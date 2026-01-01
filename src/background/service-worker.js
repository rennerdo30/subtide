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
            });
        });
    });
}

async function saveConfig(config) {
    return new Promise((resolve) => {
        chrome.storage.local.set({
            [STORAGE_KEYS.API_URL]: config.apiUrl,
            [STORAGE_KEYS.API_KEY]: config.apiKey,
            [STORAGE_KEYS.MODEL]: config.model,
            [STORAGE_KEYS.TIER]: config.tier,
            [STORAGE_KEYS.FORCE_GEN]: config.forceGen,
            [STORAGE_KEYS.DEFAULT_LANGUAGE]: config.defaultLanguage,
            [STORAGE_KEYS.BACKEND_URL]: config.backendUrl,
            // Subtitle appearance
            [STORAGE_KEYS.SUBTITLE_SIZE]: config.subtitleSize,
            [STORAGE_KEYS.SUBTITLE_POSITION]: config.subtitlePosition,
            [STORAGE_KEYS.SUBTITLE_BACKGROUND]: config.subtitleBackground,
            [STORAGE_KEYS.SUBTITLE_COLOR]: config.subtitleColor,
        }, resolve);
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
 * Combined process endpoint for Tier 3 (subtitles + translation in one call)
 * Server uses its own API key - user doesn't need one
 * Uses Server-Sent Events for progress updates
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

                // Parse SSE events
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep incomplete line in buffer

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));

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
                            console.warn('[VideoTranslate] SSE parse error:', e);
                        }
                    }
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
            // All tiers: Get subtitles from backend (no API key sent)
            return await fetchSubtitlesFromBackend(message.videoId, config);

        case 'translate':
            return await handleTranslation(message, sender, config);

        case 'process':
            // Tier 3 only: Combined subtitle + translation
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
            // Test API connection (Tier 1/2 only - direct LLM call)
            try {
                await callLLMDirect('Say "ok"', message.config || config);
                return { success: true };
            } catch (e) {
                return { success: false, error: e.message };
            }

        default:
            throw new Error(chrome.i18n.getMessage('unknownAction', [message.action]));
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

console.log('[VideoTranslate] Service worker initialized');
