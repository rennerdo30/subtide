/**
 * YouTube Content Script - UI Components
 * Handles UI injection, settings panel, and styles
 */

let controlsObserver = null;

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
                console.warn('[VideoTranslate] Controls not found after max retries');
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
 * Watch for controls removal and re-inject UI
 * @param {Element} controls - Controls element to watch
 */
function watchControls(controls) {
    if (controlsObserver) controlsObserver.disconnect();

    controlsObserver = new MutationObserver((mutations) => {
        if (!document.querySelector('.vt-container')) {
            console.log('[VideoTranslate] UI missing, re-injecting...');
            injectUI(controls);
        }
    });

    controlsObserver.observe(controls, { childList: true });

    // Also watch parent in case controls itself is replaced
    const parent = controls.parentElement;
    if (parent) {
        const parentObserver = new MutationObserver(() => {
            const newControls = document.querySelector('.ytp-right-controls');
            if (newControls && newControls !== controls) {
                console.log('[VideoTranslate] Controls replaced, re-initializing...');
                controls = newControls;
                injectUI(controls);
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
                    </div>
                    <div class="vt-menu-option" data-setting="lang">
                        <span class="vt-option-label">${chrome.i18n.getMessage('targetLanguage')}</span>
                        <span class="vt-option-value" data-value="lang">English</span>
                    </div>
                </div>
                <div class="vt-menu-separator"></div>
                <div class="vt-menu-title">${chrome.i18n.getMessage('liveTranslation')}</div>
                <div class="vt-menu-section-group">
                    <div class="vt-menu-option vt-live-action">
                        <svg viewBox="0 0 24 24" width="24" height="24" style="color: #ff0000; animation: vt-pulse 2s infinite;"><circle cx="12" cy="12" r="8" fill="currentColor"/></svg>
                        <span class="vt-option-label" style="font-weight: 500;">${chrome.i18n.getMessage('liveTranslate')}</span>
                    </div>
                </div>
                <div class="vt-menu-separator"></div>
                <div class="vt-menu-title">${chrome.i18n.getMessage('subtitleStyle')}</div>
                ${createSettingsOptionsHTML()}
            </div>
            ${createSubmenusHTML()}
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
        { key: 'font', label: 'Font', defaultValue: 'Sans-serif' },
        { key: 'outline', label: 'Text Outline', defaultValue: 'Medium' },
        { key: 'opacity', label: 'Opacity', defaultValue: 'Full' },
        { key: 'showSpeaker', label: 'Speaker Labels', defaultValue: 'Color Only' },
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
            { val: 'small', label: 'Small' },
            { val: 'medium', label: 'Medium' },
            { val: 'large', label: 'Large' },
            { val: 'xlarge', label: 'Extra Large' },
            { val: 'huge', label: 'Huge' },
            { val: 'gigantic', label: 'Gigantic' },
        ],
        position: [
            { val: 'bottom', label: 'Bottom' },
            { val: 'top', label: 'Top' },
        ],
        background: [
            { val: 'dark', label: 'Dark' },
            { val: 'darker', label: 'Darker' },
            { val: 'transparent', label: 'Semi-transparent' },
            { val: 'none', label: 'None' },
        ],
        color: [
            { val: 'white', label: 'White' },
            { val: 'yellow', label: 'Yellow' },
            { val: 'cyan', label: 'Cyan' },
            { val: 'speaker', label: 'By Speaker' },
        ],
        font: [
            { val: 'sans-serif', label: 'Sans-serif' },
            { val: 'serif', label: 'Serif' },
            { val: 'monospace', label: 'Monospace' },
            { val: 'casual', label: 'Casual' },
        ],
        outline: [
            { val: 'none', label: 'None' },
            { val: 'light', label: 'Light' },
            { val: 'medium', label: 'Medium' },
            { val: 'heavy', label: 'Heavy' },
        ],
        opacity: [
            { val: 'full', label: 'Full (100%)' },
            { val: 'high', label: 'High (85%)' },
            { val: 'medium', label: 'Medium (70%)' },
            { val: 'low', label: 'Low (50%)' },
        ],
        showSpeaker: [
            { val: 'off', label: 'Off' },
            { val: 'color', label: 'Color Only' },
            { val: 'label', label: 'Show Label' },
            { val: 'both', label: 'Color + Label' },
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
            speaker: 'By Speaker'
        },
        font: {
            'sans-serif': 'Sans-serif',
            'serif': 'Serif',
            'monospace': 'Monospace',
            'casual': 'Casual'
        },
        outline: {
            none: 'None',
            light: 'Light',
            medium: 'Medium',
            heavy: 'Heavy'
        },
        opacity: {
            full: 'Full (100%)',
            high: 'High (85%)',
            medium: 'Medium (70%)',
            low: 'Low (50%)'
        },
        showSpeaker: {
            off: 'Off',
            color: 'Color Only',
            label: 'Show Label',
            both: 'Color + Label'
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
    };
    updateDisplayedValues();

    // Add translate action
    const translateBtn = settingsPanel.querySelector('.vt-translate-action');
    translateBtn.addEventListener('click', () => {
        translateVideo(selectedLanguage);
        settingsPanel.classList.remove('show');
    });

    // Add live action
    const liveBtn = settingsPanel.querySelector('.vt-live-action');
    liveBtn.addEventListener('click', () => {
        toggleLiveTranslate();
        settingsPanel.classList.remove('show');
    });

    // Main menu option click -> show submenu
    settingsPanel.querySelectorAll('.vt-menu-option').forEach(option => {
        option.addEventListener('click', () => {
            const setting = option.dataset.setting;
            if (!setting) return;

            const submenu = settingsPanel.querySelector(`[data-for="${setting}"]`);
            if (submenu) {
                mainMenu.style.display = 'none';
                submenu.style.display = 'block';
                backBtn.classList.remove('header-hidden');
                backTitle.textContent = option.querySelector('.vt-option-label').textContent;
            }
        });
    });

    // Back button click -> return to main menu
    backBtn.addEventListener('click', () => {
        settingsPanel.querySelectorAll('.vt-submenu').forEach(s => s.style.display = 'none');
        mainMenu.style.display = 'block';
        backBtn.classList.add('header-hidden');
    });

    // Submenu item click -> apply setting
    settingsPanel.querySelectorAll('.vt-submenu-item').forEach(item => {
        item.addEventListener('click', () => {
            const submenu = item.closest('.vt-submenu');
            const setting = submenu.dataset.for;
            const value = item.dataset.val;

            if (setting === 'lang') {
                selectedLanguage = value;
                updateDisplayedValues();
                sendMessage({
                    action: 'saveConfig',
                    config: { defaultLanguage: value }
                });
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
    mainBtn.title = 'Video Translate';
    mainBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/>
        </svg>
    `;
    container.appendChild(mainBtn);

    mainBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const panel = document.querySelector('.vt-settings-panel');
        if (panel) {
            panel.classList.toggle('show');

            if (panel.classList.contains('show')) {
                const mainMenu = panel.querySelector('.vt-main-menu');
                const backBtn = panel.querySelector('.vt-settings-back');

                panel.querySelectorAll('.vt-submenu').forEach(s => s.style.display = 'none');
                if (mainMenu) mainMenu.style.display = 'block';
                if (backBtn) backBtn.classList.add('header-hidden');
            }
        }
    });

    // Close menu on outside click
    if (!window._vtGlobalClickAttached) {
        document.addEventListener('click', (e) => {
            const panel = document.querySelector('.vt-settings-panel');
            const container = document.querySelector('.vt-container');
            if (panel && panel.classList.contains('show')) {
                const isClickInside = container?.contains(e.target) || panel?.contains(e.target);
                if (!isClickInside) {
                    panel.classList.remove('show');
                }
            }
        });
        window._vtGlobalClickAttached = true;
    }

    addStyles();
    setupSync();
}
