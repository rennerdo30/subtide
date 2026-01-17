"""
TTS (Text-to-Speech) Service

Supports multiple TTS backends:
- edge-tts (primary) - Microsoft Edge TTS, free and high quality
- gTTS (fallback) - Google Text-to-Speech, free
"""

import os
import hashlib
import logging
import asyncio
from typing import Optional, Dict, List, Tuple

from backend.config import CACHE_DIR

logger = logging.getLogger('subtide')

# TTS cache directory
TTS_CACHE_DIR = os.path.join(CACHE_DIR, 'tts')
os.makedirs(TTS_CACHE_DIR, exist_ok=True)

# TTS Configuration
TTS_ENABLED = os.getenv('TTS_ENABLED', 'true').lower() == 'true'
TTS_BACKEND = os.getenv('TTS_BACKEND', 'edge-tts')  # edge-tts or gtts

# Default voices per language (edge-tts voice names)
DEFAULT_VOICES = {
    'en': 'en-US-AriaNeural',
    'es': 'es-ES-ElviraNeural',
    'fr': 'fr-FR-DeniseNeural',
    'de': 'de-DE-KatjaNeural',
    'ja': 'ja-JP-NanamiNeural',
    'ko': 'ko-KR-SunHiNeural',
    'zh-CN': 'zh-CN-XiaoxiaoNeural',
    'zh-TW': 'zh-TW-HsiaoChenNeural',
    'pt': 'pt-BR-FranciscaNeural',
    'ru': 'ru-RU-SvetlanaNeural',
    'it': 'it-IT-ElsaNeural',
    'ar': 'ar-SA-ZariyahNeural',
    'hi': 'hi-IN-SwaraNeural',
    'nl': 'nl-NL-ColetteNeural',
    'pl': 'pl-PL-ZofiaNeural',
    'tr': 'tr-TR-EmelNeural',
    'vi': 'vi-VN-HoaiMyNeural',
    'th': 'th-TH-PremwadeeNeural',
    'id': 'id-ID-GadisNeural',
}


def get_cache_key(text: str, lang: str, voice_id: Optional[str] = None) -> str:
    """Generate a cache key for TTS audio."""
    voice = voice_id or DEFAULT_VOICES.get(lang, DEFAULT_VOICES.get('en'))
    content = f"{text}:{lang}:{voice}"
    return hashlib.sha256(content.encode('utf-8')).hexdigest()[:16]


def get_cache_path(cache_key: str) -> str:
    """Get the file path for a cached TTS audio file."""
    return os.path.join(TTS_CACHE_DIR, f"{cache_key}.mp3")


def is_cached(text: str, lang: str, voice_id: Optional[str] = None) -> bool:
    """Check if TTS audio is cached."""
    cache_key = get_cache_key(text, lang, voice_id)
    cache_path = get_cache_path(cache_key)
    return os.path.exists(cache_path)


def get_cached_audio(text: str, lang: str, voice_id: Optional[str] = None) -> Optional[bytes]:
    """Get cached TTS audio if available."""
    cache_key = get_cache_key(text, lang, voice_id)
    cache_path = get_cache_path(cache_key)

    if os.path.exists(cache_path):
        with open(cache_path, 'rb') as f:
            return f.read()
    return None


def _cache_audio(audio_bytes: bytes, text: str, lang: str, voice_id: Optional[str] = None) -> str:
    """Cache TTS audio and return the cache path."""
    cache_key = get_cache_key(text, lang, voice_id)
    cache_path = get_cache_path(cache_key)

    with open(cache_path, 'wb') as f:
        f.write(audio_bytes)

    return cache_path


async def _generate_edge_tts(text: str, voice: str) -> bytes:
    """Generate TTS audio using edge-tts."""
    import edge_tts

    communicate = edge_tts.Communicate(text, voice)
    audio_data = b''

    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_data += chunk["data"]

    return audio_data


def _generate_gtts(text: str, lang: str) -> bytes:
    """Generate TTS audio using gTTS (fallback)."""
    from gtts import gTTS
    from io import BytesIO

    # Extract base language code for gTTS
    base_lang = lang.split('-')[0]

    tts = gTTS(text=text, lang=base_lang, slow=False)
    audio_buffer = BytesIO()
    tts.write_to_fp(audio_buffer)
    audio_buffer.seek(0)

    return audio_buffer.read()


def generate_tts(
    text: str,
    lang: str = 'en',
    voice_id: Optional[str] = None,
    use_cache: bool = True
) -> Tuple[bytes, str]:
    """
    Generate TTS audio for the given text.

    Args:
        text: Text to convert to speech
        lang: Target language code (e.g., 'en', 'ja', 'es')
        voice_id: Optional specific voice ID (edge-tts voice name)
        use_cache: Whether to use/store cached audio

    Returns:
        Tuple of (audio_bytes, content_type)
    """
    if not TTS_ENABLED:
        raise RuntimeError("TTS is disabled on this server")

    if not text or not text.strip():
        raise ValueError("Text cannot be empty")

    # Check cache first
    if use_cache:
        cached = get_cached_audio(text, lang, voice_id)
        if cached:
            logger.debug(f"[TTS] Cache hit for: {text[:30]}...")
            return cached, 'audio/mpeg'

    # Get voice for this language
    voice = voice_id or DEFAULT_VOICES.get(lang) or DEFAULT_VOICES.get(lang.split('-')[0]) or DEFAULT_VOICES['en']

    logger.info(f"[TTS] Generating audio: lang={lang}, voice={voice}, text={text[:50]}...")

    audio_bytes = None

    # Try edge-tts first (primary backend)
    if TTS_BACKEND == 'edge-tts':
        try:
            # Run async edge-tts in sync context
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                audio_bytes = loop.run_until_complete(_generate_edge_tts(text, voice))
            finally:
                loop.close()

            logger.debug(f"[TTS] edge-tts generated {len(audio_bytes)} bytes")
        except Exception as e:
            logger.warning(f"[TTS] edge-tts failed: {e}, falling back to gTTS")

    # Fallback to gTTS
    if audio_bytes is None:
        try:
            audio_bytes = _generate_gtts(text, lang)
            logger.debug(f"[TTS] gTTS generated {len(audio_bytes)} bytes")
        except Exception as e:
            logger.error(f"[TTS] gTTS also failed: {e}")
            raise RuntimeError(f"TTS generation failed: {e}")

    # Cache the result
    if use_cache and audio_bytes:
        _cache_audio(audio_bytes, text, lang, voice_id)

    return audio_bytes, 'audio/mpeg'


def get_available_voices(lang: Optional[str] = None) -> List[Dict]:
    """
    Get available TTS voices.

    Args:
        lang: Optional language filter (e.g., 'en' returns only English voices)

    Returns:
        List of voice dictionaries with id, name, and lang
    """
    if TTS_BACKEND != 'edge-tts':
        # gTTS doesn't have voice selection
        return [{'id': 'default', 'name': 'Default', 'lang': lang or 'en'}]

    try:
        import edge_tts

        # Run async voices list in sync context
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            voices = loop.run_until_complete(edge_tts.list_voices())
        finally:
            loop.close()

        result = []
        for voice in voices:
            voice_lang = voice.get('Locale', '')
            voice_id = voice.get('ShortName', '')
            voice_name = voice.get('FriendlyName', voice_id)

            # Filter by language if specified
            if lang:
                base_lang = lang.split('-')[0].lower()
                voice_base_lang = voice_lang.split('-')[0].lower()
                if voice_base_lang != base_lang:
                    continue

            result.append({
                'id': voice_id,
                'name': voice_name,
                'lang': voice_lang,
                'gender': voice.get('Gender', 'Unknown')
            })

        return result

    except Exception as e:
        logger.warning(f"[TTS] Failed to list voices: {e}")
        # Return default voices as fallback
        if lang:
            default_voice = DEFAULT_VOICES.get(lang, DEFAULT_VOICES.get('en'))
            return [{'id': default_voice, 'name': default_voice, 'lang': lang}]
        return [{'id': v, 'name': v, 'lang': k} for k, v in DEFAULT_VOICES.items()]


def get_tts_status() -> Dict:
    """Get TTS service status."""
    return {
        'enabled': TTS_ENABLED,
        'backend': TTS_BACKEND,
        'cache_dir': TTS_CACHE_DIR,
        'default_voices': DEFAULT_VOICES
    }


def clear_tts_cache() -> int:
    """Clear the TTS cache. Returns number of files deleted."""
    count = 0
    for filename in os.listdir(TTS_CACHE_DIR):
        if filename.endswith('.mp3'):
            try:
                os.remove(os.path.join(TTS_CACHE_DIR, filename))
                count += 1
            except OSError:
                pass
    return count
