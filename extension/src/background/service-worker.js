/**
 * Background Service Worker
 * Handles API calls and message passing between popup and content scripts
 *
 * SECURITY:
 * - Tier 1/2: API keys stay in extension, direct LLM calls from here
 * - Tier 3: No user API key needed, backend handles everything
 */

// ============================================================================
// Storage Utilities
// ============================================================================

const STORAGE_KEYS = {
    API_URL: 'apiUrl',
    API_KEY: 'apiKey',
    MODEL: 'model',
    TIER: 'tier',
    FORCE_GEN: 'forceGen',
    DEFAULT_LANGUAGE: 'defaultLanguage',
    TRANSLATION_CACHE: 'translationCache',
    BACKEND_URL: 'backendUrl',
    // Subtitle appearance
    SUBTITLE_SIZE: 'subtitleSize',
    SUBTITLE_POSITION: 'subtitlePosition',
    SUBTITLE_BACKGROUND: 'subtitleBackground',
    SUBTITLE_COLOR: 'subtitleColor',
    SUBTITLE_FONT: 'subtitleFont',
    SUBTITLE_OUTLINE: 'subtitleOutline',
    SUBTITLE_OPACITY: 'subtitleOpacity',
    SUBTITLE_SHOW_SPEAKER: 'subtitleShowSpeaker',
};

const DEFAULT_CONFIG = {
    apiUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
    tier: 'tier1',
    forceGen: false,
    defaultLanguage: 'en',
    backendUrl: 'http://localhost:5001',
    // Subtitle appearance
    subtitleSize: 'medium',
    subtitlePosition: 'bottom',
    subtitleBackground: 'dark',
    subtitleColor: 'white',
    subtitleFont: 'sans-serif',
    subtitleOutline: 'medium',
    subtitleOpacity: 'full',
    subtitleShowSpeaker: 'off',
};

async function getConfig() {
    return new Promise((resolve) => {
        chrome.storage.local.get(Object.values(STORAGE_KEYS), (result) => {
            resolve({
                apiUrl: result[STORAGE_KEYS.API_URL] || DEFAULT_CONFIG.apiUrl,
                apiKey: result[STORAGE_KEYS.API_KEY] || DEFAULT_CONFIG.apiKey,
                model: result[STORAGE_KEYS.MODEL] || DEFAULT_CONFIG.model,
                tier: result[STORAGE_KEYS.TIER] || DEFAULT_CONFIG.tier,
                forceGen: result[STORAGE_KEYS.FORCE_GEN] || DEFAULT_CONFIG.forceGen,
                defaultLanguage: result[STORAGE_KEYS.DEFAULT_LANGUAGE] || DEFAULT_CONFIG.defaultLanguage,
                backendUrl: result[STORAGE_KEYS.BACKEND_URL] || DEFAULT_CONFIG.backendUrl,
                // Subtitle appearance
                subtitleSize: result[STORAGE_KEYS.SUBTITLE_SIZE] || DEFAULT_CONFIG.subtitleSize,
                subtitlePosition: result[STORAGE_KEYS.SUBTITLE_POSITION] || DEFAULT_CONFIG.subtitlePosition,
                subtitleBackground: result[STORAGE_KEYS.SUBTITLE_BACKGROUND] || DEFAULT_CONFIG.subtitleBackground,
                subtitleColor: result[STORAGE_KEYS.SUBTITLE_COLOR] || DEFAULT_CONFIG.subtitleColor,
                subtitleFont: result[STORAGE_KEYS.SUBTITLE_FONT] || DEFAULT_CONFIG.subtitleFont,
                subtitleOutline: result[STORAGE_KEYS.SUBTITLE_OUTLINE] || DEFAULT_CONFIG.subtitleOutline,
                subtitleOpacity: result[STORAGE_KEYS.SUBTITLE_OPACITY] || DEFAULT_CONFIG.subtitleOpacity,
                subtitleShowSpeaker: result[STORAGE_KEYS.SUBTITLE_SHOW_SPEAKER] || DEFAULT_CONFIG.subtitleShowSpeaker,
            });
        });
    });
}

async function saveConfig(config) {
    return new Promise((resolve) => {
        const toSave = {};
        // Only save defined values (partial update support)
        if (config.apiUrl !== undefined) toSave[STORAGE_KEYS.API_URL] = config.apiUrl;
        if (config.apiKey !== undefined) toSave[STORAGE_KEYS.API_KEY] = config.apiKey;
        if (config.model !== undefined) toSave[STORAGE_KEYS.MODEL] = config.model;
        if (config.tier !== undefined) toSave[STORAGE_KEYS.TIER] = config.tier;
        if (config.forceGen !== undefined) toSave[STORAGE_KEYS.FORCE_GEN] = config.forceGen;
        if (config.defaultLanguage !== undefined) toSave[STORAGE_KEYS.DEFAULT_LANGUAGE] = config.defaultLanguage;
        if (config.backendUrl !== undefined) toSave[STORAGE_KEYS.BACKEND_URL] = config.backendUrl;
        // Subtitle appearance
        if (config.subtitleSize !== undefined) toSave[STORAGE_KEYS.SUBTITLE_SIZE] = config.subtitleSize;
        if (config.subtitlePosition !== undefined) toSave[STORAGE_KEYS.SUBTITLE_POSITION] = config.subtitlePosition;
        if (config.subtitleBackground !== undefined) toSave[STORAGE_KEYS.SUBTITLE_BACKGROUND] = config.subtitleBackground;
        if (config.subtitleColor !== undefined) toSave[STORAGE_KEYS.SUBTITLE_COLOR] = config.subtitleColor;
        if (config.subtitleFont !== undefined) toSave[STORAGE_KEYS.SUBTITLE_FONT] = config.subtitleFont;
        if (config.subtitleOutline !== undefined) toSave[STORAGE_KEYS.SUBTITLE_OUTLINE] = config.subtitleOutline;
        if (config.subtitleOpacity !== undefined) toSave[STORAGE_KEYS.SUBTITLE_OPACITY] = config.subtitleOpacity;
        if (config.subtitleShowSpeaker !== undefined) toSave[STORAGE_KEYS.SUBTITLE_SHOW_SPEAKER] = config.subtitleShowSpeaker;

        chrome.storage.local.set(toSave, resolve);
    });
}

async function isConfigured() {
    const config = await getConfig();
    // Tier 3 doesn't need API key (managed by server)
    if (config.tier === 'tier3') {
        return true; // Just needs backend URL which has default
    }
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
            resolve(result[CACHE_KEY] || { version: CACHE_VERSION, entries: {} });
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

    // LRU eviction
    const entries = Object.entries(cache.entries);
    if (entries.length > MAX_CACHE_ENTRIES) {
        entries.sort((a, b) => a[1].lastAccess - b[1].lastAccess);
        const toRemove = entries.length - MAX_CACHE_ENTRIES;
        for (let i = 0; i < toRemove; i++) {
            delete cache.entries[entries[i][0]];
        }
    }

    await saveCache(cache);
}

async function clearCache() {
    await saveCache({ version: CACHE_VERSION, entries: {} });
}

// ============================================================================
// Direct LLM Translation (Tier 1 & 2)
// API key stays in extension, never sent to our backend
// ============================================================================

const LANGUAGE_NAMES = {
    'en': 'English', 'ja': 'Japanese', 'ko': 'Korean',
    'zh-CN': 'Chinese (Simplified)', 'zh-TW': 'Chinese (Traditional)',
    'es': 'Spanish', 'fr': 'French', 'de': 'German',
    'pt': 'Portuguese', 'ru': 'Russian', 'ar': 'Arabic',
    'hi': 'Hindi', 'it': 'Italian', 'nl': 'Dutch',
    'pl': 'Polish', 'tr': 'Turkish', 'vi': 'Vietnamese',
    'th': 'Thai', 'id': 'Indonesian',
};

function getLanguageName(code) {
    return LANGUAGE_NAMES[code] || code;
}

/**
 * Build translation prompt
 */
function buildTranslationPrompt(subtitles, sourceLanguage, targetLanguage) {
    const sourceName = getLanguageName(sourceLanguage);
    const targetName = getLanguageName(targetLanguage);

    const numbered = subtitles.map((s, i) => `${i + 1}. ${s.text}`).join('\n');

    return `Translate these subtitles from ${sourceName} to ${targetName}.

Rules:
- Keep translations concise (for subtitles)
- Maintain tone and meaning
- Return ONLY numbered translations, one per line
- No explanations

Subtitles:
${numbered}`;
}

/**
 * Parse LLM response into translations array
 */
function parseTranslationResponse(response, expectedCount) {
    const lines = response.trim().split('\n');
    const translations = [];

    for (const line of lines) {
        const cleaned = line.replace(/^\d+[\.\)\:\-]\s*/, '').trim();
        if (cleaned) translations.push(cleaned);
    }

    // Pad if needed
    while (translations.length < expectedCount) {
        translations.push('');
    }

    return translations.slice(0, expectedCount);
}

/**
 * Call LLM API directly from extension (Tier 1 & 2)
 * User's API key never leaves the extension
 */
async function callLLMDirect(prompt, config) {
    const url = `${config.apiUrl.replace(/\/$/, '')}/chat/completions`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
            model: config.model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            max_tokens: 4096,
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(chrome.i18n.getMessage('llmApiError', [response.status.toString(), error]));
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

/**
 * Translate subtitles directly via LLM (Tier 1 & 2)
 */
async function translateDirectLLM(subtitles, sourceLanguage, targetLanguage, config, onProgress) {
    const BATCH_SIZE = 25;
    const results = [];

    for (let i = 0; i < subtitles.length; i += BATCH_SIZE) {
        const batch = subtitles.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(subtitles.length / BATCH_SIZE);

        console.log(`[VideoTranslate] Direct LLM batch ${batchNum}/${totalBatches}`);

        try {
            const prompt = buildTranslationPrompt(batch, sourceLanguage, targetLanguage);
            const response = await callLLMDirect(prompt, config);
            const translations = parseTranslationResponse(response, batch.length);

            for (let j = 0; j < batch.length; j++) {
                results.push({
                    ...batch[j],
                    translatedText: translations[j] || batch[j].text,
                });
            }
        } catch (error) {
            console.error(`[VideoTranslate] Batch ${batchNum} failed:`, error);
            // Keep original text on error
            for (const sub of batch) {
                results.push({ ...sub, translatedText: sub.text, error: true });
            }
        }

        if (onProgress) {
            onProgress({
                stage: 'translating',
                message: `Translating batch ${batchNum}/${totalBatches}...`,
                percent: Math.round((Math.min(i + BATCH_SIZE, subtitles.length) / subtitles.length) * 100),
                step: 1, // Tier 1/2 is usually just 1 step in this flow
                totalSteps: 1,
                batchInfo: { current: batchNum, total: totalBatches }
            });
        }

        // Rate limit
        if (i + BATCH_SIZE < subtitles.length) {
            await new Promise(r => setTimeout(r, 300));
        }
    }

    return results;
}

// ============================================================================
// Backend API Calls
// ============================================================================

/**
 * Fetch subtitles from backend (all tiers)
 * No API key sent - just video ID
 */
async function fetchSubtitlesFromBackend(videoId, config) {
    const { backendUrl, tier, forceGen } = config;

    // Determine endpoint based on tier and forceGen
    const useWhisper = tier === 'tier3' || (forceGen && tier === 'tier2');
    const endpoint = useWhisper ? 'transcribe' : 'subtitles';

    const response = await fetch(`${backendUrl}/api/${endpoint}?video_id=${videoId}&tier=${tier}`);

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Backend error: ${response.status}`);
    }

    return await response.json();
}

/**
 * Parse SSE (Server-Sent Events) data from a buffer
 * Handles multi-line data fields and incomplete frames robustly
 *
 * @param {string} buffer - Raw SSE data buffer
 * @returns {{events: Array, remainder: string}} Parsed events and remaining buffer
 */
function parseSSEBuffer(buffer) {
    const events = [];
    const lines = buffer.split('\n');
    let currentEvent = {};
    let dataLines = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Empty line signals end of event
        if (line === '') {
            if (dataLines.length > 0) {
                currentEvent.data = dataLines.join('\n');
                events.push(currentEvent);
            }
            currentEvent = {};
            dataLines = [];
            continue;
        }

        // Check if this might be an incomplete line at the end
        if (i === lines.length - 1 && !buffer.endsWith('\n')) {
            // Return this as remainder for next chunk
            return {
                events,
                remainder: line
            };
        }

        // Parse field: value format
        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) continue;

        // Handle comment lines (start with :)
        if (colonIndex === 0) continue;

        const field = line.slice(0, colonIndex);
        // Value starts after colon, with optional leading space
        let value = line.slice(colonIndex + 1);
        if (value.startsWith(' ')) {
            value = value.slice(1);
        }

        switch (field) {
            case 'data':
                dataLines.push(value);
                break;
            case 'event':
                currentEvent.event = value;
                break;
            case 'id':
                currentEvent.id = value;
                break;
            case 'retry':
                currentEvent.retry = parseInt(value, 10);
                break;
        }
    }

    // Handle case where buffer ends with complete event but no trailing newline
    if (dataLines.length > 0 && buffer.endsWith('\n\n')) {
        currentEvent.data = dataLines.join('\n');
        events.push(currentEvent);
        return { events, remainder: '' };
    }

    // Return any incomplete data as remainder
    const lastDoubleNewline = buffer.lastIndexOf('\n\n');
    if (lastDoubleNewline !== -1 && lastDoubleNewline < buffer.length - 2) {
        return {
            events,
            remainder: buffer.slice(lastDoubleNewline + 2)
        };
    }

    return { events, remainder: dataLines.length > 0 ? lines[lines.length - 1] || '' : '' };
}

/**
 * Combined process endpoint for Tier 3 (subtitles + translation in one call)
 * Server uses its own API key - user doesn't need one
 * Uses Server-Sent Events for progress updates with robust parsing
 */
async function processVideoTier3(videoId, targetLanguage, config, onProgress, tabId) {
    const { backendUrl, forceGen } = config;

    return new Promise((resolve, reject) => {
        const url = `${backendUrl}/api/process`;

        // Use AbortController for timeout (5 minutes for long videos)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000);

        fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream',
            },
            body: JSON.stringify({
                video_id: videoId,
                target_lang: targetLanguage,
                force_whisper: forceGen,
            }),
            signal: controller.signal,
        }).then(async response => {
            clearTimeout(timeoutId);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                reject(new Error(errorData.error || chrome.i18n.getMessage('failed')));
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                // Parse SSE events using robust parser
                const { events, remainder } = parseSSEBuffer(buffer);
                buffer = remainder;

                for (const event of events) {
                    if (!event.data) continue;

                    try {
                        const data = JSON.parse(event.data);

                        // Progress update
                        if (data.stage && data.message) {
                            console.log(`[VideoTranslate] Progress: ${data.stage} - ${data.message} (${data.percent || 0}%) Step ${data.step || '?'}/${data.totalSteps || '?'}`);
                            // Send progress to content script with all details
                            if (tabId) {
                                chrome.tabs.sendMessage(tabId, {
                                    action: 'progress',
                                    stage: data.stage,
                                    message: data.message,
                                    percent: data.percent,
                                    step: data.step,
                                    totalSteps: data.totalSteps,
                                    eta: data.eta,
                                    batchInfo: data.batchInfo,
                                }).catch(() => { });
                            }
                            if (onProgress) {
                                onProgress(data);
                            }
                        }

                        // Final result
                        if (data.result) {
                            resolve(data.result.subtitles);
                            return;
                        }

                        // Error
                        if (data.error) {
                            reject(new Error(data.error));
                            return;
                        }
                    } catch (e) {
                        console.warn('[VideoTranslate] SSE JSON parse error:', e, 'Data:', event.data);
                    }
                }
            }

            // Handle any remaining buffer content
            if (buffer.trim()) {
                try {
                    // Try to parse as final event
                    const match = buffer.match(/data:\s*(.+)/);
                    if (match) {
                        const data = JSON.parse(match[1]);
                        if (data.result) {
                            resolve(data.result.subtitles);
                            return;
                        }
                        if (data.error) {
                            reject(new Error(data.error));
                            return;
                        }
                    }
                } catch (e) {
                    console.warn('[VideoTranslate] Final buffer parse failed:', e);
                }
            }

            reject(new Error(chrome.i18n.getMessage('streamNoResult')));
        }).catch(reject);
    });
}

// ============================================================================
// Message Handler
// ============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message, sender)
        .then(sendResponse)
        .catch(error => {
            console.error('[VideoTranslate] Error:', error);
            sendResponse({ error: error.message });
        });
    return true;
});

async function handleMessage(message, sender) {
    const config = await getConfig();

    switch (message.action) {
        case 'getConfig':
            return config;

        case 'saveConfig':
            await saveConfig(message.config);
            return { success: true };

        case 'isConfigured':
            return { configured: await isConfigured() };

        case 'fetchSubtitles':
            return await fetchSubtitlesFromBackend(message.videoId, config);

        case 'translate':
            return await handleTranslation(message, sender, config);

        case 'process':
            if (config.tier !== 'tier3') {
                throw new Error(chrome.i18n.getMessage('tier3Only'));
            }
            return await handleTier3Process(message, sender, config);

        case 'getCachedTranslation':
            const cached = await getCachedTranslation(
                message.videoId,
                message.sourceLanguage,
                message.targetLanguage
            );
            return { cached, found: cached !== null };

        case 'clearCache':
            await clearCache();
            return { success: true };

        case 'getCacheStats':
            const cache = await getAllCache();
            return { entries: Object.keys(cache.entries || {}).length };

        case 'testApi':
            try {
                await callLLMDirect('Say "ok"', message.config || config);
                return { success: true };
            } catch (e) {
                return { success: false, error: e.message };
            }

        case 'startLiveTranslate':
            // Note: handleStartLiveTranslate now handles finding the active tab if sender.tab is missing
            return await handleStartLiveTranslate(message, sender, config);

        case 'stopLiveTranslate':
            return await handleStopLiveTranslate();

        case 'getLiveStatus':
            return { isLive: isLiveTranslating };

        case 'live-transcription-result':
            // Forward from offscreen to the specific tab if known, or broadcast
            if (message.tabId) {
                chrome.tabs.sendMessage(message.tabId, {
                    action: 'live-subtitles',
                    data: message.data
                }).catch(() => { });
            } else {
                // Fallback: Forward from offscreen to all YouTube tabs
                chrome.tabs.query({ url: "*://*.youtube.com/*" }, (tabs) => {
                    tabs.forEach(tab => {
                        chrome.tabs.sendMessage(tab.id, {
                            action: 'live-subtitles',
                            data: message.data
                        }).catch(() => { });
                    });
                });
            }
            return { success: true };
        
        case 'error':
            console.error('[VideoTranslate] Offscreen error:', message.message || message.error || message);
            return { success: true };

        default:
            if (message.action) {
                throw new Error(chrome.i18n.getMessage('unknownAction', [message.action]));
            }
            return { ignored: true };
    }
}

/**
 * Handle translation request
 * - Tier 1 & 2: Direct LLM call from extension (API key stays here)
 * - Tier 3: Should use 'process' action instead for efficiency
 */
async function handleTranslation(message, sender, config) {
    const { subtitles, sourceLanguage, targetLanguage, videoId } = message;

    // Check cache first
    const cached = await getCachedTranslation(videoId, sourceLanguage, targetLanguage);
    if (cached) {
        return { translations: cached, cached: true };
    }

    // Tier 1 & 2: Direct LLM call (API key never leaves extension)
    if (config.tier !== 'tier3') {
        if (!config.apiKey) {
            throw new Error(chrome.i18n.getMessage('apiKeyRequired'));
        }

        const translations = await translateDirectLLM(
            subtitles,
            sourceLanguage,
            targetLanguage,
            config,
            (p) => {
                const tabId = sender?.tab?.id;
                if (tabId) {
                    chrome.tabs.sendMessage(tabId, {
                        action: 'progress',
                        ...p
                    }).catch(() => { });
                }
            }
        );

        await cacheTranslation(videoId, sourceLanguage, targetLanguage, translations);
        return { translations, cached: false };
    }

    // Tier 3 shouldn't use this path - use 'process' action instead
    throw new Error(chrome.i18n.getMessage('tier3ProcessPath'));
}

/**
 * Handle Tier 3 combined processing
 * Single backend call: video → translated subtitles
 */
async function handleTier3Process(message, sender, config) {
    const { videoId, targetLanguage } = message;
    const tabId = sender?.tab?.id;

    // Check cache first
    const cached = await getCachedTranslation(videoId, 'auto', targetLanguage);
    if (cached) {
        return { translations: cached, cached: true };
    }

    // Single backend call does everything (with progress updates via SSE)
    const translations = await processVideoTier3(videoId, targetLanguage, config, null, tabId);

    await cacheTranslation(videoId, 'auto', targetLanguage, translations);
    return { translations, cached: false };
}

// ============================================================================
// Livestream Translation (Proposed)
// ============================================================================

let isLiveTranslating = false;

// Restore state from storage on init
chrome.storage.local.get(['isLiveTranslating'], (result) => {
    isLiveTranslating = !!result.isLiveTranslating;
});

async function handleStartLiveTranslate(message, sender, config) {
    let tabId = sender?.tab?.id;
    const { targetLanguage } = message;

    // If called from popup, sender.tab is undefined. Find the active tab.
    if (!tabId) {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs && tabs.length > 0) {
            tabId = tabs[0].id;
        }
    }

    if (!tabId) {
        throw new Error("Could not determine target tab for live translation.");
    }

    try {
        // 1. Ensure offscreen document exists
        await setupOffscreenDocument('src/offscreen/offscreen.html');

        // 2. Get tab capture stream ID
        // Note: In MV3, this must be called from the background
        const streamId = await new Promise((resolve, reject) => {
            chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (streamId) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(streamId);
                }
            });
        });

        if (!streamId) {
            throw new Error("Got empty streamId from tabCapture");
        }

        console.log('[VideoTranslate] Got streamId:', streamId);

        // 3. Tell offscreen to start recording
        await chrome.runtime.sendMessage({
            type: 'start-recording',
            target: 'offscreen',
            data: {
                streamId,
                tabId, // Pass tabId so offscreen can tag results
                targetLang: targetLanguage,
                apiUrl: config.backendUrl
            }
        });
        
        isLiveTranslating = true;
        await chrome.storage.local.set({ isLiveTranslating: true });
        return { success: true };
    } catch (error) {
        console.error('[VideoTranslate] Live translate failed:', error);
        if (error.message && error.message.includes("Extension has not been invoked")) {
             throw new Error(chrome.i18n.getMessage('usePopupForLive') || "Please start Live Translation from the Extension Popup icon.");
        }
        throw error;
    }
}

async function handleStopLiveTranslate() {
    try {
        await chrome.runtime.sendMessage({
            type: 'stop-recording',
            target: 'offscreen'
        });
        
        // Notify all YouTube tabs that live translation stopped
        chrome.tabs.query({ url: "*://*.youtube.com/*" }, (tabs) => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, {
                    action: 'live-stopped'
                }).catch(() => { });
            });
        });

        // We can keep the offscreen doc alive or close it
        // await chrome.offscreen.closeDocument();
        isLiveTranslating = false;
        await chrome.storage.local.set({ isLiveTranslating: false });
        return { success: true };
    } catch (error) {
        console.error('[VideoTranslate] Stop live failed:', error);
        isLiveTranslating = false;
        await chrome.storage.local.set({ isLiveTranslating: false });
        return { success: false, error: error.message };
    }
}

async function setupOffscreenDocument(path) {
    if (await chrome.offscreen.hasDocument()) return;

    await chrome.offscreen.createDocument({
        url: path,
        reasons: ['USER_MEDIA'],
        justification: 'Capturing tab audio for real-time translation'
    });
}

console.log('[VideoTranslate] Service worker initialized');
