/**
 * Background Service Worker
 * Handles API calls and message passing between popup and content scripts
 */

// ============================================================================
// Storage Utilities
// ============================================================================

const STORAGE_KEYS = {
    API_URL: 'apiUrl',
    API_KEY: 'apiKey',
    MODEL: 'model',
    DEFAULT_LANGUAGE: 'defaultLanguage',
    TRANSLATION_CACHE: 'translationCache',
};

const DEFAULT_CONFIG = {
    apiUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
    defaultLanguage: 'en',
};

async function getConfig() {
    return new Promise((resolve) => {
        chrome.storage.local.get(
            [STORAGE_KEYS.API_URL, STORAGE_KEYS.API_KEY, STORAGE_KEYS.MODEL, STORAGE_KEYS.DEFAULT_LANGUAGE],
            (result) => {
                resolve({
                    apiUrl: result[STORAGE_KEYS.API_URL] || DEFAULT_CONFIG.apiUrl,
                    apiKey: result[STORAGE_KEYS.API_KEY] || DEFAULT_CONFIG.apiKey,
                    model: result[STORAGE_KEYS.MODEL] || DEFAULT_CONFIG.model,
                    defaultLanguage: result[STORAGE_KEYS.DEFAULT_LANGUAGE] || DEFAULT_CONFIG.defaultLanguage,
                });
            }
        );
    });
}

async function saveConfig(config) {
    return new Promise((resolve) => {
        chrome.storage.local.set(
            {
                [STORAGE_KEYS.API_URL]: config.apiUrl,
                [STORAGE_KEYS.API_KEY]: config.apiKey,
                [STORAGE_KEYS.MODEL]: config.model,
                [STORAGE_KEYS.DEFAULT_LANGUAGE]: config.defaultLanguage,
            },
            resolve
        );
    });
}

async function isConfigured() {
    const config = await getConfig();
    return !!(config.apiUrl && config.apiKey && config.model);
}

// ============================================================================
// Cache Utilities
// ============================================================================

const CACHE_KEY = 'translationCache';
const MAX_CACHE_ENTRIES = 100;
const CACHE_VERSION = 1;

function generateCacheKey(videoId, sourceLanguage, targetLanguage) {
    return `${videoId}_${sourceLanguage}_${targetLanguage}`;
}

async function getAllCache() {
    return new Promise((resolve) => {
        chrome.storage.local.get([CACHE_KEY], (result) => {
            const cache = result[CACHE_KEY] || { version: CACHE_VERSION, entries: {} };
            resolve(cache);
        });
    });
}

async function saveCache(cache) {
    return new Promise((resolve) => {
        chrome.storage.local.set({ [CACHE_KEY]: cache }, resolve);
    });
}

async function getCachedTranslation(videoId, sourceLanguage, targetLanguage) {
    const cache = await getAllCache();
    const key = generateCacheKey(videoId, sourceLanguage, targetLanguage);
    const entry = cache.entries[key];

    if (entry) {
        entry.lastAccess = Date.now();
        await saveCache(cache);
        console.log(`[VideoTranslate] Cache hit for ${key}`);
        return entry.translations;
    }

    console.log(`[VideoTranslate] Cache miss for ${key}`);
    return null;
}

async function cacheTranslation(videoId, sourceLanguage, targetLanguage, translations) {
    const cache = await getAllCache();
    const key = generateCacheKey(videoId, sourceLanguage, targetLanguage);

    cache.entries[key] = {
        translations,
        createdAt: Date.now(),
        lastAccess: Date.now(),
    };

    const entries = Object.entries(cache.entries);
    if (entries.length > MAX_CACHE_ENTRIES) {
        entries.sort((a, b) => a[1].lastAccess - b[1].lastAccess);
        const toRemove = entries.length - MAX_CACHE_ENTRIES;
        for (let i = 0; i < toRemove; i++) {
            delete cache.entries[entries[i][0]];
        }
        console.log(`[VideoTranslate] Evicted ${toRemove} cache entries`);
    }

    await saveCache(cache);
    console.log(`[VideoTranslate] Cached translation for ${key}`);
}

async function clearCache() {
    await saveCache({ version: CACHE_VERSION, entries: {} });
    console.log('[VideoTranslate] Cache cleared');
}

async function getCacheStats() {
    const cache = await getAllCache();
    const entries = Object.keys(cache.entries).length;
    return {
        entries,
        maxEntries: MAX_CACHE_ENTRIES,
    };
}

// ============================================================================
// Translator
// ============================================================================

const BATCH_SIZE = 20;

const LANGUAGE_NAMES = {
    'en': 'English',
    'ja': 'Japanese',
    'ko': 'Korean',
    'zh-CN': 'Chinese (Simplified)',
    'zh-TW': 'Chinese (Traditional)',
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German',
    'pt': 'Portuguese',
    'ru': 'Russian',
    'ar': 'Arabic',
    'hi': 'Hindi',
    'it': 'Italian',
    'nl': 'Dutch',
    'pl': 'Polish',
    'tr': 'Turkish',
    'vi': 'Vietnamese',
    'th': 'Thai',
    'id': 'Indonesian',
};

function getLanguageName(code) {
    return LANGUAGE_NAMES[code] || code;
}

function getSupportedLanguages() {
    return Object.entries(LANGUAGE_NAMES).map(([code, name]) => ({
        code,
        name,
    }));
}

function buildPrompt(subtitles, sourceLanguage, targetLanguage) {
    const sourceName = getLanguageName(sourceLanguage);
    const targetName = getLanguageName(targetLanguage);

    const numberedSubtitles = subtitles
        .map((sub, i) => `${i + 1}. ${sub.text}`)
        .join('\n');

    return `You are a professional subtitle translator. Translate the following subtitles from ${sourceName} to ${targetName}.

Rules:
- Maintain the original meaning, tone, and emotion
- Keep translations concise (suitable for subtitle display)
- Preserve any speaker indicators or sound effects in brackets
- Return ONLY the translations, one per line, numbered to match the input
- Do not add explanations or notes

Subtitles to translate:
${numberedSubtitles}`;
}

function parseTranslationResponse(response, expectedCount) {
    const lines = response.trim().split('\n');
    const translations = [];

    for (const line of lines) {
        const cleaned = line.replace(/^\d+[\.\)\:\-]\s*/, '').trim();
        if (cleaned) {
            translations.push(cleaned);
        }
    }

    while (translations.length < expectedCount) {
        translations.push('');
    }

    return translations.slice(0, expectedCount);
}

async function callLLMAPI(prompt, config) {
    const url = `${config.apiUrl.replace(/\/$/, '')}/chat/completions`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
            model: config.model,
            messages: [
                {
                    role: 'user',
                    content: prompt,
                },
            ],
            temperature: 0.3,
            max_tokens: 4096,
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`LLM API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

async function translateBatch(subtitles, sourceLanguage, targetLanguage, config) {
    const prompt = buildPrompt(subtitles, sourceLanguage, targetLanguage);
    const response = await callLLMAPI(prompt, config);
    return parseTranslationResponse(response, subtitles.length);
}

async function translateSubtitles(subtitles, sourceLanguage, targetLanguage, onProgress) {
    const config = await getConfig();

    if (!config.apiKey) {
        throw new Error('API key not configured');
    }

    console.log(`[VideoTranslate] Translating ${subtitles.length} subtitles from ${sourceLanguage} to ${targetLanguage}`);

    const results = [];
    const totalBatches = Math.ceil(subtitles.length / BATCH_SIZE);

    for (let i = 0; i < subtitles.length; i += BATCH_SIZE) {
        const batch = subtitles.slice(i, i + BATCH_SIZE);
        const batchNumber = Math.floor(i / BATCH_SIZE) + 1;

        console.log(`[VideoTranslate] Translating batch ${batchNumber}/${totalBatches}`);

        try {
            const translations = await translateBatch(batch, sourceLanguage, targetLanguage, config);

            for (let j = 0; j < batch.length; j++) {
                results.push({
                    ...batch[j],
                    translatedText: translations[j] || batch[j].text,
                });
            }

            if (onProgress) {
                onProgress({
                    current: Math.min(i + BATCH_SIZE, subtitles.length),
                    total: subtitles.length,
                    percentage: Math.round(((i + BATCH_SIZE) / subtitles.length) * 100),
                });
            }
        } catch (error) {
            console.error(`[VideoTranslate] Batch ${batchNumber} failed:`, error);

            for (const sub of batch) {
                results.push({
                    ...sub,
                    translatedText: sub.text,
                    error: true,
                });
            }
        }

        if (i + BATCH_SIZE < subtitles.length) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    console.log(`[VideoTranslate] Translation complete: ${results.length} subtitles`);
    return results;
}

// ============================================================================
// Message Handler
// ============================================================================

const translationProgress = new Map();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message, sender)
        .then(sendResponse)
        .catch(error => {
            console.error('[VideoTranslate] Message handler error:', error);
            sendResponse({ success: false, error: error.message });
        });

    return true;
});

async function handleMessage(message, sender) {
    console.log('[VideoTranslate] Received message:', message.action);

    switch (message.action) {
        case 'getConfig':
            return await getConfig();

        case 'saveConfig':
            await saveConfig(message.config);
            return { success: true };

        case 'isConfigured':
            return { configured: await isConfigured() };

        case 'getSupportedLanguages':
            return { languages: getSupportedLanguages() };

        case 'translate':
            return await handleTranslation(message, sender);

        case 'getCachedTranslation':
            const cached = await getCachedTranslation(
                message.videoId,
                message.sourceLanguage,
                message.targetLanguage
            );
            return { cached, found: cached !== null };

        case 'getTranslationProgress':
            const tabId = sender.tab?.id;
            return { progress: translationProgress.get(tabId) || null };

        case 'clearCache':
            await clearCache();
            return { success: true };

        case 'getCacheStats':
            return await getCacheStats();

        case 'fetchSubtitles':
            return await handleFetchSubtitles(message);

        case 'fetchSubtitlesMainWorld':
            return await handleFetchSubtitlesMainWorld(message, sender);

        case 'extractSubtitlesFromPlayer':
            return await handleExtractSubtitlesFromPlayer(sender);

        case 'fetchSubtitlesXHR':
            return await handleFetchSubtitlesXHR(message, sender);

        case 'enableAndExtractSubtitles':
            return await handleEnableAndExtractSubtitles(sender);

        case 'fetchTranscriptMainWorld':
            return await handleFetchTranscriptMainWorld(message, sender);

        default:
            throw new Error(`Unknown action: ${message.action}`);
    }
}

/**
 * Fetch transcript using YouTube's internal API via Main World execution
 * This gives us access to window.ytcfg and the authenticated session
 */
async function handleFetchTranscriptMainWorld(message, sender) {
    const { videoId } = message;
    const tabId = sender.tab?.id;

    if (!tabId) {
        return { success: false, error: 'No tab ID' };
    }

    console.log('[VideoTranslate] Fetching transcript via Main World for tab:', tabId);

    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: async (vid) => {
                try {
                    // 1. Get API Key and Context from global ytcfg
                    if (!window.ytcfg || !window.ytcfg.data_) {
                        return { success: false, error: 'ytcfg not found in main world' };
                    }

                    const apiKey = window.ytcfg.data_.INNERTUBE_API_KEY;
                    const context = window.ytcfg.data_.INNERTUBE_CONTEXT;

                    if (!apiKey) {
                        return { success: false, error: 'INNERTUBE_API_KEY not found' };
                    }

                    console.log('[VideoTranslate] Found API Key:', apiKey.substring(0, 4) + '...');

                    // 2. Prepare request
                    // 2. Prepare request - Use minimal context (Client only) for robustness
                    let requestContext = {
                        client: context && context.client ? context.client : {
                            hl: 'en',
                            gl: 'US',
                            clientName: 'WEB',
                            clientVersion: '2.20230920.01.00'
                        }
                    };

                    // 3. Extract params from ytInitialData (Required for get_transcript)
                    let params = '';
                    try {
                        if (window.ytInitialData) {
                            const findParams = (obj) => {
                                if (!obj) return null;
                                if (obj.getTranscriptEndpoint) {
                                    return obj.getTranscriptEndpoint.params;
                                }
                                if (Array.isArray(obj)) {
                                    for (const item of obj) {
                                        const found = findParams(item);
                                        if (found) return found;
                                    }
                                } else if (typeof obj === 'object') {
                                    for (const key in obj) {
                                        const found = findParams(obj[key]);
                                        if (found) return found;
                                    }
                                }
                                return null;
                            };
                            params = findParams(window.ytInitialData);
                            if (params) {
                                console.log('[VideoTranslate] Found transcript params in ytInitialData');
                            } else {
                                console.warn('[VideoTranslate] Could not find transcript params in ytInitialData');
                            }
                        }
                    } catch (e) {
                        console.warn('[VideoTranslate] Error extracting params:', e);
                    }

                    const requestBody = {
                        context: requestContext,
                    };

                    if (params) {
                        requestBody.params = params;
                    }
                    requestBody.videoId = vid;

                    console.log('[VideoTranslate] Fetching Transcript API with context client:', requestContext.client.clientName, requestContext.client.clientVersion, 'Has Params:', !!params);

                    const response = await fetch(`https://www.youtube.com/youtubei/v1/get_transcript?key=${apiKey}`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(requestBody)
                    });

                    if (!response.ok) {
                        return { success: false, error: `Transcript API HTTP ${response.status}` };
                    }

                    const data = await response.json();

                    // 3. Parse result
                    const findValuesByKey = (obj, key) => {
                        let list = [];
                        if (!obj) return list;
                        if (obj instanceof Array) {
                            for (var i in obj) { list = list.concat(findValuesByKey(obj[i], key)); }
                            return list;
                        }
                        if (obj[key]) list.push(obj[key]);
                        if ((typeof obj == "object") && (obj !== null)) {
                            for (var child in obj) { list = list.concat(findValuesByKey(obj[child], key)); }
                        }
                        return list;
                    };

                    const segments = findValuesByKey(data, 'transcriptSegmentRenderer');

                    if (!segments || segments.length === 0) {
                        // Check if transcript is disabled/unavailable
                        if (data.actions) {
                            return { success: false, error: 'No transcript segments found (transcript might be empty)' };
                        }
                        return { success: false, error: 'Invalid transcript response structure' };
                    }

                    const subtitles = [];
                    const parseTimeText = (timeStr) => {
                        if (!timeStr) return 0;
                        const parts = timeStr.split(':').map(Number);
                        if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
                        if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
                        return 0;
                    };

                    for (const segment of segments) {
                        if (segment.startTimeText && segment.snippet) {
                            const startMs = parseTimeText(segment.startTimeText.simpleText);
                            const text = segment.snippet.runs.map(r => r.text).join(' ');
                            subtitles.push({ startMs, durationMs: 0, text: text.trim() });
                        }
                    }

                    // Calc durations
                    for (let i = 0; i < subtitles.length; i++) {
                        subtitles[i].durationMs = (i < subtitles.length - 1) ? subtitles[i + 1].startMs - subtitles[i].startMs : 3000;
                    }

                    return { success: true, subtitles };

                } catch (e) {
                    return { success: false, error: e.message };
                }
            },
            args: [videoId]
        });

        if (results && results[0] && results[0].result) {
            console.log('[VideoTranslate] Main World Transcript result:', results[0].result.success);
            return results[0].result;
        }

        return { success: false, error: 'No result from Main World execution' };
    } catch (e) {
        console.error('[VideoTranslate] Script execution error:', e);
        return { success: false, error: e.message };
    }
}

/**
 * Enable YouTube's native subtitles and extract from TextTrack API
 * This lets YouTube fetch the subtitles, we just read what's loaded
 */
async function handleEnableAndExtractSubtitles(sender) {
    const tabId = sender.tab?.id;

    if (!tabId) {
        return { success: false, error: 'No tab ID' };
    }

    console.log('[VideoTranslate] Enabling subtitles and extracting from TextTrack for tab:', tabId);

    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: async () => {
                try {
                    const player = document.querySelector('#movie_player');
                    const video = document.querySelector('video');

                    if (!player || !video) {
                        return { success: false, error: 'Player or video not found' };
                    }

                    // Step 1: Enable subtitles if not already enabled
                    const subtitlesButton = document.querySelector('.ytp-subtitles-button');
                    const isEnabled = subtitlesButton?.getAttribute('aria-pressed') === 'true';

                    if (!isEnabled && subtitlesButton) {
                        console.log('[VideoTranslate] Clicking CC button to enable subtitles');
                        subtitlesButton.click();

                        // Wait for subtitles to load
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }

                    // Step 2: Try to get subtitles from TextTrack API
                    const extractFromTextTracks = () => {
                        if (video.textTracks && video.textTracks.length > 0) {
                            for (let i = 0; i < video.textTracks.length; i++) {
                                const track = video.textTracks[i];
                                console.log('[VideoTranslate] Found text track:', track.kind, track.label, track.mode);

                                // Make sure track is showing
                                if (track.mode !== 'showing') {
                                    track.mode = 'showing';
                                }

                                if (track.cues && track.cues.length > 0) {
                                    const subtitles = [];
                                    for (let j = 0; j < track.cues.length; j++) {
                                        const cue = track.cues[j];
                                        subtitles.push({
                                            startMs: cue.startTime * 1000,
                                            durationMs: (cue.endTime - cue.startTime) * 1000,
                                            text: cue.text || cue.getCueAsHTML?.()?.textContent || ''
                                        });
                                    }
                                    if (subtitles.length > 0) {
                                        console.log('[VideoTranslate] Extracted', subtitles.length, 'subtitles from TextTrack');
                                        return subtitles;
                                    }
                                }
                            }
                        }
                        return null;
                    };

                    // Try immediately
                    let subtitles = extractFromTextTracks();
                    if (subtitles) {
                        return { success: true, subtitles };
                    }

                    // Step 3: If no cues yet, try using player's setOption to force subtitle loading
                    if (typeof player.setOption === 'function') {
                        try {
                            // Get available caption tracks
                            const tracks = player.getOption('captions', 'tracklist') || [];
                            console.log('[VideoTranslate] Available tracks:', tracks);

                            if (tracks.length > 0) {
                                // Select the first track
                                player.setOption('captions', 'track', tracks[0]);
                                console.log('[VideoTranslate] Set caption track:', tracks[0]);

                                // Wait for captions to load
                                await new Promise(resolve => setTimeout(resolve, 2000));

                                subtitles = extractFromTextTracks();
                                if (subtitles) {
                                    return { success: true, subtitles };
                                }
                            }
                        } catch (e) {
                            console.warn('[VideoTranslate] setOption error:', e);
                        }
                    }

                    // Step 4: Try loadModule for captions
                    if (typeof player.loadModule === 'function') {
                        try {
                            player.loadModule('captions');
                            await new Promise(resolve => setTimeout(resolve, 1500));

                            subtitles = extractFromTextTracks();
                            if (subtitles) {
                                return { success: true, subtitles };
                            }
                        } catch (e) {
                            console.warn('[VideoTranslate] loadModule error:', e);
                        }
                    }

                    // Step 5: Final attempt - observe for cues being added
                    return new Promise((resolve) => {
                        let attempts = 0;
                        const maxAttempts = 10;

                        const checkInterval = setInterval(() => {
                            attempts++;
                            const subs = extractFromTextTracks();

                            if (subs) {
                                clearInterval(checkInterval);
                                resolve({ success: true, subtitles: subs });
                            } else if (attempts >= maxAttempts) {
                                clearInterval(checkInterval);
                                resolve({ success: false, error: 'No subtitle cues found after waiting' });
                            }
                        }, 500);
                    });

                } catch (error) {
                    return { success: false, error: error.message };
                }
            }
        });

        if (results && results[0] && results[0].result) {
            console.log('[VideoTranslate] TextTrack extraction result:', results[0].result);
            return results[0].result;
        }

        return { success: false, error: 'No result from TextTrack extraction' };
    } catch (error) {
        console.error('[VideoTranslate] TextTrack extraction error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Fetch subtitles using XMLHttpRequest in main world
 * Some ad blockers only intercept fetch, not XHR
 */
async function handleFetchSubtitlesXHR(message, sender) {
    const { subtitleUrl } = message;
    const tabId = sender.tab?.id;

    if (!tabId) {
        return { success: false, error: 'No tab ID' };
    }

    console.log('[VideoTranslate] Fetching via XHR in main world for tab:', tabId);

    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: (url) => {
                return new Promise((resolve) => {
                    try {
                        // Add fmt=json3 if not present
                        let fetchUrl = url;
                        if (url.includes('fmt=')) {
                            fetchUrl = url.replace(/fmt=[^&]+/, 'fmt=json3');
                        } else {
                            fetchUrl = url + (url.includes('?') ? '&' : '?') + 'fmt=json3';
                        }

                        const xhr = new XMLHttpRequest();
                        xhr.open('GET', fetchUrl, true);
                        xhr.withCredentials = true;

                        xhr.onload = function () {
                            if (xhr.status === 200) {
                                const text = xhr.responseText;

                                if (!text || text.trim() === '' || text.trim() === '{}') {
                                    resolve({ success: false, error: 'Empty XHR response' });
                                    return;
                                }

                                let subtitles = [];

                                // Try parsing as JSON first
                                try {
                                    const data = JSON.parse(text);
                                    if (data.events) {
                                        for (const event of data.events) {
                                            if (event.segs) {
                                                const segText = event.segs.map(s => s.utf8 || '').join('');
                                                if (segText.trim()) {
                                                    subtitles.push({
                                                        startMs: event.tStartMs || 0,
                                                        durationMs: event.dDurationMs || 3000,
                                                        text: segText.trim()
                                                    });
                                                }
                                            }
                                        }
                                    }
                                } catch (e) {
                                    // Try XML parsing
                                    if (text.includes('<text')) {
                                        const parser = new DOMParser();
                                        const xmlDoc = parser.parseFromString(text, 'text/xml');
                                        const textNodes = xmlDoc.getElementsByTagName('text');
                                        for (let i = 0; i < textNodes.length; i++) {
                                            const node = textNodes[i];
                                            const start = parseFloat(node.getAttribute('start')) * 1000;
                                            const dur = parseFloat(node.getAttribute('dur')) * 1000;
                                            const nodeText = node.textContent;
                                            if (nodeText && nodeText.trim()) {
                                                subtitles.push({
                                                    startMs: start,
                                                    durationMs: dur,
                                                    text: nodeText.trim()
                                                });
                                            }
                                        }
                                    }
                                }

                                if (subtitles.length > 0) {
                                    resolve({ success: true, subtitles });
                                } else {
                                    resolve({ success: false, error: 'No subtitles parsed from XHR' });
                                }
                            } else {
                                resolve({ success: false, error: 'XHR HTTP ' + xhr.status });
                            }
                        };

                        xhr.onerror = function () {
                            resolve({ success: false, error: 'XHR network error' });
                        };

                        xhr.send();
                    } catch (error) {
                        resolve({ success: false, error: error.message });
                    }
                });
            },
            args: [subtitleUrl]
        });

        if (results && results[0] && results[0].result) {
            console.log('[VideoTranslate] XHR result:', results[0].result);
            return results[0].result;
        }

        return { success: false, error: 'No result from XHR execution' };
    } catch (error) {
        console.error('[VideoTranslate] XHR execution error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Extract subtitles directly from YouTube's player internal state
 * This doesn't require any network requests - data is already in the page
 */
async function handleExtractSubtitlesFromPlayer(sender) {
    const tabId = sender.tab?.id;

    if (!tabId) {
        return { success: false, error: 'No tab ID' };
    }

    console.log('[VideoTranslate] Extracting subtitles from player state for tab:', tabId);

    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: () => {
                try {
                    // Method 1: Try to get captions from the movie_player element
                    const player = document.querySelector('#movie_player');
                    if (player) {
                        // Try getOption for captions
                        if (typeof player.getOption === 'function') {
                            try {
                                const captionTrackList = player.getOption('captions', 'tracklist');
                                console.log('[VideoTranslate] Caption track list:', captionTrackList);
                            } catch (e) { }
                        }

                        // Try to get the current caption track data
                        if (typeof player.getVideoData === 'function') {
                            const videoData = player.getVideoData();
                            console.log('[VideoTranslate] Video data:', videoData);
                        }
                    }

                    // Method 2: Look for caption data in window objects
                    const captionData = [];

                    // Check if there's a caption renderer in the page
                    const captionWindow = document.querySelector('.ytp-caption-window-container');
                    if (captionWindow) {
                        console.log('[VideoTranslate] Found caption window container');
                    }

                    // Method 3: Extract from ytInitialPlayerResponse if available
                    if (window.ytInitialPlayerResponse) {
                        const captions = window.ytInitialPlayerResponse.captions;
                        if (captions?.playerCaptionsTracklistRenderer?.captionTracks) {
                            const tracks = captions.playerCaptionsTracklistRenderer.captionTracks;
                            const track = tracks.find(t => t.kind === 'asr') || tracks[0];
                            if (track?.baseUrl) {
                                console.log('[VideoTranslate] Found track URL from ytInitialPlayerResponse');
                                return {
                                    success: false,
                                    trackUrl: track.baseUrl,
                                    message: 'Found track URL, need to fetch'
                                };
                            }
                        }
                    }

                    // Method 4: Try to access yt.player.Application if available
                    if (window.yt?.player?.Application?.create) {
                        console.log('[VideoTranslate] Found yt.player.Application');
                    }

                    // Method 5: Look for caption segments in existing video state
                    // YouTube stores loaded captions in the player's internal state
                    if (player && player.getPlayerState) {
                        // When subtitles are enabled, YouTube loads them into memory
                        // We need to enable subtitles first, then extract

                        // Check if captions are available
                        if (typeof player.toggleSubtitles === 'function') {
                            // Get current state
                            const subtitlesButton = document.querySelector('.ytp-subtitles-button');
                            const isEnabled = subtitlesButton?.getAttribute('aria-pressed') === 'true';

                            if (!isEnabled) {
                                // Enable subtitles temporarily
                                player.toggleSubtitles();
                                console.log('[VideoTranslate] Enabled subtitles');
                            }
                        }
                    }

                    // Method 6: Try to intercept the caption data from loadModule
                    // This requires subtitles to be playing
                    const getAllTextTracks = () => {
                        const video = document.querySelector('video');
                        if (video && video.textTracks) {
                            const tracks = Array.from(video.textTracks);
                            for (const track of tracks) {
                                if (track.cues && track.cues.length > 0) {
                                    const subtitles = [];
                                    for (let i = 0; i < track.cues.length; i++) {
                                        const cue = track.cues[i];
                                        subtitles.push({
                                            startMs: cue.startTime * 1000,
                                            durationMs: (cue.endTime - cue.startTime) * 1000,
                                            text: cue.text
                                        });
                                    }
                                    if (subtitles.length > 0) {
                                        return { success: true, subtitles, source: 'textTracks' };
                                    }
                                }
                            }
                        }
                        return null;
                    };

                    const textTrackResult = getAllTextTracks();
                    if (textTrackResult) {
                        return textTrackResult;
                    }

                    return { success: false, error: 'Could not extract subtitles from player state' };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            }
        });

        if (results && results[0] && results[0].result) {
            console.log('[VideoTranslate] Player extraction result:', results[0].result);
            return results[0].result;
        }

        return { success: false, error: 'No result from player extraction' };
    } catch (error) {
        console.error('[VideoTranslate] Player extraction error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Fetch subtitles by executing script in the page's MAIN world
 * This bypasses CSP restrictions and ad blocker interference
 */
async function handleFetchSubtitlesMainWorld(message, sender) {
    const { subtitleUrl } = message;
    const tabId = sender.tab?.id;

    if (!tabId) {
        return { success: false, error: 'No tab ID' };
    }

    console.log('[VideoTranslate] Executing fetch in main world for tab:', tabId);

    try {
        // Execute fetch in the page's main world (bypasses CSP)
        const results = await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: async (url) => {
                try {
                    // Add fmt=json3 if not present
                    let fetchUrl = url;
                    if (url.includes('fmt=')) {
                        fetchUrl = url.replace(/fmt=[^&]+/, 'fmt=json3');
                    } else {
                        fetchUrl = url + (url.includes('?') ? '&' : '?') + 'fmt=json3';
                    }

                    const response = await fetch(fetchUrl, {
                        credentials: 'include'
                    });

                    if (!response.ok) {
                        return { success: false, error: 'HTTP ' + response.status };
                    }

                    const text = await response.text();

                    if (!text || text.trim() === '' || text.trim() === '{}') {
                        return { success: false, error: 'Empty response' };
                    }

                    let subtitles = [];

                    // Try parsing as JSON first
                    try {
                        const data = JSON.parse(text);
                        if (data.events) {
                            for (const event of data.events) {
                                if (event.segs) {
                                    const segText = event.segs.map(s => s.utf8 || '').join('');
                                    if (segText.trim()) {
                                        subtitles.push({
                                            startMs: event.tStartMs || 0,
                                            durationMs: event.dDurationMs || 3000,
                                            text: segText.trim()
                                        });
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        // Try XML parsing
                        if (text.includes('<text')) {
                            const parser = new DOMParser();
                            const xmlDoc = parser.parseFromString(text, 'text/xml');
                            const textNodes = xmlDoc.getElementsByTagName('text');
                            for (let i = 0; i < textNodes.length; i++) {
                                const node = textNodes[i];
                                const start = parseFloat(node.getAttribute('start')) * 1000;
                                const dur = parseFloat(node.getAttribute('dur')) * 1000;
                                const nodeText = node.textContent;
                                if (nodeText && nodeText.trim()) {
                                    subtitles.push({
                                        startMs: start,
                                        durationMs: dur,
                                        text: nodeText.trim()
                                    });
                                }
                            }
                        }
                    }

                    if (subtitles.length > 0) {
                        return { success: true, subtitles };
                    } else {
                        return { success: false, error: 'No subtitles parsed' };
                    }
                } catch (error) {
                    return { success: false, error: error.message };
                }
            },
            args: [subtitleUrl]
        });

        if (results && results[0] && results[0].result) {
            console.log('[VideoTranslate] Main world fetch result:', results[0].result);
            return results[0].result;
        }

        return { success: false, error: 'No result from main world execution' };
    } catch (error) {
        console.error('[VideoTranslate] Main world execution error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Fetch subtitles through background script (bypasses content script adblocker interference)
 */
async function handleFetchSubtitles(message) {
    const { subtitleUrl, videoId, languageCode } = message;

    console.log('[VideoTranslate] Background fetching subtitles for:', videoId);

    // Build a list of URLs to try
    // IMPORTANT: Preserve the original URL with all its signature parameters
    const urlsToTry = [];

    // 1. Original URL with fmt=json3 added (preserves signatures)
    if (subtitleUrl) {
        if (subtitleUrl.includes('fmt=')) {
            urlsToTry.push(subtitleUrl.replace(/fmt=[^&]+/, 'fmt=json3'));
        } else {
            urlsToTry.push(subtitleUrl + (subtitleUrl.includes('?') ? '&' : '?') + 'fmt=json3');
        }
        // Also try original URL as-is
        urlsToTry.push(subtitleUrl);
    }

    for (const url of urlsToTry) {
        try {
            console.log('[VideoTranslate] Trying URL:', url.substring(0, 100) + '...');

            // Try fetching with credentials (cookies) for YouTube auth
            const response = await fetch(url, {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                }
            });

            if (!response.ok) {
                console.warn('[VideoTranslate] HTTP error:', response.status);
                continue;
            }

            const text = await response.text();

            if (!text || text.trim() === '' || text.trim() === '{}') {
                console.warn('[VideoTranslate] Empty response from', url.substring(0, 50) + '...');
                continue;
            }

            // Try XML parsing first if it looks like XML
            if (text.trim().startsWith('<?xml') || text.trim().startsWith('<transcript')) {
                console.log('[VideoTranslate] Received XML subtitles via background');
                const subtitles = parseXMLSubtitlesBackground(text);
                if (subtitles.length > 0) {
                    console.log('[VideoTranslate] Successfully parsed', subtitles.length, 'XML subtitles via background');
                    return { success: true, subtitles };
                }
            }

            let data;
            try {
                data = JSON.parse(text);
            } catch (e) {
                console.warn('[VideoTranslate] JSON parse error:', e.message);
                continue;
            }

            // Validate data has events
            if (!data.events || data.events.length === 0) {
                console.warn('[VideoTranslate] JSON has no events');
                continue;
            }

            // Parse subtitles
            const subtitles = [];
            for (const event of data.events) {
                if (event.segs) {
                    const text = event.segs.map(s => s.utf8 || '').join('');
                    if (text.trim()) {
                        subtitles.push({
                            startMs: event.tStartMs || 0,
                            durationMs: event.dDurationMs || 3000,
                            text: text.trim(),
                        });
                    }
                }
            }

            if (subtitles.length > 0) {
                console.log('[VideoTranslate] Successfully fetched', subtitles.length, 'subtitles via background');
                return { success: true, subtitles };
            }
        } catch (error) {
            console.warn('[VideoTranslate] Background fetch error:', error.message);
        }
    }

    return { success: false, error: 'All fetch attempts failed' };
}

/**
 * Parse XML subtitles in background script
 */
function parseXMLSubtitlesBackground(xml) {
    const subtitles = [];
    try {
        // Use regex parsing since DOMParser may not be available in service worker
        const textRegex = /<text[^>]*start="([^"]*)"[^>]*dur="([^"]*)"[^>]*>([^<]*)<\/text>/g;
        let match;
        while ((match = textRegex.exec(xml)) !== null) {
            const start = parseFloat(match[1]) * 1000;
            const duration = parseFloat(match[2]) * 1000;
            const text = match[3]
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .trim();

            if (text) {
                subtitles.push({ startMs: start, durationMs: duration, text });
            }
        }
    } catch (e) {
        console.warn('[VideoTranslate] XML parsing failed in background:', e.message);
    }
    return subtitles;
}

async function handleTranslation(message, sender) {
    const { videoId, subtitles, sourceLanguage, targetLanguage } = message;
    const tabId = sender.tab?.id;

    const cached = await getCachedTranslation(videoId, sourceLanguage, targetLanguage);
    if (cached) {
        return { success: true, translations: cached, fromCache: true };
    }

    try {
        const translations = await translateSubtitles(
            subtitles,
            sourceLanguage,
            targetLanguage,
            (progress) => {
                translationProgress.set(tabId, progress);
                if (tabId) {
                    chrome.tabs.sendMessage(tabId, {
                        action: 'translationProgress',
                        progress,
                    }).catch(() => { });
                }
            }
        );

        await cacheTranslation(videoId, sourceLanguage, targetLanguage, translations);
        translationProgress.delete(tabId);

        return { success: true, translations, fromCache: false };
    } catch (error) {
        translationProgress.delete(tabId);
        throw error;
    }
}

console.log('[VideoTranslate] Service worker started');
