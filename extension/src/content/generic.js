/**
 * Generic Content Script - Entry Point
 * Supports ANY video platform (non-YouTube/Twitch)
 * Coordinates: generic-styles.js, generic-sync.js, generic-ui.js
 */

// =============================================================================
// Constants
// =============================================================================

/** Minimum video dimensions (px) to consider as main video */
const MIN_VIDEO_SIZE = 200;

// =============================================================================
// State
// =============================================================================

let activeVideo = null;
let currentVideoId = null;
let hlsUrl = null;
let selectedLanguage = 'en';
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

// UI element references
let uiElements = {
    controlBar: null,
    statusPanel: null,
    settingsPanel: null,
    subtitleOverlay: null,
};

// Track observers and intervals for cleanup
let domObserver = null;
let periodicCheckInterval = null;

// Translation state
let translationState = {
    isTranslating: false,
    currentStage: null,
    progress: 0,
};

// Only run on non-YouTube/Twitch pages
const isYouTube = location.host.includes('youtube.com');
const isTwitch = location.host.includes('twitch.tv');

if (!isYouTube && !isTwitch) {
    console.log('[Subtide] Initializing Generic Adapter');
    init();
}

// =============================================================================
// Initialization
// =============================================================================

function init() {
    // 1. Observe DOM for video elements (track for cleanup)
    domObserver = new MutationObserver(checkForVideo);
    domObserver.observe(document.body, { childList: true, subtree: true });

    // 2. Periodic check (some SPAs render late) - track for cleanup
    periodicCheckInterval = setInterval(checkForVideo, 2000);

    // 3. Cleanup on page unload
    window.addEventListener('beforeunload', cleanup);

    // 3. Listen for play events to grab the "active" video
    document.addEventListener('play', (e) => {
        if (e.target.tagName === 'VIDEO') {
            setActiveVideo(e.target);
        }
    }, true);

    // 4. Inject Network Interceptor
    injectInterceptor();

    // 5. Load initial config
    loadConfig();

    // 6. Listen for progress messages from service worker
    chrome.runtime.onMessage.addListener(handleMessage);
}

/**
 * Cleanup resources when leaving the page
 */
function cleanup() {
    // Disconnect MutationObserver
    if (domObserver) {
        domObserver.disconnect();
        domObserver = null;
    }

    // Clear periodic check interval
    if (periodicCheckInterval) {
        clearInterval(periodicCheckInterval);
        periodicCheckInterval = null;
    }

    // Stop subtitle sync
    if (typeof stopSync === 'function') {
        stopSync();
    }

    // Remove event listener
    window.removeEventListener('beforeunload', cleanup);
}

function injectInterceptor() {
    try {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('src/content/network_interceptor.js');
        script.onload = function () {
            this.remove();
        };
        (document.head || document.documentElement).appendChild(script);
        console.log('[Subtide] Interceptor injected');
    } catch (e) {
        console.error('[Subtide] Failed to inject interceptor:', e);
    }

    // Listen for events from the interceptor
    window.addEventListener('vt-stream-found', (e) => {
        if (e.detail && e.detail.url) {
            if (hlsUrl !== e.detail.url) {
                console.log('[Subtide] Received Stream URL from interceptor:', e.detail.url);
                hlsUrl = e.detail.url;
            }
        }
    });
}

async function loadConfig() {
    try {
        const config = await sendMessage({ action: 'getConfig' });
        selectedLanguage = config.defaultLanguage || 'en';
        if (config.subtitleSize) subtitleSettings.size = config.subtitleSize;
        if (config.subtitlePosition) subtitleSettings.position = config.subtitlePosition;
        if (config.subtitleBackground) subtitleSettings.background = config.subtitleBackground;
        if (config.subtitleColor) subtitleSettings.color = config.subtitleColor;
        if (config.subtitleFont) subtitleSettings.font = config.subtitleFont;
        if (config.subtitleOutline) subtitleSettings.outline = config.subtitleOutline;
        if (config.subtitleOpacity) subtitleSettings.opacity = config.subtitleOpacity;
        if (config.subtitleShowSpeaker) subtitleSettings.showSpeaker = config.subtitleShowSpeaker;
    } catch (e) {
        console.warn('[Subtide] Failed to load config:', e);
    }
}

// =============================================================================
// Video Detection
// =============================================================================

function checkForVideo() {
    // If we already have an active video, check if it's still in DOM
    if (activeVideo && !document.body.contains(activeVideo)) {
        removeUI();
        activeVideo = null;
    }

    if (activeVideo) return;

    // Heuristic: Find first visible video larger than minimum size
    const videos = document.querySelectorAll('video');
    for (const video of videos) {
        const rect = video.getBoundingClientRect();
        if (rect.width > MIN_VIDEO_SIZE && rect.height > MIN_VIDEO_SIZE) {
            setActiveVideo(video);
            break;
        }
    }
}

function setActiveVideo(video) {
    if (activeVideo === video) return;

    activeVideo = video;
    console.log('[Subtide] Active video found:', video);

    // Try to find HLS or MPD URL
    hlsUrl = findStreamUrl(video);

    // Generate stable ID from page URL
    currentVideoId = btoa(location.href).replace(/[^a-zA-Z0-9]/g, '').substring(0, 32);

    injectUI(video);
}

function findStreamUrl(video) {
    // 1. Check src
    if (video.src && (video.src.includes('.m3u8') || video.src.includes('.mpd'))) {
        return video.src;
    }

    // 2. Check <source> children
    const sources = video.querySelectorAll('source');
    for (const source of sources) {
        if (source.src && (source.src.includes('.m3u8') || source.src.includes('.mpd'))) {
            return source.src;
        }
    }

    return null;
}

// =============================================================================
// UI Injection
// =============================================================================

function injectUI(video) {
    // Avoid duplicates
    if (document.querySelector('.vt-generic-control-bar')) return;

    // Ensure parent has relative positioning
    const parent = video.parentElement;
    if (parent) {
        const style = window.getComputedStyle(parent);
        if (style.position === 'static') {
            parent.style.position = 'relative';
        }
    }

    // Inject styles
    window.VTGenericStyles?.inject(subtitleSettings);

    // Create UI components
    const UI = window.VTGenericUI;
    if (!UI) {
        console.error('[Subtide] UI module not loaded');
        return;
    }

    // Create control bar
    uiElements.controlBar = UI.createControlBar(video, {
        selectedLanguage,
        onTranslate: startTranslation,
        onLanguageChange: handleLanguageChange,
        onSettingsOpen: () => UI.toggleSettingsPanel(uiElements.settingsPanel),
        onToggleSubtitles: toggleSubtitles,
    });
    parent.appendChild(uiElements.controlBar);

    // Create status panel
    uiElements.statusPanel = UI.createStatusPanel();
    parent.appendChild(uiElements.statusPanel);

    // Create settings panel
    uiElements.settingsPanel = UI.createSettingsPanel(subtitleSettings, {
        onSettingChange: handleSettingChange,
        onToggleSubtitles: toggleSubtitles,
    });
    parent.appendChild(uiElements.settingsPanel);

    // Create subtitle overlay
    uiElements.subtitleOverlay = UI.createSubtitleOverlay();
    parent.appendChild(uiElements.subtitleOverlay);

    // Setup keyboard shortcuts
    UI.setupKeyboardShortcuts({
        onTranslate: startTranslation,
        onToggleSubtitles: toggleSubtitles,
        onOpenLanguageMenu: () => {
            const langDropdown = document.querySelector('.vt-lang-dropdown');
            if (langDropdown) {
                langDropdown.classList.add('open');
            }
        },
        onCloseMenus: () => {
            UI.toggleSettingsPanel(uiElements.settingsPanel, false);
            document.querySelector('.vt-lang-dropdown')?.classList.remove('open');
        },
    });

    // Handle fullscreen changes
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
}

function removeUI() {
    window.VTGenericSync?.stopSyncLoop();

    // Remove all UI elements
    document.querySelector('.vt-generic-control-bar')?.remove();
    document.querySelector('.vt-generic-status-panel')?.remove();
    document.querySelector('.vt-generic-settings-panel')?.remove();
    document.querySelector('.vt-generic-overlay')?.remove();

    uiElements = {
        controlBar: null,
        statusPanel: null,
        settingsPanel: null,
        subtitleOverlay: null,
    };
}

// =============================================================================
// Event Handlers
// =============================================================================

function handleLanguageChange(code) {
    selectedLanguage = code;
    sendMessage({ action: 'saveConfig', config: { defaultLanguage: code } });
}

function handleSettingChange(key, value, settings) {
    subtitleSettings = { ...settings };

    // Re-inject styles with new settings
    window.VTGenericStyles?.inject(subtitleSettings);

    // Save to config
    const configKey = `subtitle${key.charAt(0).toUpperCase() + key.slice(1)}`;
    const config = { [configKey]: value };
    sendMessage({ action: 'saveConfig', config });
}

function toggleSubtitles() {
    const visible = window.VTGenericUI?.toggleSubtitleVisibility(uiElements.subtitleOverlay);
    console.log('[Subtide] Subtitles:', visible ? 'visible' : 'hidden');
    return visible;
}

function handleFullscreenChange() {
    // Re-inject styles to apply fullscreen-specific rules
    window.VTGenericStyles?.inject(subtitleSettings);
}

function handleMessage(message, sender, sendResponse) {
    if (message.action === 'progress') {
        updateProgress(message);
    } else if (message.action === 'subtitles') {
        handleTranslationResult(message.subtitles);
    }
}

// =============================================================================
// Translation
// =============================================================================

async function startTranslation() {
    if (translationState.isTranslating) return;

    translationState.isTranslating = true;
    translationState.progress = 0;

    const UI = window.VTGenericUI;

    // Update control bar status
    UI?.updateInlineStatus(uiElements.controlBar, {
        text: 'Starting...',
        percent: 0,
    });

    // Show status panel
    UI?.updateStatusPanel(uiElements.statusPanel, {
        type: 'loading',
        step: 1,
        totalSteps: 3,
        text: 'Extracting audio...',
        subText: 'Preparing video for processing',
        percent: 0,
    });

    try {
        const videoUrl = location.href;
        let streamUrl = null;

        // If we found a direct stream URL (HLS/DASH), send it as streamUrl
        if (hlsUrl && (hlsUrl.includes('.m3u8') || hlsUrl.includes('.mpd'))) {
            console.log('[Subtide] Detected stream URL:', hlsUrl);
            streamUrl = hlsUrl;
        }

        console.log('[Subtide] Sending request:', { videoUrl, streamUrl, lang: selectedLanguage });

        const response = await sendMessage({
            action: 'process',
            videoId: currentVideoId,
            videoUrl: videoUrl,
            streamUrl: streamUrl,
            targetLanguage: selectedLanguage
        });

        if (response.error) throw new Error(response.error);

        handleTranslationResult(response.translations);

    } catch (e) {
        console.error('[Subtide] Translation failed:', e);

        UI?.updateStatusPanel(uiElements.statusPanel, {
            type: 'error',
            text: 'Translation failed',
            subText: e.message,
        });

        UI?.updateInlineStatus(uiElements.controlBar, {
            text: 'Error',
            message: e.message,
        });

        // Reset after delay
        setTimeout(() => {
            UI?.hideStatusPanel(uiElements.statusPanel);
            UI?.updateInlineStatus(uiElements.controlBar, { hide: true });
        }, 5000);

        translationState.isTranslating = false;
    }
}

function updateProgress(data) {
    const UI = window.VTGenericUI;

    const stageMap = {
        'downloading': { step: 1, text: 'Extracting audio...' },
        'transcribing': { step: 2, text: 'Transcribing speech...' },
        'translating': { step: 3, text: 'Translating subtitles...' },
        'finalizing': { step: 3, text: 'Finalizing...' },
    };

    const stageInfo = stageMap[data.stage] || { step: 1, text: data.message || 'Processing...' };

    translationState.currentStage = data.stage;
    translationState.progress = data.percent || 0;

    // Update status panel
    UI?.updateStatusPanel(uiElements.statusPanel, {
        type: 'loading',
        step: stageInfo.step,
        totalSteps: 3,
        text: stageInfo.text,
        subText: data.message,
        percent: data.percent,
    });

    // Update inline status
    UI?.updateInlineStatus(uiElements.controlBar, {
        text: stageInfo.text.replace('...', ''),
        message: data.message,
        percent: data.percent,
    });
}

function handleTranslationResult(subtitles) {
    if (!subtitles || !subtitles.length) {
        console.warn('[Subtide] No subtitles received');
        return;
    }

    console.log('[Subtide] Received', subtitles.length, 'subtitles');

    translationState.isTranslating = false;

    const UI = window.VTGenericUI;
    const Sync = window.VTGenericSync;

    // Show success
    UI?.updateStatusPanel(uiElements.statusPanel, {
        type: 'success',
        text: 'Subtitles ready!',
        subText: `${subtitles.length} subtitles loaded`,
    });

    UI?.updateInlineStatus(uiElements.controlBar, { hide: true });

    // Load subtitles into sync system
    Sync?.loadSubtitles(subtitles);

    // Setup sync handlers
    Sync?.setupSyncHandlers(activeVideo, (sub) => {
        UI?.updateSubtitleOverlay(uiElements.subtitleOverlay, sub, subtitleSettings);
    });

    // Start sync loop
    Sync?.startSyncLoop(activeVideo, (sub) => {
        UI?.updateSubtitleOverlay(uiElements.subtitleOverlay, sub, subtitleSettings);
    });
}

// =============================================================================
// Messaging
// =============================================================================

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
