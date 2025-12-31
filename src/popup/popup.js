/**
 * Video Translate - Popup Script
 * Handles configuration UI and settings management
 */

const elements = {
    apiUrl: document.getElementById('apiUrl'),
    apiKey: document.getElementById('apiKey'),
    provider: document.getElementById('provider'),
    model: document.getElementById('model'),
    forceGen: document.getElementById('forceGen'),
    defaultLanguage: document.getElementById('defaultLanguage'),
    toggleApiKey: document.getElementById('toggleApiKey'),
    saveConfig: document.getElementById('saveConfig'),
    clearCache: document.getElementById('clearCache'),
    cacheCount: document.getElementById('cacheCount'),
    backendStatusBadge: document.getElementById('backendStatusBadge'),
    backendWarning: document.getElementById('backendWarning'),
    checkBackend: document.getElementById('checkBackend'),
    tier: document.getElementById('tier'),
    tierHint: document.getElementById('tierHint'),
    apiConfigSection: document.getElementById('apiConfigSection'),
    forceGenGroup: document.getElementById('forceGenGroup'),
    apiUrlGroup: document.getElementById('apiUrlGroup'),
    backendUrl: document.getElementById('backendUrl'),
};

// Tier descriptions
const TIER_HINTS = {
    tier1: 'Uses YouTube\'s auto-generated captions. Requires your own API key for translation.',
    tier2: 'Uses Whisper AI for transcription. Requires your own API key.',
    tier3: 'Fully managed service. No API key needed — we handle everything!',
};

/**
 * Initialize popup
 */
async function init() {
    console.log('[VideoTranslate] Popup initialized');

    // Load configuration
    await loadConfig();

    // Check backend status
    await checkBackendStatus();

    // Load cache stats
    await loadCacheStats();

    // Setup event listeners
    setupEventListeners();
}

/**
 * Check Backend Status
 */
async function checkBackendStatus() {
    const statusText = elements.backendStatusBadge.querySelector('.status-text');
    const statusDot = elements.backendStatusBadge.querySelector('.status-dot');

    statusText.textContent = 'Checking...';
    statusDot.style.background = 'var(--text-muted)';
    statusDot.style.boxShadow = 'none';
    elements.backendWarning.style.display = 'none';

    const backendUrl = elements.backendUrl?.value?.trim() || 'http://localhost:5001';

    try {
        const response = await fetch(`${backendUrl}/health`, {
            method: 'GET',
            signal: AbortSignal.timeout(5000)
        });

        if (response.ok) {
            const data = await response.json();
            if (data.status === 'ok') {
                statusText.textContent = 'Connected';
                statusDot.style.background = 'var(--success)';
                statusDot.style.boxShadow = '0 0 8px var(--success)';
                elements.backendWarning.style.display = 'none';
                return;
            }
        }
        throw new Error('Invalid response');
    } catch (e) {
        statusText.textContent = 'Offline';
        statusDot.style.background = 'var(--error)';
        statusDot.style.boxShadow = '0 0 8px var(--error)';
        elements.backendWarning.style.display = 'flex';
    }
}

/**
 * Load configuration from storage
 */
async function loadConfig() {
    try {
        const config = await sendMessage({ action: 'getConfig' });

        elements.apiUrl.value = config.apiUrl || '';
        elements.apiKey.value = config.apiKey || '';
        elements.provider.value = config.provider || 'openai';
        elements.model.value = config.model || '';
        elements.forceGen.checked = config.forceGen || false;
        elements.defaultLanguage.value = config.defaultLanguage || 'en';
        elements.tier.value = config.tier || 'tier1';
        elements.backendUrl.value = config.backendUrl || 'http://localhost:5001';

        // Apply tier-based UI
        updateUIForTier(config.tier || 'tier1');
        updateProviderUI(config.provider || 'openai');

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
        elements.cacheCount.textContent = '0 cached';
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

        const iconEye = elements.toggleApiKey.querySelector('.icon-eye');
        const iconEyeOff = elements.toggleApiKey.querySelector('.icon-eye-off');
        iconEye.style.display = isPassword ? 'none' : 'block';
        iconEyeOff.style.display = isPassword ? 'block' : 'none';
    });

    // Check backend
    elements.checkBackend.addEventListener('click', checkBackendStatus);

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

    // Provider change
    elements.provider.addEventListener('change', (e) => {
        updateProviderUI(e.target.value);
    });

    // Tier change
    elements.tier.addEventListener('change', (e) => {
        updateUIForTier(e.target.value);
    });
}

/**
 * Update UI based on provider selection
 */
function updateProviderUI(provider) {
    if (provider === 'openai') {
        elements.apiUrl.value = 'https://api.openai.com/v1';
        elements.apiUrlGroup.style.display = 'none';
    } else if (provider === 'openrouter') {
        elements.apiUrl.value = 'https://openrouter.ai/api/v1';
        elements.apiUrlGroup.style.display = 'none';
        if (!elements.model.value || !elements.model.value.includes('/')) {
            elements.model.value = 'openai/gpt-4o-mini';
        }
    } else {
        elements.apiUrlGroup.style.display = 'block';
        elements.apiUrl.value = '';
    }
}

/**
 * Update UI based on tier selection
 */
function updateUIForTier(tier) {
    // Update hint
    elements.tierHint.textContent = TIER_HINTS[tier] || '';

    if (tier === 'tier3') {
        // Pro tier: Hide API config, it's managed
        elements.apiConfigSection.classList.add('disabled-section');
        elements.apiKey.disabled = true;
        elements.apiUrl.disabled = true;
        elements.model.disabled = true;
        elements.provider.disabled = true;
        elements.forceGen.disabled = false;
    } else {
        elements.apiConfigSection.classList.remove('disabled-section');
        elements.apiKey.disabled = false;
        elements.apiUrl.disabled = false;
        elements.model.disabled = false;
        elements.provider.disabled = false;

        if (tier === 'tier1') {
            // Free tier: No force gen
            elements.forceGen.checked = false;
            elements.forceGen.disabled = true;
            elements.forceGenGroup.style.opacity = '0.5';
            elements.forceGenGroup.title = 'Requires Tier 2 or higher';
        } else {
            // Basic tier
            elements.forceGen.disabled = false;
            elements.forceGenGroup.style.opacity = '1';
            elements.forceGenGroup.title = '';
        }
    }
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
            provider: elements.provider.value,
            model: elements.model.value.trim(),
            forceGen: elements.forceGen.checked,
            defaultLanguage: elements.defaultLanguage.value,
            tier: elements.tier.value,
            backendUrl: elements.backendUrl.value.trim() || 'http://localhost:5001',
        };

        await sendMessage({ action: 'saveConfig', config });

        // Show saved state
        btnSaving.style.display = 'none';
        btnSaved.style.display = 'inline';

        // Reset after delay
        setTimeout(() => {
            btnSaved.style.display = 'none';
            btnText.style.display = 'inline';
            elements.saveConfig.disabled = false;
        }, 2000);

    } catch (error) {
        console.error('[VideoTranslate] Failed to save config:', error);
        btnSaving.style.display = 'none';
        btnText.textContent = 'Error!';
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
    const btnText = elements.clearCache.querySelector('.btn-text');
    try {
        btnText.textContent = '...';
        elements.clearCache.disabled = true;

        await sendMessage({ action: 'clearCache' });

        elements.cacheCount.textContent = '0 cached';
        btnText.textContent = 'Done';

        setTimeout(() => {
            btnText.textContent = 'Clear';
            elements.clearCache.disabled = false;
        }, 1500);

    } catch (error) {
        console.error('[VideoTranslate] Failed to clear cache:', error);
        btnText.textContent = 'Error';

        setTimeout(() => {
            btnText.textContent = 'Clear';
            elements.clearCache.disabled = false;
        }, 1500);
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
