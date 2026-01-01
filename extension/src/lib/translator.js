/**
 * LLM Translation service
 * Supports any OpenAI-compatible API
 */

import { getConfig } from './storage.js';

const BATCH_SIZE = 50; // Number of subtitles to translate at once

/**
 * Language names for prompts
 */
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

/**
 * Get language name from code
 */
export function getLanguageName(code) {
    return LANGUAGE_NAMES[code] || code;
}

/**
 * Get all supported languages
 */
export function getSupportedLanguages() {
    return Object.entries(LANGUAGE_NAMES).map(([code, name]) => ({
        code,
        name,
    }));
}

/**
 * Build translation prompt
 */
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

/**
 * Parse translation response
 */
function parseTranslationResponse(response, expectedCount) {
    const lines = response.trim().split('\n');
    const translations = [];

    for (const line of lines) {
        // Remove numbering (e.g., "1. ", "1) ", etc.)
        const cleaned = line.replace(/^\d+[\.\)\:\-]\s*/, '').trim();
        if (cleaned) {
            translations.push(cleaned);
        }
    }

    // If we got fewer translations than expected, pad with empty strings
    while (translations.length < expectedCount) {
        translations.push('');
    }

    // If we got more, truncate
    return translations.slice(0, expectedCount);
}

/**
 * Call LLM API for translation
 */
async function callLLMAPI(prompt, config) {
    const url = `${config.apiUrl.replace(/\/$/, '')}/chat/completions`;

    const headers = {
        'Content-Type': 'application/json',
    };

    if (config.apiKey && config.apiKey.trim() !== '') {
        headers['Authorization'] = `Bearer ${config.apiKey}`;
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
            model: config.model,
            messages: [
                {
                    role: 'system',
                    content: 'You are a professional subtitle translator.',
                },
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
        throw new Error(chrome.i18n.getMessage('llmApiError', [response.status.toString(), error]));
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

/**
 * Translate a batch of subtitles
 */
/**
 * Request Queue for batching translation requests
 */
class RequestQueue {
    constructor(batchSize = 2, processDelay = 200) {
        this.queue = [];
        this.batchSize = batchSize;
        this.processDelay = processDelay;
        this.timer = null;
        this.isProcessing = false;
        this.config = null;
    }

    /**
     * Add item to queue
     */
    add(item, config) {
        return new Promise((resolve, reject) => {
            if (this.config && JSON.stringify(this.config) !== JSON.stringify(config)) {
                // Config changed? maybe flush first? simplified for now assume consistent config per session
                // or just update config to latest
            }
            this.config = config;

            this.queue.push({
                item,
                resolve,
                reject,
                sourceLang: item.sourceLang,
                targetLang: item.targetLang
            });

            this.checkQueue();
        });
    }

    /**
     * Check if queue needs processing
     */
    checkQueue() {
        if (this.queue.length >= this.batchSize) {
            this.processQueue();
        } else if (!this.timer) {
            this.timer = setTimeout(() => this.processQueue(), this.processDelay);
        }
    }

    /**
     * Process the queued items
     */
    async processQueue() {
        if (this.isProcessing || this.queue.length === 0) return;

        // Clear timer if it's running
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }

        this.isProcessing = true;

        // Take a batch
        const batch = this.queue.splice(0, this.batchSize);
        if (batch.length === 0) {
            this.isProcessing = false;
            return;
        }

        try {
            // Group by language pair to be safe, though usually all one video
            // For simplicity assume one language pair for now as we context switch per video
            // The item passed in .add() is now { subtitles, sourceLang, targetLang }

            const promises = batch.map(async (task) => {
                try {
                    // task.item contains the payload
                    const { subtitles, sourceLang, targetLang } = task.item;
                    const result = await translateBatchInternal(subtitles, sourceLang, targetLang, this.config);
                    task.resolve(result);
                } catch (e) {
                    task.reject(e);
                }
            });

            await Promise.all(promises);

        } catch (error) {
            console.error('Queue processing error:', error);
            batch.forEach(task => task.reject(error));
        } finally {
            this.isProcessing = false;
            // Check if more items came in
            if (this.queue.length > 0) {
                this.checkQueue();
            }
        }
    }
}

// Global queue instance
const requestQueue = new RequestQueue(3, 100); // Process 3 batches in parallel

/**
 * Internal translation function
 */
async function translateBatchInternal(subtitles, sourceLanguage, targetLanguage, config) {
    const prompt = buildPrompt(subtitles, sourceLanguage, targetLanguage);
    const response = await callLLMAPI(prompt, config);
    return parseTranslationResponse(response, subtitles.length);
}

/**
 * Test LLM API connection
 */
export async function testConnection(config) {
    // Simple prompt to test connection
    try {
        await callLLMAPI("Hello", config);
        return true;
    } catch (e) {
        throw e;
    }
}

/**
 * Encapsulate queue usage
 */
async function translateBatch(subtitles, sourceLanguage, targetLanguage, config) {
    // We add the entire batch as one item to the queue with metadata
    return requestQueue.add({
        subtitles,
        sourceLang: sourceLanguage,
        targetLang: targetLanguage
    }, config);
}

/**
 * Translate all subtitles with progress callback
 */
export async function translateSubtitles(subtitles, sourceLanguage, targetLanguage, onProgress) {
    const config = await getConfig();
    if (!config.apiUrl) {
        throw new Error(chrome.i18n.getMessage('apiUrlNotConfigured'));
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

            // Combine original timing with translated text
            for (let j = 0; j < batch.length; j++) {
                results.push({
                    ...batch[j],
                    translatedText: translations[j] || batch[j].text,
                });
            }

            // Report progress
            if (onProgress) {
                onProgress({
                    current: Math.min(i + BATCH_SIZE, subtitles.length),
                    total: subtitles.length,
                    percentage: Math.round(((i + BATCH_SIZE) / subtitles.length) * 100),
                });
            }
        } catch (error) {
            console.error(`[VideoTranslate] Batch ${batchNumber} failed:`, error);

            // On error, keep original text
            for (const sub of batch) {
                results.push({
                    ...sub,
                    translatedText: sub.text,
                    error: true,
                });
            }
        }

        // Small delay between batches to avoid rate limiting
        if (i + BATCH_SIZE < subtitles.length) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    console.log(`[VideoTranslate] Translation complete: ${results.length} subtitles`);
    return results;
}

export { LANGUAGE_NAMES };
