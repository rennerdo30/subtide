import os
import threading
import queue
import time
import logging
import numpy as np
# from faster_whisper import WhisperModel
from backend.services.whisper_service import get_whisper_model, get_whisper_device
from backend.services.translation_service import await_translate_subtitles

logger = logging.getLogger('video-translate')

# Track audio chunk timing for debugging
_last_chunk_time = {}

class LiveWhisperService:
    def __init__(self, sid, target_lang, socketio):
        self.sid = sid
        self.target_lang = target_lang
        self.socketio = socketio
        self.audio_queue = queue.Queue()
        self.running = False
        self.thread = None
        self.sample_rate = 16000
        
        # Audio buffer for processing
        self.audio_buffer = np.array([], dtype=np.float32)
        
        # Whisper model initialization (MLX)
        model_path = get_whisper_model()
        if isinstance(model_path, str):
            # It's an MLX model path
            import mlx_whisper
            import mlx.core as mx
            logger.info(f"[LIVE] Loading MLX model from {model_path}...")
            # Load persistent model for live streaming performance
            # Explicitly force float16 for Metal
            self.model = mlx_whisper.load_models.load_model(model_path, dtype=mx.float16)
            self.backend = "mlx"
            logger.info(f"[LIVE] MLX model loaded.")
        else:
             # Fallback/Error if not string (should not happen with MLX setup)
             logger.error("[LIVE] Invalid model for MLX usage")
             self.model = None
             self.backend = "unknown"

    def start(self):
        self.running = True
        self.thread = threading.Thread(target=self._process_loop, daemon=True)
        self.thread.start()
        logger.info(f"[LIVE] Service started for {self.sid}")

    def add_audio(self, pcm_bytes):
        """Adds raw PCM bytes to the queue."""
        try:
            # incoming is 16-bit PCM mono 16kHz
            audio_chunk = np.frombuffer(pcm_bytes, dtype=np.int16).astype(np.float32) / 32768.0
            
            # Volume and timing check for debugging
            rms = np.sqrt(np.mean(audio_chunk**2))
            now = time.time()
            last_time = _last_chunk_time.get(self.sid, now)
            _last_chunk_time[self.sid] = now
            
            if rms > 0.01:  # Log audible audio
                logger.debug(f"[LIVE] Audio chunk: {len(pcm_bytes)} bytes, volume={rms*100:.1f}%, gap={now-last_time:.2f}s")
            
            self.audio_queue.put(audio_chunk)
        except Exception as e:
            logger.error(f"[LIVE] Error decoding PCM chunk: {e}")

    def stop(self):
        self.running = False
        if self.thread:
            self.thread.join(timeout=2)
        logger.info(f"[LIVE] Service stopped for {self.sid}")

    def _process_loop(self):
        while self.running:
            try:
                # Accumulate all available chunks
                while not self.audio_queue.empty():
                    chunk = self.audio_queue.get_nowait()
                    self.audio_buffer = np.append(self.audio_buffer, chunk)

                # If we have enough audio (2 seconds), transcribe
                # Reducing to 1.5s to be more responsive, but relying on VAD to skip silence
                min_samples = int(self.sample_rate * 1.5)
                
                if len(self.audio_buffer) >= min_samples:
                    self._transcribe_and_translate()
                    
                    # Sliding window: keep the last 0.5s for continuity
                    # Increase overlap slightly to catch words cut in half
                    keep_samples = int(self.sample_rate * 0.5)
                    self.audio_buffer = self.audio_buffer[-keep_samples:]

                time.sleep(0.1)
            except Exception as e:
                logger.exception(f"[LIVE] Error in process loop: {e}")
                time.sleep(1)

    def _transcribe_and_translate(self):
        if len(self.audio_buffer) == 0:
            return

        try:
            # Transcribe
            buffer_duration = len(self.audio_buffer) / self.sample_rate
            logger.debug(f"[LIVE] Transcribing {buffer_duration:.1f}s of audio...")
            transcribe_start = time.time()
            
            transcribed_text = ""
            language = "en"
            
            if self.backend == "mlx":
                import mlx_whisper
                import mlx_whisper.audio
                import mlx_whisper.decoding
                import mlx.core as mx

                # Prepare audio for MLX (pad to 30s)
                # Ensure float32
                audio = self.audio_buffer.astype(np.float32)
                # Convert to MLX array
                audio = mx.array(audio)
                audio = mlx_whisper.audio.pad_or_trim(audio)
                mel = mlx_whisper.audio.log_mel_spectrogram(audio)
                # Cast to float16 for Metal model
                mel = mel.astype(mx.float16)
                
                # Decode
                # We use default options but can tune temperature
                result = mlx_whisper.decoding.decode(
                    self.model, 
                    mel, 
                    # decoding options
                    temperature=0.0
                )
                
                # Process result
                # result is DecodingResult or list (if batch)
                # Since we passed single input, it should be single result? 
                # decode returns Union[DecodingResult, List[DecodingResult]]
                if isinstance(result, list):
                    res = result[0]
                else:
                    res = result
                
                transcribed_text = res.text.strip()
                # Get language token or info?
                # DecodingResult has 'tokens', 'text', 'avg_logprob', 'no_speech_prob', 'temperature', 'compression_ratio'
                # It does not explicitly store language string if it was auto-detected inside decode?
                # Actually, MLX decode detects language if not provided.
                # However, retrieving it from result might be tricky if not stored.
                # For now assume 'en' or we can add language detection explicitly if needed.
                # But typically 'res.text' is what we want.
                language = "en" # Todo: extract language from model or tokens if possible
                
                # Try to infer language from tokens if MLX stores it?
                # Or just assume EN for now unless user selected something?
                # User did not select source lang in UI usually (auto detect).
            
            transcribe_duration = time.time() - transcribe_start
            
            if not transcribed_text:
                logger.debug(f"[LIVE] Transcription complete in {transcribe_duration:.2f}s (no speech detected)")
                return

            logger.info(f"[LIVE] Transcribed in {transcribe_duration:.2f}s: {transcribed_text[:80]}...")

            # Emit Transcription Immediately (User sees this first)
            logger.debug(f"[LIVE] Emitting transcription to {self.sid}")
            self.socketio.emit('live_result', {
                'text': transcribed_text,
                'translatedText': None, # Pending
                'language': language,
                'status': 'transcribing'
            }, room=self.sid, namespace='/live')

            # Translate in background (Non-blocking)
            if self.target_lang != language:
                self.socketio.start_background_task(
                    self._translate_task, 
                    transcribed_text, 
                    language,
                    self.target_lang
                )
            else:
                # If no translation needed, emit "final" state
                 self.socketio.emit('live_result', {
                    'text': transcribed_text,
                    'translatedText': transcribed_text,
                    'language': language,
                    'status': 'final'
                }, room=self.sid, namespace='/live')

        except Exception as e:
            logger.error(f"[LIVE] Transcription failed: {e}")

    def _translate_task(self, text, source_lang, target_lang):
        """Background task for translation."""
        try:
            mock_subs = [{'text': text, 'start': 0, 'end': 1}]
            translated_subs = await_translate_subtitles(mock_subs, target_lang)
            
            translated_text = text
            if translated_subs:
                translated_text = translated_subs[0].get('translatedText', text)
                logger.info(f"[LIVE] Translated [{target_lang}]: {translated_text}")

            self.socketio.emit('live_result', {
                'text': text,
                'translatedText': translated_text,
                'language': source_lang,
                'status': 'final'
            }, room=self.sid, namespace='/live')
            
        except Exception as e:
            logger.error(f"[LIVE] Translation task failed: {e}")
