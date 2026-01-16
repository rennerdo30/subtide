import json
import os
import threading
import queue
import logging
import time
import hashlib
from typing import Generator, Dict, Any, List, Optional

from backend.config import CACHE_DIR, ENABLE_WHISPER, SERVER_API_KEY

# =============================================================================
# Request Deduplication (PERF-005)
# Prevents duplicate API calls when same video/lang is requested simultaneously
# =============================================================================

_inflight_requests: Dict[str, threading.Event] = {}
_inflight_results: Dict[str, Any] = {}
_inflight_lock = threading.Lock()


def _get_request_key(video_id: str, target_lang: str) -> str:
    """Generate a unique key for a request."""
    return hashlib.sha256(f"{video_id}:{target_lang}".encode()).hexdigest()[:16]


def _check_inflight_request(video_id: str, target_lang: str) -> Optional[threading.Event]:
    """
    Check if there's an in-flight request for this video/lang combination.
    Returns the Event to wait on if there is, None otherwise.
    """
    key = _get_request_key(video_id, target_lang)
    with _inflight_lock:
        if key in _inflight_requests:
            return _inflight_requests[key]
        return None


def _register_inflight_request(video_id: str, target_lang: str) -> str:
    """Register a new in-flight request. Returns the request key."""
    key = _get_request_key(video_id, target_lang)
    with _inflight_lock:
        _inflight_requests[key] = threading.Event()
        _inflight_results[key] = None
    return key


def _complete_inflight_request(key: str, result: Any):
    """Mark an in-flight request as complete and store the result."""
    with _inflight_lock:
        if key in _inflight_requests:
            _inflight_results[key] = result
            _inflight_requests[key].set()


def _get_inflight_result(key: str) -> Any:
    """Get the result of a completed in-flight request."""
    with _inflight_lock:
        return _inflight_results.get(key)


def _cleanup_inflight_request(key: str):
    """Clean up an in-flight request after all waiters have received it."""
    with _inflight_lock:
        _inflight_requests.pop(key, None)
        _inflight_results.pop(key, None)
from backend.utils.file_utils import get_cache_path, validate_audio_file
from backend.utils.logging_utils import LogContext, generate_request_id
from backend.services.youtube_service import await_download_subtitles, get_video_title, ensure_audio_downloaded
from backend.services.video_loader import is_supported_site, download_audio, get_video_info
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
    except (OSError, json.JSONDecodeError, KeyError, TypeError):
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
            logger.exception(f"Whisper transcription failed: {e}")
            return []

    # Convert to subtitle format
    subtitles = []
    for segment in whisper_result.get('segments', []):
        subtitles.append({
            'start': round(segment['start'] * 1000),
            'end': round(segment['end'] * 1000),
            'text': segment['text'].strip(),
            'speaker': segment.get('speaker')
        })

    return subtitles


def process_video_logic(video_id: str, target_lang: str, force_whisper: bool, use_sse: bool, video_url: Optional[str] = None, stream_url: Optional[str] = None, force_refresh: bool = False):
    """
    Combined endpoint logic: fetch subtitles + translate.
    Returns generator if use_sse is True, else list of events.

    Args:
        force_refresh: If True, bypass translation cache and re-translate
    """
    logger.info(f"Entry process_video_logic: video_id={video_id}, target={target_lang}, force={force_whisper}, sse={use_sse}, url={video_url}, stream_url={stream_url}, force_refresh={force_refresh}")

    if not SERVER_API_KEY:
         # This should be handled by the route, but ensuring here logic-wise
         yield f"data: {json.dumps({'error': 'Tier 3 not configured'})}\n\n"
         return

    # Request deduplication: check if same video/lang is already being processed
    # Skip deduplication if force_refresh is set (user explicitly wants new translation)
    if not force_refresh and not force_whisper:
        inflight_event = _check_inflight_request(video_id, target_lang)
        if inflight_event:
            logger.info(f"[PROCESS] Waiting for in-flight request: {video_id} -> {target_lang}")
            yield f"data: {json.dumps({'stage': 'waiting', 'message': 'Waiting for existing request to complete...'})}\n\n"

            # Wait for the in-flight request to complete (max 10 minutes)
            if inflight_event.wait(timeout=600):
                key = _get_request_key(video_id, target_lang)
                result = _get_inflight_result(key)
                if result:
                    logger.info(f"[PROCESS] Using result from in-flight request: {video_id}")
                    yield f"data: {json.dumps({'stage': 'complete', 'message': 'Using result from parallel request', 'percent': 100})}\n\n"
                    yield f"data: {json.dumps({'result': result})}\n\n"
                    return
            else:
                logger.warning(f"[PROCESS] In-flight request timeout: {video_id}")
                # Fall through to process normally

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
            logger.error(f"[PROCESS] Sending error: {error}", exc_info=True)
            
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
            # Set context for this thread
            req_id = generate_request_id()
            LogContext.set(request_id=req_id, video_id=video_id)

            # Register this as an in-flight request for deduplication
            inflight_key = None
            if not force_refresh and not force_whisper:
                inflight_key = _register_inflight_request(video_id, target_lang)

            work_start_time = time.time()
            logger.info(f"[PROCESS] Worker thread started for video={video_id}, target={target_lang}")
            try:
                # Check translation cache first (fastest path)
                # Skip cache if force_refresh or force_whisper is set
                translation_cache_path = get_cache_path(video_id, f'translated_{target_lang}')
                if os.path.exists(translation_cache_path) and not force_whisper and not force_refresh:
                    logger.info(f"[PROCESS] Using cached translation for {video_id} -> {target_lang}")
                    send_sse('complete', 'Using cached translation', 100)
                    with open(translation_cache_path, 'r', encoding='utf-8') as f:
                        cached_result = json.load(f)
                    send_result(cached_result)
                    if inflight_key:
                        _complete_inflight_request(inflight_key, cached_result)
                    return

                # URL Selection Strategy
                # Default to YouTube if no video_url is provided
                url_to_use = f"https://www.youtube.com/watch?v={video_id}"
                
                if video_url:
                    is_official_support = is_supported_site(video_url)
                    if is_official_support:
                         url_to_use = video_url
                         logger.info(f"[PROCESS] Using supported page URL: {url_to_use}")
                    elif stream_url:
                         url_to_use = stream_url
                         is_official_support = False # Direct stream is not "officially supported" for subtitle extraction
                         logger.info(f"[PROCESS] Page not supported, using stream URL: {url_to_use}")
                    else:
                         url_to_use = video_url # Fallback to video_url even if not supported
                         is_official_support = False
                         logger.info(f"[PROCESS] Using generic page URL (not officially supported): {url_to_use}")
                else:
                    is_official_support = is_supported_site(url_to_use)
                    logger.info(f"[PROCESS] Using default YouTube URL: {url_to_use}")
                
                subtitles = []
                source_type = None
                needs_translation = True
                
                manual_subs = {} 
                auto_subs = {}
                video_duration = 0
                
                # Check Whisper cache BEFORE yt-dlp when force_whisper is set
                # This saves 2-5 seconds by skipping unnecessary yt-dlp info extraction
                whisper_cache_path = get_cache_path(video_id, 'whisper')
                use_cached_whisper = force_whisper and os.path.exists(whisper_cache_path)
                
                if use_cached_whisper:
                    logger.info(f"[PROCESS] Fast path: Using cached Whisper result (skipping yt-dlp)")
                    send_sse('whisper', 'Using cached transcription', 50, step=2, total_steps=4)
                    with open(whisper_cache_path, 'r', encoding='utf-8') as f:
                        whisper_result = json.load(f)
                    source_type = 'whisper'
                    
                    # Convert cached Whisper to subtitle format
                    for seg in whisper_result.get('segments', []):
                        subtitles.append({
                            'start': round(seg['start'] * 1000),
                            'end': round(seg['end'] * 1000),
                            'text': seg['text'].strip(),
                            'speaker': seg.get('speaker')
                        })
                    logger.info(f"[PROCESS] Loaded {len(subtitles)} subtitles from Whisper cache")
                elif is_official_support:
                    # Standard path: Check for subtitles via yt-dlp (works for YouTube etc)
                    step_start = time.time()
                    send_sse('checking', 'Checking available subtitles...', 5, step=1, total_steps=4)
                    logger.info(f"[PROCESS] Starting: video={video_id}, target={target_lang}, force_whisper={force_whisper}")

                    info = get_video_info(url_to_use)
                    manual_subs = info.get('subtitles') or {}
                    auto_subs = info.get('automatic_captions') or {}
                    video_duration = info.get('duration', 0)

                    # Filter out live_chat - it's chat replay data, not actual subtitles
                    manual_subs = {k: v for k, v in manual_subs.items() if k != 'live_chat'}

                    logger.info(f"[PROCESS] Manual subs: {list(manual_subs.keys())} | Auto subs: {list(auto_subs.keys())} | Duration: {video_duration}s (checked in {time.time()-step_start:.1f}s)")
                else:
                    # Generic site or direct stream URL: Skip subtitle check, go straight to Whisper
                    logger.info(f"[PROCESS] Generic site detected, defaulting to Whisper")
                    if not ENABLE_WHISPER:
                        send_error("Transcription is required for generic sites but is disabled on this server.")
                        return
                
                # Skip subtitle source selection if we already have subtitles (from cached Whisper)
                if subtitles:
                     pass
                # Priority 1: Target language MANUAL subs exist
                elif not use_cached_whisper and target_lang in manual_subs:
                    send_sse('downloading', f'Found {target_lang} subtitles!', 20, step=2, total_steps=3)
                    source_type = 'youtube_direct'
                    needs_translation = False
                    # Note: await_download_subtitles is specific to YouTube formats usually, 
                    # but if get_video_info returns standard structure it might work. 
                    # For safety, on generic supported sites, we might want to check format compatibility.
                    # But for now assuming official supported sites return compatible structure.
                    subtitles = await_download_subtitles(video_id, target_lang, manual_subs[target_lang])

                # Priority 2: Manual subtitles in another language
                elif manual_subs and not force_whisper:
                    source_lang = 'en' if 'en' in manual_subs else list(manual_subs.keys())[0]
                    send_sse('downloading', f'Downloading {source_lang} subtitles...', 20, step=2, total_steps=4)
                    source_type = 'youtube_manual'
                    subtitles = await_download_subtitles(video_id, source_lang, manual_subs[source_lang])

                # Priority 3: Use Whisper (higher quality than YouTube auto-translate or ONLY option for generic)
                elif ENABLE_WHISPER:
                    whisper_eta = estimate_whisper_time(video_duration) if video_duration else 60
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
                        audio_file = download_audio(url_to_use, custom_id=video_id)

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

                            # Get video title for initial prompt
                            video_title = get_video_title(video_id)
                            # Sanitize prompt
                            if video_title and (video_title == video_id or len(video_title) > 50 and "http" in video_title):
                                logger.info(f"[PROCESS] Ignoring generic title for prompt: {video_title[:30]}...")
                                video_title = None

                            if video_title:
                                logger.info(f"[PROCESS] Using initial prompt: {video_title}")

                            whisper_result = run_whisper_process(audio_file, progress_callback=whisper_progress, initial_prompt=video_title)

                            with open(cache_path, 'w', encoding='utf-8') as f:
                                json.dump(whisper_result, f, indent=2)
                        except Exception as whisper_error:
                            logger.exception(f"Whisper transcription failed: {whisper_error}")
                            send_error(f"Transcription failed: {str(whisper_error)[:100]}")
                            return

                    send_sse('whisper', 'Transcription complete', 50, step=2, total_steps=4)

                    # Convert to subtitle format
                    for seg in whisper_result.get('segments', []):
                        subtitles.append({
                            'start': round(seg['start'] * 1000),
                            'end': round(seg['end'] * 1000),
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

                    subtitles = await_translate_subtitles(subtitles, target_lang, on_translate_progress, video_id=video_id)
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
                if inflight_key:
                    _complete_inflight_request(inflight_key, final_result)

            except Exception as e:
                logger.exception(f"[PROCESS] Error in worker after {time.time()-work_start_time:.1f}s")
                send_error(str(e))
            finally:
                if inflight_key:
                    _cleanup_inflight_request(inflight_key)
                logger.info(f"[PROCESS] Worker thread finished in {time.time()-work_start_time:.1f}s")
                LogContext.clear()

        worker = threading.Thread(target=do_work, daemon=True)
        worker.start()

        while True:
            try:
                # Increased timeout to 90s for long-running Whisper transcription
                # MLX-whisper for 30min+ videos can take several minutes
                msg_type, data = progress_queue.get(timeout=90)

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
                    logger.debug(f"[PROCESS] Queue timeout (90s), worker still alive, sending ping")
                    yield f"data: {json.dumps({'ping': True})}\n\n"
                else:
                    logger.warning(f"[PROCESS] Queue timeout and worker is dead, ending")
                    yield f"data: {json.dumps({'error': 'Processing ended unexpectedly'})}\n\n"
                    return

    yield from generate()


def stream_video_logic(video_id: str, target_lang: str, force_whisper: bool, video_url: Optional[str] = None, stream_url: Optional[str] = None, force_refresh: bool = False):
    """
    Tier 4 streaming endpoint: fetch subtitles + translate with progressive streaming.
    Yields SSE events including subtitle batches as they complete translation.

    Args:
        force_refresh: If True, bypass translation cache and re-translate
    """
    if not SERVER_API_KEY:
        yield f"data: {json.dumps({'error': 'Tier 4 not configured'})}\n\n"
        return

    # Request deduplication: check if same video/lang is already being processed
    if not force_refresh and not force_whisper:
        inflight_event = _check_inflight_request(video_id, target_lang)
        if inflight_event:
            logger.info(f"[STREAM] Waiting for in-flight request: {video_id} -> {target_lang}")
            yield f"data: {json.dumps({'stage': 'waiting', 'message': 'Waiting for existing request to complete...'})}\n\n"

            # Wait for the in-flight request to complete (max 10 minutes)
            if inflight_event.wait(timeout=600):
                key = _get_request_key(video_id, target_lang)
                result = _get_inflight_result(key)
                if result:
                    logger.info(f"[STREAM] Using result from in-flight request: {video_id}")
                    yield f"data: {json.dumps({'stage': 'complete', 'message': 'Using result from parallel request', 'percent': 100})}\n\n"
                    yield f"data: {json.dumps({'result': result})}\n\n"
                    return
            else:
                logger.warning(f"[STREAM] In-flight request timeout: {video_id}")
                # Fall through to process normally

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
            # Set context for this thread
            req_id = generate_request_id()
            LogContext.set(request_id=req_id, video_id=video_id)

            # Register this as an in-flight request for deduplication
            inflight_key = None
            if not force_refresh and not force_whisper:
                inflight_key = _register_inflight_request(video_id, target_lang)

            work_start_time = time.time()
            logger.info(f"[STREAM] Worker started for video={video_id}, target={target_lang}")
            all_streamed_subtitles = []

            try:
                # Check translation cache first
                # Skip cache if force_refresh or force_whisper is set
                translation_cache_path = get_cache_path(video_id, f'translated_{target_lang}')
                if os.path.exists(translation_cache_path) and not force_whisper and not force_refresh:
                    logger.info(f"[STREAM] Using cached translation for {video_id} -> {target_lang}")
                    send_sse('complete', 'Using cached translation', 100)
                    with open(translation_cache_path, 'r', encoding='utf-8') as f:
                        cached_result = json.load(f)
                    # For cached results, stream all at once
                    send_subtitles(1, 1, cached_result.get('subtitles', []))
                    send_result(cached_result)
                    if inflight_key:
                        _complete_inflight_request(inflight_key, cached_result)
                    return

                # URL Selection Strategy
                url_to_use = f"https://www.youtube.com/watch?v={video_id}"
                
                if video_url:
                    is_official_support = is_supported_site(video_url)
                    if is_official_support:
                         url_to_use = video_url
                         logger.info(f"[STREAM] Using supported page URL: {url_to_use}")
                    elif stream_url:
                         url_to_use = stream_url
                         logger.info(f"[STREAM] Page not supported, using stream URL: {url_to_use}")
                    else:
                         url_to_use = video_url
                         logger.info(f"[STREAM] Using generic page URL: {url_to_use}")
                
                subtitles = []
                source_type = None
                needs_translation = True
                
                manual_subs = {} 
                auto_subs = {}
                video_duration = 0

                is_official_support = is_supported_site(url_to_use)

                # OPTIMIZATION: Check Whisper cache BEFORE yt-dlp when force_whisper is set
                # This saves 2-5 seconds by skipping unnecessary yt-dlp info extraction
                whisper_cache_path = get_cache_path(video_id, 'whisper')
                use_cached_whisper = force_whisper and os.path.exists(whisper_cache_path)
                
                if use_cached_whisper:
                    logger.info(f"[STREAM] Fast path: Using cached Whisper result (skipping yt-dlp)")
                    send_sse('whisper', 'Using cached transcription', 50, step=2, total_steps=4)
                    with open(whisper_cache_path, 'r', encoding='utf-8') as f:
                        whisper_result = json.load(f)
                    source_type = 'whisper'
                    
                    # Convert cached Whisper to subtitle format
                    for seg in whisper_result.get('segments', []):
                        subtitles.append({
                            'start': round(seg['start'] * 1000),
                            'end': round(seg['end'] * 1000),
                            'text': seg['text'].strip(),
                            'speaker': seg.get('speaker')
                        })
                    logger.info(f"[STREAM] Loaded {len(subtitles)} subtitles from Whisper cache")
                    
                elif is_official_support:
                    # Standard path: Check YouTube subtitles via yt-dlp
                    send_sse('checking', 'Checking available subtitles...', 5, step=1, total_steps=4)
                    logger.info(f"[STREAM] Starting: video={video_id}, target={target_lang}, force_whisper={force_whisper}")
                    
                    info = get_video_info(url_to_use)
                    manual_subs = info.get('subtitles') or {}
                    auto_subs = info.get('automatic_captions') or {}
                    video_duration = info.get('duration', 0)

                    # Filter out live_chat - it's chat replay data, not actual subtitles
                    manual_subs = {k: v for k, v in manual_subs.items() if k != 'live_chat'}

                    logger.info(f"[STREAM] Manual subs: {list(manual_subs.keys())} | Auto subs: {list(auto_subs.keys())}")
                else:
                     logger.info(f"[STREAM] Generic site detected, defaulting to Whisper")
                     if not ENABLE_WHISPER:
                         send_error("Transcription is required for generic sites but is disabled.")
                         return

                # Skip subtitle source selection if we already have subtitles (from cached Whisper)
                if subtitles:
                    logger.info(f"[STREAM] Skipping source selection - already have {len(subtitles)} subtitles")
                # Priority 1: Target language MANUAL subs exist
                elif not use_cached_whisper and target_lang in manual_subs:
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
                                'start': round(seg['start'] * 1000),
                                'end': round(seg['end'] * 1000),
                                'text': seg['text'].strip(),
                                'speaker': seg.get('speaker')
                            })
                    else:
                        audio_file = download_audio(url_to_use, custom_id=video_id)

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
                                'start': round(segment['start'] * 1000),
                                'end': round(segment['end'] * 1000),
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
                                        batch_result_callback=None,
                                        video_id=video_id
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
                            
                            # Sanitize prompt: Don't use ID/Url-based titles as prompts
                            if video_title and (video_title == video_id or len(video_title) > 50 and "http" in video_title):
                                logger.info(f"[STREAM] Ignoring generic title for prompt: {video_title[:30]}...")
                                video_title = None

                            if video_title:
                                logger.info(f"[STREAM] Using initial prompt: {video_title}")

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
                                    batch_result_callback=None,
                                    video_id=video_id
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
                        on_batch_result,  # Streaming callback
                        video_id=video_id
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
                if inflight_key:
                    _complete_inflight_request(inflight_key, final_result)

            except Exception as e:
                logger.exception(f"[STREAM] Error in worker after {time.time()-work_start_time:.1f}s")
                send_error(str(e))
            finally:
                if inflight_key:
                    _cleanup_inflight_request(inflight_key)
                logger.info(f"[STREAM] Worker finished in {time.time()-work_start_time:.1f}s")
                LogContext.clear()

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
