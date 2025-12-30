/**
 * LLM Translation service
 * Supports any OpenAI-compatible API
 */

import { getConfig } from './storage.js';

const BATCH_SIZE = 20; // Number of subtitles to translate at once

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
            temperature: 0.3, // Lower temperature for more consistent translations
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

/**
 * Translate a batch of subtitles
 */
async function translateBatch(subtitles, sourceLanguage, targetLanguage, config) {
    const prompt = buildPrompt(subtitles, sourceLanguage, targetLanguage);
    const response = await callLLMAPI(prompt, config);
    return parseTranslationResponse(response, subtitles.length);
}

/**
 * Translate all subtitles with progress callback
 */
export async function translateSubtitles(subtitles, sourceLanguage, targetLanguage, onProgress) {
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
