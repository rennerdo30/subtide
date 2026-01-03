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
let isStreaming = false; // Tier 4: streaming in progress
let streamedSubtitles = []; // Tier 4: progressively received subtitles
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
    isStreaming = false; // Reset streaming state
    streamedSubtitles = []; // Clear streamed subtitles
    removeUI();
    setTimeout(checkForVideo, 1000);
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
    const fastRetryInterval = setInterval(() => {
        fastRetryCount++;
        if (fastRetryCount > 50) { // 50 * 200ms = 10 seconds
            clearInterval(fastRetryInterval);
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

        if (userTier === 'tier4') {
            // Tier 4: Progressive streaming - subtitles arrive as batches complete
            isStreaming = true;
            streamedSubtitles = [];
            updateStatus(chrome.i18n.getMessage('translating') || 'Streaming...', 'loading', null, { animationKey: 'streaming' });

            result = await sendMessage({
                action: 'stream-process',
                videoId: currentVideoId,
                targetLanguage: targetLang
            });

            // When complete, use either the final result or accumulated streamed subtitles
            translatedSubtitles = result.translations || streamedSubtitles;
            isStreaming = false;

        } else if (userTier === 'tier3') {
            // Tier 3: Single combined call
            result = await sendMessage({
                action: 'process',
                videoId: currentVideoId,
                targetLanguage: targetLang
            });
            translatedSubtitles = result.translations;

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
            translatedSubtitles = result.translations;
        }

        if (result.error) throw new Error(result.error);

        console.log('[VideoTranslate] Received translations:', translatedSubtitles?.length, 'items');

        if (!translatedSubtitles || translatedSubtitles.length === 0) {
            throw new Error(chrome.i18n.getMessage('noTranslations'));
        }

        // Analyze subtitle density for adaptive tolerances
        analyzeSubtitleDensity(translatedSubtitles);

        // Initialize windowed access for very long videos
        initSubtitleWindow(translatedSubtitles);

        updateStatus(result.cached ? chrome.i18n.getMessage('cachedSuccess') : chrome.i18n.getMessage('doneSuccess'), 'success');

        // Hide status panel after success
        setTimeout(() => {
            const panel = document.querySelector('.vt-status-panel');
            if (panel) panel.style.display = 'none';
        }, 2000);

        // Only show overlay and setup sync if not already streaming
        // (streaming mode shows overlay on first batch)
        if (!isStreaming) {
            showOverlay();
            setupSync();
        }

    } catch (error) {
        console.error('[VideoTranslate] Translation failed:', error);
        updateStatus(chrome.i18n.getMessage('failed'), 'error');
        isStreaming = false;
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
        isLive = false;
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

    // Merge new subtitles with existing
    streamedSubtitles = streamedSubtitles.concat(newSubtitles);

    // Sort by start time (batches may arrive out of order due to parallel processing)
    streamedSubtitles.sort((a, b) => a.start - b.start);

    // Update status with streaming progress
    const percent = Math.round((batchIndex / totalBatches) * 100);
    updateStatus(
        `Streaming: ${batchIndex}/${totalBatches} batches (${streamedSubtitles.length} subs)`,
        'loading',
        percent,
        {
            animationKey: 'streaming',
            batchInfo: { current: batchIndex, total: totalBatches }
        }
    );

    // On first batch, show overlay and start sync
    if (batchIndex === 1) {
        translatedSubtitles = streamedSubtitles;
        analyzeSubtitleDensity(translatedSubtitles);
        initSubtitleWindow(translatedSubtitles);
        showOverlay();
        setupSync();
    } else {
        // Update the active subtitles array for sync
        translatedSubtitles = streamedSubtitles;
        updateActiveSubtitles(translatedSubtitles);
    }
}

/**
 * Handle streaming complete (Tier 4)
 * Called when all subtitle batches have been received
 */
function handleStreamingComplete(finalSubtitles, cached) {
    console.log(`[VideoTranslate] Streaming complete: ${finalSubtitles?.length || streamedSubtitles.length} total subtitles`);

    isStreaming = false;

    // Use final subtitles if provided, otherwise use accumulated
    if (finalSubtitles && finalSubtitles.length > 0) {
        translatedSubtitles = finalSubtitles;
    } else {
        translatedSubtitles = streamedSubtitles;
    }

    // Sort to ensure correct order
    translatedSubtitles.sort((a, b) => a.start - b.start);

    // Update analysis and window
    analyzeSubtitleDensity(translatedSubtitles);
    initSubtitleWindow(translatedSubtitles);
    updateActiveSubtitles(translatedSubtitles);

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
            if (currentVideoId && !isProcessing) {
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
