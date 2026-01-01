/**
 * Video Translate - Popup Script
 * Handles configuration UI and settings management
 * Internationalization enabled
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
    liveTranslateBtn: document.getElementById('liveTranslateBtn'),
};

let isLiveTranslating = false;

// Tier descriptions
// Tier descriptions keys (mapped to messages.json)
const TIER_HINTS_KEYS = {
    tier1: 'tierHint1',
    tier2: 'tierHint2',
    tier3: 'tierHint3',
};

/**
 * Initialize popup
 */
async function init() {
    console.log('[VideoTranslate] Popup initialized');

    // Localize page
    localizePage();

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
 * Localize all elements with data-i18n attribute
 */
function localizePage() {
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        const message = chrome.i18n.getMessage(key);
        if (message) {
            // Special handling for elements that need HTML (like the backend instruction)
            if (key === 'backendInstructionHelp') {
                element.innerHTML = message;
                return;
            }
            element.textContent = message;
        }
    });
}

/**
 * Check Backend Status
 */
async function checkBackendStatus() {
    const statusText = elements.backendStatusBadge.querySelector('.status-text');
    const statusDot = elements.backendStatusBadge.querySelector('.status-dot');

    statusText.textContent = chrome.i18n.getMessage('statusChecking');
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
                statusText.textContent = chrome.i18n.getMessage('statusConnected');
                statusDot.style.background = 'var(--success)';
                statusDot.style.boxShadow = '0 0 8px var(--success)';
                elements.backendWarning.style.display = 'none';
                return;
            }
        }
        throw new Error('Invalid response');
    } catch (e) {
        statusText.textContent = chrome.i18n.getMessage('statusOffline');
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
        const count = stats.entries || 0;
        let msg = '';
        if (count === 0) msg = chrome.i18n.getMessage('cacheCountZero');
        else if (count === 1) msg = chrome.i18n.getMessage('cacheCountOne');
        else msg = chrome.i18n.getMessage('cacheCountSome', [count.toString()]);
        elements.cacheCount.textContent = msg;
    } catch (error) {
        console.error('[VideoTranslate] Failed to load cache stats:', error);
        elements.cacheCount.textContent = chrome.i18n.getMessage('cacheCountZero');
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

    // Live Translate Button
    elements.liveTranslateBtn.addEventListener('click', async () => {
        try {
            updateLiveButtonState('loading');
            
            if (!isLiveTranslating) {
                // Start
                // We need to send the message to the background script, 
                // but we also need to make sure the background script can find the active tab.
                // The service worker update I did handles finding the active tab if sender.tab is undefined.
                const response = await sendMessage({
                    action: 'startLiveTranslate',
                    targetLanguage: elements.defaultLanguage.value
                });
                
                if (!response.success) throw new Error(response.error);
                isLiveTranslating = true;
                updateLiveButtonState('active');
            } else {
                // Stop
                const response = await sendMessage({ action: 'stopLiveTranslate' });
                if (!response.success) throw new Error(response.error);
                isLiveTranslating = false;
                updateLiveButtonState('inactive');
            }
        } catch (error) {
            console.error('[VideoTranslate] Live toggle failed:', error);
            isLiveTranslating = false;
            updateLiveButtonState('inactive');
            
            // Show user friendly error
            let errorMsg = error.message;
            if (errorMsg.includes('Extension has not been invoked')) {
                errorMsg = "Please reload the YouTube page and try again.";
            } else if (errorMsg.includes('No active tab')) {
                errorMsg = "No active YouTube tab found. Please open a video.";
            }
            alert('Failed to toggle live translation:\n' + errorMsg);
        }
    });

    // Check initial live status
    checkLiveStatus();
}

async function checkLiveStatus() {
    try {
        const response = await sendMessage({ action: 'getLiveStatus' });
        isLiveTranslating = response.isLive;
        updateLiveButtonState(isLiveTranslating ? 'active' : 'inactive');
    } catch (e) {
        console.log("Could not check live status", e);
    }
}

function updateLiveButtonState(state) {
    const btn = elements.liveTranslateBtn;
    const icon = btn.querySelector('.btn-icon');
    const text = btn.querySelector('.btn-text');

    if (state === 'loading') {
        btn.disabled = true;
        text.textContent = '...';
    } else if (state === 'active') {
        btn.disabled = false;
        btn.classList.add('btn-danger'); // Add a red style class if you have one, or inline style
        btn.style.backgroundColor = '#ef4444';
        btn.style.color = 'white';
        icon.textContent = '⏹️';
        text.textContent = 'Stop Live Translate';
    } else {
        btn.disabled = false;
        btn.classList.remove('btn-danger');
        btn.style.backgroundColor = '';
        btn.style.color = '';
        icon.textContent = '🎙️';
        text.textContent = chrome.i18n.getMessage('startLiveTranslate');
    }
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
    const hintKey = TIER_HINTS_KEYS[tier];
    if (hintKey) {
        elements.tierHint.textContent = chrome.i18n.getMessage(hintKey);
    }

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
            elements.forceGenGroup.title = chrome.i18n.getMessage('reqTier2');
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
        btnText.textContent = chrome.i18n.getMessage('saveError');
        btnText.style.display = 'inline';
        elements.saveConfig.disabled = false;

        setTimeout(() => {
            btnText.textContent = chrome.i18n.getMessage('saveConfig');
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

        const zeroMsg = chrome.i18n.getMessage('cacheCountZero');
        elements.cacheCount.textContent = zeroMsg;
        btnText.textContent = chrome.i18n.getMessage('clearDone');

        setTimeout(() => {
            btnText.textContent = chrome.i18n.getMessage('clear');
            elements.clearCache.disabled = false;
        }, 1500);

    } catch (error) {
        console.error('[VideoTranslate] Failed to clear cache:', error);
        btnText.textContent = chrome.i18n.getMessage('clearError');

        setTimeout(() => {
            btnText.textContent = chrome.i18n.getMessage('clear');
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
