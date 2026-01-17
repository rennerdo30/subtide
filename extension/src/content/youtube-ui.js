let controlsObserver = null;
let playerObserver = null;
let reinjectionDebounceTimer = null;

/**
 * Wait for YouTube player controls to be available
 * @param {number} maxRetries - Maximum retry attempts
 * @returns {Promise<Element>} Controls element
 */
function waitForControls(maxRetries = 30) {
    return new Promise((resolve, reject) => {
        let retries = 0;
        const check = () => {
            const controls = document.querySelector('.ytp-right-controls');
            if (controls && controls.offsetParent !== null) {
                resolve(controls);
            } else if (retries < maxRetries) {
                retries++;
                setTimeout(check, 500);
            } else {
                console.warn('[Subtide] Controls not found after max retries');
                reject(new Error('Controls not found'));
            }
        };
        check();
    });
}

/**
 * Wait for YouTube video player
 * @returns {Promise<Element>} Player element
 */
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
 * Debounced re-injection to avoid excessive DOM operations
 */
function debouncedReinjection() {
    if (reinjectionDebounceTimer) {
        clearTimeout(reinjectionDebounceTimer);
    }
    reinjectionDebounceTimer = setTimeout(() => {
        if (!document.querySelector('.vt-container')) {
            const controls = document.querySelector('.ytp-right-controls');
            if (controls && controls.offsetParent !== null) {
                console.log('[Subtide] Debounced re-injection triggered');
                injectUI(controls);
            }
        }
    }, 100); // 100ms debounce
}

/**
 * Watch for controls removal and re-inject UI
 * Uses a more aggressive strategy to handle YouTube's dynamic rendering
 * @param {Element} controls - Controls element to watch
 */
function watchControls(controls) {
    // Disconnect any existing observers
    if (controlsObserver) controlsObserver.disconnect();
    if (playerObserver) playerObserver.disconnect();

    // Strategy 1: Watch the controls element directly
    controlsObserver = new MutationObserver((mutations) => {
        if (!document.querySelector('.vt-container')) {
            console.log('[Subtide] UI missing (controls mutation), re-injecting...');
            debouncedReinjection();
        }
    });
    controlsObserver.observe(controls, { childList: true });

    // Strategy 2: Watch the entire player container for any DOM changes
    // This catches YouTube replacing the controls entirely
    const player = document.querySelector('.html5-video-player');
    if (player) {
        playerObserver = new MutationObserver((mutations) => {
            // Check if our button is still there
            if (!document.querySelector('.vt-container')) {
                // Verify controls still exist or find new ones
                const newControls = document.querySelector('.ytp-right-controls');
                if (newControls && newControls.offsetParent !== null) {
                    console.log('[Subtide] UI missing (player mutation), re-injecting...');
                    debouncedReinjection();
                }
            }
        });
        // Watch entire player subtree for changes
        playerObserver.observe(player, { childList: true, subtree: true });
    }

    // Strategy 3: Watch for controls element replacement
    const parent = controls.parentElement;
    if (parent) {
        const parentObserver = new MutationObserver(() => {
            const newControls = document.querySelector('.ytp-right-controls');
            if (newControls && newControls !== controls) {
                console.log('[Subtide] Controls replaced, re-initializing...');
                controls = newControls;
                debouncedReinjection();
                watchControls(controls);
            }
        });
        parentObserver.observe(parent, { childList: true });
    }
}

/**
 * Remove only buttons, not the whole UI
 */
function removeButtonsOnly() {
    document.querySelector('.vt-container')?.remove();
}

/**
 * Remove all UI elements
 */
function removeUI() {
    removeButtonsOnly();
    document.querySelector('.vt-overlay')?.remove();
    document.querySelector('.vt-status-panel')?.remove();
    document.querySelector('.vt-settings-panel')?.remove();

    if (controlsObserver) {
        controlsObserver.disconnect();
        controlsObserver = null;
    }
}

/**
 * Create status panel HTML
 * @returns {string} Status panel HTML
 */
function createStatusPanelHTML() {
    return `
        <div class="vt-status-content">
            <div class="vt-step-indicator"></div>
            <div class="vt-status-main">
                <span class="vt-status-text"></span>
                <span class="vt-sub-status"></span>
            </div>
            <div class="vt-progress-bar">
                <div class="vt-progress-fill"></div>
            </div>
            <div class="vt-status-details">
                <span class="vt-batch-info"></span>
                <span class="vt-eta"></span>
            </div>
        </div>
    `;
}

/**
 * Create settings panel HTML
 * @returns {string} Settings panel HTML
 */
function createSettingsPanelHTML() {
    return `
        <div class="vt-settings-menu-content">
            <div class="vt-settings-back header-hidden">
                <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
                <span class="vt-back-title">${chrome.i18n.getMessage('menuBack')}</span>
            </div>
            <div class="vt-main-menu">
                <div class="vt-menu-section-group">
                    <div class="vt-menu-option vt-translate-action">
                        <svg viewBox="0 0 24 24" width="24" height="24" style="color: #fff;"><path fill="currentColor" d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/></svg>
                        <span class="vt-option-label" style="font-weight: 500;">${chrome.i18n.getMessage('translateVideo')}</span>
                        <span class="vt-shortcut-hint">Alt+T</span>
                    </div>
                    <div class="vt-menu-option" data-setting="lang">
                        <span class="vt-option-label">${chrome.i18n.getMessage('targetLanguage')}</span>
                        <span class="vt-option-value" data-value="lang">English</span>
                    </div>
                </div>
                <div class="vt-menu-separator"></div>
                <div class="vt-menu-section-group">
                    <div class="vt-menu-option vt-toggle-visibility">
                        <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
                        <span class="vt-option-label">${chrome.i18n.getMessage('menuToggleSubtitles')}</span>
                        <span class="vt-shortcut-hint">Alt+S</span>
                    </div>
                    <div class="vt-menu-option" data-setting="styleMenu">
                        <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M2.53 19.65l1.34.56v-9.03l-2.43 5.86c-.41 1.02.08 2.19 1.09 2.61zm19.5-3.7L17.07 3.98a2.013 2.013 0 00-1.81-1.23c-.26 0-.53.04-.79.15L7.1 5.95a1.999 1.999 0 00-1.08 2.6l4.96 11.97a1.998 1.998 0 002.6 1.08l7.36-3.05a1.994 1.994 0 001.09-2.6zM7.88 8.75c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-2 11c0 1.1.9 2 2 2h1.45l-3.45-8.34v6.34z"/></svg>
                        <span class="vt-option-label">${chrome.i18n.getMessage('subtitleStyle')}</span>
                        <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
                    </div>
                    <div class="vt-menu-option" data-setting="moreOptions">
                        <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
                        <span class="vt-option-label">${chrome.i18n.getMessage('menuMoreOptions')}</span>
                        <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
                    </div>
                </div>
            </div>
            ${createStyleSubmenuHTML()}
            ${createMoreOptionsSubmenuHTML()}
            ${createSubmenusHTML()}
        </div>
    `;
}

/**
 * Create style submenu HTML (grouped subtitle settings)
 * @returns {string} Style submenu HTML
 */
function createStyleSubmenuHTML() {
    return `
        <div class="vt-submenu vt-style-submenu" data-for="styleMenu" style="display: none;">
            ${createSettingsOptionsHTML()}
        </div>
    `;
}

/**
 * Create more options submenu HTML
 * @returns {string} More options submenu HTML
 */
function createMoreOptionsSubmenuHTML() {
    return `
        <div class="vt-submenu vt-more-submenu" data-for="moreOptions" style="display: none;">
            <div class="vt-menu-option vt-force-translate">
                <svg viewBox="0 0 24 24" width="24" height="24" style="color: #4CAF50;"><path fill="currentColor" d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
                <span class="vt-option-label">${chrome.i18n.getMessage('forceRetranslate') || 'Force Re-translate'}</span>
            </div>
            <div class="vt-menu-option vt-live-action">
                <svg viewBox="0 0 24 24" width="24" height="24" style="color: #ff0000;"><circle cx="12" cy="12" r="8" fill="currentColor"/></svg>
                <span class="vt-option-label">${chrome.i18n.getMessage('liveTranslate')}</span>
            </div>
            <div class="vt-menu-separator"></div>
            <div class="vt-menu-option vt-dual-toggle">
                <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/></svg>
                <span class="vt-option-label">${chrome.i18n.getMessage('menuDualSubtitles')}</span>
                <span class="vt-option-value vt-dual-status">${chrome.i18n.getMessage('menuSpeakerOff')}</span>
            </div>
            <div class="vt-menu-option vt-tts-toggle">
                <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
                <span class="vt-option-label">Text-to-Speech</span>
                <span class="vt-option-value vt-tts-status">Off</span>
            </div>
            <div class="vt-tts-controls" style="display: none;">
                <div class="vt-tts-speed">
                    <span class="vt-tts-label">Speed:</span>
                    <input type="range" class="vt-tts-speed-slider" min="0.5" max="2" step="0.1" value="1">
                    <span class="vt-tts-speed-value">1.0x</span>
                </div>
                <div class="vt-tts-volume">
                    <span class="vt-tts-label">Volume:</span>
                    <input type="range" class="vt-tts-volume-slider" min="0" max="1" step="0.1" value="0.8">
                    <span class="vt-tts-volume-value">80%</span>
                </div>
            </div>
            <div class="vt-sync-controls">
                <span class="vt-sync-label">${chrome.i18n.getMessage('menuSync')}</span>
                <button class="vt-sync-btn vt-sync-fine" data-offset="-100">-0.1s</button>
                <button class="vt-sync-btn" data-offset="-500">-0.5s</button>
                <span class="vt-sync-display">+0.0s</span>
                <button class="vt-sync-btn" data-offset="500">+0.5s</button>
                <button class="vt-sync-btn vt-sync-fine" data-offset="100">+0.1s</button>
                <button class="vt-sync-btn vt-sync-reset">${chrome.i18n.getMessage('menuReset')}</button>
                <button class="vt-sync-btn vt-calibrate-btn" title="Auto-calibrate sync timing">Cal</button>
            </div>
            <div class="vt-menu-separator"></div>
            <div class="vt-menu-option" data-setting="download">
                <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                <span class="vt-option-label">${chrome.i18n.getMessage('menuDownload')}</span>
                <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
            </div>
            <div class="vt-menu-option vt-add-to-queue">
                <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                <span class="vt-option-label">${chrome.i18n.getMessage('menuAddToQueue')}</span>
            </div>
        </div>
    `;
}

/**
 * Create settings options HTML
 * @returns {string} Settings options HTML
 */
function createSettingsOptionsHTML() {
    const options = [
        { key: 'size', label: chrome.i18n.getMessage('size'), defaultValue: chrome.i18n.getMessage('sizeMedium') },
        { key: 'position', label: chrome.i18n.getMessage('position'), defaultValue: chrome.i18n.getMessage('posBottom') },
        { key: 'background', label: chrome.i18n.getMessage('background'), defaultValue: chrome.i18n.getMessage('bgDark') },
        { key: 'color', label: chrome.i18n.getMessage('textColor'), defaultValue: chrome.i18n.getMessage('colorWhite') },
        { key: 'font', label: 'Font', defaultValue: chrome.i18n.getMessage('menuFontSans') },
        { key: 'outline', label: 'Text Outline', defaultValue: chrome.i18n.getMessage('menuOutlineMedium') },
        { key: 'opacity', label: 'Opacity', defaultValue: chrome.i18n.getMessage('menuOpacityFull') },
        { key: 'showSpeaker', label: 'Speaker Labels', defaultValue: chrome.i18n.getMessage('menuSpeakerColor') },
    ];

    return options.map(opt => `
        <div class="vt-menu-option" data-setting="${opt.key}">
            <span class="vt-option-label">${opt.label}</span>
            <span class="vt-option-value" data-value="${opt.key}">${opt.defaultValue}</span>
            <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
        </div>
    `).join('');
}

/**
 * Create submenus HTML
 * @returns {string} Submenus HTML
 */
function createSubmenusHTML() {
    const submenus = {
        lang: [
            { val: 'en', label: chrome.i18n.getMessage('langEn') },
            { val: 'ja', label: chrome.i18n.getMessage('langJa') },
            { val: 'ko', label: chrome.i18n.getMessage('langKo') },
            { val: 'zh-CN', label: chrome.i18n.getMessage('langZhCN') },
            { val: 'es', label: chrome.i18n.getMessage('langEs') },
            { val: 'fr', label: chrome.i18n.getMessage('langFr') },
            { val: 'de', label: chrome.i18n.getMessage('langDe') },
            { val: 'pt', label: chrome.i18n.getMessage('langPt') },
            { val: 'ru', label: chrome.i18n.getMessage('langRu') },
        ],
        size: [
            { val: 'small', label: chrome.i18n.getMessage('sizeSmall') },
            { val: 'medium', label: chrome.i18n.getMessage('sizeMedium') },
            { val: 'large', label: chrome.i18n.getMessage('sizeLarge') },
            { val: 'xlarge', label: chrome.i18n.getMessage('sizeExtraLarge') },
            { val: 'huge', label: chrome.i18n.getMessage('sizeHuge') },
            { val: 'gigantic', label: chrome.i18n.getMessage('sizeGigantic') },
        ],
        position: [
            { val: 'bottom', label: 'Bottom' },
            { val: 'top', label: 'Top' },
        ],
        background: [
            { val: 'dark', label: chrome.i18n.getMessage('bgDark') },
            { val: 'darker', label: chrome.i18n.getMessage('bgDarker') },
            { val: 'transparent', label: chrome.i18n.getMessage('bgTransparent') },
            { val: 'none', label: chrome.i18n.getMessage('bgNone') },
        ],
        color: [
            { val: 'white', label: chrome.i18n.getMessage('colorWhite') },
            { val: 'yellow', label: chrome.i18n.getMessage('colorYellow') },
            { val: 'cyan', label: chrome.i18n.getMessage('colorCyan') },
            { val: 'speaker', label: chrome.i18n.getMessage('menuSpeakerColor') },
        ],
        font: [
            { val: 'sans-serif', label: chrome.i18n.getMessage('menuFontSans') },
            { val: 'serif', label: chrome.i18n.getMessage('menuFontSerif') },
            { val: 'monospace', label: chrome.i18n.getMessage('menuFontMono') },
            { val: 'casual', label: chrome.i18n.getMessage('menuFontCasual') },
        ],
        outline: [
            { val: 'none', label: chrome.i18n.getMessage('menuOutlineNone') },
            { val: 'light', label: chrome.i18n.getMessage('menuOutlineLight') },
            { val: 'medium', label: chrome.i18n.getMessage('menuOutlineMedium') },
            { val: 'heavy', label: chrome.i18n.getMessage('menuOutlineHeavy') },
        ],
        opacity: [
            { val: 'full', label: chrome.i18n.getMessage('menuOpacityFull') },
            { val: 'high', label: chrome.i18n.getMessage('menuOpacityHigh') },
            { val: 'medium', label: chrome.i18n.getMessage('menuOpacityMedium') },
            { val: 'low', label: chrome.i18n.getMessage('menuOpacityLow') },
        ],
        showSpeaker: [
            { val: 'off', label: chrome.i18n.getMessage('menuSpeakerOff') },
            { val: 'color', label: chrome.i18n.getMessage('menuSpeakerColor') },
            { val: 'label', label: chrome.i18n.getMessage('menuSpeakerLabel') },
            { val: 'both', label: chrome.i18n.getMessage('menuSpeakerBoth') },
        ],
        download: [
            { val: 'srt', label: chrome.i18n.getMessage('menuDownloadSRT') },
            { val: 'vtt', label: chrome.i18n.getMessage('menuDownloadVTT') },
        ],
    };

    return Object.entries(submenus).map(([key, items]) => `
        <div class="vt-submenu" data-for="${key}" style="display: none;">
            ${items.map(item => `<div class="vt-submenu-item" data-val="${item.val}">${item.label}</div>`).join('')}
        </div>
    `).join('');
}

/**
 * Get value labels for settings display
 * @returns {Object} Value labels mapping
 */
function getValueLabels() {
    return {
        size: {
            small: chrome.i18n.getMessage('sizeSmall'),
            medium: chrome.i18n.getMessage('sizeMedium'),
            large: chrome.i18n.getMessage('sizeLarge'),
            xlarge: chrome.i18n.getMessage('sizeExtraLarge'),
            huge: chrome.i18n.getMessage('sizeHuge'),
            gigantic: chrome.i18n.getMessage('sizeGigantic')
        },
        position: {
            bottom: chrome.i18n.getMessage('posBottom'),
            top: chrome.i18n.getMessage('posTop')
        },
        background: {
            dark: chrome.i18n.getMessage('bgDark'),
            darker: chrome.i18n.getMessage('bgDarker'),
            transparent: chrome.i18n.getMessage('bgTransparent'),
            none: chrome.i18n.getMessage('bgNone')
        },
        color: {
            white: chrome.i18n.getMessage('colorWhite'),
            yellow: chrome.i18n.getMessage('colorYellow'),
            cyan: chrome.i18n.getMessage('colorCyan'),
            speaker: chrome.i18n.getMessage('menuSpeakerColor')
        },
        font: {
            'sans-serif': chrome.i18n.getMessage('menuFontSans'),
            'serif': chrome.i18n.getMessage('menuFontSerif'),
            'monospace': chrome.i18n.getMessage('menuFontMono'),
            'casual': chrome.i18n.getMessage('menuFontCasual')
        },
        outline: {
            none: chrome.i18n.getMessage('menuOutlineNone'),
            light: chrome.i18n.getMessage('menuOutlineLight'),
            medium: chrome.i18n.getMessage('menuOutlineMedium'),
            heavy: chrome.i18n.getMessage('menuOutlineHeavy')
        },
        opacity: {
            full: chrome.i18n.getMessage('menuOpacityFull'),
            high: chrome.i18n.getMessage('menuOpacityHigh'),
            medium: chrome.i18n.getMessage('menuOpacityMedium'),
            low: chrome.i18n.getMessage('menuOpacityLow')
        },
        showSpeaker: {
            off: chrome.i18n.getMessage('menuSpeakerOff'),
            color: chrome.i18n.getMessage('menuSpeakerColor'),
            label: chrome.i18n.getMessage('menuSpeakerLabel'),
            both: chrome.i18n.getMessage('menuSpeakerBoth')
        },
        lang: {
            'en': chrome.i18n.getMessage('langEn'),
            'ja': chrome.i18n.getMessage('langJa'),
            'ko': chrome.i18n.getMessage('langKo'),
            'zh-CN': chrome.i18n.getMessage('langZhCN'),
            'es': chrome.i18n.getMessage('langEs'),
            'fr': chrome.i18n.getMessage('langFr'),
            'de': chrome.i18n.getMessage('langDe'),
            'pt': chrome.i18n.getMessage('langPt'),
            'ru': chrome.i18n.getMessage('langRu')
        }
    };
}

/**
 * Setup settings panel event listeners
 * @param {Element} settingsPanel - Settings panel element
 */
function setupSettingsPanelListeners(settingsPanel) {
    const mainMenu = settingsPanel.querySelector('.vt-main-menu');
    const backBtn = settingsPanel.querySelector('.vt-settings-back');
    const backTitle = settingsPanel.querySelector('.vt-back-title');
    const valueLabels = getValueLabels();

    // Track current submenu depth for back navigation
    let submenuStack = [];

    // Update displayed values from saved settings
    const updateDisplayedValues = () => {
        // Language
        const langEl = settingsPanel.querySelector('[data-value="lang"]');
        if (langEl) {
            langEl.textContent = valueLabels.lang[selectedLanguage] || selectedLanguage;
        }

        Object.keys(subtitleSettings).forEach(key => {
            const el = settingsPanel.querySelector(`[data-value="${key}"]`);
            if (el && valueLabels[key]) {
                el.textContent = valueLabels[key][subtitleSettings[key]] || subtitleSettings[key];
            }
        });

        // Update checkmarks in submenus
        settingsPanel.querySelectorAll('.vt-submenu-item').forEach(item => {
            item.classList.remove('selected');
        });

        // Language checkmark
        const langSubmenu = settingsPanel.querySelector('[data-for="lang"]');
        if (langSubmenu) {
            const selected = langSubmenu.querySelector(`[data-val="${selectedLanguage}"]`);
            if (selected) selected.classList.add('selected');
        }

        Object.keys(subtitleSettings).forEach(key => {
            const submenu = settingsPanel.querySelector(`[data-for="${key}"]`);
            if (submenu) {
                const selected = submenu.querySelector(`[data-val="${subtitleSettings[key]}"]`);
                if (selected) selected.classList.add('selected');
            }
        });

        // Update dual status
        const dualStatus = settingsPanel.querySelector('.vt-dual-status');
        if (dualStatus) {
            dualStatus.textContent = subtitleSettings.dualMode ? 'On' : chrome.i18n.getMessage('menuSpeakerOff');
        }
    };
    updateDisplayedValues();

    // Add translate action
    const translateBtn = settingsPanel.querySelector('.vt-translate-action');
    translateBtn.addEventListener('click', () => {
        translateVideo(selectedLanguage);
        settingsPanel.classList.remove('show');
    });

    // Add live action (in more options submenu)
    settingsPanel.querySelectorAll('.vt-live-action').forEach(liveBtn => {
        liveBtn.addEventListener('click', () => {
            toggleLiveTranslate();
            settingsPanel.classList.remove('show');
        });
    });

    // Add force re-translate action (in more options submenu)
    settingsPanel.querySelectorAll('.vt-force-translate').forEach(forceBtn => {
        forceBtn.addEventListener('click', () => {
            forceRetranslate();
            settingsPanel.classList.remove('show');
        });
    });

    // Dual subtitles toggle (in more options submenu)
    settingsPanel.querySelectorAll('.vt-dual-toggle').forEach(dualToggle => {
        dualToggle.addEventListener('click', () => {
            toggleDualMode();
            updateDisplayedValues();
        });
    });

    // TTS toggle (in more options submenu)
    settingsPanel.querySelectorAll('.vt-tts-toggle').forEach(ttsToggle => {
        ttsToggle.addEventListener('click', () => {
            if (window.vtTTS) {
                const newState = !window.vtTTS.isEnabled();
                window.vtTTS.setEnabled(newState);

                // Update UI
                const statusEl = ttsToggle.querySelector('.vt-tts-status');
                if (statusEl) {
                    statusEl.textContent = newState ? 'On' : 'Off';
                }

                // Show/hide controls
                const controlsEl = settingsPanel.querySelector('.vt-tts-controls');
                if (controlsEl) {
                    controlsEl.style.display = newState ? 'block' : 'none';
                }
            }
        });
    });

    // TTS speed slider
    const ttsSpeedSlider = settingsPanel.querySelector('.vt-tts-speed-slider');
    if (ttsSpeedSlider) {
        ttsSpeedSlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            if (window.vtTTS) {
                window.vtTTS.setRate(value);
            }
            const valueEl = settingsPanel.querySelector('.vt-tts-speed-value');
            if (valueEl) {
                valueEl.textContent = value.toFixed(1) + 'x';
            }
        });
    }

    // TTS volume slider
    const ttsVolumeSlider = settingsPanel.querySelector('.vt-tts-volume-slider');
    if (ttsVolumeSlider) {
        ttsVolumeSlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            if (window.vtTTS) {
                window.vtTTS.setVolume(value);
            }
            const valueEl = settingsPanel.querySelector('.vt-tts-volume-value');
            if (valueEl) {
                valueEl.textContent = Math.round(value * 100) + '%';
            }
        });
    }

    // Toggle visibility
    const visibilityToggle = settingsPanel.querySelector('.vt-toggle-visibility');
    if (visibilityToggle) {
        visibilityToggle.addEventListener('click', () => {
            toggleSubtitleVisibility();
        });
    }

    // Sync offset buttons
    settingsPanel.querySelectorAll('.vt-sync-btn[data-offset]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const offset = parseInt(btn.dataset.offset, 10);
            adjustSyncOffset(offset);
        });
    });

    // Sync reset button
    settingsPanel.querySelectorAll('.vt-sync-reset').forEach(syncReset => {
        syncReset.addEventListener('click', (e) => {
            e.stopPropagation();
            resetSyncOffset();
        });
    });

    // Calibrate button
    settingsPanel.querySelectorAll('.vt-calibrate-btn').forEach(calibrateBtn => {
        calibrateBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            startSyncCalibration();
        });
    });

    // Add to Queue button
    settingsPanel.querySelectorAll('.vt-add-to-queue').forEach(addToQueueBtn => {
        addToQueueBtn.addEventListener('click', async () => {
            if (!currentVideoId) {
                console.warn('[Subtide] No video ID for queue');
                return;
            }

            const title = document.querySelector('h1.ytd-video-primary-info-renderer')?.textContent?.trim()
                || document.querySelector('h1.title')?.textContent?.trim()
                || currentVideoId;

            try {
                const response = await sendMessage({
                    action: 'addToQueue',
                    videoId: currentVideoId,
                    title: title,
                    targetLanguage: selectedLanguage
                });

                if (response.success) {
                    console.log('[Subtide] Added to queue:', currentVideoId);
                    addToQueueBtn.querySelector('.vt-option-label').textContent = chrome.i18n.getMessage('menuAdded');
                    setTimeout(() => {
                        addToQueueBtn.querySelector('.vt-option-label').textContent = chrome.i18n.getMessage('menuAddToQueue');
                    }, 2000);
                } else {
                    console.warn('[Subtide] Queue error:', response.error);
                    addToQueueBtn.querySelector('.vt-option-label').textContent = response.error || 'Error';
                    setTimeout(() => {
                        addToQueueBtn.querySelector('.vt-option-label').textContent = chrome.i18n.getMessage('menuAddToQueue');
                    }, 2000);
                }
            } catch (error) {
                console.error('[Subtide] Failed to add to queue:', error);
            }

            settingsPanel.classList.remove('show');
        });
    });

    // Function to show a submenu
    const showSubmenu = (submenuId, title, parentId = null) => {
        const submenu = settingsPanel.querySelector(`[data-for="${submenuId}"]`);
        if (submenu) {
            // Hide all menus
            mainMenu.style.display = 'none';
            settingsPanel.querySelectorAll('.vt-submenu').forEach(s => s.style.display = 'none');

            // Show the target submenu
            submenu.style.display = 'block';
            backBtn.classList.remove('header-hidden');
            backTitle.textContent = title;

            // Track navigation
            submenuStack.push({ id: submenuId, parent: parentId });
        }
    };

    // Function to go back
    const goBack = () => {
        if (submenuStack.length === 0) {
            // Go to main menu
            settingsPanel.querySelectorAll('.vt-submenu').forEach(s => s.style.display = 'none');
            mainMenu.style.display = 'block';
            backBtn.classList.add('header-hidden');
        } else {
            const current = submenuStack.pop();
            if (current.parent) {
                // Go to parent submenu
                const parentSubmenu = settingsPanel.querySelector(`[data-for="${current.parent}"]`);
                if (parentSubmenu) {
                    settingsPanel.querySelectorAll('.vt-submenu').forEach(s => s.style.display = 'none');
                    parentSubmenu.style.display = 'block';
                    // Update back title based on parent
                    const parentTitles = { styleMenu: chrome.i18n.getMessage('menuSubtitleStyle'), moreOptions: chrome.i18n.getMessage('menuMoreOptions') };
                    backTitle.textContent = parentTitles[current.parent] || chrome.i18n.getMessage('menuBack');
                }
            } else {
                // Go to main menu
                settingsPanel.querySelectorAll('.vt-submenu').forEach(s => s.style.display = 'none');
                mainMenu.style.display = 'block';
                backBtn.classList.add('header-hidden');
                submenuStack = [];
            }
        }
    };

    // Main menu option click -> show submenu
    mainMenu.querySelectorAll('.vt-menu-option[data-setting]').forEach(option => {
        option.addEventListener('click', () => {
            const setting = option.dataset.setting;
            if (!setting) return;

            const title = option.querySelector('.vt-option-label').textContent;
            showSubmenu(setting, title);
        });
    });

    // Style submenu options -> show value submenu
    const styleSubmenu = settingsPanel.querySelector('[data-for="styleMenu"]');
    if (styleSubmenu) {
        styleSubmenu.querySelectorAll('.vt-menu-option[data-setting]').forEach(option => {
            option.addEventListener('click', () => {
                const setting = option.dataset.setting;
                if (!setting) return;

                const title = option.querySelector('.vt-option-label').textContent;
                showSubmenu(setting, title, 'styleMenu');
            });
        });
    }

    // More options submenu -> show value submenu (for download)
    const moreSubmenu = settingsPanel.querySelector('[data-for="moreOptions"]');
    if (moreSubmenu) {
        moreSubmenu.querySelectorAll('.vt-menu-option[data-setting]').forEach(option => {
            option.addEventListener('click', () => {
                const setting = option.dataset.setting;
                if (!setting) return;

                const title = option.querySelector('.vt-option-label').textContent;
                showSubmenu(setting, title, 'moreOptions');
            });
        });
    }

    // Back button click
    backBtn.addEventListener('click', goBack);

    // Submenu item click -> apply setting
    settingsPanel.querySelectorAll('.vt-submenu-item').forEach(item => {
        item.addEventListener('click', () => {
            const submenu = item.closest('.vt-submenu');
            const setting = submenu.dataset.for;
            const value = item.dataset.val;

            // Handle download format selection
            if (setting === 'download') {
                downloadSubtitles(value);
                goBack();
                return;
            }

            if (setting === 'lang') {
                selectedLanguage = value;
                updateDisplayedValues();
                sendMessage({
                    action: 'saveConfig',
                    config: { defaultLanguage: value }
                });
                goBack();
                return;
            }

            subtitleSettings[setting] = value;
            addStyles();

            sendMessage({
                action: 'saveConfig',
                config: {
                    subtitleSize: subtitleSettings.size,
                    subtitlePosition: subtitleSettings.position,
                    subtitleBackground: subtitleSettings.background,
                    subtitleColor: subtitleSettings.color,
                    subtitleFont: subtitleSettings.font,
                    subtitleOutline: subtitleSettings.outline,
                    subtitleOpacity: subtitleSettings.opacity,
                    subtitleShowSpeaker: subtitleSettings.showSpeaker,
                }
            });

            updateDisplayedValues();
            goBack();
        });
    });
}

/**
 * Inject translate UI into YouTube player
 * @param {Element} controlsElement - Controls element to inject into
 */
function injectUI(controlsElement) {
    // Avoid duplicates
    if (document.querySelector('.vt-container')) return;

    const controls = controlsElement || document.querySelector('.ytp-right-controls');
    if (!controls) return;

    const container = document.createElement('div');
    container.className = 'vt-container';
    controls.prepend(container);

    // Status panel overlay on video
    const player = document.querySelector('.html5-video-player');
    if (player && !player.querySelector('.vt-status-panel')) {
        const statusPanel = document.createElement('div');
        statusPanel.className = 'vt-status-panel';
        statusPanel.innerHTML = createStatusPanelHTML();
        player.appendChild(statusPanel);
    }

    // Add settings panel
    if (player && !player.querySelector('.vt-settings-panel')) {
        const settingsPanel = document.createElement('div');
        settingsPanel.className = 'vt-settings-panel ytp-popup ytp-settings-menu';
        settingsPanel.innerHTML = createSettingsPanelHTML();
        player.appendChild(settingsPanel);
        setupSettingsPanelListeners(settingsPanel);
    }

    // Add main button
    const mainBtn = document.createElement('button');
    mainBtn.className = 'vt-main-btn ytp-button';
    const btnLabel = chrome.i18n.getMessage('btnVideoTranslate') || 'Video Translate';
    mainBtn.title = btnLabel;
    mainBtn.setAttribute('aria-label', btnLabel);
    mainBtn.setAttribute('aria-haspopup', 'true');
    mainBtn.setAttribute('aria-expanded', 'false');
    mainBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
            <path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/>
        </svg>
    `;
    container.appendChild(mainBtn);

    // Helper function to close panel and restore focus
    function closePanel(panel, returnFocus = true) {
        panel.classList.remove('show');
        mainBtn.setAttribute('aria-expanded', 'false');
        if (returnFocus) {
            mainBtn.focus();
        }
    }

    mainBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const panel = document.querySelector('.vt-settings-panel');
        if (panel) {
            const wasOpen = panel.classList.contains('show');
            panel.classList.toggle('show');

            if (panel.classList.contains('show')) {
                mainBtn.setAttribute('aria-expanded', 'true');
                const mainMenu = panel.querySelector('.vt-main-menu');
                const backBtn = panel.querySelector('.vt-settings-back');

                panel.querySelectorAll('.vt-submenu').forEach(s => s.style.display = 'none');
                if (mainMenu) mainMenu.style.display = 'block';
                if (backBtn) backBtn.classList.add('header-hidden');

                // Focus management: move focus to first focusable element in panel
                const firstFocusable = panel.querySelector('button, [tabindex="0"], input, select');
                if (firstFocusable) {
                    setTimeout(() => firstFocusable.focus(), 50);
                }
            } else if (wasOpen) {
                mainBtn.setAttribute('aria-expanded', 'false');
                // Return focus to main button when closing
                mainBtn.focus();
            }
        }
    });

    // Keyboard navigation for settings panel
    if (!window._vtKeyboardNavAttached) {
        document.addEventListener('keydown', (e) => {
            const panel = document.querySelector('.vt-settings-panel');
            if (!panel || !panel.classList.contains('show')) return;

            // Escape key closes the panel
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                closePanel(panel, true);
                return;
            }

            // Tab key for focus trapping within panel
            if (e.key === 'Tab') {
                const focusableElements = panel.querySelectorAll(
                    'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]'
                );
                const firstFocusable = focusableElements[0];
                const lastFocusable = focusableElements[focusableElements.length - 1];

                if (e.shiftKey && document.activeElement === firstFocusable) {
                    e.preventDefault();
                    lastFocusable?.focus();
                } else if (!e.shiftKey && document.activeElement === lastFocusable) {
                    e.preventDefault();
                    firstFocusable?.focus();
                }
            }
        });
        window._vtKeyboardNavAttached = true;
    }

    // Close menu on outside click
    if (!window._vtGlobalClickAttached) {
        document.addEventListener('click', (e) => {
            const panel = document.querySelector('.vt-settings-panel');
            const container = document.querySelector('.vt-container');
            if (panel && panel.classList.contains('show')) {
                const isClickInside = container?.contains(e.target) || panel?.contains(e.target);
                if (!isClickInside) {
                    closePanel(panel, true);
                }
            }
        });
        window._vtGlobalClickAttached = true;
    }

    addStyles();
    setupSync();
}
