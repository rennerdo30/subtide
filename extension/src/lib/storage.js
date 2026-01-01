/**
 * Storage utilities for Chrome extension
 */

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

/**
 * Get configuration from storage
 */
export async function getConfig() {
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

/**
 * Save configuration to storage
 */
export async function saveConfig(config) {
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

/**
 * Check if API is configured
 */
export async function isConfigured() {
  const config = await getConfig();
  return !!(config.apiUrl && config.apiKey && config.model);
}

export { STORAGE_KEYS, DEFAULT_CONFIG };
