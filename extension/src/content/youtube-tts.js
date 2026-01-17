/**
 * TTS (Text-to-Speech) Controller for YouTube Subtide
 *
 * Supports:
 * - Backend TTS (edge-tts via API)
 * - Browser speechSynthesis fallback
 * - Voice selection per language
 * - Rate/volume controls
 * - Video synchronization
 */

// TTS State
let ttsEnabled = false;
let ttsSource = 'auto'; // 'auto', 'backend', 'browser'
let ttsRate = 1.0;
let ttsVolume = 0.8;
let ttsVoices = {}; // lang -> voice_id mapping
let ttsPitch = 1.0;

// Audio playback state
let currentAudio = null;
let speechQueue = [];
let isSpeaking = false;
let lastSpokenText = '';

// Backend state
let backendAvailable = null; // null = unknown, true/false after check
let apiUrl = null;

// Callbacks
let onTTSStateChange = null; // Callback when TTS state changes

/**
 * Initialize TTS controller
 */
async function initTTS(options = {}) {
    apiUrl = options.apiUrl || null;
    onTTSStateChange = options.onStateChange || null;

    // Load saved settings
    const settings = await chrome.storage.local.get([
        'ttsEnabled', 'ttsSource', 'ttsRate', 'ttsVolume', 'ttsPitch', 'ttsVoices'
    ]);

    ttsEnabled = settings.ttsEnabled || false;
    ttsSource = settings.ttsSource || 'auto';
    ttsRate = settings.ttsRate || 1.0;
    ttsVolume = settings.ttsVolume || 0.8;
    ttsPitch = settings.ttsPitch || 1.0;
    ttsVoices = settings.ttsVoices || {};

    // Check backend availability if we have an API URL
    if (apiUrl) {
        checkBackendAvailability();
    }

    console.log('[TTS] Initialized:', { ttsEnabled, ttsSource, ttsRate, backendAvailable });
}

/**
 * Check if backend TTS is available
 */
async function checkBackendAvailability() {
    if (!apiUrl) {
        backendAvailable = false;
        return;
    }

    try {
        const response = await fetch(`${apiUrl}/api/tts/status`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });

        if (response.ok) {
            const data = await response.json();
            backendAvailable = data.enabled === true;
            console.log('[TTS] Backend status:', data);
        } else {
            backendAvailable = false;
        }
    } catch (e) {
        console.warn('[TTS] Backend check failed:', e.message);
        backendAvailable = false;
    }
}

/**
 * Set API URL for backend TTS
 */
function setApiUrl(url) {
    apiUrl = url;
    backendAvailable = null; // Reset
    if (url) {
        checkBackendAvailability();
    }
}

/**
 * Enable/disable TTS
 */
async function setTTSEnabled(enabled) {
    ttsEnabled = enabled;
    await chrome.storage.local.set({ ttsEnabled });

    if (!enabled) {
        stopSpeaking();
    }

    if (onTTSStateChange) {
        onTTSStateChange({ enabled: ttsEnabled, speaking: isSpeaking });
    }

    console.log('[TTS] Enabled:', ttsEnabled);
}

/**
 * Set TTS source preference
 */
async function setTTSSource(source) {
    ttsSource = source; // 'auto', 'backend', 'browser'
    await chrome.storage.local.set({ ttsSource });
    console.log('[TTS] Source:', ttsSource);
}

/**
 * Set speech rate (0.5 - 2.0)
 */
async function setTTSRate(rate) {
    ttsRate = Math.max(0.5, Math.min(2.0, rate));
    await chrome.storage.local.set({ ttsRate });
}

/**
 * Set speech volume (0 - 1)
 */
async function setTTSVolume(volume) {
    ttsVolume = Math.max(0, Math.min(1, volume));
    await chrome.storage.local.set({ ttsVolume });
}

/**
 * Set speech pitch (0.5 - 2.0)
 */
async function setTTSPitch(pitch) {
    ttsPitch = Math.max(0.5, Math.min(2.0, pitch));
    await chrome.storage.local.set({ ttsPitch });
}

/**
 * Set voice for a specific language
 */
async function setVoiceForLanguage(lang, voiceId) {
    ttsVoices[lang] = voiceId;
    await chrome.storage.local.set({ ttsVoices });
}

/**
 * Get the best voice for a language
 */
function getVoiceForLanguage(lang) {
    // Check user preference first
    if (ttsVoices[lang]) return ttsVoices[lang];

    // For browser TTS, find a matching voice
    if (window.speechSynthesis) {
        const voices = speechSynthesis.getVoices();
        const baseLang = lang.split('-')[0].toLowerCase();

        // Exact match
        let voice = voices.find(v => v.lang.toLowerCase() === lang.toLowerCase());
        if (voice) return voice.name;

        // Base language match
        voice = voices.find(v => v.lang.toLowerCase().startsWith(baseLang));
        if (voice) return voice.name;
    }

    return null;
}

/**
 * Get available voices
 */
async function getAvailableVoices(lang = null) {
    const voices = [];

    // Get browser voices
    if (window.speechSynthesis) {
        const browserVoices = speechSynthesis.getVoices();
        for (const voice of browserVoices) {
            if (lang) {
                const baseLang = lang.split('-')[0].toLowerCase();
                if (!voice.lang.toLowerCase().startsWith(baseLang)) continue;
            }
            voices.push({
                id: voice.name,
                name: voice.name,
                lang: voice.lang,
                source: 'browser'
            });
        }
    }

    // Get backend voices if available
    if (backendAvailable && apiUrl) {
        try {
            const url = lang ? `${apiUrl}/api/tts/voices?lang=${lang}` : `${apiUrl}/api/tts/voices`;
            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();
                for (const voice of data.voices || []) {
                    voices.push({
                        ...voice,
                        source: 'backend'
                    });
                }
            }
        } catch (e) {
            console.warn('[TTS] Failed to fetch backend voices:', e.message);
        }
    }

    return voices;
}

/**
 * Speak text
 * @param {string} text - Text to speak
 * @param {string} lang - Language code
 * @param {boolean} interrupt - Whether to interrupt current speech
 */
async function speak(text, lang = 'en', interrupt = true) {
    if (!ttsEnabled) return;
    if (!text || !text.trim()) return;
    if (text === lastSpokenText) return; // Avoid repeating same text

    // Interrupt current speech if requested
    if (interrupt) {
        stopSpeaking();
    }

    lastSpokenText = text;

    // Determine which TTS source to use
    const useBackend = shouldUseBackend();

    try {
        if (useBackend) {
            await speakWithBackend(text, lang);
        } else {
            await speakWithBrowser(text, lang);
        }
    } catch (e) {
        console.error('[TTS] Speech failed:', e);

        // Try fallback if backend failed
        if (useBackend) {
            console.log('[TTS] Falling back to browser TTS');
            try {
                await speakWithBrowser(text, lang);
            } catch (e2) {
                console.error('[TTS] Browser fallback also failed:', e2);
            }
        }
    }
}

/**
 * Determine if backend TTS should be used
 */
function shouldUseBackend() {
    if (ttsSource === 'backend') return backendAvailable === true;
    if (ttsSource === 'browser') return false;

    // Auto: prefer backend if available
    return backendAvailable === true && apiUrl;
}

/**
 * Speak using backend TTS
 */
async function speakWithBackend(text, lang) {
    if (!apiUrl) throw new Error('No API URL configured');

    const voiceId = ttsVoices[lang] || null;

    const response = await fetch(`${apiUrl}/api/tts/speak`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg'
        },
        body: JSON.stringify({
            text,
            lang,
            voice_id: voiceId
        })
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || 'TTS request failed');
    }

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);

    return new Promise((resolve, reject) => {
        currentAudio = new Audio(audioUrl);
        currentAudio.playbackRate = ttsRate;
        currentAudio.volume = ttsVolume;

        currentAudio.onplay = () => {
            isSpeaking = true;
            notifyStateChange();
        };

        currentAudio.onended = () => {
            isSpeaking = false;
            URL.revokeObjectURL(audioUrl);
            currentAudio = null;
            notifyStateChange();
            resolve();
        };

        currentAudio.onerror = (e) => {
            isSpeaking = false;
            URL.revokeObjectURL(audioUrl);
            currentAudio = null;
            notifyStateChange();
            reject(new Error('Audio playback failed'));
        };

        currentAudio.play().catch(reject);
    });
}

/**
 * Speak using browser speechSynthesis
 */
function speakWithBrowser(text, lang) {
    return new Promise((resolve, reject) => {
        if (!window.speechSynthesis) {
            reject(new Error('speechSynthesis not available'));
            return;
        }

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;
        utterance.rate = ttsRate;
        utterance.volume = ttsVolume;
        utterance.pitch = ttsPitch;

        // Set voice if we have a preference
        const voiceName = getVoiceForLanguage(lang);
        if (voiceName) {
            const voices = speechSynthesis.getVoices();
            const voice = voices.find(v => v.name === voiceName);
            if (voice) utterance.voice = voice;
        }

        utterance.onstart = () => {
            isSpeaking = true;
            notifyStateChange();
        };

        utterance.onend = () => {
            isSpeaking = false;
            notifyStateChange();
            resolve();
        };

        utterance.onerror = (e) => {
            isSpeaking = false;
            notifyStateChange();
            // Don't reject on 'interrupted' - that's expected when stopping
            if (e.error === 'interrupted') {
                resolve();
            } else {
                reject(new Error(`Speech synthesis error: ${e.error}`));
            }
        };

        speechSynthesis.speak(utterance);
    });
}

/**
 * Stop current speech
 */
function stopSpeaking() {
    // Stop Audio element
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio = null;
    }

    // Stop browser speech synthesis
    if (window.speechSynthesis) {
        speechSynthesis.cancel();
    }

    isSpeaking = false;
    lastSpokenText = '';
    notifyStateChange();
}

/**
 * Pause current speech
 */
function pauseSpeaking() {
    if (currentAudio) {
        currentAudio.pause();
    }
    if (window.speechSynthesis) {
        speechSynthesis.pause();
    }
    notifyStateChange();
}

/**
 * Resume paused speech
 */
function resumeSpeaking() {
    if (currentAudio && currentAudio.paused) {
        currentAudio.play();
    }
    if (window.speechSynthesis) {
        speechSynthesis.resume();
    }
    notifyStateChange();
}

/**
 * Notify state change callback
 */
function notifyStateChange() {
    if (onTTSStateChange) {
        onTTSStateChange({
            enabled: ttsEnabled,
            speaking: isSpeaking,
            source: shouldUseBackend() ? 'backend' : 'browser',
            backendAvailable
        });
    }
}

/**
 * Get current TTS state
 */
function getTTSState() {
    return {
        enabled: ttsEnabled,
        speaking: isSpeaking,
        source: ttsSource,
        effectiveSource: shouldUseBackend() ? 'backend' : 'browser',
        backendAvailable,
        rate: ttsRate,
        volume: ttsVolume,
        pitch: ttsPitch,
        voices: ttsVoices
    };
}

/**
 * Handle video pause - pause TTS
 */
function onVideoPause() {
    if (isSpeaking) {
        pauseSpeaking();
    }
}

/**
 * Handle video play - resume TTS
 */
function onVideoPlay() {
    if (currentAudio && currentAudio.paused) {
        resumeSpeaking();
    }
}

// Export for use in other modules
window.vtTTS = {
    init: initTTS,
    setApiUrl,
    setEnabled: setTTSEnabled,
    setSource: setTTSSource,
    setRate: setTTSRate,
    setVolume: setTTSVolume,
    setPitch: setTTSPitch,
    setVoice: setVoiceForLanguage,
    getVoices: getAvailableVoices,
    speak,
    stop: stopSpeaking,
    pause: pauseSpeaking,
    resume: resumeSpeaking,
    getState: getTTSState,
    onVideoPause,
    onVideoPlay,
    isEnabled: () => ttsEnabled,
    isSpeaking: () => isSpeaking
};
