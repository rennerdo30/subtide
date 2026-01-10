/**
 * YouTube Content Script - Main Entry Point
 * Orchestrates UI injection and subtitle translation
 *
 * This file depends on the following modules loaded before it:
 * - youtube-constants.js (STATUS_MESSAGES, SPEAKER_COLORS, getSpeakerColor)
 * - youtube-status.js (updateStatus)
 * - youtube-subtitles.js (parseSubtitles, mergeSegments, setupSync, showOverlay, getSubtitleStyleValues)
 * - youtube-styles.js (addStyles)
 * - youtube-ui.js (injectUI, removeUI, waitForPlayer, waitForControls, watchControls)
 */

// =============================================================================
// State Management (Per-Video Map)
// =============================================================================

/**
 * Per-video state to prevent cross-tab/cross-video state pollution
 * Each video ID gets its own isolated state object
 */
const videoStates = new Map();

/**
 * Create initial state for a video
 * @returns {Object} Fresh state object
 */
function createInitialVideoState() {
    return {
        sourceSubtitles: null,
        translatedSubtitles: null,
        isProcessing: false,
        isLive: false,
        isStreaming: false,
        streamedSubtitles: [],
    };
}

/**
 * Get state for a video, creating if needed
 * @param {string} videoId - Video ID
 * @returns {Object} Video state object
 */
function getVideoState(videoId) {
    if (!videoId) return createInitialVideoState();
    if (!videoStates.has(videoId)) {
        videoStates.set(videoId, createInitialVideoState());
    }
    return videoStates.get(videoId);
}

/**
 * Clear state for a video
 * @param {string} videoId - Video ID
 */
function clearVideoState(videoId) {
    if (videoId) {
        videoStates.delete(videoId);
    }
}

/**
 * Clean up old video states to prevent memory leaks
 * Keeps only the current video and max 5 most recent
 */
function cleanupOldVideoStates(currentId) {
    const MAX_CACHED_STATES = 5;
    if (videoStates.size <= MAX_CACHED_STATES) return;

    // Keep currentId, remove oldest entries
    const keys = [...videoStates.keys()].filter(k => k !== currentId);
    const toRemove = keys.slice(0, keys.length - MAX_CACHED_STATES + 1);
    toRemove.forEach(k => videoStates.delete(k));
}

// Current video being viewed (single active video per content script)
let currentVideoId = null;

// Global config (not per-video)
let selectedLanguage = null;
let userTier = 'tier1';
let backendUrl = 'http://localhost:5001';

// Track MutationObserver for cleanup
let navigationObserver = null;

// Track all active timeouts for proper cleanup
const activeTimeouts = new Set();

// Convenience getters for current video state
function getCurrentState() {
    return getVideoState(currentVideoId);
}

// Legacy compatibility - these read/write to current video state
Object.defineProperty(window, '_vtSourceSubtitles', {
    get() { return getCurrentState().sourceSubtitles; },
    set(v) { getCurrentState().sourceSubtitles = v; }
});
Object.defineProperty(window, '_vtTranslatedSubtitles', {
    get() { return getCurrentState().translatedSubtitles; },
    set(v) { getCurrentState().translatedSubtitles = v; }
});

/**
 * Safe setTimeout that tracks the timeout ID for cleanup
 * @param {Function} fn - Function to call
 * @param {number} delay - Delay in milliseconds
 * @returns {number} Timeout ID
 */
function safeSetTimeout(fn, delay) {
    const id = setTimeout(() => {
        activeTimeouts.delete(id);
        fn();
    }, delay);
    activeTimeouts.add(id);
    return id;
}

/**
 * Clear a timeout and remove from tracking
 * @param {number} id - Timeout ID to clear
 */
function safeClearTimeout(id) {
    if (id) {
        clearTimeout(id);
        activeTimeouts.delete(id);
    }
}

/**
 * Clear all tracked timeouts
 */
function clearAllTimeouts() {
    activeTimeouts.forEach(id => clearTimeout(id));
    activeTimeouts.clear();
}

// Subtitle appearance settings
let subtitleSettings = {
    size: 'medium',
    position: 'bottom',
    background: 'dark',
    color: 'white',
    font: 'sans-serif',
    outline: 'medium',
    opacity: 'full',
    showSpeaker: 'color',
};

// =============================================================================
// Initialization
// =============================================================================

/**
 * Initialize on YouTube
 */
function init() {
    console.log('[VideoTranslate] Initializing');
    observeNavigation();
    checkForVideo();
}

/**
 * Watch for YouTube SPA navigation
 */
function observeNavigation() {
    let lastUrl = location.href;

    // Clean up existing observer if any
    if (navigationObserver) {
        navigationObserver.disconnect();
    }

    navigationObserver = new MutationObserver(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            onNavigate();
        }
    });

    navigationObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('popstate', onNavigate);

    // Cleanup on page unload
    window.addEventListener('beforeunload', cleanup);
}

/**
 * Cleanup resources when leaving the page
 */
function cleanup() {
    // Disconnect MutationObserver
    if (navigationObserver) {
        navigationObserver.disconnect();
        navigationObserver = null;
    }

    // Clear all tracked timeouts
    clearAllTimeouts();

    // Stop subtitle sync loop
    if (typeof stopSync === 'function') {
        stopSync();
    }

    // Remove event listeners
    window.removeEventListener('popstate', onNavigate);
    window.removeEventListener('beforeunload', cleanup);
}

/**
 * Handle navigation events
 */
function onNavigate() {
    // Stop subtitle sync loop to prevent orphaned RAF callbacks
    if (typeof stopSync === 'function') {
        stopSync();
    }

    // Clear all tracked timeouts (includes any pending live subtitle timeout)
    clearAllTimeouts();

    // Clear any legacy timeout references
    if (window._liveSubtitleTimeout) {
        clearTimeout(window._liveSubtitleTimeout);
        window._liveSubtitleTimeout = null;
    }

    // Clear fast retry interval if running
    if (window._vtFastRetryInterval) {
        clearInterval(window._vtFastRetryInterval);
        window._vtFastRetryInterval = null;
    }

    // Reset state for current video (use Map-based state)
    if (currentVideoId) {
        const state = getVideoState(currentVideoId);
        state.translatedSubtitles = null;
        state.sourceSubtitles = null;
        state.isProcessing = false;
        state.isLive = false;
        state.isStreaming = false;
        state.streamedSubtitles = [];
    }

    // Clean up old states to prevent memory buildup
    cleanupOldVideoStates(currentVideoId);

    removeUI();
    safeSetTimeout(checkForVideo, 1000);
}

/**
 * Check if on video page (Watch page or Embed)
 */
function checkForVideo() {
    let videoId = null;
    const url = new URL(location.href);

    // Case 1: Standard Watch Page (v param)
    if (url.searchParams.has('v')) {
        videoId = url.searchParams.get('v');
    }
    // Case 2: Embed (pathname)
    else if (url.pathname.startsWith('/embed/')) {
        videoId = url.pathname.split('/embed/')[1];
        // Remove any further path segments or params if needed (usually just ID)
        if (videoId && videoId.includes('/')) {
            videoId = videoId.split('/')[0];
        }
        if (videoId && videoId.includes('?')) {
            videoId = videoId.split('?')[0];
        }
    }

    if (videoId && videoId !== currentVideoId) {
        currentVideoId = videoId;
        console.log('[VideoTranslate] Video detected:', videoId, '(isEmbed:', url.pathname.startsWith('/embed/'), ')');
        setupPage(videoId);
    }
}

// =============================================================================
// Page Setup
// =============================================================================

/**
 * Setup page with UI
 */
async function setupPage(videoId) {
    await waitForPlayer();

    // Load config
    const config = await sendMessage({ action: 'getConfig' });
    selectedLanguage = config.defaultLanguage || 'en';
    userTier = config.tier || 'tier1';
    backendUrl = config.backendUrl || 'http://localhost:5001';

    // Load subtitle appearance settings
    subtitleSettings = {
        size: config.subtitleSize || 'medium',
        position: config.subtitlePosition || 'bottom',
        background: config.subtitleBackground || 'dark',
        color: config.subtitleColor || 'white',
        font: config.subtitleFont || 'sans-serif',
        outline: config.subtitleOutline || 'medium',
        opacity: config.subtitleOpacity || 'full',
        showSpeaker: config.subtitleShowSpeaker || 'color',
    };

    console.log('[VideoTranslate] Tier:', userTier);
    console.log('[VideoTranslate] Subtitle settings:', subtitleSettings);

    // Try to inject UI with error handling
    waitForControls().then(controls => {
        injectUI(controls);
        watchControls(controls);
    }).catch(err => {
        console.error('[VideoTranslate] Failed to find controls:', err);
        setTimeout(() => {
            const retryControls = document.querySelector('.ytp-right-controls');
            if (retryControls) {
                injectUI(retryControls);
                watchControls(retryControls);
            }
        }, 2000);
    });

    // Periodic check to ensure UI stays injected (reduced from 5s to 1s for faster recovery)
    setInterval(() => {
        if (!document.querySelector('.vt-container')) {
            const controls = document.querySelector('.ytp-right-controls');
            if (controls && controls.offsetParent !== null) {
                console.log('[VideoTranslate] Periodic re-injection');
                injectUI(controls);
            }
        }
    }, 1000);

    // Fast initial injection loop for the first 10 seconds (every 200ms)
    // This catches YouTube's aggressive initial DOM rebuilding
    let fastRetryCount = 0;
    // Store reference for cleanup on navigation
    window._vtFastRetryInterval = setInterval(() => {
        fastRetryCount++;
        if (fastRetryCount > 50) { // 50 * 200ms = 10 seconds
            clearInterval(window._vtFastRetryInterval);
            window._vtFastRetryInterval = null;
            return;
        }
        if (!document.querySelector('.vt-container')) {
            const controls = document.querySelector('.ytp-right-controls');
            if (controls && controls.offsetParent !== null) {
                console.log('[VideoTranslate] Fast re-injection attempt', fastRetryCount);
                injectUI(controls);
                watchControls(controls);
            }
        }
    }, 200);

    // For Tier 1/2: Pre-fetch subtitles (Tier 3 and 4 handle everything server-side)
    if (userTier !== 'tier3' && userTier !== 'tier4') {
        await prefetchSubtitles(videoId);
    }
}

// =============================================================================
// Subtitle Operations
// =============================================================================

/**
 * Pre-fetch subtitles (Tier 1/2)
 */
async function prefetchSubtitles(videoId) {
    updateStatus(chrome.i18n.getMessage('loading'), 'loading', null, { animationKey: 'loading' });

    const state = getVideoState(videoId);

    try {
        const data = await sendMessage({ action: 'fetchSubtitles', videoId });

        if (data.error) throw new Error(data.error);

        state.sourceSubtitles = parseSubtitles(data);

        if (state.sourceSubtitles.length > 0) {
            updateStatus(chrome.i18n.getMessage('subsCount', [state.sourceSubtitles.length.toString()]), 'success');
        } else {
            updateStatus(chrome.i18n.getMessage('noSubtitles'), 'error');
        }
    } catch (error) {
        console.error('[VideoTranslate] Prefetch failed:', error);
        updateStatus(chrome.i18n.getMessage('noSubtitles'), 'error');
    }
}

/**
 * Translate video subtitles
 */
/**
 * Translate video subtitles
 * @param {string} targetLang - Target language code
 * @param {Object} options - Optional settings
 * @param {boolean} options.forceRefresh - Bypass cache and force re-translation
 */
async function translateVideo(targetLang, options = {}) {
    const { forceRefresh = false } = options;

    const state = getVideoState(currentVideoId);

    if (state.isProcessing) {
        updateStatus(chrome.i18n.getMessage('processing'), 'loading', null, { animationKey: 'processing' });
        return;
    }

    // If force refresh, clear local state first
    if (forceRefresh) {
        console.log('[VideoTranslate] Force refresh requested, clearing cache...');
        state.translatedSubtitles = null;
        state.streamedSubtitles = [];

        // Clear localStorage cache for this video
        try {
            const cacheKey = `vt-cache-${currentVideoId}-${targetLang}`;
            localStorage.removeItem(cacheKey);
        } catch (e) {
            console.warn('[VideoTranslate] Could not clear local cache:', e);
        }
    }

    state.isProcessing = true;
    const statusMessage = forceRefresh
        ? (chrome.i18n.getMessage('forceTranslating') || 'Re-translating (bypassing cache)...')
        : chrome.i18n.getMessage('translating');
    updateStatus(statusMessage, 'loading', null, { animationKey: 'translating' });

    try {
        let result;

        if (userTier === 'tier4') {
            // Tier 4: Progressive streaming - subtitles arrive as batches complete
            state.isStreaming = true;
            state.streamedSubtitles = [];
            updateStatus(chrome.i18n.getMessage('translating') || 'Streaming...', 'loading', null, { animationKey: 'streaming' });

            result = await sendMessage({
                action: 'stream-process',
                videoId: currentVideoId,
                targetLanguage: targetLang,
                forceRefresh: forceRefresh
            });

            // When complete, use either the final result or accumulated streamed subtitles
            state.translatedSubtitles = result.translations || state.streamedSubtitles;
            state.isStreaming = false;

        } else if (userTier === 'tier3') {
            // Tier 3: Single combined call
            result = await sendMessage({
                action: 'process',
                videoId: currentVideoId,
                targetLanguage: targetLang,
                forceRefresh: forceRefresh
            });
            state.translatedSubtitles = result.translations;

        } else {
            // Tier 1/2: May need to re-fetch subtitles if forcing
            if (forceRefresh || !state.sourceSubtitles || state.sourceSubtitles.length === 0) {
                const fetchResult = await sendMessage({
                    action: 'fetch-subtitles',
                    videoId: currentVideoId,
                    forceRefresh: forceRefresh
                });
                if (fetchResult.subtitles) {
                    state.sourceSubtitles = fetchResult.subtitles;
                }
            }

            if (!state.sourceSubtitles || state.sourceSubtitles.length === 0) {
                throw new Error(chrome.i18n.getMessage('noSubtitles'));
            }

            result = await sendMessage({
                action: 'translate',
                videoId: currentVideoId,
                subtitles: state.sourceSubtitles,
                sourceLanguage: 'auto',
                targetLanguage: targetLang,
                forceRefresh: forceRefresh
            });
            state.translatedSubtitles = result.translations;
        }

        if (result.error) throw new Error(result.error);

        console.log('[VideoTranslate] Received translations:', state.translatedSubtitles?.length, 'items');

        if (!state.translatedSubtitles || state.translatedSubtitles.length === 0) {
            throw new Error(chrome.i18n.getMessage('noTranslations'));
        }

        // Analyze subtitle density for adaptive tolerances
        analyzeSubtitleDensity(state.translatedSubtitles);

        // Initialize windowed access for very long videos
        initSubtitleWindow(state.translatedSubtitles);

        const successMessage = forceRefresh
            ? (chrome.i18n.getMessage('retranslateSuccess') || 'Re-translation complete!')
            : (result.cached ? chrome.i18n.getMessage('cachedSuccess') : chrome.i18n.getMessage('doneSuccess'));
        updateStatus(successMessage, 'success');

        // Hide status panel after success
        setTimeout(() => {
            const panel = document.querySelector('.vt-status-panel');
            if (panel) panel.style.display = 'none';
        }, 2000);

        // Only show overlay and setup sync if not already streaming
        // (streaming mode shows overlay on first batch)
        if (!state.isStreaming) {
            showOverlay();
            setupSync();
        }

    } catch (error) {
        console.error('[VideoTranslate] Translation failed:', error);
        updateStatus(chrome.i18n.getMessage('failed'), 'error');
        state.isStreaming = false;
    } finally {
        state.isProcessing = false;
    }
}

/**
 * Force re-translate the current video (clears cache)
 * This bypasses the cache and forces a fresh translation
 * Shows confirmation dialog before proceeding
 */
function forceRetranslate() {
    // Show confirmation dialog - re-translation uses API quota and takes time
    const confirmMessage = chrome.i18n.getMessage('confirmRetranslate') ||
        'Re-translate this video?\n\nThis will:\n• Clear the cached translation\n• Use your API quota\n• Take some time to complete\n\nContinue?';

    if (!confirm(confirmMessage)) {
        console.log('[VideoTranslate] Force re-translate cancelled by user');
        return Promise.resolve();
    }

    return translateVideo(selectedLanguage, { forceRefresh: true });
}

/**
 * Toggle live translation mode
 */
async function toggleLiveTranslate() {
    // Chrome Manifest V3 restriction: tabCapture requires extension invocation (popup click)
    // We cannot trigger it from the content script directly.
    alert(chrome.i18n.getMessage('usePopupForLive') || "Please use the Extension Popup to start Live Translation.\n\nClick the Video Translate icon in your browser toolbar.");
    return;
}

/**
 * Handle incoming live subtitles
 */
function handleLiveSubtitles(data) {
    const state = getVideoState(currentVideoId);

    // If we receive data, we are live. Ensure overlay is visible.
    if (!state.isLive) {
        state.isLive = true;
        showOverlay();
    }

    const overlay = document.querySelector('.vt-overlay');
    if (!overlay) return;

    const { text, translatedText, speaker } = data;

    // Add to overlay (rolling text)
    // We treat the translated text as the primary display
    const content = translatedText || text;

    // Apply styles dynamically
    const styleValues = getSubtitleStyleValues();

    // Create span with explicit styles to ensure visibility
    const span = document.createElement('span');
    span.className = 'vt-text';
    span.textContent = content;

    // Force styles
    span.style.background = styleValues.background;
    span.style.color = styleValues.color || '#fff';
    span.style.fontSize = styleValues.fontSize;
    span.style.fontFamily = styleValues.fontFamily;
    span.style.textShadow = styleValues.textShadow;
    span.style.opacity = styleValues.opacity;
    span.style.display = 'inline-block';
    span.style.padding = '4px 8px';
    span.style.borderRadius = '4px';

    overlay.innerHTML = '';
    overlay.appendChild(span);
    overlay.style.display = 'block';

    // Auto-fade if no new data for 5 seconds
    if (window._liveSubtitleTimeout) clearTimeout(window._liveSubtitleTimeout);
    window._liveSubtitleTimeout = setTimeout(() => {
        overlay.innerHTML = '';
    }, 5000);
}

// =============================================================================
// Communication
// =============================================================================

/**
 * Send message to background script
 */
function sendMessage(msg) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(msg, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                resolve(response);
            }
        });
    });
}

/**
 * Listen for progress updates from background script
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'progress') {
        const { stage, message: msg, percent, step, totalSteps, eta, batchInfo } = message;

        const stageTypes = {
            'checking': 'loading',
            'downloading': 'loading',
            'whisper': 'loading',
            'translating': 'loading',
            'complete': 'success',
        };

        const options = {};
        if (step !== undefined) options.step = step;
        if (totalSteps !== undefined) options.totalSteps = totalSteps;
        if (eta) options.eta = eta;
        if (batchInfo) options.batchInfo = batchInfo;

        if (stage === 'whisper') options.animationKey = 'transcribing';
        else options.animationKey = stage;

        updateStatus(msg, stageTypes[stage] || 'loading', percent, options);
        sendResponse({ received: true });

    } else if (message.action === 'streaming-subtitles') {
        // Tier 4: Handle progressive subtitle streaming
        handleStreamingSubtitles(message.subtitles, message.batchIndex, message.totalBatches);
        sendResponse({ received: true });

    } else if (message.action === 'streaming-complete') {
        // Tier 4: Streaming finished
        handleStreamingComplete(message.subtitles, message.cached);
        sendResponse({ received: true });

    } else if (message.action === 'live-subtitles') {
        handleLiveSubtitles(message.data);
        sendResponse({ received: true });

    } else if (message.action === 'live-stopped') {
        const state = getVideoState(currentVideoId);
        state.isLive = false;
        const overlay = document.querySelector('.vt-overlay');
        if (overlay) overlay.textContent = '';
        sendResponse({ received: true });
    }
    return true;
});

/**
 * Handle streaming subtitle batch (Tier 4)
 * Called when each batch of translated subtitles arrives
 */
function handleStreamingSubtitles(newSubtitles, batchIndex, totalBatches) {
    console.log(`[VideoTranslate] Streaming batch ${batchIndex}/${totalBatches}: ${newSubtitles.length} subtitles`);

    const state = getVideoState(currentVideoId);

    // Merge new subtitles with existing
    state.streamedSubtitles = state.streamedSubtitles.concat(newSubtitles);

    // Sort by start time (batches may arrive out of order due to parallel processing)
    state.streamedSubtitles.sort((a, b) => a.start - b.start);

    // Update status with streaming progress
    const percent = Math.round((batchIndex / totalBatches) * 100);
    updateStatus(
        `Streaming: ${batchIndex}/${totalBatches} batches (${state.streamedSubtitles.length} subs)`,
        'loading',
        percent,
        {
            animationKey: 'streaming',
            batchInfo: { current: batchIndex, total: totalBatches }
        }
    );

    // On first batch, show overlay and start sync
    if (batchIndex === 1) {
        state.translatedSubtitles = state.streamedSubtitles;
        analyzeSubtitleDensity(state.translatedSubtitles);
        initSubtitleWindow(state.translatedSubtitles);
        showOverlay();
        setupSync();
    } else {
        // Update the active subtitles array for sync
        state.translatedSubtitles = state.streamedSubtitles;
        updateActiveSubtitles(state.translatedSubtitles);
    }
}

/**
 * Handle streaming complete (Tier 4)
 * Called when all subtitle batches have been received
 */
function handleStreamingComplete(finalSubtitles, cached) {
    const state = getVideoState(currentVideoId);

    console.log(`[VideoTranslate] Streaming complete: ${finalSubtitles?.length || state.streamedSubtitles.length} total subtitles`);

    state.isStreaming = false;

    // Use final subtitles if provided, otherwise use accumulated
    if (finalSubtitles && finalSubtitles.length > 0) {
        state.translatedSubtitles = finalSubtitles;
    } else {
        state.translatedSubtitles = state.streamedSubtitles;
    }

    // Sort to ensure correct order
    state.translatedSubtitles.sort((a, b) => a.start - b.start);

    // Update analysis and window
    analyzeSubtitleDensity(state.translatedSubtitles);
    initSubtitleWindow(state.translatedSubtitles);
    updateActiveSubtitles(state.translatedSubtitles);

    updateStatus(cached ? chrome.i18n.getMessage('cachedSuccess') : chrome.i18n.getMessage('doneSuccess'), 'success');

    // Hide status panel after success
    setTimeout(() => {
        const panel = document.querySelector('.vt-status-panel');
        if (panel) panel.style.display = 'none';
    }, 2000);
}

// =============================================================================
// Keyboard Shortcuts
// =============================================================================

/**
 * Handle keyboard shortcuts
 * Alt+S: Toggle subtitle visibility
 * Alt+T: Translate current video
 * Alt+D: Toggle dual subtitle mode
 */
function handleKeyboardShortcut(e) {
    // Only handle Alt+key combinations
    if (!e.altKey) return;

    // Don't trigger when typing in input fields
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
        return;
    }

    switch (e.key.toLowerCase()) {
        case 's': // Alt+S: Toggle subtitles
            e.preventDefault();
            toggleSubtitleVisibility();
            break;
        case 't': // Alt+T: Translate video
            e.preventDefault();
            const state = getVideoState(currentVideoId);
            if (currentVideoId && !state.isProcessing) {
                translateVideo(selectedLanguage);
            }
            break;
        case 'd': // Alt+D: Toggle dual mode
            e.preventDefault();
            toggleDualMode();
            break;
    }
}

/**
 * Toggle subtitle overlay visibility
 */
function toggleSubtitleVisibility() {
    const overlay = document.querySelector('.vt-overlay');
    if (overlay) {
        const isVisible = overlay.style.display !== 'none';
        overlay.style.display = isVisible ? 'none' : 'block';
        console.log('[VideoTranslate] Subtitles', isVisible ? 'hidden' : 'shown');
    }
}

/**
 * Toggle dual subtitle mode
 */
function toggleDualMode() {
    subtitleSettings.dualMode = !subtitleSettings.dualMode;
    console.log('[VideoTranslate] Dual mode:', subtitleSettings.dualMode ? 'ON' : 'OFF');

    // Update overlay structure
    updateOverlayForDualMode();

    // Save preference
    sendMessage({
        action: 'saveConfig',
        config: { subtitleDualMode: subtitleSettings.dualMode }
    });
}

/**
 * Update overlay HTML structure for dual mode
 */
function updateOverlayForDualMode() {
    const overlay = document.querySelector('.vt-overlay');
    if (!overlay) return;

    if (subtitleSettings.dualMode) {
        overlay.innerHTML = `
            <div class="vt-text-original"></div>
            <div class="vt-text-translated"></div>
        `;
        overlay.classList.add('vt-dual-mode');
    } else {
        overlay.innerHTML = '<span class="vt-text"></span>';
        overlay.classList.remove('vt-dual-mode');
    }
}

// Register keyboard shortcut handler
document.addEventListener('keydown', handleKeyboardShortcut);

// =============================================================================
// Start
// =============================================================================

init();
