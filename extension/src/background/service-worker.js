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
    BACKEND_API_KEY: 'backendApiKey',
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
                backendApiKey: result[STORAGE_KEYS.BACKEND_API_KEY] || '',
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
        if (config.backendApiKey !== undefined) toSave[STORAGE_KEYS.BACKEND_API_KEY] = config.backendApiKey;
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
    // Tier 3 and Tier 4 don't need API key (managed by server)
    if (config.tier === 'tier3' || config.tier === 'tier4') {
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
 * Detect language from subtitle text using character analysis
 * Returns detected language code or 'unknown'
 */
function detectLanguage(subtitles, sampleSize = 5) {
    if (!subtitles || subtitles.length === 0) return 'unknown';

    // Sample first N subtitles
    const sample = subtitles.slice(0, Math.min(sampleSize, subtitles.length));
    const text = sample.map(s => s.text).join(' ');

    if (!text.trim()) return 'unknown';

    // Character pattern detection
    const patterns = {
        'ja': /[\u3040-\u309F\u30A0-\u30FF]/g,  // Hiragana + Katakana
        'ko': /[\uAC00-\uD7AF\u1100-\u11FF]/g,  // Korean
        'zh': /[\u4E00-\u9FFF]/g,                // CJK (Chinese/Japanese Kanji)
        'ar': /[\u0600-\u06FF]/g,                // Arabic
        'hi': /[\u0900-\u097F]/g,                // Devanagari (Hindi)
        'ru': /[\u0400-\u04FF]/g,                // Cyrillic
        'th': /[\u0E00-\u0E7F]/g,                // Thai
    };

    const scores = {};
    for (const [lang, pattern] of Object.entries(patterns)) {
        const matches = text.match(pattern);
        scores[lang] = matches ? matches.length / text.length : 0;
    }

    // Find highest scoring language
    let detected = 'en'; // Default to English
    let maxScore = 0;

    for (const [lang, score] of Object.entries(scores)) {
        if (score > maxScore && score > 0.1) { // Threshold: at least 10% of chars
            maxScore = score;
            detected = lang;
        }
    }

    // Special case: Japanese uses Kanji (zh pattern) but also has kana
    if (scores['zh'] > 0.1 && scores['ja'] > 0.05) {
        detected = 'ja'; // Likely Japanese with kanji
    }

    console.log(`[VideoTranslate] Detected language: ${detected} (scores: ${JSON.stringify(scores)})`);
    return detected;
}

/**
 * Check if source and target languages are effectively the same
 */
function isSameLanguage(detected, target) {
    // Normalize language codes
    const normalize = (lang) => {
        if (lang.startsWith('zh')) return 'zh';
        return lang.toLowerCase().split('-')[0];
    };

    return normalize(detected) === normalize(target);
}

/**
 * Sentence Boundary Detection: Merge partial sentences before translation
 * Returns merged subtitles with original indices for resplitting
 */
function mergePartialSentences(subtitles) {
    if (!subtitles || subtitles.length === 0) return { merged: subtitles, mapping: [] };

    const merged = [];
    const mapping = []; // Maps merged index to original indices

    // Sentence ending punctuation (supports multiple languages)
    const sentenceEndPattern = /[.!?。！？…]$/;

    let currentGroup = [];
    let groupIndices = [];

    for (let i = 0; i < subtitles.length; i++) {
        const sub = subtitles[i];
        currentGroup.push(sub);
        groupIndices.push(i);

        const text = sub.text.trim();
        const endsWithPunctuation = sentenceEndPattern.test(text);
        const isLastSubtitle = i === subtitles.length - 1;

        // Merge when we hit sentence end or last subtitle
        if (endsWithPunctuation || isLastSubtitle) {
            const mergedText = currentGroup.map(s => s.text).join(' ');
            merged.push({
                ...currentGroup[0],
                text: mergedText,
                end: currentGroup[currentGroup.length - 1].end,
                _originalIndices: [...groupIndices]
            });
            mapping.push([...groupIndices]);
            currentGroup = [];
            groupIndices = [];
        }
    }

    if (merged.length !== subtitles.length) {
        console.log(`[VideoTranslate] Merged ${subtitles.length} -> ${merged.length} sentences`);
    }

    return { merged, mapping };
}

/**
 * Resplit translated text back to original subtitle timings
 */
function resplitAfterTranslation(originalSubtitles, translatedMerged, mapping) {
    if (!mapping || mapping.length === 0) return translatedMerged;

    const results = [];

    for (let i = 0; i < translatedMerged.length; i++) {
        const indices = mapping[i];
        const translatedText = translatedMerged[i].translatedText || translatedMerged[i].text;

        if (indices.length === 1) {
            // Single subtitle, no split needed
            results.push({
                ...originalSubtitles[indices[0]],
                translatedText
            });
        } else {
            // Multiple originals merged - need to split translation proportionally
            const words = translatedText.split(/\s+/);
            const totalWords = words.length;
            const wordsPerSegment = Math.ceil(totalWords / indices.length);

            for (let j = 0; j < indices.length; j++) {
                const origIdx = indices[j];
                const start = j * wordsPerSegment;
                const end = Math.min((j + 1) * wordsPerSegment, totalWords);
                const segmentWords = words.slice(start, end);

                results.push({
                    ...originalSubtitles[origIdx],
                    translatedText: segmentWords.join(' ') || translatedText
                });
            }
        }
    }

    return results;
}

/**
 * Build translation prompt
 */
function buildTranslationPrompt(subtitles, sourceLanguage, targetLanguage, isRetry = false, fullSubtitleList = null, batchStartIndex = 0) {
    const sourceName = getLanguageName(sourceLanguage);
    const targetName = getLanguageName(targetLanguage);

    // Build numbered list with context markers
    const numbered = subtitles.map((s, i) => `${i + 1}. ${s.text}`).join('\n');

    // Context Window: Include prev/next subtitle if available
    let contextHint = '';
    if (fullSubtitleList && fullSubtitleList.length > subtitles.length) {
        const prevIdx = batchStartIndex - 1;
        const nextIdx = batchStartIndex + subtitles.length;

        if (prevIdx >= 0) {
            const prevText = fullSubtitleList[prevIdx]?.text || '';
            if (prevText) {
                contextHint += `[Previous context]: "${prevText.substring(0, 100)}"\n`;
            }
        }
        if (nextIdx < fullSubtitleList.length) {
            const nextText = fullSubtitleList[nextIdx]?.text || '';
            if (nextText) {
                contextHint += `[Next context]: "${nextText.substring(0, 100)}"\n`;
            }
        }
    }

    if (isRetry) {
        // Stronger prompt for retry - emphasize that translation MUST happen
        return `CRITICAL: You MUST translate these subtitles from ${sourceName} to ${targetName}. 

DO NOT return the original text. Every line MUST be translated to ${targetName}.
If a line is already in ${targetName}, still rephrase it naturally.

Rules:
- TRANSLATE every single line to ${targetName}
- Keep translations concise (for subtitles)
- Return ONLY numbered translations, one per line
- No explanations, no original text

${contextHint}
Subtitles to translate:
${numbered}`;
    }

    return `Translate these subtitles from ${sourceName} to ${targetName}.

Rules:
- Keep translations concise (for subtitles)
- Maintain tone and meaning
- Consider context from adjacent subtitles for coherence
- Return ONLY numbered translations, one per line
- No explanations

${contextHint}
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
    const MAX_RETRIES = 2;
    const results = [];

    // Language detection pre-check: skip translation if source = target
    const detectedLang = detectLanguage(subtitles);
    if (isSameLanguage(detectedLang, targetLanguage)) {
        console.log(`[VideoTranslate] Source language (${detectedLang}) matches target (${targetLanguage}), skipping translation`);
        // Return subtitles with translatedText = original text
        return subtitles.map(sub => ({
            ...sub,
            translatedText: sub.text,
            skippedTranslation: true
        }));
    }

    // Sentence Boundary Detection: Merge partial sentences for better translation
    const { merged: mergedSubtitles, mapping: sentenceMapping } = mergePartialSentences(subtitles);
    const subsToTranslate = mergedSubtitles.length < subtitles.length ? mergedSubtitles : subtitles;
    const usesSentenceMerging = mergedSubtitles.length < subtitles.length;

    if (usesSentenceMerging) {
        console.log(`[VideoTranslate] Using sentence merging: ${subtitles.length} -> ${mergedSubtitles.length} segments`);
    }

    for (let i = 0; i < subsToTranslate.length; i += BATCH_SIZE) {
        const batch = subsToTranslate.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(subsToTranslate.length / BATCH_SIZE);

        console.log(`[VideoTranslate] Direct LLM batch ${batchNum}/${totalBatches}`);

        let translations = null;
        let retryCount = 0;

        while (retryCount <= MAX_RETRIES) {
            try {
                const isRetry = retryCount > 0;
                // Pass full subtitle list and batch start index for context window
                const prompt = buildTranslationPrompt(batch, sourceLanguage, targetLanguage, isRetry, subsToTranslate, i);
                const response = await callLLMDirect(prompt, config);
                translations = parseTranslationResponse(response, batch.length);

                // Check if translation actually happened (at least 50% should be different)
                const unchangedCount = translations.filter((t, idx) =>
                    t.trim().toLowerCase() === batch[idx].text.trim().toLowerCase()
                ).length;

                const unchangedPercent = (unchangedCount / translations.length) * 100;

                if (unchangedPercent > 50 && retryCount < MAX_RETRIES) {
                    console.warn(`[VideoTranslate] Batch ${batchNum}: ${unchangedPercent.toFixed(0)}% unchanged, retrying...`);
                    retryCount++;
                    await new Promise(r => setTimeout(r, 500)); // Brief delay before retry
                    continue;
                }

                break; // Success
            } catch (error) {
                console.error(`[VideoTranslate] Batch ${batchNum} attempt ${retryCount + 1} failed:`, error);
                retryCount++;
                if (retryCount > MAX_RETRIES) {
                    // Keep original text on error after all retries
                    translations = batch.map(sub => sub.text);
                    break;
                }
                await new Promise(r => setTimeout(r, 500));
            }
        }

        for (let j = 0; j < batch.length; j++) {
            const translatedText = translations?.[j] || batch[j].text;
            results.push({
                ...batch[j],
                translatedText,
                // Mark as potentially failed if same as original
                translationFailed: translatedText.trim().toLowerCase() === batch[j].text.trim().toLowerCase()
            });
        }

        if (onProgress) {
            onProgress({
                stage: 'translating',
                message: `Translating batch ${batchNum}/${totalBatches}...`,
                percent: Math.round((Math.min(i + BATCH_SIZE, subsToTranslate.length) / subsToTranslate.length) * 100),
                step: 1,
                totalSteps: 1,
                batchInfo: { current: batchNum, total: totalBatches }
            });
        }

        // Rate limit
        if (i + BATCH_SIZE < subsToTranslate.length) {
            await new Promise(r => setTimeout(r, 300));
        }
    }

    // Log warning if many translations failed
    const failedCount = results.filter(r => r.translationFailed).length;
    if (failedCount > results.length * 0.3) {
        console.warn(`[VideoTranslate] Warning: ${failedCount}/${results.length} translations may have failed (unchanged from source)`);
    }

    // Resplit merged sentences back to original timing
    let finalResults = results;
    if (usesSentenceMerging) {
        console.log('[VideoTranslate] Resplitting merged sentences to original timing...');
        finalResults = resplitAfterTranslation(subtitles, results, sentenceMapping);
    }

    // Optional Multi-Pass Translation Refinement
    if (config.enableMultiPass && finalResults.length > 0) {
        console.log('[VideoTranslate] Running multi-pass refinement...');
        try {
            const refinedResults = await refineTranslations(finalResults, targetLanguage, config, onProgress);
            return refinedResults;
        } catch (error) {
            console.warn('[VideoTranslate] Multi-pass refinement failed, using first-pass results:', error);
        }
    }

    return finalResults;
}

/**
 * Multi-Pass Refinement: Second pass to improve translation naturalness
 */
async function refineTranslations(translations, targetLanguage, config, onProgress) {
    const BATCH_SIZE = 25;
    const targetName = getLanguageName(targetLanguage);
    const refined = [...translations];

    for (let i = 0; i < translations.length; i += BATCH_SIZE) {
        const batch = translations.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(translations.length / BATCH_SIZE);

        const numbered = batch.map((s, idx) => `${idx + 1}. ${s.translatedText}`).join('\n');

        const refinementPrompt = `Review and improve these ${targetName} subtitle translations for natural flow.

Fix any awkward phrasing, grammar issues, or unnatural expressions.
Keep the same meaning and roughly the same length.
Return ONLY the improved numbered translations, one per line.

Translations to refine:
${numbered}`;

        try {
            const response = await callLLMDirect(refinementPrompt, config);
            const refinedTexts = parseTranslationResponse(response, batch.length);

            for (let j = 0; j < batch.length && j < refinedTexts.length; j++) {
                if (refinedTexts[j] && refinedTexts[j].trim()) {
                    refined[i + j] = {
                        ...refined[i + j],
                        translatedText: refinedTexts[j],
                        refined: true
                    };
                }
            }
        } catch (error) {
            console.warn(`[VideoTranslate] Refinement batch ${batchNum} failed:`, error);
        }

        if (onProgress) {
            onProgress({
                stage: 'refining',
                message: `Refining batch ${batchNum}/${totalBatches}...`,
                percent: 100,
                step: 2,
                totalSteps: 2,
                batchInfo: { current: batchNum, total: totalBatches }
            });
        }

        await new Promise(r => setTimeout(r, 300));
    }

    console.log('[VideoTranslate] Multi-pass refinement complete');
    return refined;
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

    const headers = {};
    if (config.backendApiKey) {
        headers['Authorization'] = `Bearer ${config.backendApiKey}`;
    }

    const response = await fetch(`${backendUrl}/api/${endpoint}?video_id=${videoId}&tier=${tier}`, {
        headers: headers
    });

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
    let { backendUrl, forceGen, backendApiKey } = config;

    // Normalize URL: remove trailing slashes
    backendUrl = backendUrl.replace(/\/+$/, '');

    // Detect RunPod deployment type:
    // 1. Serverless: api.runpod.ai/v2/{id} -> uses /runsync + {"input": {...}}
    // 2. Load Balancing: {id}.api.runpod.ai -> uses custom Flask app at /api/process
    const isRunPodServerless = backendUrl.includes('api.runpod.ai/v2/');
    const isRunPodLoadBalancer = backendUrl.match(/^https?:\/\/[a-zA-Z0-9]+\.api\.runpod\.ai/);
    const isRunPod = isRunPodServerless || isRunPodLoadBalancer;

    // Use AbortController for timeout (5 minutes for long videos)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000);

    try {
        let url;
        let body;

        if (isRunPodServerless) {
            // RunPod Serverless: Use async /run endpoint with polling
            // This avoids timeout issues with long-running jobs
            url = `${backendUrl}/run`;
            body = JSON.stringify({
                input: {
                    video_id: videoId,
                    target_lang: targetLanguage,
                    force_whisper: forceGen,
                }
            });
        } else {
            // Flask Backend (including RunPod Load Balancing)
            url = `${backendUrl}/api/process`;
            body = JSON.stringify({
                video_id: videoId,
                target_lang: targetLanguage,
                force_whisper: forceGen,
            });
        }

        // Use AbortController for timeout (5 minutes for long videos)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000);

        const fetchHeaders = {
            'Content-Type': 'application/json',
            ...(config.backendApiKey ? { 'Authorization': `Bearer ${config.backendApiKey}` } : {})
        };

        // For Flask (SSE), we accept event-stream. For RunPod, standard JSON.
        if (!isRunPod) {
            fetchHeaders['Accept'] = 'text/event-stream';
        }

        // RunPod requires an API Key
        if (isRunPod && !config.backendApiKey) {
            throw new Error("RunPod connection requires a Backend API Key. Please configure it in the extension settings.");
        }

        console.log('[VideoTranslate] POST Tier 3:', url);
        console.log('[VideoTranslate] isRunPod:', isRunPod, 'isRunPodServerless:', isRunPodServerless, 'isRunPodLoadBalancer:', !!isRunPodLoadBalancer);
        console.log('[VideoTranslate] backendApiKey present:', !!config.backendApiKey);
        console.log('[VideoTranslate] Headers:', JSON.stringify(fetchHeaders, null, 2).replace(config.backendApiKey || 'NO_KEY', '***'));

        // --- RunPod Serverless Async Handler ---
        if (isRunPodServerless) {
            // Step 1: Submit job
            const submitResponse = await fetch(url, {
                method: 'POST',
                headers: fetchHeaders,
                body: body,
            });

            if (!submitResponse.ok) {
                const errorData = await submitResponse.json().catch(() => ({}));
                throw new Error(errorData.error || `Server Error ${submitResponse.status}: ${submitResponse.statusText}`);
            }

            const submitData = await submitResponse.json();
            console.log('[VideoTranslate] RunPod Job Submitted:', submitData);

            if (!submitData.id) {
                throw new Error('RunPod did not return a job ID');
            }

            const jobId = submitData.id;
            const statusUrl = `${backendUrl}/status/${jobId}`;

            // Step 2: Poll for completion
            const POLL_INTERVAL_MS = 2000;
            const MAX_POLL_TIME_MS = 30 * 60 * 1000; // 30 mins
            const startTime = Date.now();
            let lastStatus = '';

            while (Date.now() - startTime < MAX_POLL_TIME_MS) {
                await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

                if (controller.signal.aborted) {
                    throw new Error('Request aborted');
                }

                const statusResponse = await fetch(statusUrl, {
                    method: 'GET',
                    headers: fetchHeaders,
                });

                if (!statusResponse.ok) {
                    console.warn('[VideoTranslate] Status poll failed:', statusResponse.status);
                    continue;
                }

                const statusData = await statusResponse.json();

                if (statusData.status !== lastStatus) {
                    lastStatus = statusData.status;
                    const progressMsg = {
                        stage: statusData.status.toLowerCase(),
                        message: `RunPod: ${statusData.status}`,
                        percent: statusData.status === 'IN_PROGRESS' ? 50 :
                            statusData.status === 'IN_QUEUE' ? 10 : 0
                    };
                    if (tabId) {
                        chrome.tabs.sendMessage(tabId, { action: 'progress', ...progressMsg }).catch(() => { });
                    }
                    if (onProgress) onProgress(progressMsg);
                }

                if (statusData.status === 'COMPLETED') {
                    clearTimeout(timeoutId);
                    const output = statusData.output;
                    if (!output) throw new Error('RunPod job completed but no output');
                    if (output.error) throw new Error(output.error);

                    let finalSubtitles = [];
                    if (Array.isArray(output)) {
                        for (const item of output) {
                            if (item.subtitles) finalSubtitles = finalSubtitles.concat(item.subtitles);
                            if (item.error) throw new Error(item.error);
                        }
                    } else if (output.subtitles) {
                        finalSubtitles = output.subtitles;
                    }
                    return finalSubtitles.length > 0 ? finalSubtitles : [];
                }

                if (statusData.status === 'FAILED') {
                    throw new Error(`RunPod job failed: ${statusData.error || statusData.output?.error || 'Unknown error'}`);
                }

                if (statusData.status === 'CANCELLED') {
                    throw new Error('RunPod job was cancelled');
                }
            }
            throw new Error('RunPod job timed out after 30 minutes');
        }

        // --- RunPod Load Balancer or Flask Backend ---
        const response = await fetch(url, {
            method: 'POST',
            headers: fetchHeaders,
            body: body,
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Server Error ${response.status}: ${response.statusText}`);
        }

        // RunPod Load Balancer (JSON)
        if (isRunPodLoadBalancer) {
            const data = await response.json();
            console.log('[VideoTranslate] RunPod LB Response:', data);
            if (data.subtitles) return data.subtitles;
            if (data.error) throw new Error(data.error);
            throw new Error('No subtitles in response');
        }

        // Flask Backend (SSE)
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const { events, remainder } = parseSSEBuffer(buffer);
            buffer = remainder;

            for (const event of events) {
                if (!event.data) continue;
                try {
                    const data = JSON.parse(event.data);

                    if (data.stage && data.message) {
                        if (tabId) {
                            chrome.tabs.sendMessage(tabId, { action: 'progress', ...data }).catch(() => { });
                        }
                        if (onProgress) onProgress(data);
                    }

                    if (data.result) return data.result.subtitles;
                    if (data.error) throw new Error(data.error);
                } catch (e) {
                    console.warn('[VideoTranslate] JSON Parse error:', e);
                }
            }
        }

        // Final check
        if (buffer.trim()) {
            try {
                const match = buffer.match(/data:\s*(.+)/);
                if (match) {
                    const data = JSON.parse(match[1]);
                    if (data.result) return data.result.subtitles;
                }
            } catch (e) { }
        }

        throw new Error(chrome.i18n.getMessage('streamNoResult'));

    } catch (error) {
        clearTimeout(timeoutId);
        console.error('[VideoTranslate] Fetch failed:', error);
        throw error;
    }
}

/**
 * Tier 4 streaming endpoint: progressive subtitle streaming
 * Streams translated subtitles as each batch completes
 * Uses Server-Sent Events with subtitle data in each batch
 */
async function processVideoTier4(videoId, targetLanguage, config, onProgress, onSubtitles, tabId) {
    const { backendUrl, forceGen, apiKey } = config;

    return new Promise((resolve, reject) => {
        const url = `${backendUrl}/api/stream`;

        // Use AbortController for timeout (5 minutes for long videos)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000);

        const allSubtitles = [];

        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream',
        };

        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        fetch(url, {
            method: 'POST',
            headers: headers,
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

                        // Streaming subtitles - the key Tier 4 feature
                        if (data.stage === 'subtitles' && data.subtitles) {
                            console.log(`[VideoTranslate] Tier4: Received batch ${data.batchInfo?.current}/${data.batchInfo?.total} (${data.subtitles.length} subs)`);

                            // Accumulate subtitles
                            allSubtitles.push(...data.subtitles);

                            // Send streaming subtitles to content script
                            if (tabId) {
                                chrome.tabs.sendMessage(tabId, {
                                    action: 'streaming-subtitles',
                                    subtitles: data.subtitles,
                                    batchIndex: data.batchInfo?.current || 1,
                                    totalBatches: data.batchInfo?.total || 1,
                                    isComplete: false
                                }).catch(() => { });
                            }

                            if (onSubtitles) {
                                onSubtitles(data.subtitles, data.batchInfo);
                            }
                        }

                        // Progress update (non-subtitle stages)
                        if (data.stage && data.message && data.stage !== 'subtitles') {
                            console.log(`[VideoTranslate] Tier4 Progress: ${data.stage} - ${data.message} (${data.percent || 0}%)`);

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
                            // Notify content script that streaming is complete
                            if (tabId) {
                                chrome.tabs.sendMessage(tabId, {
                                    action: 'streaming-complete',
                                    subtitles: data.result.subtitles
                                }).catch(() => { });
                            }
                            resolve(data.result.subtitles);
                            return;
                        }

                        // Error
                        if (data.error) {
                            reject(new Error(data.error));
                            return;
                        }
                    } catch (e) {
                        console.warn('[VideoTranslate] Tier4 SSE JSON parse error:', e, 'Data:', event.data);
                    }
                }
            }

            // If we got subtitles but no final result, return what we have
            if (allSubtitles.length > 0) {
                console.log(`[VideoTranslate] Tier4: Stream ended with ${allSubtitles.length} subtitles (no final result event)`);
                resolve(allSubtitles);
                return;
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
        case 'ping':
            // Simple ping to wake up service worker
            return { pong: true };

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

        case 'stream-process':
            if (config.tier !== 'tier4') {
                throw new Error('Tier 4 required for streaming');
            }
            return await handleTier4Stream(message, sender, config);

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

        // Queue management actions
        case 'getQueue':
            return { queue: await getQueue() };

        case 'addToQueue':
            return await addToQueue(message.videoId, message.title, message.targetLanguage);

        case 'removeFromQueue':
            return await removeFromQueue(message.itemId);

        case 'clearCompletedQueue':
            return await clearCompletedQueue();

        case 'getQueueStatus':
            const queue = await getQueue();
            return {
                total: queue.length,
                pending: queue.filter(i => i.status === 'pending').length,
                processing: queue.filter(i => i.status === 'processing').length,
                completed: queue.filter(i => i.status === 'completed').length,
                failed: queue.filter(i => i.status === 'failed').length,
                isProcessing: isProcessingQueue
            };

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

/**
 * Handle Tier 4 streaming processing
 * Progressive streaming: subtitles streamed as batches complete
 */
async function handleTier4Stream(message, sender, config) {
    const { videoId, targetLanguage } = message;
    const tabId = sender?.tab?.id;

    // Check cache first - if cached, no streaming needed
    const cached = await getCachedTranslation(videoId, 'auto', targetLanguage);
    if (cached) {
        // For cached results, send all subtitles at once as "streaming-complete"
        if (tabId) {
            chrome.tabs.sendMessage(tabId, {
                action: 'streaming-complete',
                subtitles: cached,
                cached: true
            }).catch(() => { });
        }
        return { translations: cached, cached: true };
    }

    // Streaming backend call - subtitles arrive progressively
    const translations = await processVideoTier4(videoId, targetLanguage, config, null, null, tabId);

    // Cache the complete result
    await cacheTranslation(videoId, 'auto', targetLanguage, translations);
    return { translations, cached: false, streamed: true };
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

// ============================================================================
// Video Queue Management
// ============================================================================

const QUEUE_STORAGE_KEY = 'videoQueue';

/**
 * Queue item structure:
 * {
 *   id: string,
 *   videoId: string,
 *   title: string,
 *   targetLanguage: string,
 *   status: 'pending' | 'processing' | 'completed' | 'failed',
 *   addedAt: number,
 *   completedAt?: number,
 *   error?: string
 * }
 */

let isProcessingQueue = false;

/**
 * Get all queue items
 */
async function getQueue() {
    return new Promise((resolve) => {
        chrome.storage.local.get([QUEUE_STORAGE_KEY], (result) => {
            resolve(result[QUEUE_STORAGE_KEY] || []);
        });
    });
}

/**
 * Save queue to storage
 */
async function saveQueue(queue) {
    return new Promise((resolve) => {
        chrome.storage.local.set({ [QUEUE_STORAGE_KEY]: queue }, resolve);
    });
}

/**
 * Add video to queue
 */
async function addToQueue(videoId, title, targetLanguage) {
    const queue = await getQueue();

    // Check if already in queue
    const existing = queue.find(item => item.videoId === videoId && item.targetLanguage === targetLanguage);
    if (existing) {
        return { success: false, error: 'Video already in queue' };
    }

    const newItem = {
        id: `${videoId}_${Date.now()}`,
        videoId,
        title: title || videoId,
        targetLanguage,
        status: 'pending',
        addedAt: Date.now(),
    };

    queue.push(newItem);
    await saveQueue(queue);

    // Start processing if not already
    if (!isProcessingQueue) {
        processQueue();
    }

    return { success: true, item: newItem };
}

/**
 * Remove video from queue
 */
async function removeFromQueue(itemId) {
    const queue = await getQueue();
    const index = queue.findIndex(item => item.id === itemId);

    if (index === -1) {
        return { success: false, error: 'Item not found' };
    }

    queue.splice(index, 1);
    await saveQueue(queue);
    return { success: true };
}

/**
 * Clear completed/failed items from queue
 */
async function clearCompletedQueue() {
    const queue = await getQueue();
    const filtered = queue.filter(item => item.status === 'pending' || item.status === 'processing');
    await saveQueue(filtered);
    return { success: true, remaining: filtered.length };
}

/**
 * Process queue items sequentially
 */
async function processQueue() {
    if (isProcessingQueue) return;
    isProcessingQueue = true;

    console.log('[VideoTranslate] Starting queue processing');

    const config = await getConfig();

    while (true) {
        const queue = await getQueue();
        const pending = queue.find(item => item.status === 'pending');

        if (!pending) {
            console.log('[VideoTranslate] Queue empty, stopping processor');
            break;
        }

        // Update status to processing
        pending.status = 'processing';
        await saveQueue(queue);

        console.log(`[VideoTranslate] Processing queue item: ${pending.videoId}`);

        try {
            // Check cache first
            const cached = await getCachedTranslation(pending.videoId, 'auto', pending.targetLanguage);

            if (cached) {
                pending.status = 'completed';
                pending.completedAt = Date.now();
                pending.cached = true;
            } else if (config.tier === 'tier3') {
                // Use Tier 3 processing
                const translations = await processVideoTier3(
                    pending.videoId,
                    pending.targetLanguage,
                    config,
                    null,
                    null // No tab ID for background queue processing
                );

                await cacheTranslation(pending.videoId, 'auto', pending.targetLanguage, translations);
                pending.status = 'completed';
                pending.completedAt = Date.now();
            } else {
                // Tier 1/2: Need subtitles first, then translate
                const subtitleData = await fetchSubtitlesFromBackend(pending.videoId, config);

                // Parse subtitles (simplified - actual parsing in content script)
                const subtitles = subtitleData.segments || subtitleData.events?.map(e => ({
                    start: e.tStartMs,
                    end: e.tStartMs + (e.dDurationMs || 3000),
                    text: e.segs?.map(s => s.utf8 || '').join('').trim()
                })).filter(s => s.text) || [];

                if (subtitles.length === 0) {
                    throw new Error('No subtitles found');
                }

                const translations = await translateDirectLLM(
                    subtitles,
                    'auto',
                    pending.targetLanguage,
                    config,
                    null
                );

                await cacheTranslation(pending.videoId, 'auto', pending.targetLanguage, translations);
                pending.status = 'completed';
                pending.completedAt = Date.now();
            }
        } catch (error) {
            console.error(`[VideoTranslate] Queue item failed: ${pending.videoId}`, error);
            pending.status = 'failed';
            pending.error = error.message;
            pending.completedAt = Date.now();
        }

        await saveQueue(queue);

        // Small delay between items
        await new Promise(r => setTimeout(r, 1000));
    }

    isProcessingQueue = false;
}

// Add queue actions to message handler - need to update the switch statement
// This will be handled by adding cases in handleMessage

console.log('[VideoTranslate] Service worker initialized');
