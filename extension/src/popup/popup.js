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
    ttsEnabled: document.getElementById('ttsEnabled'),
    ttsSource: document.getElementById('ttsSource'),
    ttsRate: document.getElementById('ttsRate'),
    ttsRateValue: document.getElementById('ttsRateValue'),
    ttsVolume: document.getElementById('ttsVolume'),
    ttsVolumeValue: document.getElementById('ttsVolumeValue'),
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
    backendApiKey: document.getElementById('backendApiKey'),
    toggleBackendApiKey: document.getElementById('toggleBackendApiKey'),
    liveTranslateBtn: document.getElementById('liveTranslateBtn'),
    // Queue elements
    queuePending: document.getElementById('queuePending'),
    queueProcessing: document.getElementById('queueProcessing'),
    queueCompleted: document.getElementById('queueCompleted'),
    queueList: document.getElementById('queueList'),
    clearQueueBtn: document.getElementById('clearQueueBtn'),
};

let isLiveTranslating = false;

// Tier descriptions
// Tier descriptions keys (mapped to messages.json)
const TIER_HINTS_KEYS = {
    tier1: 'tierHint1',
    tier2: 'tierHint2',
    tier3: 'tierHint3',
    tier4: 'tierHint4',
};

/**
 * Wake up the service worker and wait for it to respond
 * Chrome MV3 service workers can be inactive and need time to start
 * Uses singleton pattern to prevent race conditions from concurrent calls
 */
let wakeUpPromise = null;
async function wakeUpServiceWorker(maxRetries = 3) {
    // Singleton pattern: if already waking up, return existing promise
    if (wakeUpPromise) return wakeUpPromise;

    wakeUpPromise = (async () => {
        for (let i = 0; i < maxRetries; i++) {
            try {
                const response = await sendMessage({ action: 'ping' }, 3000);
                if (response?.pong) {
                    console.log('[Subtide] Service worker is ready');
                    return true;
                }
            } catch (e) {
                console.log(`[Subtide] Wake-up attempt ${i + 1}/${maxRetries} failed:`, e.message);
                // Wait a bit before retrying
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        console.warn('[Subtide] Service worker may not be fully ready');
        return false;
    })();

    try {
        return await wakeUpPromise;
    } finally {
        wakeUpPromise = null;
    }
}

/**
 * Initialize popup
 */
async function init() {
    console.log('[Subtide] Popup initializing...');

    // Localize page first (no async, instant)
    localizePage();

    // Wake up the service worker BEFORE any other operations
    await wakeUpServiceWorker();

    console.log('[Subtide] Popup initialized');

    // Load configuration
    await loadConfig();

    // Check backend status
    await checkBackendStatus();

    // Load cache stats
    await loadCacheStats();

    // Load queue
    await loadQueue();

    // Setup event listeners
    setupEventListeners();

    // Refresh queue periodically
    setInterval(loadQueue, 3000);
}

/**
 * Localize all elements with data-i18n attribute
 */
function localizePage() {
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        const message = chrome.i18n.getMessage(key);
        if (message) {
            // Use textContent for all i18n to prevent XSS
            // HTML structure should be in the DOM, not in locale files
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

    let backendUrl = elements.backendUrl?.value?.trim() || 'http://localhost:5001';
    // Remove trailing slash for consistency
    backendUrl = backendUrl.replace(/\/+$/, '');

    // Validate URL to prevent javascript: or other unsafe protocols
    try {
        const urlObj = new URL(backendUrl);
        if (!['http:', 'https:'].includes(urlObj.protocol)) {
            throw new Error('Invalid protocol');
        }
    } catch (urlError) {
        console.warn('[Subtide] Invalid backend URL:', backendUrl);
        statusText.textContent = chrome.i18n.getMessage('statusOffline');
        statusDot.style.background = 'var(--error)';
        statusDot.style.boxShadow = '0 0 8px var(--error)';
        elements.backendWarning.style.display = 'flex';
        return;
    }

    const apiKey = elements.backendApiKey?.value?.trim();

    try {
        const headers = {};
        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        console.log('[Subtide] Health check:', `${backendUrl}/health`);

        const response = await fetch(`${backendUrl}/health`, {
            method: 'GET',
            headers: headers,
            signal: AbortSignal.timeout(15000) // 15s timeout for cold starts
        });

        console.log('[Subtide] Health response:', response.status);

        if (response.ok) {
            const data = await response.json();
            console.log('[Subtide] Health data:', data);

            // Check for Flask response OR RunPod Serverless response
            // Flask: { "status": "ok" }
            // RunPod Serverless: { "jobs": {...}, "workers": {...} }
            if (data.status === 'ok' || data.workers !== undefined || data.jobs !== undefined) {
                statusText.textContent = chrome.i18n.getMessage('statusConnected');
                statusDot.style.background = 'var(--success)';
                statusDot.style.boxShadow = '0 0 8px var(--success)';
                elements.backendWarning.style.display = 'none';
                return;
            }
        }
        throw new Error(`HTTP ${response.status}`);
    } catch (e) {
        console.warn("[Subtide] Backend check failed:", e);

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
        elements.backendApiKey.value = config.backendApiKey || '';

        // Load TTS settings
        if (elements.ttsEnabled) elements.ttsEnabled.checked = config.ttsEnabled || false;
        if (elements.ttsSource) elements.ttsSource.value = config.ttsSource || 'auto';
        if (elements.ttsRate) {
            elements.ttsRate.value = config.ttsRate || 1;
            if (elements.ttsRateValue) elements.ttsRateValue.textContent = (config.ttsRate || 1).toFixed(1) + 'x';
        }
        if (elements.ttsVolume) {
            elements.ttsVolume.value = config.ttsVolume || 0.8;
            if (elements.ttsVolumeValue) elements.ttsVolumeValue.textContent = Math.round((config.ttsVolume || 0.8) * 100) + '%';
        }

        // Apply tier-based UI
        updateUIForTier(config.tier || 'tier1');
        updateProviderUI(config.provider || 'openai');

    } catch (error) {
        console.error('[Subtide] Failed to load config:', error);
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
        console.error('[Subtide] Failed to load cache stats:', error);
        elements.cacheCount.textContent = chrome.i18n.getMessage('cacheCountZero');
    }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Toggle API key visibility (LLM)
    elements.toggleApiKey.addEventListener('click', () => {
        const input = elements.apiKey;
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';

        const iconEye = elements.toggleApiKey.querySelector('.icon-eye');
        const iconEyeOff = elements.toggleApiKey.querySelector('.icon-eye-off');
        iconEye.style.display = isPassword ? 'none' : 'block';
        iconEyeOff.style.display = isPassword ? 'block' : 'none';
    });

    // Toggle API key visibility (Backend)
    elements.toggleBackendApiKey.addEventListener('click', () => {
        const input = elements.backendApiKey;
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';

        const iconEye = elements.toggleBackendApiKey.querySelector('.icon-eye');
        const iconEyeOff = elements.toggleBackendApiKey.querySelector('.icon-eye-off');
        iconEye.style.display = isPassword ? 'none' : 'block';
        iconEyeOff.style.display = isPassword ? 'block' : 'none';
    });

    // Check backend
    elements.checkBackend.addEventListener('click', checkBackendStatus);

    // Save configuration
    elements.saveConfig.addEventListener('click', saveConfiguration);

    // Clear cache
    elements.clearCache.addEventListener('click', clearCache);

    // Clear completed queue
    elements.clearQueueBtn.addEventListener('click', clearCompletedQueue);

    // Auto-save on Enter key
    [elements.apiUrl, elements.apiKey, elements.model, elements.backendUrl, elements.backendApiKey].forEach(input => {
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

    // TTS Rate slider
    if (elements.ttsRate) {
        elements.ttsRate.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            if (elements.ttsRateValue) {
                elements.ttsRateValue.textContent = value.toFixed(1) + 'x';
            }
        });
    }

    // TTS Volume slider
    if (elements.ttsVolume) {
        elements.ttsVolume.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            if (elements.ttsVolumeValue) {
                elements.ttsVolumeValue.textContent = Math.round(value * 100) + '%';
            }
        });
    }

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
            console.error('[Subtide] Live toggle failed:', error);
            isLiveTranslating = false;
            updateLiveButtonState('inactive');

            // Show user friendly error
            let errorMsg = error.message;
            if (errorMsg.includes('Extension has not been invoked')) {
                errorMsg = chrome.i18n.getMessage('errorReload');
            } else if (errorMsg.includes('No active tab')) {
                errorMsg = chrome.i18n.getMessage('errorNoActiveTab');
            }
            alert(chrome.i18n.getMessage('errorLiveTranslateFail', [errorMsg]));
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

/**
 * Load and render queue
 */
async function loadQueue() {
    try {
        const response = await sendMessage({ action: 'getQueue' });
        const queue = response.queue || [];

        // Update counts
        const pending = queue.filter(i => i.status === 'pending').length;
        const processing = queue.filter(i => i.status === 'processing').length;
        const completed = queue.filter(i => i.status === 'completed' || i.status === 'failed').length;

        elements.queuePending.textContent = `${pending} pending`;
        elements.queueProcessing.textContent = `${processing} processing`;
        elements.queueCompleted.textContent = `${completed} done`;

        // Render list using safe DOM APIs to prevent XSS
        elements.queueList.textContent = ''; // Clear existing content

        if (queue.length === 0) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'queue-empty';
            emptyDiv.textContent = 'No videos in queue';
            elements.queueList.appendChild(emptyDiv);
        } else {
            queue.forEach(item => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'queue-item';
                itemDiv.dataset.id = item.id;

                const statusDiv = document.createElement('div');
                // Validate status to prevent class injection
                const safeStatus = ['pending', 'processing', 'completed', 'failed'].includes(item.status)
                    ? item.status : 'pending';
                statusDiv.className = `queue-item-status ${safeStatus}`;

                const titleDiv = document.createElement('div');
                titleDiv.className = 'queue-item-title';
                titleDiv.title = item.title || '';
                titleDiv.textContent = item.title || '';

                const removeBtn = document.createElement('button');
                removeBtn.className = 'queue-item-remove';
                removeBtn.dataset.id = item.id;
                removeBtn.title = 'Remove';
                removeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>';

                removeBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await sendMessage({ action: 'removeFromQueue', itemId: item.id });
                    loadQueue();
                });

                itemDiv.appendChild(statusDiv);
                itemDiv.appendChild(titleDiv);
                itemDiv.appendChild(removeBtn);
                elements.queueList.appendChild(itemDiv);
            });
        }
    } catch (error) {
        console.error('[Subtide] Failed to load queue:', error);
    }
}

/**
 * Clear completed queue items
 */
async function clearCompletedQueue() {
    try {
        await sendMessage({ action: 'clearCompletedQueue' });
        loadQueue();
    } catch (error) {
        console.error('[Subtide] Failed to clear queue:', error);
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
        text.textContent = chrome.i18n.getMessage('btnStopLiveTranslate');
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

    if (tier === 'tier3' || tier === 'tier4') {
        // Pro/Stream tier: Hide API config, it's managed
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
            backendApiKey: elements.backendApiKey.value.trim(),
            // TTS settings
            ttsEnabled: elements.ttsEnabled?.checked || false,
            ttsSource: elements.ttsSource?.value || 'auto',
            ttsRate: parseFloat(elements.ttsRate?.value) || 1,
            ttsVolume: parseFloat(elements.ttsVolume?.value) || 0.8,
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
        console.error('[Subtide] Failed to save config:', error);
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
        console.error('[Subtide] Failed to clear cache:', error);
        btnText.textContent = chrome.i18n.getMessage('clearError');

        setTimeout(() => {
            btnText.textContent = chrome.i18n.getMessage('clear');
            elements.clearCache.disabled = false;
        }, 1500);
    }
}

/**
 * Send message to background script with timeout
 */
function sendMessage(message, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            reject(new Error('Service worker timeout - please try again'));
        }, timeoutMs);

        chrome.runtime.sendMessage(message, (response) => {
            clearTimeout(timeoutId);
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
