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
// State Management
// =============================================================================

let currentVideoId = null;
let sourceSubtitles = null;
let translatedSubtitles = null;
let selectedLanguage = null;
let isProcessing = false;
let isLive = false;
let userTier = 'tier1';
let backendUrl = 'http://localhost:5001';

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

    const observer = new MutationObserver(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            onNavigate();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('popstate', onNavigate);
}

/**
 * Handle navigation events
 */
function onNavigate() {
    translatedSubtitles = null;
    sourceSubtitles = null;
    isProcessing = false;
    isLive = false; // Reset live state
    removeUI();
    setTimeout(checkForVideo, 1000);
}

/**
 * Check if on video page
 */
function checkForVideo() {
    const videoId = new URL(location.href).searchParams.get('v');

    if (videoId && videoId !== currentVideoId) {
        currentVideoId = videoId;
        console.log('[VideoTranslate] Video:', videoId);
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

    // Periodic check to ensure UI stays injected
    setInterval(() => {
        if (!document.querySelector('.vt-container')) {
            const controls = document.querySelector('.ytp-right-controls');
            if (controls && controls.offsetParent !== null) {
                console.log('[VideoTranslate] Periodic re-injection');
                injectUI(controls);
            }
        }
    }, 5000);

    // For Tier 1/2: Pre-fetch subtitles
    if (userTier !== 'tier3') {
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

    try {
        const data = await sendMessage({ action: 'fetchSubtitles', videoId });

        if (data.error) throw new Error(data.error);

        sourceSubtitles = parseSubtitles(data);

        if (sourceSubtitles.length > 0) {
            updateStatus(chrome.i18n.getMessage('subsCount', [sourceSubtitles.length.toString()]), 'success');
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
async function translateVideo(targetLang) {
    if (isProcessing) {
        updateStatus(chrome.i18n.getMessage('processing'), 'loading', null, { animationKey: 'processing' });
        return;
    }

    isProcessing = true;
    updateStatus(chrome.i18n.getMessage('translating'), 'loading', null, { animationKey: 'translating' });

    try {
        let result;

        if (userTier === 'tier3') {
            // Tier 3: Single combined call
            result = await sendMessage({
                action: 'process',
                videoId: currentVideoId,
                targetLanguage: targetLang
            });
        } else {
            // Tier 1/2: Subtitles already fetched, translate via direct LLM
            if (!sourceSubtitles || sourceSubtitles.length === 0) {
                throw new Error(chrome.i18n.getMessage('noSubtitles'));
            }

            result = await sendMessage({
                action: 'translate',
                videoId: currentVideoId,
                subtitles: sourceSubtitles,
                sourceLanguage: 'auto',
                targetLanguage: targetLang
            });
        }

        if (result.error) throw new Error(result.error);

        translatedSubtitles = result.translations;
        console.log('[VideoTranslate] Received translations:', translatedSubtitles?.length, 'items');

        if (!translatedSubtitles || translatedSubtitles.length === 0) {
            throw new Error(chrome.i18n.getMessage('noTranslations'));
        }

        updateStatus(result.cached ? chrome.i18n.getMessage('cachedSuccess') : chrome.i18n.getMessage('doneSuccess'), 'success');

        // Hide status panel after success
        setTimeout(() => {
            const panel = document.querySelector('.vt-status-panel');
            if (panel) panel.style.display = 'none';
        }, 2000);

        showOverlay();
        setupSync();

    } catch (error) {
        console.error('[VideoTranslate] Translation failed:', error);
        updateStatus(chrome.i18n.getMessage('failed'), 'error');
    } finally {
        isProcessing = false;
    }
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
    // If we receive data, we are live. Ensure overlay is visible.
    if (!isLive) {
        isLive = true;
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
    } else if (message.action === 'live-subtitles') {
        handleLiveSubtitles(message.data);
        sendResponse({ received: true });
    } else if (message.action === 'live-stopped') {
        isLive = false;
        const overlay = document.querySelector('.vt-overlay');
        if (overlay) overlay.textContent = '';
        sendResponse({ received: true });
    }
    return true;
});

// =============================================================================
// Start
// =============================================================================

init();
