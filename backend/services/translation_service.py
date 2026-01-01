import os
import json
import time
import re
import math
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict, Any, Tuple, Optional, Callable
from openai import OpenAI

from backend.config import CACHE_DIR, LANG_NAMES, SERVER_API_KEY, SERVER_API_URL, SERVER_MODEL

logger = logging.getLogger('video-translate')

def get_historical_batch_time() -> float:
    """Get average batch time from history for initial ETA estimate."""
    history_path = os.path.join(CACHE_DIR, 'batch_time_history.json')
    try:
        if os.path.exists(history_path):
            with open(history_path, 'r') as f:
                history = json.load(f)
                if history.get('times'):
                    return sum(history['times']) / len(history['times'])
    except:
        pass
    return 3.0  # Default 3 seconds per batch

def save_batch_time_history(batch_times: List[float]):
    """Save batch times for future ETA estimates."""
    history_path = os.path.join(CACHE_DIR, 'batch_time_history.json')
    try:
        history = {'times': []}
        if os.path.exists(history_path):
            with open(history_path, 'r') as f:
                history = json.load(f)

        # Keep last 50 batch times
        history['times'] = (history.get('times', []) + batch_times)[-50:]
        history['updated'] = time.time()

        with open(history_path, 'w') as f:
            json.dump(history, f)
    except Exception as e:
        logger.warning(f"Failed to save batch time history: {e}")

def format_eta(seconds: float) -> str:
    """Format seconds into human readable time."""
    if not seconds:
        return ""
    if seconds < 60:
        return f"{int(seconds)}s"
    elif seconds < 3600:
        mins = int(seconds // 60)
        secs = int(seconds % 60)
        return f"{mins}m {secs}s"
    else:
        hours = int(seconds // 3600)
        mins = int((seconds % 3600) // 60)
        return f"{hours}h {mins}m"

def estimate_translation_time(subtitle_count: int) -> float:
    """Estimate translation time based on subtitle count."""
    # Historical average is ~3s per batch of 25
    # Parallel processing with 3 workers
    batch_size = 25
    max_workers = 3
    avg_batch_time = get_historical_batch_time()
    
    total_batches = (subtitle_count + batch_size - 1) // batch_size
    # Effective batches (parallelized)
    effective_batches = (total_batches + max_workers - 1) // max_workers
    
    return effective_batches * avg_batch_time

def parse_vtt_to_json3(vtt_content: str) -> Dict[str, Any]:
    """Parse VTT subtitle format to JSON3-like structure."""
    events = []
    pattern = r'(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})\n(.+?)(?=\n\n|\Z)'

    def ts_to_ms(ts):
        h, m, s = ts.split(':')
        s, ms = s.split('.')
        return int(h)*3600000 + int(m)*60000 + int(s)*1000 + int(ms)

    for match in re.finditer(pattern, vtt_content, re.DOTALL):
        start_str, end_str, text = match.groups()
        events.append({
            'tStartMs': ts_to_ms(start_str),
            'dDurationMs': ts_to_ms(end_str) - ts_to_ms(start_str),
            'segs': [{'utf8': text.strip()}]
        })

    return {'events': events}

def await_translate_subtitles(
    subtitles: List[Dict[str, Any]],
    target_lang: str,
    progress_callback: Optional[Callable[[int, int, int, str], None]] = None
) -> List[Dict[str, Any]]:
    """Translate subtitles using LLM with parallel batching, rate limit handling, and retry."""

    # Configuration constants with documented rationale
    # -------------------------------------------------------------------------
    # BATCH_SIZE: 25 subtitles per batch
    # - Balances context size (~2000 tokens/batch) with API call overhead
    # - Fits comfortably in 4K-8K context models while leaving room for responses
    # - Empirically optimal for GPT-4o-mini and similar models
    BATCH_SIZE = 25

    # MAX_RETRIES: 3 attempts per batch
    # - Handles transient API failures (timeouts, rate limits)
    # - With exponential backoff (2^attempt seconds), max wait is ~8s per retry
    MAX_RETRIES = 3

    # MAX_WORKERS: 3 parallel workers
    # - OpenAI Tier 1: 3 RPM limit, so 3 workers maximizes throughput
    # - Prevents rate limit errors while maintaining reasonable speed
    # - Higher values trigger 429 errors on most API tiers
    MAX_WORKERS = 3

    # RETRY_ROUNDS: 2 retry rounds for failed batches
    # - After initial pass, retry failed batches up to 2 more times
    # - Allows recovery from temporary API issues without excessive retries
    RETRY_ROUNDS = 2

    t_name = LANG_NAMES.get(target_lang, target_lang)

    client_args = {
        'api_key': SERVER_API_KEY,
        'base_url': SERVER_API_URL.rstrip('/') if SERVER_API_URL else None
    }
    
    # Clean up client_args
    if not client_args['base_url']:
        del client_args['base_url']
    if not client_args['api_key']:
        # This function relies on SERVER_API_KEY being present (Tier 3)
        # But we handle None elegantly anyway
        pass

    if SERVER_API_URL and 'openrouter.ai' in SERVER_API_URL:
        client_args['default_headers'] = {
            'HTTP-Referer': 'https://video-translate.app',
            'X-Title': 'Video Translate'
        }

    client = OpenAI(**client_args)

    # Split into batches
    batches = []
    for i in range(0, len(subtitles), BATCH_SIZE):
        batches.append((i, subtitles[i:i + BATCH_SIZE]))

    total_batches = len(batches)
    completed_batches = [0]
    start_time = [time.time()]
    batch_times = []  # Track time per batch for ETA
    historical_avg = get_historical_batch_time()
    
    logger.info(f"[TRANSLATE] Translating {len(subtitles)} subtitles in {total_batches} batches ({MAX_WORKERS} parallel, hist avg: {historical_avg:.1f}s)")

    def translate_batch(batch_data, is_retry=False):
        """Translate a single batch with rate limit handling."""
        batch_start = time.time()
        batch_idx, batch = batch_data
        batch_num = batch_idx // BATCH_SIZE + 1

        numbered_subs = "\n".join([f"{i+1}. {s['text']}" for i, s in enumerate(batch)])

        system_prompt = f"You are a professional subtitle translator. You ONLY output {t_name}. Never output Chinese unless the target language is Chinese."
        user_prompt = f"""Translate these {len(batch)} subtitles to {t_name}.

TARGET LANGUAGE: {t_name} (code: {target_lang})
CRITICAL: Your output MUST be in {t_name}. Do NOT output Chinese, Japanese, or any other language except {t_name}.

Return exactly {len(batch)} numbered translations, one per line.
Format: "1. [translation in {t_name}]"

Rules:
- Output ONLY in {t_name} language
- Return numbered translations 1 to {len(batch)}
- Keep concise for subtitles
- No explanations or notes

Subtitles to translate:
{numbered_subs}

Remember: Output MUST be in {t_name} only."""

        translations = []
        # Local Max Retries for this thread
        for attempt in range(MAX_RETRIES + 1):
            try:
                response = client.chat.completions.create(
                    model=SERVER_MODEL,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    temperature=0.3,
                    max_tokens=4096
                )

                content = response.choices[0].message.content

                # Parse translations
                lines = content.strip().split('\n')
                translations = []
                for line in lines:
                    cleaned = line.strip()
                    if not cleaned: continue
                    if cleaned[0].isdigit():
                        match = re.match(r'^\d+[\.\)\:\-]\s*(.*)', cleaned)
                        if match:
                            cleaned = match.group(1).strip()
                    if cleaned:
                        translations.append(cleaned)

                # Verify count - if we have most of them, accept it
                if len(translations) >= len(batch) * 0.8:
                    batch_duration = time.time() - batch_start
                    logger.info(f"[TRANSLATE] Batch {batch_num}/{total_batches} OK ({len(translations)}/{len(batch)}) in {batch_duration:.1f}s")
                    return batch_idx, translations, True, batch_duration
                else:
                    logger.warning(f"[TRANSLATE] Batch {batch_num} incomplete: {len(translations)}/{len(batch)}")

            except Exception as e:
                error_str = str(e)
                logger.error(f"[TRANSLATE] Batch {batch_num} attempt {attempt+1} failed: {e}")

                # Handle rate limits with exponential backoff
                if '429' in error_str or 'rate' in error_str.lower():
                    wait_time = 2 ** (attempt + 1)
                    if 'retry in' in error_str.lower():
                        try:
                            match = re.search(r'retry in (\d+)', error_str.lower())
                            if match:
                                wait_time = int(match.group(1)) + 1
                        except:
                            pass
                    logger.warning(f"[TRANSLATE] Rate limited, waiting {wait_time}s...")
                    time.sleep(wait_time)
                elif attempt < MAX_RETRIES:
                    time.sleep(1)

        batch_duration = time.time() - batch_start
        return batch_idx, translations if translations else [], False, batch_duration

    def process_batches(batch_list, round_num=1):
        results = {}
        failed_batches = []

        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            futures = {executor.submit(translate_batch, batch, round_num > 1): batch for batch in batch_list}

            for future in as_completed(futures):
                batch_idx, translations, success, duration = future.result()
                results[batch_idx] = translations
                completed_batches[0] += 1
                batch_times.append(duration)

                if not success or len(translations) < len(batches[batch_idx // BATCH_SIZE][1]) * 0.8:
                    failed_batches.append(batches[batch_idx // BATCH_SIZE])

                # Calculate ETA
                remaining_batches = total_batches - completed_batches[0]
                if batch_times:
                    avg_time = sum(batch_times) / len(batch_times)
                else:
                    avg_time = historical_avg

                eta_seconds = (remaining_batches / MAX_WORKERS) * avg_time
                eta_str = format_eta(eta_seconds) if remaining_batches > 0 else "almost done"

                if progress_callback:
                    pct = int((completed_batches[0] / total_batches) * 100)
                    progress_callback(completed_batches[0], total_batches, min(pct, 99), eta_str)

        return results, failed_batches

    # Initial pass
    results, failed_batches = process_batches(batches)

    # Retry failed batches
    for retry_round in range(RETRY_ROUNDS):
        if not failed_batches:
            break
        logger.info(f"[TRANSLATE] Retry round {retry_round + 1}: {len(failed_batches)} failed batches")
        time.sleep(5)
        retry_results, failed_batches = process_batches(failed_batches, retry_round + 2)
        results.update(retry_results)

    # Apply translations
    for batch_idx, batch in batches:
        translations = results.get(batch_idx, [])
        while len(translations) < len(batch):
            translations.append('')
        translations = translations[:len(batch)]

        for i, sub in enumerate(batch):
            sub['translatedText'] = translations[i]

    # Save stats
    if batch_times:
        save_batch_time_history(batch_times)

    # Verification
    total_empty = sum(1 for s in subtitles if not s.get('translatedText'))
    elapsed = time.time() - start_time[0]
    if total_empty > 0:
        logger.warning(f"[TRANSLATE] DONE: {total_empty}/{len(subtitles)} empty translations in {elapsed:.1f}s")
    else:
        logger.info(f"[TRANSLATE] DONE: All {len(subtitles)} translated in {elapsed:.1f}s!")

    return subtitles

def translate_subtitles_simple(
    subtitles: List[Dict[str, Any]], 
    source_lang: str, 
    target_lang: str,
    model_id: str,
    api_key: str,
    api_url: Optional[str] = None
) -> Dict[str, Any]:
    """Translate subtitles using provided credentials (Tier 1/2)."""
    
    # Calculate stats
    total_chars = sum(len(s.get('text', '')) for s in subtitles)
    estimated_tokens = total_chars // 4
    
    logger.info(f"{'='*60}")
    logger.info(f"TRANSLATION REQUEST")
    logger.info(f"  Subtitles: {len(subtitles)} | Chars: {total_chars} | Est. tokens: {estimated_tokens}")
    logger.info(f"  Direction: {source_lang} -> {target_lang}")
    logger.info(f"  Model: {model_id}")
    logger.info(f"{'='*60}")

    # Build prompt
    s_name = LANG_NAMES.get(source_lang, source_lang)
    t_name = LANG_NAMES.get(target_lang, target_lang)
    numbered_subs = "\n".join([f"{i+1}. {s.get('text', '')}" for i, s in enumerate(subtitles)])

    system_prompt = f"You are a professional subtitle translator. You ONLY output {t_name}. Never output Chinese unless translating TO Chinese."
    user_prompt = f"""Translate the following subtitles from {s_name} to {t_name}.

TARGET LANGUAGE: {t_name} (code: {target_lang})
CRITICAL: Your output MUST be in {t_name}. Do NOT output Chinese or any other language except {t_name}.

Rules:
- Maintain original meaning, tone, and emotion
- Keep translations concise for subtitle display
- Preserve speaker indicators and sound effects in brackets
- Return ONLY numbered translations, one per line
- No explanations or notes
- Output MUST be in {t_name}

Subtitles:
{numbered_subs}

Remember: All output must be in {t_name}."""

    client_args = {'api_key': api_key}
    extra_headers = {}

    if api_url:
        client_args['base_url'] = api_url.rstrip('/')
        if 'openrouter.ai' in api_url:
            extra_headers['HTTP-Referer'] = 'https://video-translate.app'
            extra_headers['X-Title'] = 'Video Translate'

    if extra_headers:
        client_args['default_headers'] = extra_headers

    try:
        client = OpenAI(**client_args)
        
        start_time = time.time()
        logger.info("Sending request to LLM...")

        response = client.chat.completions.create(
            model=model_id,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.3,
            max_tokens=8192
        )

        elapsed = time.time() - start_time
        logger.info(f"Response received in {elapsed:.2f}s")

        content = response.choices[0].message.content

        # Parse response
        lines = content.strip().split('\n')
        translations = []
        for line in lines:
            cleaned = line.strip()
            if cleaned and cleaned[0].isdigit():
                match = re.match(r'^\d+[\.\)]\s*(.*)', cleaned)
                if match:
                    cleaned = match.group(1).strip()
            
            if cleaned:
                translations.append(cleaned)

        logger.info(f"Received {len(translations)} translations (Expected {len(subtitles)})")
        
        # Ensure correct count
        expected = len(subtitles)
        if len(translations) != expected:
            logger.warning(f"Translation count mismatch! Expected {expected}, got {len(translations)}")
            if len(translations) < expected:
                while len(translations) < expected:
                    translations.append("")
            else:
                translations = translations[:expected]

        return {'translations': translations}

    except Exception as e:
        logger.exception("Translation error")
        raise e
