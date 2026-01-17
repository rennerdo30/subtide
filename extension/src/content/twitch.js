/**
 * Twitch Content Script - Main Entry Point
 * Orchestrates UI injection and subtitle translation for Twitch
 *
 * This file depends on the following modules loaded before it:
 * - youtube-constants.js (STATUS_MESSAGES, SPEAKER_COLORS, getSpeakerColor)
 * - youtube-status.js (updateStatus)
 * - youtube-subtitles.js (parseSubtitles, mergeSegments, setupSync, showOverlay, getSubtitleStyleValues)
 * - youtube-styles.js (addStyles)
 * - youtube-export.js (downloadSubtitles, exportAsSRT, exportAsVTT)
 */

// =============================================================================
// State Management
// =============================================================================

let currentChannelId = null;
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
    dualMode: false,
};

// =============================================================================
// Initialization
// =============================================================================

/**
 * Initialize on Twitch
 */
function init() {
    console.log('[Subtide] Initializing on Twitch');
    observeNavigation();
    checkForStream();
}

/**
 * Watch for Twitch SPA navigation
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
    isLive = false;
    removeTwitchUI();
    setTimeout(checkForStream, 1000);
}

/**
 * Check if on a stream or VOD page
 */
function checkForStream() {
    // Match /channel or /videos/id patterns
    const match = location.pathname.match(/^\/(\w+)(?:\/videos\/(\d+))?/);

    if (match) {
        const channelName = match[1];
        const vodId = match[2];

        // Skip non-channel pages like /directory, /settings, etc.
        const reservedPaths = ['directory', 'settings', 'wallet', 'subscriptions', 'inventory', 'messages', 'friends'];
        if (reservedPaths.includes(channelName)) return;

        const newId = vodId || channelName;
        if (newId !== currentChannelId) {
            currentChannelId = newId;
            console.log('[Subtide] Twitch:', vodId ? `VOD ${vodId}` : `Channel ${channelName}`);
            setupTwitchPage(newId, !!vodId);
        }
    }
}

// =============================================================================
// Page Setup
// =============================================================================

/**
 * Setup page with UI
 */
async function setupTwitchPage(id, isVod) {
    await waitForTwitchPlayer();

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
        dualMode: config.subtitleDualMode || false,
    };

    console.log('[Subtide] Tier:', userTier);

    // Inject UI
    injectTwitchUI();

    // Setup periodic re-injection
    setInterval(() => {
        if (!document.querySelector('.vt-twitch-container')) {
            const controls = document.querySelector('[data-a-target="player-controls"]') ||
                document.querySelector('.player-controls__right-control-group');
            if (controls) {
                console.log('[Subtide] Twitch periodic re-injection');
                injectTwitchUI();
            }
        }
    }, 2000);
}

/**
 * Wait for Twitch video player to be available
 */
function waitForTwitchPlayer() {
    return new Promise((resolve) => {
        const check = () => {
            const player = document.querySelector('.video-player') ||
                document.querySelector('[data-a-target="video-player"]');
            if (player) {
                resolve(player);
            } else {
                setTimeout(check, 500);
            }
        };
        check();
    });
}

// =============================================================================
// UI Injection
// =============================================================================

/**
 * Inject translate UI into Twitch player
 */
function injectTwitchUI() {
    if (document.querySelector('.vt-twitch-container')) return;

    // Find Twitch player controls
    const controls = document.querySelector('[data-a-target="player-controls"]') ||
        document.querySelector('.player-controls__right-control-group') ||
        document.querySelector('.video-player__default-player');

    if (!controls) {
        console.warn('[Subtide] Twitch controls not found');
        return;
    }

    const container = document.createElement('div');
    container.className = 'vt-twitch-container';
    container.style.cssText = `
        display: inline-flex;
        align-items: center;
        margin-right: 8px;
        position: relative;
    `;

    // Create translate button
    const btn = document.createElement('button');
    btn.className = 'vt-twitch-btn';
    btn.title = 'Video Translate';
    btn.style.cssText = `
        background: transparent;
        border: none;
        cursor: pointer;
        padding: 5px;
        opacity: 0.8;
        transition: opacity 0.2s;
    `;
    btn.innerHTML = `
        <svg viewBox="0 0 24 24" width="20" height="20" fill="white">
            <path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/>
        </svg>
    `;
    btn.addEventListener('mouseenter', () => btn.style.opacity = '1');
    btn.addEventListener('mouseleave', () => btn.style.opacity = '0.8');

    // Create menu
    const menu = document.createElement('div');
    menu.className = 'vt-twitch-menu';
    menu.style.cssText = `
        display: none;
        position: absolute;
        bottom: 100%;
        right: 0;
        background: rgba(24, 24, 27, 0.95);
        border-radius: 6px;
        padding: 8px 0;
        min-width: 180px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        z-index: 9999;
        margin-bottom: 8px;
    `;

    menu.innerHTML = `
        <div class="vt-twitch-menu-item" data-action="translate" style="padding: 8px 16px; color: white; cursor: pointer; display: flex; align-items: center; gap: 8px;">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/>
            </svg>
            <span>Translate Stream</span>
        </div>
        <div class="vt-twitch-menu-item" data-action="live" style="padding: 8px 16px; color: white; cursor: pointer; display: flex; align-items: center; gap: 8px;">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="#ff4444">
                <circle cx="12" cy="12" r="8"/>
            </svg>
            <span>Live Translate (Beta)</span>
        </div>
        <div style="height: 1px; background: rgba(255,255,255,0.1); margin: 8px 0;"></div>
        <div class="vt-twitch-menu-item" data-action="toggle" style="padding: 8px 16px; color: white; cursor: pointer; display: flex; align-items: center; gap: 8px;">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
            </svg>
            <span>Toggle Subtitles</span>
        </div>
    `;

    // Add hover styles
    menu.querySelectorAll('.vt-twitch-menu-item').forEach(item => {
        item.addEventListener('mouseenter', () => item.style.background = 'rgba(255,255,255,0.1)');
        item.addEventListener('mouseleave', () => item.style.background = 'transparent');
    });

    // Menu item click handlers
    menu.querySelector('[data-action="translate"]').addEventListener('click', () => {
        translateTwitchStream();
        menu.style.display = 'none';
    });

    menu.querySelector('[data-action="live"]').addEventListener('click', () => {
        startLiveTranslation();
        menu.style.display = 'none';
    });

    menu.querySelector('[data-action="toggle"]').addEventListener('click', () => {
        toggleSubtitleVisibility();
        menu.style.display = 'none';
    });

    // Toggle menu on button click
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    });

    // Close menu on outside click
    document.addEventListener('click', () => {
        menu.style.display = 'none';
    });

    container.appendChild(btn);
    container.appendChild(menu);

    // Insert into controls
    const rightControls = document.querySelector('.player-controls__right-control-group');
    if (rightControls) {
        rightControls.prepend(container);
    } else {
        controls.appendChild(container);
    }

    // Add subtitle overlay
    createTwitchOverlay();

    // Add styles
    addStyles();
}

/**
 * Create subtitle overlay for Twitch player
 */
function createTwitchOverlay() {
    if (document.querySelector('.vt-overlay')) return;

    const player = document.querySelector('.video-player') ||
        document.querySelector('[data-a-target="video-player"]');
    if (!player) return;

    const overlay = document.createElement('div');
    overlay.className = 'vt-overlay';
    overlay.innerHTML = subtitleSettings.dualMode
        ? '<div class="vt-text-original"></div><div class="vt-text-translated"></div>'
        : '<span class="vt-text"></span>';
    overlay.style.display = 'none';

    player.appendChild(overlay);
}

/**
 * Remove Twitch UI elements
 */
function removeTwitchUI() {
    document.querySelector('.vt-twitch-container')?.remove();
    document.querySelector('.vt-overlay')?.remove();
}

// =============================================================================
// Translation
// =============================================================================

/**
 * Translate Twitch stream (for VODs)
 */
async function translateTwitchStream() {
    if (isProcessing) return;

    // For VODs, we could potentially use a similar approach to YouTube
    // For live streams, we need live transcription
    alert('Twitch translation requires the Live Translate feature.\n\nClick "Live Translate (Beta)" to start real-time transcription.');
}

/**
 * Start live translation for Twitch
 */
function startLiveTranslation() {
    // Chrome Manifest V3 restriction: tabCapture requires extension invocation (popup click)
    alert('Please use the Extension Popup to start Live Translation.\n\nClick the Video Translate icon in your browser toolbar.');
}

/**
 * Toggle subtitle visibility
 */
function toggleSubtitleVisibility() {
    const overlay = document.querySelector('.vt-overlay');
    if (overlay) {
        const isVisible = overlay.style.display !== 'none';
        overlay.style.display = isVisible ? 'none' : 'block';
        console.log('[Subtide] Subtitles', isVisible ? 'hidden' : 'shown');
    }
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
 * Handle incoming live subtitles
 */
function handleLiveSubtitles(data) {
    if (!isLive) {
        isLive = true;
        const overlay = document.querySelector('.vt-overlay');
        if (overlay) overlay.style.display = 'block';
    }

    const overlay = document.querySelector('.vt-overlay');
    if (!overlay) return;

    const { text, translatedText } = data;
    const content = translatedText || text;

    const styleValues = getSubtitleStyleValues();

    if (subtitleSettings.dualMode) {
        const originalEl = overlay.querySelector('.vt-text-original');
        const translatedEl = overlay.querySelector('.vt-text-translated');
        if (originalEl) originalEl.textContent = text;
        if (translatedEl) translatedEl.textContent = translatedText || '';
    } else {
        const textEl = overlay.querySelector('.vt-text');
        if (textEl) {
            textEl.textContent = content;
            textEl.style.background = styleValues.background;
            textEl.style.color = styleValues.color || '#fff';
            textEl.style.fontSize = styleValues.fontSize;
        }
    }

    // Auto-fade if no new data
    if (window._liveSubtitleTimeout) clearTimeout(window._liveSubtitleTimeout);
    window._liveSubtitleTimeout = setTimeout(() => {
        if (subtitleSettings.dualMode) {
            const originalEl = overlay.querySelector('.vt-text-original');
            const translatedEl = overlay.querySelector('.vt-text-translated');
            if (originalEl) originalEl.textContent = '';
            if (translatedEl) translatedEl.textContent = '';
        } else {
            const textEl = overlay.querySelector('.vt-text');
            if (textEl) textEl.textContent = '';
        }
    }, 5000);
}

/**
 * Listen for messages from background script
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'live-subtitles') {
        handleLiveSubtitles(message.data);
        sendResponse({ received: true });
    } else if (message.action === 'live-stopped') {
        isLive = false;
        const overlay = document.querySelector('.vt-overlay');
        if (overlay) {
            if (subtitleSettings.dualMode) {
                const originalEl = overlay.querySelector('.vt-text-original');
                const translatedEl = overlay.querySelector('.vt-text-translated');
                if (originalEl) originalEl.textContent = '';
                if (translatedEl) translatedEl.textContent = '';
            } else {
                const textEl = overlay.querySelector('.vt-text');
                if (textEl) textEl.textContent = '';
            }
        }
        sendResponse({ received: true });
    }
    return true;
});

// =============================================================================
// Start
// =============================================================================

init();
