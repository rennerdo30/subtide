/**
 * YouTube Content Script
 * Handles UI injection and subtitle synchronization
 */

// State
let currentVideoId = null;
let sourceSubtitles = null;
let translatedSubtitles = null;
let selectedLanguage = null;
let isProcessing = false;
let userTier = 'tier1';
let backendUrl = 'http://localhost:5001';

// Subtitle appearance settings
let subtitleSettings = {
    size: 'medium',
    position: 'bottom',
    background: 'dark',
    color: 'white',
};

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

function onNavigate() {
    translatedSubtitles = null;
    sourceSubtitles = null;
    isProcessing = false;
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
    };

    console.log('[VideoTranslate] Tier:', userTier);
    console.log('[VideoTranslate] Subtitle settings:', subtitleSettings);

    injectUI();

    // For Tier 1/2: Pre-fetch subtitles so they're ready when user clicks translate
    // For Tier 3: We'll do everything in one call when user clicks translate
    if (userTier !== 'tier3') {
        await prefetchSubtitles(videoId);
    }
}

function waitForPlayer() {
    return new Promise((resolve) => {
        const check = () => {
            const player = document.querySelector('.html5-video-player');
            if (player) resolve(player);
            else setTimeout(check, 500);
        };
        check();
    });
}

/**
 * Pre-fetch subtitles (Tier 1/2)
 */
async function prefetchSubtitles(videoId) {
    updateStatus('Loading...', 'loading');

    try {
        const data = await sendMessage({ action: 'fetchSubtitles', videoId });

        if (data.error) throw new Error(data.error);

        sourceSubtitles = parseSubtitles(data);

        if (sourceSubtitles.length > 0) {
            updateStatus(`${sourceSubtitles.length} subs`, 'success');
        } else {
            updateStatus('No subs', 'error');
        }
    } catch (error) {
        console.error('[VideoTranslate] Prefetch failed:', error);
        updateStatus('No subs', 'error');
    }
}

/**
 * Parse subtitles from backend response
 */
function parseSubtitles(data) {
    const subtitles = [];

    // Whisper format
    if (data.segments) {
        for (const seg of data.segments) {
            subtitles.push({
                start: seg.start * 1000,
                end: seg.end * 1000,
                text: seg.text.trim()
            });
        }
        return mergeSegments(subtitles);
    }

    // YouTube JSON3 format
    if (data.events) {
        for (const event of data.events) {
            if (!event.segs) continue;
            const text = event.segs.map(s => s.utf8 || '').join('').trim();
            if (text) {
                subtitles.push({
                    start: event.tStartMs,
                    end: event.tStartMs + (event.dDurationMs || 3000),
                    text
                });
            }
        }
    }

    return subtitles;
}

/**
 * Merge short segments (for Whisper output)
 */
function mergeSegments(subs, maxGap = 500, maxDur = 8000) {
    if (subs.length <= 1) return subs;

    const merged = [];
    let curr = { ...subs[0] };

    for (let i = 1; i < subs.length; i++) {
        const next = subs[i];
        const gap = next.start - curr.end;
        const newDur = next.end - curr.start;

        if (gap <= maxGap && newDur <= maxDur) {
            curr.end = next.end;
            curr.text += ' ' + next.text;
        } else {
            merged.push(curr);
            curr = { ...next };
        }
    }
    merged.push(curr);

    return merged;
}

/**
 * Remove UI elements
 */
function removeUI() {
    document.querySelector('.vt-container')?.remove();
    document.querySelector('.vt-overlay')?.remove();
    document.querySelector('.vt-status-panel')?.remove();
}

/**
 * Inject translate UI
 */
function injectUI() {
    removeUI();

    const controls = document.querySelector('.ytp-right-controls');
    if (!controls) return;

    const container = document.createElement('div');
    container.className = 'vt-container';
    container.innerHTML = `
        <button class="vt-btn ytp-button" title="Click to translate, right-click for language">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                <path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/>
            </svg>
            <span class="vt-badge"></span>
        </button>
        <div class="vt-menu">
            <div class="vt-menu-item" data-lang="en">🇬🇧 English</div>
            <div class="vt-menu-item" data-lang="ja">🇯🇵 Japanese</div>
            <div class="vt-menu-item" data-lang="ko">🇰🇷 Korean</div>
            <div class="vt-menu-item" data-lang="zh-CN">🇨🇳 Chinese</div>
            <div class="vt-menu-item" data-lang="es">🇪🇸 Spanish</div>
            <div class="vt-menu-item" data-lang="fr">🇫🇷 French</div>
            <div class="vt-menu-item" data-lang="de">🇩🇪 German</div>
            <div class="vt-menu-item" data-lang="pt">🇵🇹 Portuguese</div>
            <div class="vt-menu-item" data-lang="ru">🇷🇺 Russian</div>
        </div>
    `;

    controls.prepend(container);

    // Status panel overlay on video
    const player = document.querySelector('.html5-video-player');
    if (player && !player.querySelector('.vt-status-panel')) {
        const statusPanel = document.createElement('div');
        statusPanel.className = 'vt-status-panel';
        statusPanel.innerHTML = `
            <div class="vt-status-content">
                <div class="vt-step-indicator"></div>
                <span class="vt-status-text"></span>
                <div class="vt-progress-bar">
                    <div class="vt-progress-fill"></div>
                </div>
                <div class="vt-status-details">
                    <span class="vt-batch-info"></span>
                    <span class="vt-eta"></span>
                </div>
            </div>
        `;
        player.appendChild(statusPanel);
    }

    // Add settings panel for subtitle appearance (floating, instant-apply)
    if (player && !player.querySelector('.vt-settings-panel')) {
        const settingsPanel = document.createElement('div');
        settingsPanel.className = 'vt-settings-panel';
        settingsPanel.innerHTML = `
            <div class="vt-settings-header">
                <span>Subtitle Style</span>
                <button class="vt-settings-close">×</button>
            </div>
            <div class="vt-settings-body">
                <div class="vt-setting-row">
                    <label>Size</label>
                    <select data-setting="size">
                        <option value="small">S</option>
                        <option value="medium" selected>M</option>
                        <option value="large">L</option>
                        <option value="xlarge">XL</option>
                    </select>
                </div>
                <div class="vt-setting-row">
                    <label>Position</label>
                    <select data-setting="position">
                        <option value="bottom" selected>Bottom</option>
                        <option value="top">Top</option>
                    </select>
                </div>
                <div class="vt-setting-row">
                    <label>Background</label>
                    <select data-setting="background">
                        <option value="dark" selected>Dark</option>
                        <option value="darker">Darker</option>
                        <option value="transparent">Light</option>
                        <option value="none">None</option>
                    </select>
                </div>
                <div class="vt-setting-row">
                    <label>Color</label>
                    <select data-setting="color">
                        <option value="white" selected>White</option>
                        <option value="yellow">Yellow</option>
                        <option value="cyan">Cyan</option>
                    </select>
                </div>
            </div>
        `;
        player.appendChild(settingsPanel);

        // Load saved settings
        settingsPanel.querySelector(`[data-setting="size"]`).value = subtitleSettings.size;
        settingsPanel.querySelector(`[data-setting="position"]`).value = subtitleSettings.position;
        settingsPanel.querySelector(`[data-setting="background"]`).value = subtitleSettings.background;
        settingsPanel.querySelector(`[data-setting="color"]`).value = subtitleSettings.color;

        // Instant apply on change
        settingsPanel.querySelectorAll('select').forEach(select => {
            select.addEventListener('change', () => {
                subtitleSettings[select.dataset.setting] = select.value;
                addStyles(); // Re-apply styles instantly
                // Save to storage
                sendMessage({
                    action: 'saveConfig',
                    config: {
                        subtitleSize: subtitleSettings.size,
                        subtitlePosition: subtitleSettings.position,
                        subtitleBackground: subtitleSettings.background,
                        subtitleColor: subtitleSettings.color,
                    }
                });
            });
        });

        // Close button
        settingsPanel.querySelector('.vt-settings-close').addEventListener('click', () => {
            settingsPanel.classList.remove('show');
        });
    }

    // Add settings button to controls
    const settingsBtn = document.createElement('button');
    settingsBtn.className = 'vt-settings-btn ytp-button';
    settingsBtn.title = 'Subtitle Settings';
    settingsBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
        </svg>
    `;
    container.appendChild(settingsBtn);

    // Settings button click
    settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const panel = player.querySelector('.vt-settings-panel');
        if (panel) {
            panel.classList.toggle('show');
        }
    });

    const btn = container.querySelector('.vt-btn');
    const badge = container.querySelector('.vt-badge');
    const menu = container.querySelector('.vt-menu');
    let menuOpen = false;

    // Update badge
    const updateBadge = () => {
        badge.textContent = selectedLanguage.split('-')[0].toUpperCase();
    };
    updateBadge();

    // Click on badge = show menu, click on button = translate
    btn.addEventListener('click', (e) => {
        const clickedBadge = e.target.closest('.vt-badge');

        if (clickedBadge) {
            // Clicked on badge - toggle menu
            e.stopPropagation();
            menuOpen = !menuOpen;
            menu.classList.toggle('show', menuOpen);
        } else if (!menuOpen) {
            // Clicked on button (not badge) and menu closed - translate
            translateVideo(selectedLanguage);
        } else {
            // Menu was open, close it
            menuOpen = false;
            menu.classList.remove('show');
        }
    });

    // Menu item click
    menu.querySelectorAll('.vt-menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            selectedLanguage = item.dataset.lang;
            updateBadge();
            menuOpen = false;
            menu.classList.remove('show');
            translateVideo(selectedLanguage);
        });
    });

    // Close menu on outside click
    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
            menuOpen = false;
            menu.classList.remove('show');
        }
    });

    addStyles();
    setupSync();
}

/**
 * Translate video subtitles
 */
async function translateVideo(targetLang) {
    if (isProcessing) {
        updateStatus('Processing...', 'loading');
        return;
    }

    isProcessing = true;
    updateStatus('Translating...', 'loading');

    try {
        let result;

        if (userTier === 'tier3') {
            // Tier 3: Single combined call (subtitle fetch + translate on server)
            result = await sendMessage({
                action: 'process',
                videoId: currentVideoId,
                targetLanguage: targetLang
            });
        } else {
            // Tier 1/2: Subtitles already fetched, translate via direct LLM
            if (!sourceSubtitles || sourceSubtitles.length === 0) {
                throw new Error('No subtitles available');
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
        console.log('[VideoTranslate] First subtitle:', JSON.stringify(translatedSubtitles?.[0]));
        console.log('[VideoTranslate] Has translatedText:', !!translatedSubtitles?.[0]?.translatedText);

        if (!translatedSubtitles || translatedSubtitles.length === 0) {
            throw new Error('No translations received');
        }

        updateStatus(result.cached ? 'Cached ✓' : 'Done ✓', 'success');
        showOverlay();
        setupSync(); // Re-setup sync to ensure listener is attached

    } catch (error) {
        console.error('[VideoTranslate] Translation failed:', error);
        updateStatus('Failed', 'error');
    } finally {
        isProcessing = false;
    }
}

/**
 * Update status display - shows in overlay panel on video
 */
/**
 * Update status display with enhanced progress information
 * @param {string} text - Main status message
 * @param {string} type - Status type: 'loading', 'success', 'error'
 * @param {number|null} percent - Progress percentage (0-100)
 * @param {object|null} options - Extended options
 * @param {number} options.step - Current step number
 * @param {number} options.totalSteps - Total number of steps
 * @param {string} options.eta - Estimated time remaining
 * @param {object} options.batchInfo - Batch progress info {current, total}
 */
function updateStatus(text, type = '', percent = null, options = {}) {
    const panel = document.querySelector('.vt-status-panel');
    const stepIndicator = panel?.querySelector('.vt-step-indicator');
    const textEl = panel?.querySelector('.vt-status-text');
    const progressBar = panel?.querySelector('.vt-progress-bar');
    const progressFill = panel?.querySelector('.vt-progress-fill');
    const batchInfoEl = panel?.querySelector('.vt-batch-info');
    const etaEl = panel?.querySelector('.vt-eta');

    if (panel && textEl) {
        // Update step indicator (e.g., "Step 2/4")
        if (stepIndicator) {
            if (options.step && options.totalSteps) {
                stepIndicator.textContent = `Step ${options.step}/${options.totalSteps}`;
                stepIndicator.style.display = 'block';
            } else {
                stepIndicator.style.display = 'none';
            }
        }

        // Update main status text
        textEl.textContent = text;
        panel.className = 'vt-status-panel ' + type;

        // Update progress bar
        if (progressBar && progressFill) {
            if (percent !== null && percent > 0) {
                progressBar.style.display = 'block';
                progressFill.style.width = `${percent}%`;
            } else {
                progressBar.style.display = 'none';
            }
        }

        // Update batch info (e.g., "Batch 3/10")
        if (batchInfoEl) {
            if (options.batchInfo && options.batchInfo.current && options.batchInfo.total) {
                batchInfoEl.textContent = `Batch ${options.batchInfo.current}/${options.batchInfo.total}`;
                batchInfoEl.style.display = 'inline';
            } else {
                batchInfoEl.style.display = 'none';
            }
        }

        // Update ETA
        if (etaEl) {
            if (options.eta && type === 'loading') {
                etaEl.textContent = `ETA: ${options.eta}`;
                etaEl.style.display = 'inline';
            } else {
                etaEl.style.display = 'none';
            }
        }

        // Show panel for loading/error, hide on success after delay
        if (type === 'loading' || type === 'error') {
            panel.style.display = 'block';
        } else if (type === 'success') {
            panel.style.display = 'block';
            if (progressBar) progressBar.style.display = 'none';
            if (stepIndicator) stepIndicator.style.display = 'none';
            if (batchInfoEl) batchInfoEl.style.display = 'none';
            if (etaEl) etaEl.style.display = 'none';
            setTimeout(() => {
                if (panel.classList.contains('success')) {
                    panel.style.display = 'none';
                }
            }, 2000);
        }
    }
}

/**
 * Show subtitle overlay
 */
function showOverlay() {
    let overlay = document.querySelector('.vt-overlay');
    if (!overlay) {
        const player = document.querySelector('.html5-video-player');
        if (!player) return;

        overlay = document.createElement('div');
        overlay.className = 'vt-overlay';
        overlay.innerHTML = '<span class="vt-text"></span>';
        player.appendChild(overlay);
    }
    overlay.style.display = 'block';
}

/**
 * Setup video time sync
 */
function setupSync() {
    const video = document.querySelector('video');
    if (!video) return;

    // Remove existing listener if any
    if (video._vtSyncHandler) {
        video.removeEventListener('timeupdate', video._vtSyncHandler);
    }

    video._vtSyncHandler = () => {
        if (!translatedSubtitles?.length) return;

        const time = video.currentTime * 1000;
        const sub = translatedSubtitles.find(s => time >= s.start && time <= s.end);

        const textEl = document.querySelector('.vt-text');
        if (textEl && sub) {
            // Use translatedText, fallback to original if empty
            const displayText = sub.translatedText || sub.text;
            textEl.textContent = displayText || '';
        } else if (textEl) {
            textEl.textContent = '';
        }
    };

    video.addEventListener('timeupdate', video._vtSyncHandler);
}

/**
 * Get subtitle style values based on settings
 */
function getSubtitleStyleValues() {
    // Font sizes
    const sizes = {
        small: '16px',
        medium: '20px',
        large: '24px',
        xlarge: '28px',
    };

    // Background styles
    const backgrounds = {
        dark: 'rgba(0,0,0,0.85)',
        darker: 'rgba(0,0,0,0.95)',
        transparent: 'rgba(0,0,0,0.5)',
        none: 'transparent',
    };

    // Text colors
    const colors = {
        white: '#fff',
        yellow: '#ffeb3b',
        cyan: '#00bcd4',
    };

    // Position (bottom or top)
    const positions = {
        bottom: { bottom: '70px', top: 'auto' },
        top: { bottom: 'auto', top: '70px' },
    };

    return {
        fontSize: sizes[subtitleSettings.size] || sizes.medium,
        background: backgrounds[subtitleSettings.background] || backgrounds.dark,
        color: colors[subtitleSettings.color] || colors.white,
        position: positions[subtitleSettings.position] || positions.bottom,
    };
}

/**
 * Add styles
 */
function addStyles() {
    // Remove existing styles to apply new settings
    document.querySelector('#vt-styles')?.remove();

    const styleValues = getSubtitleStyleValues();

    const style = document.createElement('style');
    style.id = 'vt-styles';
    style.textContent = `
        .vt-container {
            position: relative !important;
            display: flex !important;
            align-items: center !important;
            margin-right: 6px !important;
        }
        .vt-btn {
            position: relative !important;
            opacity: 0.9 !important;
        }
        .vt-btn:hover {
            opacity: 1 !important;
        }
        .vt-badge {
            position: absolute !important;
            bottom: 4px !important;
            right: 4px !important;
            background: #fff !important;
            color: #000 !important;
            font-size: 9px !important;
            font-weight: bold !important;
            padding: 1px 3px !important;
            border-radius: 2px !important;
            line-height: 1 !important;
        }
        .vt-menu {
            display: none;
            position: absolute !important;
            bottom: 100% !important;
            left: 50% !important;
            transform: translateX(-50%) !important;
            background: rgba(28,28,28,0.95) !important;
            border-radius: 3px !important;
            padding: 3px 0 !important;
            margin-bottom: 4px !important;
            min-width: 110px !important;
            box-shadow: 0 2px 6px rgba(0,0,0,0.4) !important;
            z-index: 9999 !important;
        }
        .vt-menu.show {
            display: block !important;
        }
        .vt-menu-item {
            padding: 3px 10px !important;
            color: #fff !important;
            font-size: 14px !important;
            line-height: 1.3 !important;
            cursor: pointer !important;
            white-space: nowrap !important;
        }
        .vt-menu-item:hover {
            background: rgba(255,255,255,0.15) !important;
        }
        .vt-status-panel {
            position: absolute !important;
            top: 12px !important;
            left: 50% !important;
            transform: translateX(-50%) !important;
            z-index: 60 !important;
            pointer-events: none !important;
        }
        .vt-status-content {
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            background: rgba(0,0,0,0.9) !important;
            padding: 10px 20px !important;
            border-radius: 6px !important;
            min-width: 200px !important;
        }
        .vt-status-text {
            color: #fff !important;
            font-size: 13px !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
            margin-bottom: 6px !important;
        }
        .vt-progress-bar {
            width: 100% !important;
            height: 4px !important;
            background: rgba(255,255,255,0.2) !important;
            border-radius: 2px !important;
            overflow: hidden !important;
            display: none;
        }
        .vt-progress-fill {
            height: 100% !important;
            background: linear-gradient(90deg, #4caf50, #8bc34a) !important;
            border-radius: 2px !important;
            transition: width 0.3s ease !important;
            width: 0%;
        }
        .vt-step-indicator {
            color: rgba(255,255,255,0.6) !important;
            font-size: 10px !important;
            font-weight: 600 !important;
            text-transform: uppercase !important;
            letter-spacing: 0.5px !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
            margin-bottom: 4px !important;
            display: none;
        }
        .vt-status-details {
            display: flex !important;
            gap: 12px !important;
            justify-content: center !important;
            margin-top: 6px !important;
        }
        .vt-batch-info, .vt-eta {
            color: rgba(255,255,255,0.7) !important;
            font-size: 11px !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
            display: none;
        }
        .vt-eta {
            color: #8bc34a !important;
            font-weight: 500 !important;
        }
        .vt-status-panel.loading .vt-status-text {
            color: #ffc107 !important;
        }
        .vt-status-panel.loading .vt-progress-fill {
            background: linear-gradient(90deg, #ffc107, #ffeb3b) !important;
        }
        .vt-status-panel.success .vt-status-text {
            color: #4caf50 !important;
        }
        .vt-status-panel.error .vt-status-text {
            color: #f44336 !important;
        }
        .vt-overlay {
            position: absolute !important;
            ${styleValues.position.bottom !== 'auto' ? `bottom: ${styleValues.position.bottom}` : `top: ${styleValues.position.top}`} !important;
            left: 50% !important;
            transform: translateX(-50%) !important;
            max-width: 80% !important;
            text-align: center !important;
            z-index: 60 !important;
            pointer-events: none !important;
        }
        .vt-text {
            display: inline-block !important;
            background: ${styleValues.background} !important;
            color: ${styleValues.color} !important;
            padding: 8px 16px !important;
            border-radius: 4px !important;
            font-size: ${styleValues.fontSize} !important;
            line-height: 1.4 !important;
            text-shadow: ${subtitleSettings.background === 'none' ? '1px 1px 2px rgba(0,0,0,0.8), -1px -1px 2px rgba(0,0,0,0.8)' : 'none'} !important;
        }
        .vt-settings-btn {
            opacity: 0.9 !important;
            margin-left: 4px !important;
        }
        .vt-settings-btn:hover {
            opacity: 1 !important;
        }
        .vt-settings-panel {
            display: none;
            position: absolute !important;
            top: 50px !important;
            right: 12px !important;
            background: rgba(20, 20, 20, 0.95) !important;
            border: 1px solid rgba(255,255,255,0.15) !important;
            border-radius: 8px !important;
            padding: 0 !important;
            min-width: 180px !important;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5) !important;
            z-index: 9999 !important;
            backdrop-filter: blur(10px) !important;
        }
        .vt-settings-panel.show {
            display: block !important;
        }
        .vt-settings-header {
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            padding: 10px 12px !important;
            border-bottom: 1px solid rgba(255,255,255,0.1) !important;
            color: #fff !important;
            font-size: 13px !important;
            font-weight: 600 !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        }
        .vt-settings-close {
            background: none !important;
            border: none !important;
            color: rgba(255,255,255,0.6) !important;
            font-size: 18px !important;
            cursor: pointer !important;
            padding: 0 !important;
            width: 24px !important;
            height: 24px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            border-radius: 4px !important;
        }
        .vt-settings-close:hover {
            background: rgba(255,255,255,0.1) !important;
            color: #fff !important;
        }
        .vt-settings-body {
            padding: 8px 12px 12px !important;
        }
        .vt-setting-row {
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            margin-bottom: 8px !important;
        }
        .vt-setting-row:last-child {
            margin-bottom: 0 !important;
        }
        .vt-setting-row label {
            color: rgba(255,255,255,0.8) !important;
            font-size: 12px !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        }
        .vt-setting-row select {
            background: rgba(255,255,255,0.1) !important;
            border: 1px solid rgba(255,255,255,0.2) !important;
            border-radius: 4px !important;
            color: #fff !important;
            padding: 4px 8px !important;
            font-size: 12px !important;
            cursor: pointer !important;
            min-width: 80px !important;
        }
        .vt-setting-row select:focus {
            outline: none !important;
            border-color: #00d9ff !important;
        }
        .vt-setting-row select option {
            background: #222 !important;
            color: #fff !important;
        }
    `;
    document.head.appendChild(style);
}

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

        // Map stages to status types
        const stageTypes = {
            'checking': 'loading',
            'downloading': 'loading',
            'whisper': 'loading',
            'translating': 'loading',
            'complete': 'success',
        };

        // Build options object with all progress details
        const options = {};
        if (step !== undefined) options.step = step;
        if (totalSteps !== undefined) options.totalSteps = totalSteps;
        if (eta) options.eta = eta;
        if (batchInfo) options.batchInfo = batchInfo;

        updateStatus(msg, stageTypes[stage] || 'loading', percent, options);
        sendResponse({ received: true });
    }
    return true;
});

// Initialize
init();
