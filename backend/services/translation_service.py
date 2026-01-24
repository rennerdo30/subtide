import os
import json
import time
import re
import math
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict, Any, Tuple, Optional, Callable

from backend.config import CACHE_DIR, LANG_NAMES, SERVER_API_KEY, SERVER_API_URL, SERVER_MODEL, get_model_for_language
from backend.utils.logging_utils import log_with_context, LogContext
from backend.utils.partial_cache import (
    save_partial_progress, load_partial_progress, clear_partial_progress, compute_source_hash
)
from backend.utils.language_detection import validate_batch_language, detect_source_language_leakage
from backend.utils.model_utils import supports_json_mode

logger = logging.getLogger('subtide')

def get_historical_batch_time() -> float:
    """Get average batch time from history for initial ETA estimate."""
    history_path = os.path.join(CACHE_DIR, 'batch_time_history.json')
    try:
        if os.path.exists(history_path):
            with open(history_path, 'r') as f:
                history = json.load(f)
                if history.get('times'):
                    return sum(history['times']) / len(history['times'])
    except (OSError, json.JSONDecodeError, KeyError, TypeError):
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

    # Handle edge case of zero or very few subtitles
    if subtitle_count <= 0:
        return avg_batch_time  # Return minimum estimate

    total_batches = (subtitle_count + batch_size - 1) // batch_size
    # Effective batches (parallelized) - ensure at least 1
    effective_batches = max(1, (total_batches + max_workers - 1) // max_workers)

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

def ms_to_timestamp(ms: int) -> str:
    """Convert milliseconds to HH:MM:SS format."""
    ms = int(ms)  # Handle float inputs gracefully
    s = ms // 1000
    h = s // 3600
    m = (s % 3600) // 60
    s = s % 60
    return f"{h:02d}:{m:02d}:{s:02d}"

def await_translate_subtitles(
    subtitles: List[Dict[str, Any]],
    target_lang: str,
    progress_callback: Optional[Callable[[int, int, int, str], None]] = None,
    batch_result_callback: Optional[Callable[[int, int, List[Dict[str, Any]]], None]] = None,
    terminology: Optional[List[str]] = None,
    video_id: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Translate subtitles using LLM with parallel batching, rate limit handling, and retry.

    Args:
        subtitles: List of subtitle dicts with 'text' field
        target_lang: Target language code
        progress_callback: Called with (completed_batches, total_batches, percent, eta_str)
        batch_result_callback: Called with (batch_index, total_batches, translated_batch)
                               when each batch completes - enables streaming results
        terminology: Optional list of proper nouns/terms to preserve in translation
        video_id: Optional video ID for partial cache (enables batch resume on failure)
    """

    # Configuration constants
    BATCH_SIZE = 25
    MAX_RETRIES = 3
    RETRY_ROUNDS = 2

    t_name = LANG_NAMES.get(target_lang, target_lang)

    # Initialize LLM Provider
    from backend.services.llm.factory import get_llm_provider
    try:
        provider = get_llm_provider()
    except Exception as e:
        logger.error(f"Failed to initialize LLM provider: {e}")
        raise e

    # Use provider's specific concurrency limit
    MAX_WORKERS = provider.concurrency_limit

    # Split into batches
    batches = []
    for i in range(0, len(subtitles), BATCH_SIZE):
        batches.append((i, subtitles[i:i + BATCH_SIZE]))

    total_batches = len(batches)
    completed_batches = [0]
    start_time = [time.time()]
    batch_times = []  # Track time per batch for ETA
    historical_avg = get_historical_batch_time()
    
    # Partial cache for batch resume
    source_hash = compute_source_hash(subtitles) if video_id else None
    cached_results = {}
    if video_id and source_hash:
        cached_results = load_partial_progress(video_id, target_lang, source_hash) or {}
        if cached_results:
            log_with_context(logger, 'INFO', f"[TRANSLATE] Resuming from cache: {len(cached_results)}/{total_batches} batches already done")
    
    # Calculate time range for logs
    time_range = ""
    if subtitles:
        start_ms = subtitles[0].get('start', 0)
        end_ms = subtitles[-1].get('end', 0)
        time_range = f"({ms_to_timestamp(start_ms)} - {ms_to_timestamp(end_ms)})"

    log_with_context(logger, 'INFO', f"[TRANSLATE] Translating {len(subtitles)} subtitles {time_range} in {total_batches} batches ({MAX_WORKERS} parallel) using {provider.provider_name}:{provider.default_model}")

    def translate_batch(batch_data, is_retry=False):
        """Translate a single batch with rate limit handling."""
        batch_idx, batch = batch_data
        batch_num = batch_idx // BATCH_SIZE + 1
        
        # Log batch time range
        b_time_range = ""
        if batch:
            b_start = batch[0].get('start', 0)
            b_end = batch[-1].get('end', 0)
            b_time_range = f"[{ms_to_timestamp(b_start)}-{ms_to_timestamp(b_end)}]"
        
        log_with_context(logger, 'INFO', f"[TRANSLATE] Batch {batch_num}/{total_batches} starting {b_time_range} ({len(batch)} subtitles)...")
        batch_start = time.time()

        numbered_subs = "\n".join([f"{i+1}. {s['text']}" for i, s in enumerate(batch)])
        
        # Context window: use TRANSLATED text from previous segments for continuity
        context_str = ""
        if batch_idx > 0:
            context_start = max(0, batch_idx - 3)
            context_subs = subtitles[context_start:batch_idx]
            if context_subs:
                prev_texts = [s.get('translatedText', '') for s in context_subs if s.get('translatedText')]
                if prev_texts:
                    context_str = f"\n\n(Previous translations for context continuity - maintain consistent style:)\n" + "\n".join([f"[prev] {t}" for t in prev_texts])

        # Build terminology string
        terminology_str = ""
        if terminology and len(terminology) > 0:
            terms_list = ", ".join(terminology[:15])
            terminology_str = f" Keep these proper nouns/terms consistent: {terms_list}."

        # Determine prompt mode
        # We rely on provider capabilities. Most support JSON schema or at least text.
        # We'll default to JSON mode logic if the provider likely supports it, but abstract it via generate_json
        
        # System Prompt
        system_prompt = f"""You are a subtitle translator. You MUST output ONLY {t_name} ({target_lang}).{terminology_str}
CRITICAL: Every translation MUST be in {t_name}. Never output English or any other language.
Return a JSON object with a "translations" array containing exactly {len(batch)} translated strings."""

        user_prompt = f"""Translate these subtitles to {t_name} ({target_lang}).

STRICT RULES:
1. OUTPUT LANGUAGE: {t_name} ONLY - this is mandatory
2. Never output English (unless {t_name} IS English)
3. Never copy the source text - always translate
4. Keep translations concise for subtitle display

Source subtitles to translate:
{numbered_subs}{context_str}

Return JSON with {len(batch)} translations in {t_name}: {{"translations": ["...", "..."]}}"""

        translations = []
        last_failure_reason = None
        usage = None

        for attempt in range(MAX_RETRIES + 1):
            try:
                # Retry context
                current_prompt = user_prompt
                if attempt > 0 and last_failure_reason:
                    current_prompt += f"\n\n**RETRY ATTEMPT {attempt}**: Previous translation was REJECTED because: {last_failure_reason}. You MUST output ALL translations in {t_name} this time."

                temperature = 0.3 + (attempt * 0.1)

                # Call Provider
                # We try generate_json
                try:
                    json_response = provider.generate_json(
                        prompt=current_prompt,
                        system_prompt=system_prompt,
                        temperature=min(temperature, 0.7),
                        max_tokens=4096
                    )
                    
                    if isinstance(json_response, dict) and 'translations' in json_response:
                        translations = json_response['translations']
                    elif isinstance(json_response, list):
                        translations = json_response
                    else:
                         # Fallback for loose JSON
                         for key, value in json_response.items():
                            if isinstance(value, list) and len(value) > 0:
                                translations = value
                                break
                    
                    # If we got here, JSON usage was mostly successful, but let's check content
                    if not translations:
                        raise ValueError("Empty or invalid JSON structure")

                except Exception as json_err:
                     log_with_context(logger, 'WARNING', f"[TRANSLATE] JSON generation failed ({json_err}), falling back to text generation...")
                     # Fallback to text generation
                     text_response = provider.generate_text(
                        prompt=current_prompt + "\n\nProvide strictly numbered lines.",
                        system_prompt=system_prompt,
                        temperature=min(temperature, 0.7),
                        max_tokens=4096
                     )
                     
                     # Parse numbered lines
                     lines = text_response.strip().split('\n')
                     translations = []
                     for line in lines:
                        cleaned = line.strip()
                        if not cleaned: continue
                        if cleaned[0].isdigit():
                            match = re.search(r'^\d+[\.\)\:]\s*(.*)', cleaned)
                            if match: cleaned = match.group(1).strip()
                        if cleaned:
                            translations.append(cleaned)

                # Verify count
                if len(translations) >= len(batch) * 0.8:
                    batch_duration = time.time() - batch_start

                    # Language validation
                    is_valid_lang, invalid_indices, lang_reason = validate_batch_language(translations, target_lang)

                    if not is_valid_lang:
                        log_with_context(logger, 'WARNING', f"[TRANSLATE] Batch {batch_num} wrong language: {lang_reason}")
                        if attempt < MAX_RETRIES:
                            last_failure_reason = f"Output contained wrong language ({lang_reason}). Expected {t_name}."
                            time.sleep(1)
                            continue

                    # Source leakage check
                    source_texts = [s.get('text', '') for s in batch[:len(translations)]]
                    has_leakage, leakage_indices = detect_source_language_leakage(source_texts, translations)

                    if has_leakage:
                        log_with_context(logger, 'WARNING', f"[TRANSLATE] Batch {batch_num} has source leakage")
                        if attempt < MAX_RETRIES:
                            last_failure_reason = f"Source text was copied without translation ({len(leakage_indices)} lines)."
                            time.sleep(1)
                            continue

                    log_with_context(logger, 'INFO', f"[TRANSLATE] Batch {batch_num}/{total_batches} OK ({len(translations)}/{len(batch)}) in {batch_duration:.1f}s")
                    return batch_idx, translations, True, batch_duration, usage
                else:
                    logger.warning(f"[TRANSLATE] Batch {batch_num} incomplete: {len(translations)}/{len(batch)}")
                    if attempt < MAX_RETRIES:
                        last_failure_reason = f"Incomplete result. Expected {len(batch)} translations, got {len(translations)}."
                        time.sleep(1)
                        continue

            except Exception as e:
                error_str = str(e)
                log_with_context(logger, 'ERROR', f"[TRANSLATE] Batch {batch_num} attempt {attempt+1} failed: {e}")
                
                # Check for rate limits (simple string check as provider errors are normalized to strings/exceptions)
                if '429' in error_str or 'rate' in error_str.lower() or 'quota' in error_str.lower():
                    wait_time = 2 ** (attempt + 1)
                    if 'retry in' in error_str.lower():
                         # Try to parse wait time
                         pass 
                    logger.warning(f"[TRANSLATE] Rate limit/Quota hit, waiting {wait_time}s")
                    time.sleep(wait_time)
                elif attempt < MAX_RETRIES:
                    time.sleep(1)

        batch_duration = time.time() - batch_start
        return batch_idx, translations if translations else [], False, batch_duration, None

    def process_batches(batch_list, round_num=1):
        results = {}
        failed_batches = []
        total_usage = {'prompt_tokens': 0, 'completion_tokens': 0, 'total_tokens': 0}

        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            futures = {executor.submit(translate_batch, batch, round_num > 1): batch for batch in batch_list}

            for future in as_completed(futures):
                batch_idx, translations, success, duration, usage = future.result()
                results[batch_idx] = translations
                completed_batches[0] += 1
                batch_times.append(duration)

                # Accumulate token usage for cost tracking
                if usage:
                    total_usage['prompt_tokens'] += usage.get('prompt_tokens', 0)
                    total_usage['completion_tokens'] += usage.get('completion_tokens', 0)
                    total_usage['total_tokens'] += usage.get('total_tokens', 0)

                batch_data = batches[batch_idx // BATCH_SIZE][1]

                if not success or len(translations) < len(batch_data) * 0.8:
                    failed_batches.append(batches[batch_idx // BATCH_SIZE])
                else:
                    # Apply translations immediately for streaming
                    padded_translations = translations[:]
                    while len(padded_translations) < len(batch_data):
                        padded_translations.append('')
                    padded_translations = padded_translations[:len(batch_data)]

                    for i, sub in enumerate(batch_data):
                        sub['translatedText'] = padded_translations[i]

                    # Stream the translated batch immediately
                    if batch_result_callback:
                        batch_result_callback(
                            completed_batches[0],  # 1-indexed batch number
                            total_batches,
                            batch_data  # Already has translatedText applied
                        )
                    
                    # Save progress for batch resume
                    if video_id and source_hash:
                        results_for_cache = {str(k): v for k, v in results.items()}
                        save_partial_progress(video_id, target_lang, results_for_cache, total_batches, source_hash)

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

        return results, failed_batches, total_usage

    # Initial pass
    results, failed_batches, usage_totals = process_batches(batches)

    # Retry failed batches
    for retry_round in range(RETRY_ROUNDS):
        if not failed_batches:
            break
        logger.info(f"[TRANSLATE] Retry round {retry_round + 1}: {len(failed_batches)} failed batches")
        time.sleep(3)  # Reduced from 5s to 3s for faster retries
        retry_results, failed_batches, retry_usage = process_batches(failed_batches, retry_round + 2)
        results.update(retry_results)
        # Accumulate retry usage
        usage_totals['prompt_tokens'] += retry_usage.get('prompt_tokens', 0)
        usage_totals['completion_tokens'] += retry_usage.get('completion_tokens', 0)
        usage_totals['total_tokens'] += retry_usage.get('total_tokens', 0)

    # Apply translations for batches that weren't streamed
    # (retried batches or when batch_result_callback is not provided)
    for batch_idx, batch in batches:
        translations = results.get(batch_idx, [])
        while len(translations) < len(batch):
            translations.append('')
        translations = translations[:len(batch)]

        for i, sub in enumerate(batch):
            # Only apply if not already set (streaming mode sets it inline)
            if not sub.get('translatedText'):
                sub['translatedText'] = translations[i]

    # Retry empty individual translations
    EMPTY_RETRY_ROUNDS = 2
    for empty_retry in range(EMPTY_RETRY_ROUNDS):
        # Collect subtitles with empty translations
        empty_subs = [(idx, sub) for idx, sub in enumerate(subtitles) if not sub.get('translatedText')]

        if not empty_subs:
            break

        logger.info(f"[TRANSLATE] Empty retry round {empty_retry + 1}: {len(empty_subs)} empty translations to retry")

        # Batch the empty subs (smaller batches for retries)
        empty_batch_size = min(BATCH_SIZE // 2, 10)
        empty_batches = []
        for i in range(0, len(empty_subs), empty_batch_size):
            batch_items = empty_subs[i:i + empty_batch_size]
            empty_batches.append((i, batch_items))

        # Retry each empty batch
        for batch_num, batch_items in empty_batches:
            if not batch_items:
                continue

            # Extract just the subs for translation
            batch_subs = [item[1] for item in batch_items]
            original_indices = [item[0] for item in batch_items]

            numbered_subs = "\n".join([f"{i+1}. {s['text']}" for i, s in enumerate(batch_subs)])

            system_prompt = f"""You are a subtitle translator. Translate to {t_name} ({target_lang}).
Return a JSON object with a "translations" array containing exactly {len(batch_subs)} translated strings."""

            user_prompt = f"""Translate these subtitles to {t_name} ({target_lang}):

{numbered_subs}

Return JSON: {{"translations": ["...", "..."]}}"""

            try:
                json_response = provider.generate_json(
                    prompt=user_prompt,
                    system_prompt=system_prompt,
                    temperature=0.5,
                    max_tokens=2048
                )

                retry_translations = []
                if isinstance(json_response, dict) and 'translations' in json_response:
                    retry_translations = json_response['translations']
                elif isinstance(json_response, list):
                    retry_translations = json_response

                # Apply retry results
                for i, orig_idx in enumerate(original_indices):
                    if i < len(retry_translations) and retry_translations[i]:
                        subtitles[orig_idx]['translatedText'] = retry_translations[i]

                filled = sum(1 for i, idx in enumerate(original_indices) if i < len(retry_translations) and retry_translations[i])
                logger.info(f"[TRANSLATE] Empty retry filled {filled}/{len(batch_items)} translations")

            except Exception as e:
                logger.warning(f"[TRANSLATE] Empty retry batch failed: {e}")
                continue

        time.sleep(1)  # Brief pause between retry rounds

    # Save stats
    if batch_times:
        save_batch_time_history(batch_times)

    # Verification
    total_empty = sum(1 for s in subtitles if not s.get('translatedText'))
    elapsed = time.time() - start_time[0]
    if total_empty > 0:
        log_with_context(logger, 'WARNING', f"[TRANSLATE] DONE: {total_empty}/{len(subtitles)} empty translations in {elapsed:.1f}s")
    else:
        log_with_context(logger, 'INFO', f"[TRANSLATE] DONE: All {len(subtitles)} translated in {elapsed:.1f}s!")
        # Clear cache on full success
        if video_id:
            clear_partial_progress(video_id, target_lang)

    # Log token usage for cost tracking (Tier 3)
    if usage_totals and usage_totals.get('total_tokens', 0) > 0:
        prompt_tokens = usage_totals['prompt_tokens']
        completion_tokens = usage_totals['completion_tokens']
        total_tokens = usage_totals['total_tokens']
        # Estimate cost (approximate pricing for common models)
        # GPT-4: ~$0.03/1K prompt, $0.06/1K completion
        # GPT-3.5-turbo: ~$0.0005/1K prompt, $0.0015/1K completion
        # Claude: ~$0.008/1K prompt, $0.024/1K completion
        estimated_cost = (prompt_tokens * 0.01 + completion_tokens * 0.03) / 1000  # Conservative average
        log_with_context(logger, 'INFO',
            f"[COST] Tokens: {total_tokens:,} (prompt: {prompt_tokens:,}, completion: {completion_tokens:,}) | Est. cost: ${estimated_cost:.4f}")

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
    log_with_context(logger, 'INFO', f"TRANSLATION REQUEST")
    logger.info(f"  Subtitles: {len(subtitles)} | Chars: {total_chars} | Est. tokens: {estimated_tokens}")
    logger.info(f"  Direction: {source_lang} -> {target_lang}")
    logger.info(f"  Model: {model_id}")
    logger.info(f"{'='*60}")

    # Build prompt
    s_name = LANG_NAMES.get(source_lang, source_lang)
    t_name = LANG_NAMES.get(target_lang, target_lang)
    numbered_subs = "\n".join([f"{i+1}. {s.get('text', '')}" for i, s in enumerate(subtitles)])

    # Check if model supports JSON structured output
    use_json_mode = supports_json_mode(model_id)

    if use_json_mode:
        # JSON mode: more reliable parsing
        system_prompt = f"""You are a professional subtitle translator. You MUST output ONLY {t_name} ({target_lang}).
CRITICAL: Every translation MUST be in {t_name}. Never output English or any other language unless that IS the target.
Return a JSON object with a "translations" array containing exactly {len(subtitles)} translated strings."""

        user_prompt = f"""Translate these subtitles from {s_name} to {t_name} ({target_lang}).

STRICT RULES:
1. OUTPUT LANGUAGE: {t_name} ONLY - this is mandatory
2. Never output English or source language (unless {t_name} IS that language)
3. Never copy source text - always translate
4. Keep translations concise for subtitle display
5. Preserve speaker indicators [brackets] and sound effects

Subtitles to translate:
{numbered_subs}

Return JSON with {len(subtitles)} translations in {t_name}: {{"translations": ["...", "..."]}}"""
    else:
        # Numbered lines mode: fallback
        system_prompt = f"""You are a professional subtitle translator. You MUST output ONLY {t_name} ({target_lang}).
CRITICAL: Every line MUST be in {t_name}. Never output English or any other language unless that IS the target."""

        user_prompt = f"""Translate from {s_name} to {t_name} ({target_lang}).

STRICT RULES:
1. OUTPUT LANGUAGE: {t_name} ONLY - this is mandatory
2. Never output English or source language (unless {t_name} IS that language)
3. Never copy source text - always translate
4. Format: "1. [translation in {t_name}]"
5. No explanations, only numbered translations

Subtitles:
{numbered_subs}

All {len(subtitles)} outputs MUST be in {t_name}."""

    # Instantiate OpenAIProvider directly for simple/Tier 1 usage
    from backend.services.llm.openai_provider import OpenAIProvider
    
    # Map api_url if provided
    base_url = api_url.rstrip('/') if api_url else None
    
    # Handle specific headers for OpenRouter if referenced in URL
    # OpenAIProvider doesn't strictly abstract 'extra_headers' in __init__ easily without modification 
    # or we can pass them in generate if we extended the base class.
    # However, standard OpenAIProvider logic in init doesn't take headers.
    # But usually base_url is enough. The headers were for "Referer" which is good practice but maybe not critical for "simple".
    # OR we can modify OpenAIProvider to accept default_headers.
    # Let's check OpenAIProvider implementation... it does NOT accept default_headers in init.
    # But we can patch the client or just accept that simple mode might miss strict headers for OR.
    # Actually, simpler: just rely on the AbstractLLMProvider method which we control.
    # But OpenAIProvider uses self.client underneath.
    
    # Let's just assume standard usage.
    try:
        provider = OpenAIProvider(api_key=api_key, model=model_id, base_url=base_url)
    except Exception as e:
        logger.error(f"Failed to create provider: {e}")
        raise e

    start_time = time.time()
    logger.info(f"Sending request to LLM... (JSON mode: {use_json_mode})")

    try:
        if use_json_mode:
             json_response = provider.generate_json(
                 prompt=user_prompt,
                 system_prompt=system_prompt,
                 temperature=0.3,
                 max_tokens=8192
             )
             # Determine translations from JSON
             if isinstance(json_response, dict) and 'translations' in json_response:
                 translations = json_response['translations']
             elif isinstance(json_response, list):
                 translations = json_response
             else:
                 translations = [] # Fallback logic below
                 
        else:
             # Text mode
             text_response = provider.generate_text(
                 prompt=user_prompt,
                 system_prompt=system_prompt,
                 temperature=0.3,
                 max_tokens=8192
             )
             # Parse
             lines = text_response.strip().split('\n')
             translations = []
             for line in lines:
                cleaned = line.strip()
                if cleaned and cleaned[0].isdigit():
                    match = re.search(r'^\d+[\.\)]\s*(.*)', cleaned)
                    if match: cleaned = match.group(1).strip()
                if cleaned:
                    translations.append(cleaned)

        elapsed = time.time() - start_time
        logger.info(f"Response received in {elapsed:.2f}s")
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

        return {'translations': translations, 'usage': None} # usage tracking abstracted away/not returned by generate_* yet

    except Exception as e:
        logger.exception("Translation error")
        raise e
