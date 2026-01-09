/**
 * Generic Content Script - Supports ANY platform
 * Detects <video> elements and HLS streams.
 */

// =============================================================================
// Constants
// =============================================================================

/** Minimum video dimensions (px) to consider as main video */
const MIN_VIDEO_SIZE = 200;

/** Subtitle windowing - enable for lists larger than this */
const SUBTITLE_WINDOW_THRESHOLD = 800;

/** Number of subtitles to keep in active window */
const SUBTITLE_WINDOW_SIZE = 200;

/** Update window when within this many items of edge */
const SUBTITLE_WINDOW_EDGE_THRESHOLD = 40;

/** Minimum time between window updates (ms) */
const SUBTITLE_WINDOW_UPDATE_INTERVAL_MS = 500;

/** Target frame rate for subtitle sync optimization */
const SUBTITLE_SYNC_TARGET_FPS = 120;

/**
 * Subtitle density thresholds (subtitles per minute)
 * Used to adjust sync tolerances based on content
 */
const DENSITY_HIGH_THRESHOLD = 25;  // > 25 subs/min = high density
const DENSITY_LOW_THRESHOLD = 8;    // < 8 subs/min = low density

/**
 * Default subtitle timing tolerances (all values in milliseconds)
 * - toleranceStart: How early to show subtitle before its start time
 * - toleranceEnd: How long to keep subtitle after its end time
 * - lookahead: How far ahead to search in binary search
 * - gapBridge: Max gap to bridge between subtitles (shows next early)
 */
const DEFAULT_TIMING = {
    toleranceStart: 50,
    toleranceEnd: 150,
    lookahead: 250,
    gapBridge: 300
};

const HIGH_DENSITY_TIMING = {
    toleranceStart: 30,
    toleranceEnd: 80,
    lookahead: 100,
    gapBridge: 150
};

const LOW_DENSITY_TIMING = {
    toleranceStart: 100,
    toleranceEnd: 300,
    lookahead: 400,
    gapBridge: 600
};

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

// Only run on non-YouTube/Twitch pages (manifest handles matching, but safe double-check)
const isYouTube = location.host.includes('youtube.com');
const isTwitch = location.host.includes('twitch.tv');

if (!isYouTube && !isTwitch) {
    console.log('[VideoTranslate] Initializing Generic Adapter');
    init();
}

function init() {
    // 1. Observe DOM for video elements
    const observer = new MutationObserver(checkForVideo);
    observer.observe(document.body, { childList: true, subtree: true });

    // 2. Periodic check (some SPAs render late)
    setInterval(checkForVideo, 2000);

    // 3. Listen for play events to grab the "active" video
    document.addEventListener('play', (e) => {
        if (e.target.tagName === 'VIDEO') {
            setActiveVideo(e.target);
        }
    }, true);

    // 4. Inject Network Interceptor
    injectInterceptor();

    // Load initial config
    loadConfig();
}

function injectInterceptor() {
    try {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('src/content/network_interceptor.js');
        script.onload = function () {
            this.remove();
        };
        (document.head || document.documentElement).appendChild(script);
        console.log('[VideoTranslate] Interceptor injected');
    } catch (e) {
        console.error('[VideoTranslate] Failed to inject interceptor:', e);
    }

    // Listen for events from the interceptor
    window.addEventListener('vt-stream-found', (e) => {
        if (e.detail && e.detail.url) {
            // Check if it's a new URL or different
            if (hlsUrl !== e.detail.url) {
                console.log('[VideoTranslate] Received Stream URL from interceptor:', e.detail.url);
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
        console.warn('Failed to load config:', e);
    }
}

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
            // Found a candidate
            setActiveVideo(video);
            break;
        }
    }
}

function setActiveVideo(video) {
    if (activeVideo === video) return;

    activeVideo = video;
    console.log('[VideoTranslate] Active video found:', video);

    // Try to find HLS or MPD URL
    hlsUrl = findStreamUrl(video);

    // Generate stable ID from page URL or stream URL
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

function injectUI(video) {
    if (document.querySelector('.vt-generic-container')) return;

    const container = document.createElement('div');
    container.className = 'vt-generic-container';
    container.style.cssText = `
        position: absolute;
        top: 10px;
        right: 10px;
        z-index: 99999;
        font-family: sans-serif;
    `;

    // Main Button (Gear Icon + Action)
    const btn = document.createElement('button');
    btn.className = 'vt-main-btn';
    btn.innerHTML = `
        <span class="vt-btn-text">Translate Video</span>
        <svg class="vt-btn-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="display:none; margin-left:6px;">
            <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.04.17 0 .4.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.58 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.04-.17 0-.4-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
        </svg>
    `;

    // Style similar to previous button but nicer
    btn.style.cssText = `
        display: flex;
        align-items: center;
        background: rgba(0, 0, 0, 0.7);
        color: white;
        border: 1px solid rgba(255, 255, 255, 0.3);
        border-radius: 4px;
        padding: 6px 12px;
        cursor: pointer;
        font-size: 13px;
        backdrop-filter: blur(4px);
        transition: all 0.2s;
    `;

    btn.onmouseover = () => btn.style.background = 'rgba(0, 0, 0, 0.9)';
    btn.onmouseout = () => btn.style.background = 'rgba(0, 0, 0, 0.7)';

    btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleSettingsPanel();
    };

    container.appendChild(btn);

    // Create Settings Panel (Hidden by default)
    const settingsPanel = createSettingsPanel();
    container.appendChild(settingsPanel);
    setupSettingsLogic(settingsPanel);

    // Positioning logic 
    const parent = video.parentElement;
    if (parent) {
        const style = window.getComputedStyle(parent);
        if (style.position === 'static') {
            parent.style.position = 'relative';
        }
        parent.appendChild(container);
    }

    // Create overlay for subtitles
    createSubtitleOverlay(video);
    applyStyles(); // Apply initial styles
}

function createSettingsOptionsHTML() {
    const options = [
        { key: 'size', label: chrome.i18n.getMessage('size') || 'Size' },
        { key: 'position', label: chrome.i18n.getMessage('position') || 'Position' },
        { key: 'background', label: chrome.i18n.getMessage('background') || 'Background' },
        { key: 'color', label: chrome.i18n.getMessage('textColor') || 'Text Color' },
        { key: 'font', label: 'Font' },
        { key: 'outline', label: 'Outline' },
        { key: 'opacity', label: 'Opacity' },
    ];

    return options.map(opt => `
        <div class="vt-menu-option" data-setting="${opt.key}">
            <span class="vt-option-label">${opt.label}</span>
            <span class="vt-option-value" data-value="${opt.key}"></span>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
        </div>
    `).join('');
}


function createSettingsPanel() {
    const p = document.createElement('div');
    p.className = 'vt-settings-panel';
    p.style.cssText = `
        display: none;
        position: absolute;
        top: 40px;
        right: 0;
        width: 280px;
        background: rgba(28, 28, 28, 0.95);
        backdrop-filter: blur(10px);
        border-radius: 8px;
        color: white;
        font-size: 13px;
        overflow: hidden;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    `;

    p.innerHTML = `
        <div class="vt-settings-header" style="padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; cursor: pointer; display: none;">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
            <span class="vt-header-title" style="margin-left: 8px;">Back</span>
        </div>
        
        <div class="vt-menu-content main-menu">
             <div class="vt-menu-option vt-action-translate" style="padding: 10px; cursor: pointer; display: flex; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1);">
                <svg viewBox="0 0 24 24" width="20" height="20" style="margin-right: 8px;" fill="currentColor"><path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/></svg>
                <span class="vt-lang-label">Start Translation</span>
            </div>

            <div class="vt-menu-option" data-setting="lang" style="padding: 10px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
                <span>Target Language</span>
                <span class="vt-option-value" data-value="lang">${selectedLanguage}</span>
                 <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
            </div>
            
            <div style="height: 1px; background: rgba(255,255,255,0.1); margin: 4px 0;"></div>
            
            <div class="vt-menu-option" data-setting="styleMenu" style="padding: 10px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
                <span>Subtitle Appearance</span>
                 <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
            </div>
        </div>

        <!-- Submenus -->
        <div class="vt-menu-content submenu" data-id="lang" style="display: none;">
             <!-- Languages injected here -->
        </div>
        
        <div class="vt-menu-content submenu" data-id="styleMenu" style="display: none;">
            ${createSettingsOptionsHTML()}
        </div>
        
        <div class="vt-menu-content submenu" data-id="styleValues" style="display: none;">
             <!-- Style values injected here -->
        </div>
    `;
    return p;
}

function setupSettingsLogic(panel) {
    const mainMenu = panel.querySelector('.main-menu');
    const header = panel.querySelector('.vt-settings-header');
    const backTitle = panel.querySelector('.vt-header-title');

    // Navigation Logic
    const showMenu = (menu) => {
        panel.querySelectorAll('.vt-menu-content').forEach(m => m.style.display = 'none');
        menu.style.display = 'block';
        if (menu === mainMenu) {
            header.style.display = 'none';
        } else {
            header.style.display = 'flex';
        }
    };

    header.onclick = () => {
        // Simple 1-level back for now, or check visibility
        if (panel.querySelector('.submenu[data-id="styleValues"]').style.display === 'block') {
            showMenu(panel.querySelector('.submenu[data-id="styleMenu"]'));
            backTitle.textContent = 'Subtitle Appearance';
        } else {
            showMenu(mainMenu);
        }
    };

    // 1. Start Translation
    panel.querySelector('.vt-action-translate').onclick = () => {
        toggleSettingsPanel(); // close
        startTranslation();
    };

    // 2. Language Menu
    panel.querySelector('[data-setting="lang"]').onclick = () => {
        const langMenu = panel.querySelector('.submenu[data-id="lang"]');
        langMenu.innerHTML = '';

        const languages = [
            { code: 'en', label: 'English' },
            { code: 'ja', label: 'Japanese' },
            { code: 'ko', label: 'Korean' },
            { code: 'zh-CN', label: 'Chinese (Simplified)' },
            { code: 'es', label: 'Spanish' },
            { code: 'fr', label: 'French' },
            { code: 'de', label: 'German' },
            { code: 'pt', label: 'Portuguese' },
            { code: 'ru', label: 'Russian' }
        ];

        languages.forEach(l => {
            const div = document.createElement('div');
            div.style.padding = '8px 10px';
            div.style.cursor = 'pointer';
            div.className = 'vt-menu-item';
            div.innerHTML = `
                <div style="display:flex; justify-content:space-between;">
                    ${l.label}
                    ${selectedLanguage === l.code ? '✓' : ''}
                </div>`;
            div.onclick = () => {
                selectedLanguage = l.code;
                panel.querySelector('[data-value="lang"]').textContent = l.code;
                sendMessage({ action: 'saveConfig', config: { defaultLanguage: l.code } });
                showMenu(mainMenu);
            };
            // Hover effect
            div.onmouseover = () => div.style.background = 'rgba(255,255,255,0.1)';
            div.onmouseout = () => div.style.background = 'transparent';
            langMenu.appendChild(div);
        });

        showMenu(langMenu);
        backTitle.textContent = 'Language';
    };

    // 3. Style Menu
    panel.querySelector('[data-setting="styleMenu"]').onclick = () => {
        showMenu(panel.querySelector('.submenu[data-id="styleMenu"]'));
        backTitle.textContent = 'Appearance';
        updateStyleMenuLabels(panel);
    };

    // 4. Style Options Click
    panel.querySelector('.submenu[data-id="styleMenu"]').querySelectorAll('.vt-menu-option').forEach(opt => {
        opt.style.cssText = "padding: 10px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;";
        opt.onclick = () => {
            const settingKey = opt.dataset.setting;
            showStyleValues(panel, settingKey);
        };
    });
}

function updateStyleMenuLabels(panel) {
    const labels = {
        size: { small: 'Small', medium: 'Medium', large: 'Large', xlarge: 'Extra Large', huge: 'Huge' },
        position: { bottom: 'Bottom', top: 'Top' },
        background: { dark: 'Dark', darker: 'Darker', transparent: 'Transparent', none: 'None' },
        color: { white: 'White', yellow: 'Yellow', cyan: 'Cyan' },
        font: { 'sans-serif': 'Sans-Serif', 'serif': 'Serif', 'monospace': 'Monospace' },
        outline: { none: 'None', light: 'Light', medium: 'Medium', heavy: 'Heavy' },
        opacity: { full: '100%', high: '90%', medium: '75%', low: '50%' }
    };

    Object.keys(subtitleSettings).forEach(k => {
        const valDisplay = panel.querySelector(`.vt-menu-option[data-setting="${k}"] .vt-option-value`);
        if (valDisplay) {
            const mapping = labels[k];
            valDisplay.textContent = (mapping && mapping[subtitleSettings[k]]) ? mapping[subtitleSettings[k]] : subtitleSettings[k];
        }
    });
}

function showStyleValues(panel, key) {
    const valueMenu = panel.querySelector('.submenu[data-id="styleValues"]');
    valueMenu.innerHTML = '';

    const values = getStyleOptionsRecursive(key);

    values.forEach(v => {
        const div = document.createElement('div');
        div.style.padding = '8px 10px';
        div.style.cursor = 'pointer';
        div.innerHTML = `
            <div style="display:flex; justify-content:space-between;">
                ${v.label}
                ${subtitleSettings[key] === v.val ? '✓' : ''}
            </div>`;
        div.onclick = () => {
            subtitleSettings[key] = v.val;
            applyStyles(); // Update visual immediately

            // Save config
            const cfg = {};
            cfg[`subtitle${key.charAt(0).toUpperCase() + key.slice(1)}`] = v.val;
            sendMessage({ action: 'saveConfig', config: cfg });

            showMenu(panel.querySelector('.submenu[data-id="styleMenu"]'), panel); // Go back one level
        };
        div.onmouseover = () => div.style.background = 'rgba(255,255,255,0.1)';
        div.onmouseout = () => div.style.background = 'transparent';
        valueMenu.appendChild(div);
    });

    // Helper to switch menu
    const header = panel.querySelector('.vt-settings-header');
    header.style.display = 'flex';
    panel.querySelector('.vt-header-title').textContent = key.charAt(0).toUpperCase() + key.slice(1);

    panel.querySelectorAll('.vt-menu-content').forEach(m => m.style.display = 'none');
    valueMenu.style.display = 'block';
}

function showMenu(menu, panel) {
    // helper required inside closure usually, but here duplicated for simplicity or needs refactor
    // Re-using the logic from setup, but since I am outside, I'll just hack the display props assuming panel ref
    if (panel) {
        panel.querySelectorAll('.vt-menu-content').forEach(m => m.style.display = 'none');
        menu.style.display = 'block';
    }
}

function getStyleOptionsRecursive(key) {
    // Simplified map
    const map = {
        size: [
            { val: 'small', label: 'Small' },
            { val: 'medium', label: 'Medium' },
            { val: 'large', label: 'Large' },
            { val: 'xlarge', label: 'Extra Large' },
            { val: 'huge', label: 'Huge' }
        ],
        position: [
            { val: 'bottom', label: 'Bottom' },
            { val: 'top', label: 'Top' }
        ],
        background: [
            { val: 'dark', label: 'Dark' },
            { val: 'darker', label: 'Darker' },
            { val: 'transparent', label: 'Transparent' },
            { val: 'none', label: 'None' }
        ],
        color: [
            { val: 'white', label: 'White' },
            { val: 'yellow', label: 'Yellow' },
            { val: 'cyan', label: 'Cyan' }
        ],
        font: [
            { val: 'sans-serif', label: 'Sans Serif' },
            { val: 'serif', label: 'Serif' },
            { val: 'monospace', label: 'Monospace' }
        ],
        outline: [
            { val: 'none', label: 'None' },
            { val: 'light', label: 'Light' },
            { val: 'medium', label: 'Medium' },
            { val: 'heavy', label: 'Heavy' }
        ],
        opacity: [
            { val: 'full', label: '100%' },
            { val: 'high', label: '90%' },
            { val: 'medium', label: '75%' },
            { val: 'low', label: '50%' }
        ]
    };
    return map[key] || [];
}

function toggleSettingsPanel() {
    const p = document.querySelector('.vt-settings-panel');
    if (p) {
        if (p.style.display === 'none') {
            p.style.display = 'block';

            // Show icon in button
            const icon = document.querySelector('.vt-btn-icon');
            if (icon) icon.style.display = 'block';
            document.querySelector('.vt-btn-text').textContent = "Settings";
        } else {
            p.style.display = 'none';
            // Reset button text
            const icon = document.querySelector('.vt-btn-icon');
            if (icon) icon.style.display = 'none';
            document.querySelector('.vt-btn-text').textContent = "Translate Video";
        }
    }
}

function createSubtitleOverlay(video) {
    if (document.querySelector('.vt-overlay')) return;

    const overlay = document.createElement('div');
    overlay.className = 'vt-overlay';
    overlay.style.cssText = `
        position: absolute;
        bottom: 10%;
        left: 5%;
        right: 5%;
        text-align: center;
        pointer-events: none;
        z-index: 99998;
        display: none;
        transition: all 0.3s;
    `;

    overlay.innerHTML = '<span class="vt-text"></span>';

    video.parentElement.appendChild(overlay);
}

function applyStyles() {
    const overlay = document.querySelector('.vt-overlay');
    const text = document.querySelector('.vt-text');
    if (!overlay || !text) return;

    // Base styles
    let css = `
        display: inline-block;
        padding: 4px 8px;
        border-radius: 4px;
        transition: all 0.2s;
    `;

    // Size
    const sizes = { small: '14px', medium: '18px', large: '24px', xlarge: '32px', huge: '42px' };
    css += `font-size: ${sizes[subtitleSettings.size] || '18px'};`;

    // Position
    if (subtitleSettings.position === 'top') {
        overlay.style.top = '10%';
        overlay.style.bottom = 'auto';
    } else {
        overlay.style.top = 'auto';
        overlay.style.bottom = '10%';
    }

    // Background
    const bg = {
        dark: 'rgba(0,0,0,0.7)',
        darker: 'rgba(0,0,0,0.9)',
        transparent: 'rgba(0,0,0,0.3)',
        none: 'transparent'
    };
    css += `background-color: ${bg[subtitleSettings.background] || 'rgba(0,0,0,0.7)'};`;

    // Color
    const colors = { white: '#fff', yellow: '#ffeb3b', cyan: '#00bcd4' };
    css += `color: ${colors[subtitleSettings.color] || '#fff'};`;

    // Font
    css += `font-family: ${subtitleSettings.font};`;

    // Outline
    const outlines = {
        none: 'none',
        light: '1px 1px 2px rgba(0,0,0,0.5)',
        medium: '2px 2px 3px rgba(0,0,0,0.7)',
        heavy: '2px 2px 4px rgba(0,0,0,0.9)'
    };
    css += `text-shadow: ${outlines[subtitleSettings.outline] || 'none'};`;

    text.style.cssText = css;

    // Opacity
    const opacities = { full: 1, high: 0.9, medium: 0.75, low: 0.5 };
    overlay.style.opacity = opacities[subtitleSettings.opacity] || 1;
}

function removeUI() {
    stopSyncLoop();
    document.querySelector('.vt-generic-container')?.remove();
    document.querySelector('.vt-overlay')?.remove();
}

async function startTranslation() {
    const btnText = document.querySelector('.vt-btn-text');
    const btn = document.querySelector('.vt-main-btn');

    // Show loading state with spinner
    if (btnText) btnText.textContent = 'Connecting...';
    if (btn) {
        btn.style.opacity = '0.7';
        btn.style.cursor = 'wait';
    }

    // Create progress indicator
    let progressIndicator = document.querySelector('.vt-progress');
    if (!progressIndicator) {
        progressIndicator = document.createElement('div');
        progressIndicator.className = 'vt-progress';
        progressIndicator.style.cssText = `
            position: absolute;
            top: 45px;
            right: 0;
            padding: 6px 10px;
            background: rgba(0, 0, 0, 0.8);
            color: #4fd1c5;
            font-size: 11px;
            border-radius: 4px;
            display: none;
        `;
        document.querySelector('.vt-generic-container')?.appendChild(progressIndicator);
    }

    const updateProgress = (stage, message, percent) => {
        if (btnText) {
            const stageNames = {
                'downloading': '⬇️ Downloading',
                'transcribing': '🎤 Transcribing',
                'translating': '🌐 Translating',
                'subtitles': '✅ Ready'
            };
            btnText.textContent = stageNames[stage] || stage;
        }
        if (progressIndicator && percent !== undefined) {
            progressIndicator.style.display = 'block';
            progressIndicator.textContent = `${Math.round(percent)}%`;
        }
    };

    try {
        const videoUrl = location.href;
        let streamUrl = null;

        // If we found a direct stream URL (HLS/DASH), send it as streamUrl
        if (hlsUrl && (hlsUrl.includes('.m3u8') || hlsUrl.includes('.mpd'))) {
            console.log('[VideoTranslate] Detected stream URL:', hlsUrl);
            streamUrl = hlsUrl;
        }

        console.log('[VideoTranslate] Sending request:', { videoUrl, streamUrl, lang: selectedLanguage });

        updateProgress('downloading', 'Starting...', 0);

        const response = await sendMessage({
            action: 'process',
            videoId: currentVideoId,
            videoUrl: videoUrl,
            streamUrl: streamUrl,
            targetLanguage: selectedLanguage
        });

        if (response.error) throw new Error(response.error);

        // Reset button state
        if (btn) {
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
        }
        if (btnText) btnText.textContent = '✅ Subtitles Ready';
        if (progressIndicator) progressIndicator.style.display = 'none';

        handleTranslationResult(response.translations);

    } catch (e) {
        console.error('Translation failed:', e);
        if (btn) {
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
        }
        if (btnText) btnText.textContent = '❌ Error';
        if (progressIndicator) progressIndicator.style.display = 'none';

        // Show error in overlay instead of alert
        const overlay = document.querySelector('.vt-overlay');
        const textEl = overlay?.querySelector('.vt-text');
        if (overlay && textEl) {
            overlay.style.display = 'block';
            textEl.style.color = '#ff6b6b';
            textEl.textContent = `Translation failed: ${e.message}`;
            // Reset after 5 seconds
            setTimeout(() => {
                textEl.style.color = '';
                textEl.textContent = '';
                overlay.style.display = 'none';
            }, 5000);
        }
    }
}

// Sync state for tracking playback
let syncState = {
    animationFrameId: null,
    lastVideoTime: -1,
    currentSubIndex: -1,
    isActive: false,
    subtitles: [],
};

// Subtitle display window for performance on long videos
let subtitleWindow = {
    isEnabled: false,
    fullList: [],
    activeList: [],
    windowStart: 0,
    windowEnd: 0,
    windowSize: SUBTITLE_WINDOW_SIZE,
    lastAccessTime: 0
};

// Adaptive timing based on content density (values in ms)
let subtitleDensity = { ...DEFAULT_TIMING };

/**
 * Initialize windowed viewing for long subtitle lists
 */
function initSubtitleWindow(subs) {
    if (!subs || subs.length < SUBTITLE_WINDOW_THRESHOLD) {
        subtitleWindow.isEnabled = false;
        subtitleWindow.activeList = subs;
        subtitleWindow.fullList = subs;
        return;
    }

    subtitleWindow = {
        isEnabled: true,
        windowSize: SUBTITLE_WINDOW_SIZE,
        windowStart: 0,
        windowEnd: SUBTITLE_WINDOW_SIZE,
        fullList: subs,
        activeList: subs.slice(0, SUBTITLE_WINDOW_SIZE),
        lastAccessTime: performance.now()
    };
    console.log('[VideoTranslate] Windowed access enabled for', subs.length, 'subtitles');
}

/**
 * Update active window based on current position
 */
function updateSubtitleWindow(currentIndex) {
    if (!subtitleWindow.isEnabled) return;

    const now = performance.now();
    if (now - subtitleWindow.lastAccessTime < SUBTITLE_WINDOW_UPDATE_INTERVAL_MS) return;

    const half = Math.floor(subtitleWindow.windowSize / 2);
    const start = Math.max(0, currentIndex - half);
    const end = Math.min(subtitleWindow.fullList.length, currentIndex + half);

    // Only update if we're near the edges
    if (currentIndex - subtitleWindow.windowStart < SUBTITLE_WINDOW_EDGE_THRESHOLD ||
        subtitleWindow.windowEnd - currentIndex < SUBTITLE_WINDOW_EDGE_THRESHOLD) {
        subtitleWindow.windowStart = start;
        subtitleWindow.windowEnd = end;
        subtitleWindow.activeList = subtitleWindow.fullList.slice(start, end);
        subtitleWindow.lastAccessTime = now;
    }
}

/**
 * Analyze density to adjust sync tolerances
 */
function analyzeSubtitleDensity(subtitles) {
    if (!subtitles || subtitles.length < 10) return;

    const totalTime = (subtitles[subtitles.length - 1].end - subtitles[0].start) / 1000;
    const subsPerMinute = (subtitles.length / totalTime) * 60;

    if (subsPerMinute > DENSITY_HIGH_THRESHOLD) {
        subtitleDensity = { ...HIGH_DENSITY_TIMING };
    } else if (subsPerMinute < DENSITY_LOW_THRESHOLD) {
        subtitleDensity = { ...LOW_DENSITY_TIMING };
    } else {
        subtitleDensity = { ...DEFAULT_TIMING };
    }
    console.log('[VideoTranslate] Subtitle density:', Math.round(subsPerMinute), 'subs/min');
}

function handleTranslationResult(subtitles) {
    if (!subtitles || !subtitles.length) return;

    console.log('[VideoTranslate] Received', subtitles.length, 'subtitles');

    // Normalize and analyze
    const normalized = subtitles.map(s => ({
        start: s.start,
        end: s.end,
        text: s.translatedText || s.text,
        speaker: s.speaker
    }));

    syncState.subtitles = normalized;
    analyzeSubtitleDensity(normalized);
    initSubtitleWindow(normalized);

    const video = activeVideo;
    const overlay = document.querySelector('.vt-overlay');
    const textEl = overlay?.querySelector('.vt-text');

    if (!video || !overlay || !textEl) {
        console.error('[VideoTranslate] Missing video or overlay elements');
        return;
    }

    overlay.style.display = 'block';

    // Setup event handlers
    setupSyncHandlers(video, textEl, overlay);

    // Start sync loop
    startSyncLoop(video, textEl, overlay);
}

/**
 * Setup video event handlers for seek and state changes
 */
function setupSyncHandlers(video, textEl, overlay) {
    // Remove existing handlers
    if (video._vtSeekHandler) {
        video.removeEventListener('seeked', video._vtSeekHandler);
        video.removeEventListener('ended', video._vtEndHandler);
    }

    // Handle seek - reset find position
    video._vtSeekHandler = () => {
        syncState.currentSubIndex = -1;
        syncState.lastVideoTime = -1;
    };
    video.addEventListener('seeked', video._vtSeekHandler);

    // Handle video end
    video._vtEndHandler = () => {
        textEl.textContent = '';
        overlay.style.display = 'none';
    };
    video.addEventListener('ended', video._vtEndHandler);
}

/**
 * Start the RAF-based sync loop for smooth subtitle updates
 */
function startSyncLoop(video, textEl, overlay) {
    // Cancel existing loop
    if (syncState.animationFrameId) {
        cancelAnimationFrame(syncState.animationFrameId);
    }

    syncState.isActive = true;

    const syncLoop = () => {
        if (!syncState.isActive || !activeVideo) {
            syncState.animationFrameId = null;
            return;
        }

        const currentTimeMs = video.currentTime * 1000;

        // Speed scaling for optimization - skip frames if time hasn't changed enough
        const rate = video.playbackRate || 1;
        const skipThreshold = (1000 / SUBTITLE_SYNC_TARGET_FPS) * rate;

        // Optimization: Skip if time hasn't changed significantly
        if (Math.abs(currentTimeMs - syncState.lastVideoTime) < skipThreshold) {
            syncState.animationFrameId = requestAnimationFrame(syncLoop);
            return;
        }

        syncState.lastVideoTime = currentTimeMs;

        // Find current subtitle
        const sub = findSubtitleAt(currentTimeMs);

        if (sub) {
            if (textEl.textContent !== sub.text) {
                textEl.textContent = sub.text;
            }
            overlay.style.display = 'block';

            // Update window if needed
            if (syncState.currentSubIndex >= 0) {
                updateSubtitleWindow(syncState.currentSubIndex);
            }
        } else {
            if (textEl.textContent !== '') {
                textEl.textContent = '';
            }
            overlay.style.display = 'none';
        }

        syncState.animationFrameId = requestAnimationFrame(syncLoop);
    };

    syncState.animationFrameId = requestAnimationFrame(syncLoop);
}

/**
 * Find subtitle at given time using binary search for efficiency
 */
function findSubtitleAt(timeMs) {
    // Use windowed list if available for performance
    const subs = subtitleWindow.isEnabled ? subtitleWindow.activeList : syncState.subtitles;
    const offset = subtitleWindow.isEnabled ? subtitleWindow.windowStart : 0;

    if (!subs || subs.length === 0) return null;

    // 1. Sequential check (most common case: linear playback)
    const localIdx = syncState.currentSubIndex - offset;
    if (localIdx >= 0 && localIdx < subs.length) {
        const current = subs[localIdx];
        if (timeMs >= current.start - subtitleDensity.toleranceStart && timeMs <= current.end + subtitleDensity.toleranceEnd) {
            return current;
        }

        // Check next subtitle (lookahead)
        if (localIdx + 1 < subs.length) {
            const next = subs[localIdx + 1];
            if (timeMs >= next.start - subtitleDensity.toleranceStart && timeMs <= next.end + subtitleDensity.toleranceEnd) {
                syncState.currentSubIndex = offset + localIdx + 1;
                return next;
            }
        }
    }

    // 2. Binary search for non-sequential access (seek)
    let lo = 0, hi = subs.length - 1;
    while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        const sub = subs[mid];

        if (timeMs < sub.start - subtitleDensity.lookahead) {
            hi = mid - 1;
        } else if (timeMs > sub.end + subtitleDensity.toleranceEnd) {
            lo = mid + 1;
        } else {
            // Found it or within tolerance
            syncState.currentSubIndex = offset + mid;
            return sub;
        }
    }

    // 3. Gap bridging (if time is between two subs within gapBridge threshold)
    if (lo < subs.length) {
        const nextSub = subs[lo];
        if (nextSub.start - timeMs <= subtitleDensity.gapBridge) {
            syncState.currentSubIndex = offset + lo;
            return nextSub;
        }
    }

    return null;
}

/**
 * Stop sync loop (called when video ends or UI is removed)
 */
function stopSyncLoop() {
    syncState.isActive = false;
    if (syncState.animationFrameId) {
        cancelAnimationFrame(syncState.animationFrameId);
        syncState.animationFrameId = null;
    }
}

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
