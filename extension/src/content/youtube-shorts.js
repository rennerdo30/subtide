/**
 * YouTube Shorts Mode - Pre-translation support
 * Translates videos before the user sees them for instant subtitle display when swiping
 */

// Inject Shorts-specific styles
function injectShortsStyles() {
    if (document.getElementById('vt-shorts-styles')) return;

    const style = document.createElement('style');
    style.id = 'vt-shorts-styles';
    style.textContent = `
        /* Widget Container - fixed to viewport with maximum z-index */
        .vt-shorts-widget {
            position: fixed !important;
            bottom: 120px !important;
            right: 12px !important;
            z-index: 2147483647 !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
            pointer-events: auto !important;
        }

        /* Compact Toggle Button */
        .vt-shorts-toggle {
            width: 40px !important;
            height: 40px !important;
            border-radius: 50% !important;
            background: rgba(15, 15, 15, 0.85) !important;
            border: 1px solid rgba(255, 255, 255, 0.08) !important;
            color: rgba(255, 255, 255, 0.7) !important;
            cursor: pointer !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            transition: all 0.15s ease !important;
            backdrop-filter: blur(12px) !important;
            -webkit-backdrop-filter: blur(12px) !important;
            box-shadow: 0 2px 12px rgba(0, 0, 0, 0.4) !important;
            position: relative !important;
            padding: 0 !important;
        }

        .vt-shorts-toggle:hover {
            background: rgba(25, 25, 25, 0.95) !important;
            color: #fff !important;
            border-color: rgba(255, 255, 255, 0.15) !important;
            transform: scale(1.05) !important;
        }

        .vt-shorts-toggle.active {
            background: rgba(16, 185, 129, 0.9) !important;
            border-color: rgba(16, 185, 129, 1) !important;
            color: #fff !important;
            box-shadow: 0 2px 16px rgba(16, 185, 129, 0.4) !important;
        }

        .vt-shorts-icon {
            width: 18px !important;
            height: 18px !important;
        }

        /* Status Dot */
        .vt-shorts-status-dot {
            position: absolute !important;
            top: 4px !important;
            right: 4px !important;
            width: 6px !important;
            height: 6px !important;
            border-radius: 50% !important;
            background: transparent !important;
            transition: all 0.2s ease !important;
        }

        .vt-shorts-toggle.active .vt-shorts-status-dot {
            background: rgba(255, 255, 255, 0.9) !important;
        }

        .vt-shorts-status-dot.translating {
            background: #fbbf24 !important;
            animation: vt-shorts-pulse 1s infinite ease-in-out !important;
        }

        @keyframes vt-shorts-pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(1.3); }
        }

        /* Dropdown Panel */
        .vt-shorts-dropdown {
            position: absolute !important;
            bottom: calc(100% + 8px) !important;
            right: 0 !important;
            width: 220px !important;
            background: rgba(18, 18, 18, 0.98) !important;
            border: 1px solid rgba(255, 255, 255, 0.08) !important;
            border-radius: 12px !important;
            overflow: hidden !important;
            opacity: 0 !important;
            visibility: hidden !important;
            transform: translateY(8px) scale(0.95) !important;
            transition: all 0.15s ease !important;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5) !important;
            backdrop-filter: blur(16px) !important;
            -webkit-backdrop-filter: blur(16px) !important;
        }

        .vt-shorts-dropdown.show {
            opacity: 1 !important;
            visibility: visible !important;
            transform: translateY(0) scale(1) !important;
        }

        /* Dropdown Header */
        .vt-shorts-dropdown-header {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            padding: 12px 14px !important;
            border-bottom: 1px solid rgba(255, 255, 255, 0.06) !important;
        }

        .vt-shorts-dropdown-title {
            font-size: 11px !important;
            font-weight: 600 !important;
            text-transform: uppercase !important;
            letter-spacing: 0.5px !important;
            color: rgba(255, 255, 255, 0.5) !important;
        }

        /* Power Toggle */
        .vt-shorts-power {
            width: 28px !important;
            height: 28px !important;
            border-radius: 6px !important;
            background: rgba(255, 255, 255, 0.06) !important;
            border: none !important;
            color: rgba(255, 255, 255, 0.4) !important;
            cursor: pointer !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            transition: all 0.15s ease !important;
            padding: 0 !important;
        }

        .vt-shorts-power:hover {
            background: rgba(255, 255, 255, 0.1) !important;
            color: rgba(255, 255, 255, 0.7) !important;
        }

        .vt-shorts-power.active {
            background: rgba(16, 185, 129, 0.2) !important;
            color: #10b981 !important;
        }

        .vt-shorts-power svg {
            width: 16px !important;
            height: 16px !important;
        }

        /* Language Grid */
        .vt-shorts-lang-grid {
            display: grid !important;
            grid-template-columns: repeat(3, 1fr) !important;
            gap: 4px !important;
            padding: 10px !important;
        }

        .vt-shorts-lang-btn {
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 2px !important;
            padding: 8px 4px !important;
            background: transparent !important;
            border: 1px solid transparent !important;
            border-radius: 8px !important;
            color: rgba(255, 255, 255, 0.7) !important;
            cursor: pointer !important;
            transition: all 0.12s ease !important;
        }

        .vt-shorts-lang-btn:hover {
            background: rgba(255, 255, 255, 0.06) !important;
            color: #fff !important;
        }

        .vt-shorts-lang-btn.selected {
            background: rgba(16, 185, 129, 0.15) !important;
            border-color: rgba(16, 185, 129, 0.4) !important;
            color: #10b981 !important;
        }

        .vt-shorts-lang-flag {
            font-size: 10px !important;
            font-weight: 700 !important;
            letter-spacing: 0.5px !important;
        }

        .vt-shorts-lang-name {
            font-size: 9px !important;
            opacity: 0.6 !important;
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            max-width: 58px !important;
        }

        /* Settings Row */
        .vt-shorts-settings-row {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            padding: 10px 14px !important;
            border-top: 1px solid rgba(255, 255, 255, 0.06) !important;
        }

        .vt-shorts-settings-label {
            font-size: 11px !important;
            color: rgba(255, 255, 255, 0.5) !important;
            font-weight: 500 !important;
        }

        .vt-shorts-size-picker {
            display: flex !important;
            gap: 4px !important;
        }

        .vt-shorts-size-btn {
            width: 28px !important;
            height: 24px !important;
            border-radius: 4px !important;
            background: rgba(255, 255, 255, 0.06) !important;
            border: 1px solid transparent !important;
            color: rgba(255, 255, 255, 0.5) !important;
            font-size: 10px !important;
            font-weight: 600 !important;
            cursor: pointer !important;
            transition: all 0.12s ease !important;
            padding: 0 !important;
        }

        .vt-shorts-size-btn:hover {
            background: rgba(255, 255, 255, 0.1) !important;
            color: rgba(255, 255, 255, 0.8) !important;
        }

        .vt-shorts-size-btn.selected {
            background: rgba(16, 185, 129, 0.2) !important;
            border-color: rgba(16, 185, 129, 0.4) !important;
            color: #10b981 !important;
        }

        /* Footer */
        .vt-shorts-dropdown-footer {
            padding: 8px 14px !important;
            border-top: 1px solid rgba(255, 255, 255, 0.06) !important;
            background: rgba(0, 0, 0, 0.2) !important;
        }

        .vt-shorts-queue-status {
            font-size: 10px !important;
            color: rgba(255, 255, 255, 0.4) !important;
        }

        .vt-shorts-queue-status.active {
            color: #10b981 !important;
        }

        /* Subtitle Overlay - draggable, appended to body for proper stacking */
        .vt-shorts-overlay {
            position: fixed !important;
            bottom: 180px !important;
            left: 50% !important;
            transform: translateX(-50%) !important;
            max-width: 90% !important;
            z-index: 2147483647 !important;
            text-align: center !important;
            pointer-events: auto !important;
            cursor: grab !important;
            user-select: none !important;
            -webkit-user-select: none !important;
            touch-action: none !important;
        }

        .vt-shorts-overlay.dragging {
            cursor: grabbing !important;
            opacity: 0.9 !important;
        }

        .vt-shorts-overlay .vt-text {
            display: inline-block !important;
            background: rgba(0, 0, 0, 0.9) !important;
            color: #fff !important;
            padding: 14px 24px !important;
            border-radius: 10px !important;
            font-size: 28px !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
            line-height: 1.4 !important;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8) !important;
            max-width: 100% !important;
            word-wrap: break-word !important;
            font-weight: 600 !important;
            letter-spacing: 0.02em !important;
            pointer-events: auto !important;
        }

        /* Translating Status */
        .vt-shorts-status {
            position: fixed !important;
            bottom: 170px !important;
            right: 12px !important;
            padding: 6px 10px !important;
            background: rgba(18, 18, 18, 0.9) !important;
            border-radius: 6px !important;
            color: #10b981 !important;
            font-size: 11px !important;
            font-weight: 500 !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
            z-index: 2147483646 !important;
            display: flex !important;
            align-items: center !important;
            gap: 6px !important;
            backdrop-filter: blur(12px) !important;
            -webkit-backdrop-filter: blur(12px) !important;
            border: 1px solid rgba(255, 255, 255, 0.06) !important;
        }

        .vt-shorts-status::before {
            content: '' !important;
            width: 5px !important;
            height: 5px !important;
            background: #10b981 !important;
            border-radius: 50% !important;
            animation: vt-shorts-pulse 1s infinite ease-in-out !important;
        }

        /* Mobile */
        @media (max-width: 600px) {
            .vt-shorts-widget {
                bottom: 100px !important;
                right: 8px !important;
            }
            .vt-shorts-toggle {
                width: 36px !important;
                height: 36px !important;
            }
            .vt-shorts-icon {
                width: 16px !important;
                height: 16px !important;
            }
            .vt-shorts-dropdown {
                width: 200px !important;
            }
            .vt-shorts-overlay {
                bottom: 150px !important;
            }
            .vt-shorts-overlay .vt-text {
                font-size: 15px !important;
                padding: 8px 14px !important;
            }
        }
    `;
    document.head.appendChild(style);
}

// State
let shortsEnabled = false;
let interceptorSetup = false;  // Prevent duplicate interceptor injection

// Cleanup references (to prevent memory leaks)
let queueStatusInterval = null;
let cleanupListeners = [];  // Store listener references for cleanup
let currentShortsVideoId = null;
let scrollObserver = null;
const PRELOAD_COUNT = 20;  // Translate many videos ahead for instant playback

/**
 * Detect if on Shorts page
 */
function isShortsPage() {
    return window.location.pathname.startsWith('/shorts/');
}

/**
 * Get current Shorts video ID from URL
 */
function getCurrentShortsId() {
    const path = window.location.pathname;
    if (path.startsWith('/shorts/')) {
        return path.split('/shorts/')[1]?.split(/[/?]/)[0];
    }
    return null;
}

/**
 * Find all video IDs in the Shorts feed
 * Aggressively detects ALL videos YouTube has pre-loaded
 */
function detectShortsInFeed() {
    const videoIds = new Set();

    // Method 1: From ytd-reel-video-renderer elements (main player reels)
    document.querySelectorAll('ytd-reel-video-renderer').forEach(reel => {
        // Try video-id attribute
        const attrId = reel.getAttribute('video-id');
        if (attrId) {
            videoIds.add(attrId);
        }

        // Try __data property (YouTube's internal data)
        try {
            const data = reel.__data || reel.data;
            if (data?.videoId) videoIds.add(data.videoId);
            if (data?.command?.reelWatchEndpoint?.videoId) {
                videoIds.add(data.command.reelWatchEndpoint.videoId);
            }
        } catch (e) {}

        // Try finding from href in the reel
        const links = reel.querySelectorAll('a[href*="/shorts/"]');
        links.forEach(link => {
            const match = link.href.match(/\/shorts\/([^/?]+)/);
            if (match) videoIds.add(match[1]);
        });
    });

    // Method 2: From shorts-video elements (newer YouTube UI)
    document.querySelectorAll('ytd-shorts-video-cell-view-model, ytd-shorts').forEach(cell => {
        const link = cell.querySelector('a[href*="/shorts/"]');
        if (link) {
            const match = link.href.match(/\/shorts\/([^/?]+)/);
            if (match) videoIds.add(match[1]);
        }
        // Try internal data
        try {
            const data = cell.__data || cell.data;
            if (data?.videoId) videoIds.add(data.videoId);
        } catch (e) {}
    });

    // Method 3: From video elements - extract from various URL patterns
    document.querySelectorAll('video').forEach(video => {
        const src = video.src || video.currentSrc || '';
        // YouTube video URLs - multiple patterns
        let match = src.match(/\/(?:v|embed|shorts)\/([a-zA-Z0-9_-]{11})/);
        if (match) videoIds.add(match[1]);

        // Also check for videoplayback URLs with video ID param
        match = src.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
        if (match) videoIds.add(match[1]);
    });

    // Method 4: From any shorts links on the page
    document.querySelectorAll('a[href*="/shorts/"]').forEach(link => {
        const match = link.href.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
        if (match) {
            videoIds.add(match[1]);
        }
    });

    // Method 5: From ytd-reel-item-renderer (sidebar/related)
    document.querySelectorAll('ytd-reel-item-renderer').forEach(item => {
        const link = item.querySelector('a[href*="/shorts/"]');
        if (link) {
            const match = link.href.match(/\/shorts\/([^/?]+)/);
            if (match) videoIds.add(match[1]);
        }
    });

    // Method 6: From ytd-engagement-panel (related videos panel)
    document.querySelectorAll('ytd-engagement-panel-section-list-renderer a[href*="/shorts/"]').forEach(link => {
        const match = link.href.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
        if (match) videoIds.add(match[1]);
    });

    // Method 7: Look for player elements with data attributes
    document.querySelectorAll('[data-video-id]').forEach(el => {
        const id = el.getAttribute('data-video-id');
        if (id && id.length === 11) videoIds.add(id);
    });

    // Method 8: Get current video from URL
    const currentId = getCurrentShortsId();
    if (currentId) videoIds.add(currentId);

    // Method 9: Try to find Shorts player app data
    try {
        const ytdApp = document.querySelector('ytd-app');
        if (ytdApp && ytdApp.__data) {
            const appData = ytdApp.__data;
            // Navigate through YouTube's data structure
            const playerData = appData.data?.playerResponse;
            if (playerData?.videoDetails?.videoId) {
                videoIds.add(playerData.videoDetails.videoId);
            }
        }
    } catch (e) {}

    // Method 10: Look for sequence container with video data
    try {
        const sequenceProvider = document.querySelector('ytd-shorts, #shorts-container');
        if (sequenceProvider) {
            // YouTube Shorts uses a sequence of videos
            const items = sequenceProvider.querySelectorAll('ytd-reel-video-renderer, [video-id]');
            items.forEach(item => {
                const id = item.getAttribute('video-id');
                if (id) videoIds.add(id);
            });
        }
    } catch (e) {}

    // Method 11: From cached responses (if we've intercepted them)
    if (window._vtShortsVideoIds) {
        window._vtShortsVideoIds.forEach(id => videoIds.add(id));
    }

    // Log for debugging
    if (videoIds.size > 0) {
        vtLog.debug(`[Shorts] Detected ${videoIds.size} videos:`, Array.from(videoIds));
    } else {
        vtLog.warn('[Shorts] No videos detected in feed!');
    }

    return Array.from(videoIds);
}

/**
 * Inject the interceptor script into page context (only once per page load)
 */
function injectInterceptorScript() {
    // Only inject once per page
    if (interceptorSetup) return;
    if (document.getElementById('vt-shorts-interceptor')) return;

    interceptorSetup = true;

    // Create script element with src pointing to extension resource
    const script = document.createElement('script');
    script.id = 'vt-shorts-interceptor';
    script.src = chrome.runtime.getURL('src/content/shorts-interceptor.js');

    // Inject into page
    (document.head || document.documentElement).appendChild(script);
    vtLog.info('[Shorts] Interceptor script injected');
}

/**
 * Set up message listener for intercepted video IDs
 * Called each time we enter Shorts mode (listener is cleaned up when leaving)
 */
function setupInterceptorListener() {
    // Listen for intercepted videos from page context via postMessage
    const messageHandler = (e) => {
        // Only accept messages from same window
        if (e.source !== window) return;
        if (e.data?.type !== 'vt-shorts-videos') return;

        const ids = e.data.ids;

        // Security: Validate the data
        if (!Array.isArray(ids)) return;
        if (ids.length === 0 || ids.length > 100) return;

        // Validate each ID is exactly 11 chars alphanumeric (YouTube video ID format)
        const validIds = ids.filter(id =>
            typeof id === 'string' &&
            /^[a-zA-Z0-9_-]{11}$/.test(id)
        );

        if (validIds.length > 0) {
            vtLog.info('[Shorts] Received', validIds.length, 'valid IDs via postMessage');
            queueShortsForTranslation(validIds);
        }
    };

    window.addEventListener('message', messageHandler);
    cleanupListeners.push(() => window.removeEventListener('message', messageHandler));

    vtLog.debug('[Shorts] Interceptor message listener set up');
}

/**
 * Intercept YouTube's fetch to capture upcoming video IDs
 * Must inject into page context since content scripts can't intercept page fetch
 * Uses external script file to bypass CSP
 */
function setupShortsInterceptor() {
    injectInterceptorScript();
    setupInterceptorListener();
}

/**
 * Queue videos for pre-translation via service worker
 */
async function queueShortsForTranslation(videoIds) {
    const targetLang = shortsTargetLang || 'en';

    vtLog.debug(`[Shorts] Queuing ${videoIds.length} videos for pre-translation to ${targetLang}`);

    for (let i = 0; i < videoIds.length; i++) {
        const videoId = videoIds[i];
        try {
            await chrome.runtime.sendMessage({
                action: 'queueShortsTranslation',
                videoId,
                targetLang,
                priority: i  // Lower = higher priority
            });
        } catch (e) {
            vtLog.warn(`[Shorts] Failed to queue ${videoId}:`, e.message);
        }
    }
}

// Current target language for Shorts
let shortsTargetLang = 'en';

// Subtitle size setting for Shorts - sizes optimized for vertical video
let shortsSubtitleSize = 'medium';
const SHORTS_SUBTITLE_SIZES = [
    { id: 'small', label: 'S', size: '20px' },
    { id: 'medium', label: 'M', size: '28px' },
    { id: 'large', label: 'L', size: '38px' },
    { id: 'xlarge', label: 'XL', size: '48px' },
];

// Available languages for Shorts translation
const SHORTS_LANGUAGES = [
    { code: 'en', name: 'English', flag: 'EN' },
    { code: 'es', name: 'Espa\u00f1ol', flag: 'ES' },
    { code: 'fr', name: 'Fran\u00e7ais', flag: 'FR' },
    { code: 'de', name: 'Deutsch', flag: 'DE' },
    { code: 'ja', name: '\u65e5\u672c\u8a9e', flag: 'JA' },
    { code: 'ko', name: '\ud55c\uad6d\uc5b4', flag: 'KO' },
    { code: 'zh-CN', name: '\u4e2d\u6587', flag: 'ZH' },
    { code: 'pt', name: 'Portugu\u00eas', flag: 'PT' },
    { code: 'ru', name: '\u0420\u0443\u0441\u0441\u043a\u0438\u0439', flag: 'RU' },
    { code: 'it', name: 'Italiano', flag: 'IT' },
    { code: 'ar', name: '\u0627\u0644\u0639\u0631\u0628\u064a\u0629', flag: 'AR' },
    { code: 'hi', name: '\u0939\u093f\u0928\u094d\u0926\u0940', flag: 'HI' },
];

/**
 * Create floating toggle button for Shorts with language dropdown
 */
async function createShortsToggle() {
    if (document.querySelector('.vt-shorts-widget')) return null;

    // Load saved preferences FIRST before building UI
    const result = await chrome.storage.local.get([
        'defaultLanguage', 'shortsTargetLang', 'shortsSubtitleSize', 'shortsSubtitlePosition', 'shortsEnabled'
    ]);
    shortsTargetLang = result.shortsTargetLang || result.defaultLanguage || 'en';
    shortsSubtitleSize = result.shortsSubtitleSize || 'medium';
    subtitlePosition = result.shortsSubtitlePosition || null;
    shortsEnabled = result.shortsEnabled || false;

    vtLog.debug('[Shorts] Loaded settings:', { shortsTargetLang, shortsSubtitleSize, shortsEnabled });

    // Main container
    const widget = document.createElement('div');
    widget.className = 'vt-shorts-widget';

    // Main toggle button - compact icon only
    const toggle = document.createElement('button');
    toggle.className = 'vt-shorts-toggle';
    toggle.innerHTML = `
        <svg class="vt-shorts-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8H4.69c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/>
        </svg>
        <span class="vt-shorts-status-dot"></span>
    `;
    toggle.setAttribute('aria-label', 'Toggle Shorts Translation');
    toggle.setAttribute('aria-expanded', 'false');

    // Update visual state based on loaded settings
    if (shortsEnabled) {
        toggle.classList.add('active');
    }

    // Dropdown panel - now uses loaded settings
    const dropdown = document.createElement('div');
    dropdown.className = 'vt-shorts-dropdown';
    dropdown.innerHTML = `
        <div class="vt-shorts-dropdown-header">
            <span class="vt-shorts-dropdown-title">Translate to</span>
            <button class="vt-shorts-power ${shortsEnabled ? 'active' : ''}" aria-label="Toggle translation">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M13 3h-2v10h2V3zm4.83 2.17l-1.42 1.42C17.99 7.86 19 9.81 19 12c0 3.87-3.13 7-7 7s-7-3.13-7-7c0-2.19 1.01-4.14 2.58-5.42L6.17 5.17C4.23 6.82 3 9.26 3 12c0 4.97 4.03 9 9 9s9-4.03 9-9c0-2.74-1.23-5.18-3.17-6.83z"/>
                </svg>
            </button>
        </div>
        <div class="vt-shorts-lang-grid">
            ${SHORTS_LANGUAGES.map(lang => `
                <button class="vt-shorts-lang-btn ${lang.code === shortsTargetLang ? 'selected' : ''}"
                        data-lang="${lang.code}"
                        title="${lang.name}">
                    <span class="vt-shorts-lang-flag">${lang.flag}</span>
                    <span class="vt-shorts-lang-name">${lang.name}</span>
                </button>
            `).join('')}
        </div>
        <div class="vt-shorts-settings-row">
            <span class="vt-shorts-settings-label">Size</span>
            <div class="vt-shorts-size-picker">
                ${SHORTS_SUBTITLE_SIZES.map(s => `
                    <button class="vt-shorts-size-btn ${s.id === shortsSubtitleSize ? 'selected' : ''}"
                            data-size="${s.id}"
                            title="${s.id}">
                        ${s.label}
                    </button>
                `).join('')}
            </div>
        </div>
        <div class="vt-shorts-dropdown-footer">
            <span class="vt-shorts-queue-status"></span>
        </div>
    `;

    widget.appendChild(toggle);
    widget.appendChild(dropdown);

    // Toggle dropdown on click
    let dropdownOpen = false;
    toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownOpen = !dropdownOpen;
        dropdown.classList.toggle('show', dropdownOpen);
        toggle.setAttribute('aria-expanded', dropdownOpen ? 'true' : 'false');
    });

    // Power button - toggle translation on/off
    const powerBtn = dropdown.querySelector('.vt-shorts-power');
    powerBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        shortsEnabled = !shortsEnabled;
        toggle.classList.toggle('active', shortsEnabled);
        powerBtn.classList.toggle('active', shortsEnabled);

        if (shortsEnabled) {
            startShortsMode();
        } else {
            stopShortsMode();
        }

        await chrome.storage.local.set({ shortsEnabled });
        updateQueueStatus();
    });

    // Language selection
    dropdown.querySelectorAll('.vt-shorts-lang-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const lang = btn.dataset.lang;
            shortsTargetLang = lang;

            // Update UI
            dropdown.querySelectorAll('.vt-shorts-lang-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');

            // Save preference
            await chrome.storage.local.set({ shortsTargetLang: lang, defaultLanguage: lang });

            // If enabled, restart with new language
            if (shortsEnabled) {
                stopShortsMode();
                startShortsMode();
            }

            vtLog.debug('[Shorts] Language changed to:', lang);
        });
    });

    // Subtitle size selection
    dropdown.querySelectorAll('.vt-shorts-size-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const size = btn.dataset.size;
            shortsSubtitleSize = size;

            // Update UI
            dropdown.querySelectorAll('.vt-shorts-size-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');

            // Save preference
            await chrome.storage.local.set({ shortsSubtitleSize: size });

            // Apply size immediately
            applyShortsSubtitleSize(size);

            vtLog.debug('[Shorts] Subtitle size changed to:', size);
        });
    });

    // Close dropdown when clicking outside (store for cleanup)
    const clickOutsideHandler = (e) => {
        if (!widget.contains(e.target) && dropdownOpen) {
            dropdownOpen = false;
            dropdown.classList.remove('show');
            toggle.setAttribute('aria-expanded', 'false');
        }
    };
    document.addEventListener('click', clickOutsideHandler);
    cleanupListeners.push(() => document.removeEventListener('click', clickOutsideHandler));

    // Close on Escape (store for cleanup)
    const escapeHandler = (e) => {
        if (e.key === 'Escape' && dropdownOpen) {
            dropdownOpen = false;
            dropdown.classList.remove('show');
            toggle.setAttribute('aria-expanded', 'false');
        }
    };
    document.addEventListener('keydown', escapeHandler);
    cleanupListeners.push(() => document.removeEventListener('keydown', escapeHandler));

    // Append to body for fixed positioning
    document.body.appendChild(widget);
    vtLog.debug('[Shorts] Widget created');

    // Start queue status updates (store reference for cleanup)
    updateQueueStatus();
    if (queueStatusInterval) clearInterval(queueStatusInterval);
    queueStatusInterval = setInterval(updateQueueStatus, 2000);

    return widget;
}

/**
 * Update queue status in dropdown
 */
async function updateQueueStatus() {
    const statusEl = document.querySelector('.vt-shorts-queue-status');
    const dotEl = document.querySelector('.vt-shorts-status-dot');
    if (!statusEl) return;

    try {
        const response = await chrome.runtime.sendMessage({ action: 'getShortsQueueStatus' });
        if (response) {
            const { queueLength, cacheSize, activeTranslations } = response;

            if (activeTranslations > 0) {
                statusEl.textContent = `Translating ${activeTranslations} video${activeTranslations > 1 ? 's' : ''}...`;
                statusEl.classList.add('active');
                if (dotEl) dotEl.classList.add('translating');
            } else if (queueLength > 0) {
                statusEl.textContent = `${queueLength} in queue`;
                statusEl.classList.add('active');
                if (dotEl) dotEl.classList.remove('translating');
            } else if (shortsEnabled) {
                statusEl.textContent = `${cacheSize} cached`;
                statusEl.classList.remove('active');
                if (dotEl) dotEl.classList.remove('translating');
            } else {
                statusEl.textContent = 'Ready';
                statusEl.classList.remove('active');
                if (dotEl) dotEl.classList.remove('translating');
            }
        }
    } catch (e) {
        // Ignore errors
    }
}

/**
 * Apply subtitle size to Shorts overlay
 */
function applyShortsSubtitleSize(sizeId) {
    const sizeConfig = SHORTS_SUBTITLE_SIZES.find(s => s.id === sizeId);
    if (!sizeConfig) return;

    const overlay = document.querySelector('.vt-shorts-overlay .vt-text');
    if (overlay) {
        overlay.style.fontSize = sizeConfig.size;
    }

    // Also update CSS variable for future overlays
    document.documentElement.style.setProperty('--vt-shorts-subtitle-size', sizeConfig.size);
}

/**
 * Show translating status indicator
 */
function showTranslatingStatus() {
    let status = document.querySelector('.vt-shorts-status');
    if (!status) {
        status = document.createElement('div');
        status.className = 'vt-shorts-status';
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        document.body.appendChild(status);
    }
    status.textContent = chrome.i18n.getMessage('translating') || 'Translating...';
    status.style.display = 'block';
}

/**
 * Hide translating status indicator
 */
function hideTranslatingStatus() {
    const status = document.querySelector('.vt-shorts-status');
    if (status) {
        status.style.display = 'none';
    }
}

// Saved subtitle position
let subtitlePosition = null;

/**
 * Make an element draggable
 * Returns a cleanup function to remove event listeners
 */
function makeDraggable(element) {
    let isDragging = false;
    let startX, startY, startLeft, startBottom;

    const onMouseDown = (e) => {
        // Only left click
        if (e.button !== 0) return;

        isDragging = true;
        element.classList.add('dragging');

        // Get current position
        const rect = element.getBoundingClientRect();
        startX = e.clientX;
        startY = e.clientY;

        // Calculate current left/bottom from transform
        const style = window.getComputedStyle(element);
        startLeft = rect.left + rect.width / 2;  // Center point
        startBottom = window.innerHeight - rect.bottom;

        e.preventDefault();
        e.stopPropagation();
    };

    const onMouseMove = (e) => {
        if (!isDragging) return;

        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;

        // New position (centered)
        const newLeft = startLeft + deltaX;
        const newBottom = startBottom - deltaY;

        // Apply new position
        element.style.left = `${newLeft}px`;
        element.style.bottom = `${Math.max(20, newBottom)}px`;
        element.style.transform = 'translateX(-50%)';

        e.preventDefault();
    };

    const onMouseUp = () => {
        if (!isDragging) return;

        isDragging = false;
        element.classList.remove('dragging');

        // Save position
        subtitlePosition = {
            left: element.style.left,
            bottom: element.style.bottom
        };

        // Persist to storage
        chrome.storage.local.set({ shortsSubtitlePosition: subtitlePosition });
    };

    const onTouchMove = (e) => {
        if (isDragging && e.touches.length === 1) {
            const touch = e.touches[0];
            onMouseMove({ clientX: touch.clientX, clientY: touch.clientY, preventDefault: () => e.preventDefault() });
        }
    };

    const onDblClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        element.style.left = '50%';
        element.style.bottom = '180px';
        element.style.transform = 'translateX(-50%)';
        subtitlePosition = null;
        chrome.storage.local.remove('shortsSubtitlePosition');
        vtLog.debug('[Shorts] Subtitle position reset');
    };

    const onTouchStart = (e) => {
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            onMouseDown({ button: 0, clientX: touch.clientX, clientY: touch.clientY, preventDefault: () => {}, stopPropagation: () => {} });
        }
    };

    // Add element-level listeners
    element.addEventListener('mousedown', onMouseDown);
    element.addEventListener('dblclick', onDblClick);
    element.addEventListener('touchstart', onTouchStart, { passive: false });

    // Add document-level listeners
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onMouseUp);

    // Return cleanup function to remove all document-level listeners
    return function cleanup() {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', onMouseUp);
    };
}

/**
 * Show subtitles overlay for Shorts
 */
function showShortsSubtitles(subtitles) {
    hideTranslatingStatus();

    // Get or create overlay - always append to body for proper z-index and dragging
    let overlay = document.querySelector('.vt-shorts-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'vt-shorts-overlay';
        overlay.setAttribute('aria-live', 'polite');

        // Restore saved position if available
        if (subtitlePosition) {
            overlay.style.left = subtitlePosition.left;
            overlay.style.bottom = subtitlePosition.bottom;
            overlay.style.transform = 'translateX(-50%)';
        }

        // Always append to body for proper stacking and dragging
        document.body.appendChild(overlay);

        // Make it draggable and store cleanup function
        const dragCleanup = makeDraggable(overlay);
        cleanupListeners.push(dragCleanup);
        vtLog.debug('[Shorts] Created draggable overlay');
    }

    // Start subtitle sync using existing subtitles module
    if (typeof window.startSubtitleSync === 'function') {
        window.startSubtitleSync(subtitles, overlay);
        vtLog.debug('[Shorts] Started subtitle sync with', subtitles.length, 'subtitles');

        // Apply saved subtitle size after a short delay (wait for text element to be created)
        setTimeout(() => {
            applyShortsSubtitleSize(shortsSubtitleSize);
        }, 50);
    } else {
        vtLog.warn('[Shorts] startSubtitleSync not available');
    }
}

/**
 * Hide subtitles overlay
 */
function hideShortsSubtitles() {
    hideTranslatingStatus();

    // Stop subtitle sync
    if (typeof window.stopSubtitleSync === 'function') {
        window.stopSubtitleSync();
    }

    const overlay = document.querySelector('.vt-shorts-overlay');
    if (overlay) {
        overlay.remove();
    }
}

/**
 * Display cached subtitles for a video (or show loading state)
 */
async function displayCachedSubtitles(videoId) {
    if (!videoId) return;

    vtLog.debug('[Shorts] Checking cache for:', videoId);

    try {
        const response = await chrome.runtime.sendMessage({
            action: 'getShortsCache',
            videoId
        });

        if (response?.subtitles && response.subtitles.length > 0) {
            vtLog.debug('[Shorts] Cache hit! Displaying subtitles');
            showShortsSubtitles(response.subtitles);
        } else {
            vtLog.debug('[Shorts] Cache miss, showing translating status');
            hideShortsSubtitles();
            showTranslatingStatus();

            // Queue this video for translation if not already queued
            queueShortsForTranslation([videoId]);
        }
    } catch (e) {
        vtLog.warn('[Shorts] Error getting cached subtitles:', e.message);
        hideShortsSubtitles();
    }
}

/**
 * Trigger a scan in the page context
 */
function triggerPageScan() {
    // Send message to interceptor script in page context
    window.postMessage({ type: 'vt-trigger-scan' }, '*');
}

/**
 * Start Shorts mode - begin pre-translation
 */
function startShortsMode() {
    vtLog.info('[Shorts] Mode enabled');

    // Trigger a scan in the page context to capture embedded video IDs
    triggerPageScan();

    // Detect from DOM
    const videoIds = detectShortsInFeed();
    if (videoIds.length > 0) {
        // Current video first, then all others
        const currentId = getCurrentShortsId();
        const orderedIds = currentId
            ? [currentId, ...videoIds.filter(id => id !== currentId)]
            : videoIds;
        // Queue all detected videos for translation
        queueShortsForTranslation(orderedIds);
        vtLog.info(`[Shorts] Queued ${orderedIds.length} videos for pre-translation`);
    }

    // Watch for navigation/scroll changes
    observeShortsScroll();

    // Display subtitles for current video if cached
    const currentId = getCurrentShortsId();
    if (currentId) {
        currentShortsVideoId = currentId;
        displayCachedSubtitles(currentId);
    }

    // Periodically re-scan feed for new videos (YouTube loads more as you scroll)
    startFeedScanner();

    // Trigger another scan after a delay to catch late-loaded data
    setTimeout(triggerPageScan, 1500);
}

// Feed scanner interval
let feedScannerInterval = null;

/**
 * Start periodic feed scanning to detect newly loaded videos
 */
function startFeedScanner() {
    if (feedScannerInterval) return;

    feedScannerInterval = setInterval(() => {
        if (!shortsEnabled) return;

        const videoIds = detectShortsInFeed();
        if (videoIds.length > 0) {
            queueShortsForTranslation(videoIds);
        }
    }, 3000);  // Scan every 3 seconds for new videos
}

/**
 * Stop feed scanner
 */
function stopFeedScanner() {
    if (feedScannerInterval) {
        clearInterval(feedScannerInterval);
        feedScannerInterval = null;
    }
}

/**
 * Stop Shorts mode
 */
function stopShortsMode() {
    vtLog.info('[Shorts] Mode disabled');
    hideShortsSubtitles();
    hideTranslatingStatus();
    disconnectScrollObserver();
    stopFeedScanner();
    currentShortsVideoId = null;

    // Clean up queue status interval
    if (queueStatusInterval) {
        clearInterval(queueStatusInterval);
        queueStatusInterval = null;
    }
}

/**
 * Full cleanup when leaving Shorts page
 */
function cleanupShortsPage() {
    stopShortsMode();

    // Remove all stored event listeners
    cleanupListeners.forEach(cleanup => cleanup());
    cleanupListeners = [];

    // Remove DOM elements
    document.querySelector('.vt-shorts-widget')?.remove();
    document.querySelector('.vt-shorts-overlay')?.remove();
    document.querySelector('.vt-shorts-status')?.remove();

    vtLog.debug('[Shorts] Full cleanup completed');
}

/**
 * Observe scroll/navigation to detect new Shorts
 */
function observeShortsScroll() {
    if (scrollObserver) return;

    // Use URL polling as a reliable backup
    let lastUrl = location.href;
    const urlCheckInterval = setInterval(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            checkShortsChange();
        }
    }, 200);

    // Also observe DOM changes for immediate detection
    scrollObserver = new MutationObserver(() => {
        checkShortsChange();
    });

    scrollObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['is-active', 'video-id']
    });

    // Store interval reference for cleanup
    scrollObserver._urlInterval = urlCheckInterval;

    vtLog.debug('[Shorts] Scroll observer started');
}

/**
 * Check if current Short has changed
 */
function checkShortsChange() {
    if (!shortsEnabled) return;

    const newId = getCurrentShortsId();
    if (newId && newId !== currentShortsVideoId) {
        vtLog.debug('[Shorts] Video changed:', currentShortsVideoId, '->', newId);
        currentShortsVideoId = newId;
        onShortsChanged(newId);
    }
}

/**
 * Disconnect scroll observer
 */
function disconnectScrollObserver() {
    if (scrollObserver) {
        scrollObserver.disconnect();
        if (scrollObserver._urlInterval) {
            clearInterval(scrollObserver._urlInterval);
        }
        scrollObserver = null;
        vtLog.debug('[Shorts] Scroll observer disconnected');
    }
}

/**
 * When current Shorts video changes
 */
function onShortsChanged(videoId) {
    vtLog.debug('[Shorts] Changed to:', videoId);

    // Display cached subtitles if available
    displayCachedSubtitles(videoId);

    // Queue ALL remaining videos for pre-translation
    const feedIds = detectShortsInFeed();
    const currentIndex = feedIds.indexOf(videoId);

    if (currentIndex !== -1) {
        // Queue all videos after current one
        const nextIds = feedIds.slice(currentIndex + 1);
        if (nextIds.length > 0) {
            queueShortsForTranslation(nextIds);
            vtLog.debug(`[Shorts] Queued ${nextIds.length} upcoming videos`);
        }
    }
}

/**
 * Handle translation ready message from service worker
 */
function handleTranslationReady(videoId, subtitles) {
    vtLog.debug('[Shorts] Translation ready for:', videoId);

    // Only display if this is the current video
    if (videoId === currentShortsVideoId && shortsEnabled) {
        showShortsSubtitles(subtitles);
    }
}

/**
 * Initialize Shorts mode
 */
async function initShorts() {
    if (!isShortsPage()) return;

    // Setup fetch interceptor to capture upcoming video IDs
    setupShortsInterceptor();

    // Inject styles first
    injectShortsStyles();

    vtLog.debug('[Shorts] Initializing on Shorts page');

    // Create toggle button (this loads settings internally)
    await createShortsToggle();

    // Auto-start if previously enabled (shortsEnabled is set by createShortsToggle)
    if (shortsEnabled) {
        startShortsMode();
    }
}

/**
 * Listen for messages from service worker
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'shortsTranslationReady') {
        handleTranslationReady(message.videoId, message.subtitles);
        sendResponse({ received: true });
    }
    return false;
});

// Listen for URL changes (YouTube SPA navigation)
let pageLastUrl = location.href;  // Renamed to avoid shadowing local lastUrl in observeShortsScroll
const urlObserver = new MutationObserver(() => {
    if (location.href !== pageLastUrl) {
        pageLastUrl = location.href;

        if (isShortsPage()) {
            // Delay slightly to let YouTube initialize
            setTimeout(initShorts, 300);
        } else {
            // Left Shorts page - full cleanup
            cleanupShortsPage();
        }
    }
});

urlObserver.observe(document, { subtree: true, childList: true });

// Initial check - interceptor is set up inside initShorts() only for Shorts pages
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initShorts);
} else {
    initShorts();
}

vtLog.debug('[Shorts] Script loaded');
