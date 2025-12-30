/**
 * Popup Script
 * Handles configuration UI and settings management
 */

// DOM Elements
const elements = {
    apiUrl: document.getElementById('apiUrl'),
    apiKey: document.getElementById('apiKey'),
    model: document.getElementById('model'),
    defaultLanguage: document.getElementById('defaultLanguage'),
    toggleApiKey: document.getElementById('toggleApiKey'),
    saveConfig: document.getElementById('saveConfig'),
    clearCache: document.getElementById('clearCache'),
    cacheCount: document.getElementById('cacheCount'),
    statusBadge: document.getElementById('statusBadge'),
};

/**
 * Initialize popup
 */
async function init() {
    console.log('[VideoTranslate] Popup initialized');

    // Load current configuration
    await loadConfig();

    // Load cache stats
    await loadCacheStats();

    // Setup event listeners
    setupEventListeners();
}

/**
 * Load configuration from storage
 */
async function loadConfig() {
    try {
        const config = await sendMessage({ action: 'getConfig' });

        elements.apiUrl.value = config.apiUrl || '';
        elements.apiKey.value = config.apiKey || '';
        elements.model.value = config.model || '';
        elements.defaultLanguage.value = config.defaultLanguage || 'en';

        // Update status badge
        updateStatusBadge(config.apiUrl && config.apiKey && config.model);
    } catch (error) {
        console.error('[VideoTranslate] Failed to load config:', error);
    }
}

/**
 * Load cache statistics
 */
async function loadCacheStats() {
    try {
        const stats = await sendMessage({ action: 'getCacheStats' });
        elements.cacheCount.textContent = `${stats.entries} translation${stats.entries !== 1 ? 's' : ''} cached`;
    } catch (error) {
        console.error('[VideoTranslate] Failed to load cache stats:', error);
        elements.cacheCount.textContent = '0 translations cached';
    }
}

/**
 * Update status badge
 */
function updateStatusBadge(isConfigured) {
    const statusText = elements.statusBadge.querySelector('.status-text');

    if (isConfigured) {
        elements.statusBadge.classList.add('configured');
        statusText.textContent = 'Configured';
    } else {
        elements.statusBadge.classList.remove('configured');
        statusText.textContent = 'Not Configured';
    }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Toggle API key visibility
    elements.toggleApiKey.addEventListener('click', () => {
        const input = elements.apiKey;
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';

        // Toggle icons
        const iconEye = elements.toggleApiKey.querySelector('.icon-eye');
        const iconEyeOff = elements.toggleApiKey.querySelector('.icon-eye-off');
        iconEye.style.display = isPassword ? 'none' : 'block';
        iconEyeOff.style.display = isPassword ? 'block' : 'none';
    });

    // Save configuration
    elements.saveConfig.addEventListener('click', saveConfiguration);

    // Clear cache
    elements.clearCache.addEventListener('click', clearCache);

    // Auto-save on Enter key
    [elements.apiUrl, elements.apiKey, elements.model].forEach(input => {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                saveConfiguration();
            }
        });
    });
}

/**
 * Save configuration
 */
async function saveConfiguration() {
    const btnText = elements.saveConfig.querySelector('.btn-text');
    const btnSaving = elements.saveConfig.querySelector('.btn-saving');
    const btnSaved = elements.saveConfig.querySelector('.btn-saved');

    // Show saving state
    btnText.style.display = 'none';
    btnSaving.style.display = 'inline';
    elements.saveConfig.disabled = true;

    try {
        const config = {
            apiUrl: elements.apiUrl.value.trim(),
            apiKey: elements.apiKey.value.trim(),
            model: elements.model.value.trim(),
            defaultLanguage: elements.defaultLanguage.value,
        };

        await sendMessage({ action: 'saveConfig', config });

        // Show saved state
        btnSaving.style.display = 'none';
        btnSaved.style.display = 'inline';

        // Update status badge
        updateStatusBadge(config.apiUrl && config.apiKey && config.model);

        // Reset button after delay
        setTimeout(() => {
            btnSaved.style.display = 'none';
            btnText.style.display = 'inline';
            elements.saveConfig.disabled = false;
        }, 2000);

    } catch (error) {
        console.error('[VideoTranslate] Failed to save config:', error);
        btnSaving.style.display = 'none';
        btnText.textContent = 'Error saving!';
        btnText.style.display = 'inline';
        elements.saveConfig.disabled = false;

        setTimeout(() => {
            btnText.textContent = 'Save Configuration';
        }, 2000);
    }
}

/**
 * Clear translation cache
 */
async function clearCache() {
    try {
        elements.clearCache.textContent = 'Clearing...';
        elements.clearCache.disabled = true;

        await sendMessage({ action: 'clearCache' });

        elements.cacheCount.textContent = '0 translations cached';
        elements.clearCache.textContent = 'Cleared!';

        setTimeout(() => {
            elements.clearCache.textContent = 'Clear Cache';
            elements.clearCache.disabled = false;
        }, 2000);

    } catch (error) {
        console.error('[VideoTranslate] Failed to clear cache:', error);
        elements.clearCache.textContent = 'Error!';

        setTimeout(() => {
            elements.clearCache.textContent = 'Clear Cache';
            elements.clearCache.disabled = false;
        }, 2000);
    }
}

/**
 * Send message to background script
 */
function sendMessage(message) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                resolve(response);
            }
        });
    });
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
