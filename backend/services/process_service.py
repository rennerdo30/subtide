import json
import os
import threading
import queue
import logging
import time
from typing import Generator, Dict, Any, List, Optional

from backend.config import CACHE_DIR, ENABLE_WHISPER, SERVER_API_KEY
from backend.utils.file_utils import get_cache_path, validate_audio_file
from backend.services.youtube_service import ensure_audio_downloaded, await_download_subtitles, get_video_title
from backend.services.whisper_service import run_whisper_process, run_whisper_streaming
from backend.services.translation_service import (
    await_translate_subtitles, 
    estimate_translation_time, 
    format_eta,
    get_historical_batch_time
)
# Ensure we import yt_dlp for the initial check in process_video_logic
import yt_dlp

logger = logging.getLogger('video-translate')

def estimate_whisper_time(duration_seconds: float) -> float:
    """
    Estimate Whisper transcription time based on video duration.
    Uses historical data if available, otherwise conservative defaults.
    """
    from backend.services.whisper_service import get_whisper_device, get_whisper_backend, WHISPER_MODEL_SIZE
    from backend.config import ENABLE_DIARIZATION

    # Try to load historical RTF
    history_path = os.path.join(CACHE_DIR, 'whisper_timing.json')
    try:
        if os.path.exists(history_path):
            with open(history_path, 'r') as f:
                history = json.load(f)
                if history.get('rtf_samples'):
                    samples = history['rtf_samples'][-10:]
                    historical_rtf = sum(samples) / len(samples)
                    # Add buffer for diarization if enabled
                    if ENABLE_DIARIZATION:
                        historical_rtf *= 1.3  # Diarization adds ~30%
                    return duration_seconds * historical_rtf * 1.1  # +10% buffer
    except:
        pass

    device = get_whisper_device()

    # MORE CONSERVATIVE defaults based on real-world testing
    backend = get_whisper_backend()
    if device == "cuda":
        factor = 0.15  # Was 0.1
    elif backend == "mlx-whisper":
        model_factors = {
            'tiny': 0.15, 'tiny.en': 0.15,
            'base': 0.20, 'base.en': 0.20,
            'small': 0.30, 'small.en': 0.30,
            'medium': 0.50, 'medium.en': 0.50,
            'large': 0.80, 'large-v2': 0.80,
            'large-v3': 0.80, 'large-v3-turbo': 0.60,
        }
        factor = model_factors.get(WHISPER_MODEL_SIZE, 0.25)
    elif backend == "faster-whisper":
        model_factors = {
            'tiny': 0.15, 'base': 0.20, 'small': 0.35,
            'medium': 0.60, 'large': 1.0, 'large-v2': 1.0, 'large-v3': 1.0,
        }
        factor = model_factors.get(WHISPER_MODEL_SIZE, 0.30)
    else:
        # Original openai-whisper on CPU
        model_factors = {
            'tiny': 0.5, 'base': 0.8, 'small': 1.2,
            'medium': 2.0, 'large': 4.0, 'large-v2': 4.0, 'large-v3': 4.0,
        }
        factor = model_factors.get(WHISPER_MODEL_SIZE, 1.0)

    # Add time for diarization if enabled
    if ENABLE_DIARIZATION:
        factor *= 1.3  # Diarization adds ~30% time

    return duration_seconds * factor

def await_whisper_transcribe(video_id: str, url: str) -> List[Dict[str, Any]]:
    """Transcribe video using Whisper with persistent audio caching."""
    cache_path = get_cache_path(video_id, 'whisper')

    if os.path.exists(cache_path):
        logger.info("[PROCESS] Using cached Whisper transcription")
        with open(cache_path, 'r', encoding='utf-8') as f:
            whisper_result = json.load(f)
    else:
        logger.info("[PROCESS] Running Whisper transcription...")

        final_audio_path = ensure_audio_downloaded(video_id, url)
        if not final_audio_path or not os.path.exists(final_audio_path):
            logger.error("Could not find downloaded audio file")
            return []

        # Run Whisper on the cached audio file
        try:
            whisper_result = run_whisper_process(final_audio_path)
            
            # Cache the result
            with open(cache_path, 'w', encoding='utf-8') as f:
                json.dump(whisper_result, f, indent=2)
                
        except Exception as e:
            logger.error(f"Whisper transcription failed: {e}")
            return []

    # Convert to subtitle format
    subtitles = []
    for segment in whisper_result.get('segments', []):
        subtitles.append({
            'start': int(segment['start'] * 1000),
            'end': int(segment['end'] * 1000),
            'text': segment['text'].strip(),
            'speaker': segment.get('speaker') 
        })

    return subtitles


def process_video_logic(video_id: str, target_lang: str, force_whisper: bool, use_sse: bool):
    """
    Combined endpoint logic: fetch subtitles + translate.
    Returns generator if use_sse is True, else list of events.
    """
    if not SERVER_API_KEY:
         # This should be handled by the route, but ensuring here logic-wise
         yield f"data: {json.dumps({'error': 'Tier 3 not configured'})}\n\n"
         return

    def generate():
        # Queue for progress messages
        progress_queue = queue.Queue()

        def send_sse(stage, message, percent=None, step=None, total_steps=None, eta=None, batch_info=None):
            data = {'stage': stage, 'message': message}
            if percent is not None: data['percent'] = percent
            if step is not None: data['step'] = step
            if total_steps is not None: data['totalSteps'] = total_steps
            if eta is not None: data['eta'] = eta
            if batch_info is not None: data['batchInfo'] = batch_info
            progress_queue.put(('progress', data))

        def send_result(result):
            progress_queue.put(('result', result))

        def send_error(error):
            logger.error(f"[PROCESS] Sending error: {error}")
            
            # Construct structured error
            error_data = {
                'message': str(error),
                'type': type(error).__name__
            }
            
            # Add hints for specific errors
            if "Expected key.size(1)" in str(error):
                error_data['hint'] = "PyTorch version mismatch. Please contact admin to pin torch==2.2.0."
            elif "CUDA out of memory" in str(error):
                error_data['hint'] = "GPU is out of memory. Try a smaller model or shorter video."
            elif "Tier 3" in str(error):
                error_data['hint'] = "This feature requires a higher tier plan."
                
            progress_queue.put(('error', error_data))

        def do_work():
            work_start_time = time.time()
            logger.info(f"[PROCESS] Worker thread started for video={video_id}, target={target_lang}")
            try:
                # Check translation cache first
                translation_cache_path = get_cache_path(video_id, f'translated_{target_lang}')
                if os.path.exists(translation_cache_path) and not force_whisper:
                    logger.info(f"[PROCESS] Using cached translation for {video_id} -> {target_lang}")
                    send_sse('complete', 'Using cached translation', 100)
                    with open(translation_cache_path, 'r', encoding='utf-8') as f:
                        cached_result = json.load(f)
                    send_result(cached_result)
                    return

                url = f"https://www.youtube.com/watch?v={video_id}"
                subtitles = []
                source_type = None
                needs_translation = True
                
                # Step 1: Check available subtitles
                step_start = time.time()
                send_sse('checking', 'Checking available subtitles...', 5, step=1, total_steps=4)
                logger.info(f"[PROCESS] Starting: video={video_id}, target={target_lang}, force_whisper={force_whisper}")

                ydl_opts = {
                    'skip_download': True,
                    'writesubtitles': True,
                    'writeautomaticsub': True,
                    'quiet': True,
                    'no_warnings': True,
                    'format': None,
                    'ignore_no_formats_error': True,
                }

                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(url, download=False)
                    manual_subs = info.get('subtitles') or {}
                    auto_subs = info.get('automatic_captions') or {}
                    video_duration = info.get('duration', 0)

                logger.info(f"[PROCESS] Manual subs: {list(manual_subs.keys())} | Auto subs: {list(auto_subs.keys())} | Duration: {video_duration}s (checked in {time.time()-step_start:.1f}s)")
                
                # Priority 1: Target language MANUAL subs exist
                if target_lang in manual_subs:
                    send_sse('downloading', f'Found {target_lang} subtitles!', 20, step=2, total_steps=3)
                    source_type = 'youtube_direct'
                    needs_translation = False
                    subtitles = await_download_subtitles(video_id, target_lang, manual_subs[target_lang])

                # Priority 2: Manual subtitles in another language
                elif manual_subs and not force_whisper:
                    source_lang = 'en' if 'en' in manual_subs else list(manual_subs.keys())[0]
                    send_sse('downloading', f'Downloading {source_lang} subtitles...', 20, step=2, total_steps=4)
                    source_type = 'youtube_manual'
                    subtitles = await_download_subtitles(video_id, source_lang, manual_subs[source_lang])

                # Priority 3: Use Whisper (higher quality than YouTube auto-translate)
                elif ENABLE_WHISPER:
                    whisper_eta = estimate_whisper_time(video_duration)
                    whisper_eta_str = format_eta(whisper_eta)
                    
                    send_sse('whisper', 'Downloading audio...', 10, step=2, total_steps=4, eta=whisper_eta_str)
                    source_type = 'whisper'

                    # Check cache first
                    cache_path = get_cache_path(video_id, 'whisper')
                    if os.path.exists(cache_path):
                        send_sse('whisper', 'Using cached transcription', 50, step=2, total_steps=4)
                        with open(cache_path, 'r', encoding='utf-8') as f:
                            whisper_result = json.load(f)
                    else:
                        audio_file = ensure_audio_downloaded(video_id, url)

                        if not audio_file:
                            send_error('Audio download failed')
                            return

                        is_valid, err_msg = validate_audio_file(audio_file)
                        if not is_valid:
                            send_error(f"Audio download failed: {err_msg}")
                            return

                        send_sse('whisper', 'Transcribing with Whisper...', 30, step=2, total_steps=4, eta=whisper_eta_str)

                        try:
                            def whisper_progress(stage, message, pct):
                                send_sse(stage, message, pct, step=2, total_steps=4)

                            whisper_result = run_whisper_process(audio_file, progress_callback=whisper_progress)

                            with open(cache_path, 'w', encoding='utf-8') as f:
                                json.dump(whisper_result, f, indent=2)
                        except Exception as whisper_error:
                            logger.error(f"Whisper transcription failed: {whisper_error}")
                            send_error(f"Transcription failed: {str(whisper_error)[:100]}")
                            return

                    send_sse('whisper', 'Transcription complete', 50, step=2, total_steps=4)

                    # Convert to subtitle format
                    for seg in whisper_result.get('segments', []):
                        subtitles.append({
                            'start': int(seg['start'] * 1000),
                            'end': int(seg['end'] * 1000),
                            'text': seg['text'].strip(),
                            'speaker': seg.get('speaker')
                        })


                # Fallback: YouTube auto
                elif auto_subs:
                    source_lang = list(auto_subs.keys())[0]
                    send_sse('downloading', f'Using auto-captions ({source_lang})...', 20, step=2, total_steps=4)
                    source_type = 'youtube_auto'
                    subtitles = await_download_subtitles(video_id, source_lang, auto_subs[source_lang])

                else:
                    send_error('No subtitles available')
                    return

                if not subtitles:
                    send_error('Failed to get subtitles')
                    return

                logger.info(f"[PROCESS] Got {len(subtitles)} subtitles from {source_type}")

                # Step 2: Translate if needed
                if needs_translation:
                    trans_start = time.time()
                    trans_eta_sec = estimate_translation_time(len(subtitles))
                    trans_eta_str = format_eta(trans_eta_sec)
                    hist_avg = get_historical_batch_time()
                    
                    logger.info(f"[PROCESS] Translation needed: {len(subtitles)} subtitles, ETA={trans_eta_str}, hist_avg={hist_avg:.1f}s/batch")
                    send_sse('translating', f'Translating {len(subtitles)} subtitles...', 55, step=3, total_steps=4, eta=trans_eta_str)

                    def on_translate_progress(done, total, pct, eta=""):
                        overall_pct = 55 + int(pct * 0.4)
                        batch_info = {'current': done, 'total': total}
                        send_sse('translating', f'Translating subtitles...', overall_pct, step=3, total_steps=4, eta=eta if eta else None, batch_info=batch_info)

                    subtitles = await_translate_subtitles(subtitles, target_lang, on_translate_progress)
                    logger.info(f"[PROCESS] Translation complete in {time.time()-trans_start:.1f}s")
                    send_sse('translating', 'Translation complete', 95, step=3, total_steps=4)
                else:
                    for sub in subtitles:
                        sub['translatedText'] = sub['text']

                # Build final result
                final_result = {
                    'subtitles': subtitles,
                    'source': source_type,
                    'translated': needs_translation
                }

                # Cache the result
                if all(sub.get('translatedText') for sub in subtitles[:5]) or not needs_translation:
                    translation_cache_path = get_cache_path(video_id, f'translated_{target_lang}')
                    with open(translation_cache_path, 'w', encoding='utf-8') as f:
                        json.dump(final_result, f, indent=2)
                    logger.info(f"[PROCESS] Cached translation to {translation_cache_path}")

                send_sse('complete', 'Subtitles ready!', 100, step=4, total_steps=4)
                send_result(final_result)

            except Exception as e:
                logger.exception(f"[PROCESS] Error in worker after {time.time()-work_start_time:.1f}s")
                send_error(str(e))
            finally:
                logger.info(f"[PROCESS] Worker thread finished in {time.time()-work_start_time:.1f}s")

        worker = threading.Thread(target=do_work, daemon=True)
        worker.start()

        while True:
            try:
                # Increased timeout to 60s for long-running Whisper transcription
                # MLX-whisper for 20min+ videos can take several minutes
                msg_type, data = progress_queue.get(timeout=60)

                if msg_type == 'progress':
                    yield f"data: {json.dumps(data)}\n\n"
                elif msg_type == 'result':
                    yield f"data: {json.dumps({'result': data})}\n\n"
                    return
                elif msg_type == 'error':
                    yield f"data: {json.dumps({'error': data})}\n\n"
                    return

            except queue.Empty:
                if worker.is_alive():
                    logger.debug(f"[PROCESS] Queue timeout (10s), worker still alive, sending ping")
                    yield f"data: {json.dumps({'ping': True})}\n\n"
                else:
                    logger.warning(f"[PROCESS] Queue timeout and worker is dead, ending")
                    yield f"data: {json.dumps({'error': 'Processing ended unexpectedly'})}\n\n"
                    return

    yield from generate()


def stream_video_logic(video_id: str, target_lang: str, force_whisper: bool):
    """
    Tier 4 streaming endpoint: fetch subtitles + translate with progressive streaming.
    Yields SSE events including subtitle batches as they complete translation.
    """
    if not SERVER_API_KEY:
        yield f"data: {json.dumps({'error': 'Tier 4 not configured'})}\n\n"
        return

    def generate():
        progress_queue = queue.Queue()

        def send_sse(stage, message, percent=None, step=None, total_steps=None, eta=None, batch_info=None):
            data = {'stage': stage, 'message': message}
            if percent is not None: data['percent'] = percent
            if step is not None: data['step'] = step
            if total_steps is not None: data['totalSteps'] = total_steps
            if eta is not None: data['eta'] = eta
            if batch_info is not None: data['batchInfo'] = batch_info
            progress_queue.put(('progress', data))

        def send_subtitles(batch_num, total_batches, subtitles_batch):
            """Stream translated subtitle batch to client."""
            data = {
                'stage': 'subtitles',
                'message': f'Batch {batch_num}/{total_batches} ready',
                'batchInfo': {'current': batch_num, 'total': total_batches},
                'subtitles': subtitles_batch
            }
            progress_queue.put(('progress', data))

        def send_result(result):
            progress_queue.put(('result', result))

        def send_error(error):
            logger.error(f"[STREAM] Sending error: {error}")
            progress_queue.put(('error', str(error)))

        def do_work():
            work_start_time = time.time()
            logger.info(f"[STREAM] Worker started for video={video_id}, target={target_lang}")
            all_streamed_subtitles = []

            try:
                # Check translation cache first
                translation_cache_path = get_cache_path(video_id, f'translated_{target_lang}')
                if os.path.exists(translation_cache_path) and not force_whisper:
                    logger.info(f"[STREAM] Using cached translation for {video_id} -> {target_lang}")
                    send_sse('complete', 'Using cached translation', 100)
                    with open(translation_cache_path, 'r', encoding='utf-8') as f:
                        cached_result = json.load(f)
                    # For cached results, stream all at once
                    send_subtitles(1, 1, cached_result.get('subtitles', []))
                    send_result(cached_result)
                    return

                url = f"https://www.youtube.com/watch?v={video_id}"
                subtitles = []
                source_type = None
                needs_translation = True

                # Step 1: Check available subtitles
                send_sse('checking', 'Checking available subtitles...', 5, step=1, total_steps=4)
                logger.info(f"[STREAM] Starting: video={video_id}, target={target_lang}, force_whisper={force_whisper}")

                ydl_opts = {
                    'skip_download': True,
                    'writesubtitles': True,
                    'writeautomaticsub': True,
                    'quiet': True,
                    'no_warnings': True,
                    'format': None,  # Don't require any specific format for info extraction
                    'ignore_no_formats_error': True,  # Ignore format errors
                }

                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(url, download=False)
                    manual_subs = info.get('subtitles') or {}
                    auto_subs = info.get('automatic_captions') or {}
                    video_duration = info.get('duration', 0)

                logger.info(f"[STREAM] Manual subs: {list(manual_subs.keys())} | Auto subs: {list(auto_subs.keys())}")

                # Priority 1: Target language MANUAL subs exist
                if target_lang in manual_subs:
                    send_sse('downloading', f'Found {target_lang} subtitles!', 20, step=2, total_steps=3)
                    source_type = 'youtube_direct'
                    needs_translation = False
                    subtitles = await_download_subtitles(video_id, target_lang, manual_subs[target_lang])

                # Priority 2: Manual subtitles in another language
                elif manual_subs and not force_whisper:
                    source_lang = 'en' if 'en' in manual_subs else list(manual_subs.keys())[0]
                    send_sse('downloading', f'Downloading {source_lang} subtitles...', 20, step=2, total_steps=4)
                    source_type = 'youtube_manual'
                    subtitles = await_download_subtitles(video_id, source_lang, manual_subs[source_lang])

                # Priority 3: Use Whisper (higher quality than YouTube auto-translate)
                elif ENABLE_WHISPER:
                    whisper_eta = estimate_whisper_time(video_duration)
                    whisper_eta_str = format_eta(whisper_eta)

                    send_sse('whisper', 'Downloading audio...', 10, step=2, total_steps=4, eta=whisper_eta_str)
                    source_type = 'whisper'

                    cache_path = get_cache_path(video_id, 'whisper')
                    if os.path.exists(cache_path):
                        # Use cached transcription (non-streaming path)
                        send_sse('whisper', 'Using cached transcription', 50, step=2, total_steps=4)
                        with open(cache_path, 'r', encoding='utf-8') as f:
                            whisper_result = json.load(f)
                        
                        for seg in whisper_result.get('segments', []):
                            subtitles.append({
                                'start': int(seg['start'] * 1000),
                                'end': int(seg['end'] * 1000),
                                'text': seg['text'].strip(),
                                'speaker': seg.get('speaker')
                            })
                    else:
                        audio_file = ensure_audio_downloaded(video_id, url)

                        if not audio_file:
                            send_error('Audio download failed')
                            return

                        is_valid, err_msg = validate_audio_file(audio_file)
                        if not is_valid:
                            send_error(f"Audio download failed: {err_msg}")
                            return

                        send_sse('whisper', 'Transcribing with Whisper (streaming)...', 15, step=2, total_steps=4, eta=whisper_eta_str)

                        # Streaming Whisper with pipelined translation
                        segment_buffer = []
                        BATCH_SIZE = 5  # Translate every 5 segments for faster first subtitle
                        batch_count = [0]
                        
                        def on_whisper_segment(segment):
                            """Called for each segment as Whisper produces it."""
                            # Convert to subtitle format
                            sub = {
                                'start': int(segment['start'] * 1000),
                                'end': int(segment['end'] * 1000),
                                'text': segment['text'].strip(),
                            }
                            segment_buffer.append(sub)
                            subtitles.append(sub)  # Also add to main list
                            
                            # When we have enough segments, translate and stream
                            if len(segment_buffer) >= BATCH_SIZE:
                                batch_count[0] += 1
                                batch_to_translate = segment_buffer.copy()
                                segment_buffer.clear()
                                
                                logger.info(f"[STREAM] Translating batch {batch_count[0]} ({len(batch_to_translate)} segments)...")
                                
                                # Translate this batch
                                try:
                                    translated = await_translate_subtitles(
                                        batch_to_translate,
                                        target_lang,
                                        progress_callback=None,
                                        batch_result_callback=None
                                    )
                                    
                                    # Stream translated batch to client
                                    send_subtitles(batch_count[0], -1, translated)  # -1 = unknown total
                                    all_streamed_subtitles.extend(translated)
                                    
                                    logger.info(f"[STREAM] Streamed batch {batch_count[0]}")
                                except Exception as trans_err:
                                    logger.error(f"[STREAM] Batch translation error: {trans_err}")
                        
                        def whisper_progress(stage, message, pct):
                            send_sse(stage, message, pct, step=2, total_steps=4)

                        try:
                            # Get video title for initial prompt (helps with proper nouns)
                            video_title = get_video_title(video_id)
                            
                            whisper_result = run_whisper_streaming(
                                audio_file,
                                segment_callback=on_whisper_segment,
                                progress_callback=whisper_progress,
                                initial_prompt=video_title
                            )

                            # Cache the result
                            with open(cache_path, 'w', encoding='utf-8') as f:
                                json.dump(whisper_result, f, indent=2)
                            
                            # Translate any remaining segments in buffer
                            if segment_buffer:
                                batch_count[0] += 1
                                logger.info(f"[STREAM] Translating final batch {batch_count[0]} ({len(segment_buffer)} segments)...")
                                
                                translated = await_translate_subtitles(
                                    segment_buffer,
                                    target_lang,
                                    progress_callback=None,
                                    batch_result_callback=None
                                )
                                send_subtitles(batch_count[0], batch_count[0], translated)
                                all_streamed_subtitles.extend(translated)
                            
                            # Mark that streaming translation is complete
                            needs_translation = False
                            
                        except Exception as whisper_error:
                            logger.error(f"Whisper transcription failed: {whisper_error}")
                            send_error(f"Transcription failed: {str(whisper_error)[:100]}")
                            return

                    send_sse('whisper', 'Transcription complete', 50, step=2, total_steps=4)

                # Fallback: YouTube auto
                elif auto_subs:
                    source_lang = list(auto_subs.keys())[0]
                    send_sse('downloading', f'Using auto-captions ({source_lang})...', 20, step=2, total_steps=4)
                    source_type = 'youtube_auto'
                    subtitles = await_download_subtitles(video_id, source_lang, auto_subs[source_lang])

                else:
                    send_error('No subtitles available')
                    return

                if not subtitles:
                    send_error('Failed to get subtitles')
                    return

                logger.info(f"[STREAM] Got {len(subtitles)} subtitles from {source_type}")

                # Step 3: Translate with streaming if needed
                if needs_translation:
                    trans_eta_sec = estimate_translation_time(len(subtitles))
                    trans_eta_str = format_eta(trans_eta_sec)

                    logger.info(f"[STREAM] Translation needed: {len(subtitles)} subtitles, ETA={trans_eta_str}")
                    send_sse('translating', f'Translating {len(subtitles)} subtitles...', 55, step=3, total_steps=4, eta=trans_eta_str)

                    def on_translate_progress(done, total, pct, eta=""):
                        overall_pct = 55 + int(pct * 0.4)
                        batch_info = {'current': done, 'total': total}
                        send_sse('translating', f'Translating subtitles...', overall_pct, step=3, total_steps=4, eta=eta if eta else None, batch_info=batch_info)

                    def on_batch_result(batch_num, total_batches, batch_subtitles):
                        """Stream each translated batch to the client immediately."""
                        # Make a copy to avoid reference issues
                        batch_copy = [dict(s) for s in batch_subtitles]
                        all_streamed_subtitles.extend(batch_copy)
                        send_subtitles(batch_num, total_batches, batch_copy)

                    subtitles = await_translate_subtitles(
                        subtitles,
                        target_lang,
                        on_translate_progress,
                        on_batch_result  # New streaming callback
                    )
                    logger.info(f"[STREAM] Translation complete")
                    send_sse('translating', 'Translation complete', 95, step=3, total_steps=4)
                else:
                    for sub in subtitles:
                        sub['translatedText'] = sub['text']
                    # Stream all subtitles at once for non-translation case
                    send_subtitles(1, 1, subtitles)

                # Build final result
                final_result = {
                    'subtitles': subtitles,
                    'source': source_type,
                    'translated': needs_translation
                }

                # Cache the result
                if all(sub.get('translatedText') for sub in subtitles[:5]) or not needs_translation:
                    translation_cache_path = get_cache_path(video_id, f'translated_{target_lang}')
                    with open(translation_cache_path, 'w', encoding='utf-8') as f:
                        json.dump(final_result, f, indent=2)
                    logger.info(f"[STREAM] Cached translation to {translation_cache_path}")

                send_sse('complete', 'Subtitles ready!', 100, step=4, total_steps=4)
                send_result(final_result)

            except Exception as e:
                logger.exception(f"[STREAM] Error in worker after {time.time()-work_start_time:.1f}s")
                send_error(str(e))
            finally:
                logger.info(f"[STREAM] Worker finished in {time.time()-work_start_time:.1f}s")

        worker = threading.Thread(target=do_work, daemon=True)
        worker.start()

        while True:
            try:
                msg_type, data = progress_queue.get(timeout=60)

                if msg_type == 'progress':
                    yield f"data: {json.dumps(data)}\n\n"
                elif msg_type == 'result':
                    yield f"data: {json.dumps({'result': data})}\n\n"
                    return
                elif msg_type == 'error':
                    yield f"data: {json.dumps({'error': data})}\n\n"
                    return

            except queue.Empty:
                if worker.is_alive():
                    logger.debug(f"[STREAM] Queue timeout, worker still alive, sending ping")
                    yield f"data: {json.dumps({'ping': True})}\n\n"
                else:
                    logger.warning(f"[STREAM] Queue timeout and worker is dead, ending")
                    yield f"data: {json.dumps({'error': 'Processing ended unexpectedly'})}\n\n"
                    return

    yield from generate()
