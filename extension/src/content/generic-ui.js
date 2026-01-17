/**
 * Generic Video Player - UI Components
 * Control bar, status panel, settings menu, and subtitle overlay
 */

// =============================================================================
// Full Language List (50+)
// =============================================================================

const LANGUAGES = [
    { code: 'en', name: 'English', native: 'English' },
    { code: 'ja', name: 'Japanese', native: '日本語' },
    { code: 'ko', name: 'Korean', native: '한국어' },
    { code: 'zh-CN', name: 'Chinese (Simplified)', native: '简体中文' },
    { code: 'zh-TW', name: 'Chinese (Traditional)', native: '繁體中文' },
    { code: 'es', name: 'Spanish', native: 'Español' },
    { code: 'fr', name: 'French', native: 'Français' },
    { code: 'de', name: 'German', native: 'Deutsch' },
    { code: 'pt', name: 'Portuguese', native: 'Português' },
    { code: 'pt-BR', name: 'Portuguese (Brazil)', native: 'Português (Brasil)' },
    { code: 'ru', name: 'Russian', native: 'Русский' },
    { code: 'ar', name: 'Arabic', native: 'العربية' },
    { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
    { code: 'it', name: 'Italian', native: 'Italiano' },
    { code: 'nl', name: 'Dutch', native: 'Nederlands' },
    { code: 'pl', name: 'Polish', native: 'Polski' },
    { code: 'tr', name: 'Turkish', native: 'Türkçe' },
    { code: 'vi', name: 'Vietnamese', native: 'Tiếng Việt' },
    { code: 'th', name: 'Thai', native: 'ไทย' },
    { code: 'id', name: 'Indonesian', native: 'Bahasa Indonesia' },
    { code: 'ms', name: 'Malay', native: 'Bahasa Melayu' },
    { code: 'fil', name: 'Filipino', native: 'Filipino' },
    { code: 'uk', name: 'Ukrainian', native: 'Українська' },
    { code: 'cs', name: 'Czech', native: 'Čeština' },
    { code: 'sv', name: 'Swedish', native: 'Svenska' },
    { code: 'da', name: 'Danish', native: 'Dansk' },
    { code: 'fi', name: 'Finnish', native: 'Suomi' },
    { code: 'no', name: 'Norwegian', native: 'Norsk' },
    { code: 'el', name: 'Greek', native: 'Ελληνικά' },
    { code: 'he', name: 'Hebrew', native: 'עברית' },
    { code: 'hu', name: 'Hungarian', native: 'Magyar' },
    { code: 'ro', name: 'Romanian', native: 'Română' },
    { code: 'sk', name: 'Slovak', native: 'Slovenčina' },
    { code: 'bg', name: 'Bulgarian', native: 'Български' },
    { code: 'hr', name: 'Croatian', native: 'Hrvatski' },
    { code: 'sr', name: 'Serbian', native: 'Српски' },
    { code: 'sl', name: 'Slovenian', native: 'Slovenščina' },
    { code: 'lt', name: 'Lithuanian', native: 'Lietuvių' },
    { code: 'lv', name: 'Latvian', native: 'Latviešu' },
    { code: 'et', name: 'Estonian', native: 'Eesti' },
    { code: 'bn', name: 'Bengali', native: 'বাংলা' },
    { code: 'ta', name: 'Tamil', native: 'தமிழ்' },
    { code: 'te', name: 'Telugu', native: 'తెలుగు' },
    { code: 'mr', name: 'Marathi', native: 'मराठी' },
    { code: 'gu', name: 'Gujarati', native: 'ગુજરાતી' },
    { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ' },
    { code: 'ml', name: 'Malayalam', native: 'മലയാളം' },
    { code: 'pa', name: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
    { code: 'ur', name: 'Urdu', native: 'اردو' },
    { code: 'fa', name: 'Persian', native: 'فارسی' },
    { code: 'sw', name: 'Swahili', native: 'Kiswahili' },
    { code: 'af', name: 'Afrikaans', native: 'Afrikaans' },
];

// Recent languages (tracked per session)
let recentLanguages = ['en', 'ja', 'es'];

// =============================================================================
// UI State
// =============================================================================

let uiState = {
    controlBarVisible: false,
    settingsPanelOpen: false,
    menuStack: [], // For navigation: [{id, title}]
    subtitlesVisible: true,
    hideTimeout: null,
};

// =============================================================================
// SVG Icons
// =============================================================================

const ICONS = {
    translate: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/></svg>`,
    settings: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.04.17 0 .4.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.58 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.04-.17 0-.4-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>`,
    chevronDown: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/></svg>`,
    chevronRight: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>`,
    back: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>`,
    search: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>`,
    language: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm6.93 6h-2.95c-.32-1.25-.78-2.45-1.38-3.56 1.84.63 3.37 1.91 4.33 3.56zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14C4.1 13.36 4 12.69 4 12s.1-1.36.26-2h3.38c-.08.66-.14 1.32-.14 2 0 .68.06 1.34.14 2H4.26zm.82 2h2.95c.32 1.25.78 2.45 1.38 3.56-1.84-.63-3.37-1.9-4.33-3.56zm2.95-8H5.08c.96-1.66 2.49-2.93 4.33-3.56C8.81 5.55 8.35 6.75 8.03 8zM12 19.96c-.83-1.2-1.48-2.53-1.91-3.96h3.82c-.43 1.43-1.08 2.76-1.91 3.96zM14.34 14H9.66c-.09-.66-.16-1.32-.16-2 0-.68.07-1.35.16-2h4.68c.09.65.16 1.32.16 2 0 .68-.07 1.34-.16 2zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95c-.96 1.65-2.49 2.93-4.33 3.56zM16.36 14c.08-.66.14-1.32.14-2 0-.68-.06-1.34-.14-2h3.38c.16.64.26 1.31.26 2s-.1 1.36-.26 2h-3.38z"/></svg>`,
    visibility: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`,
    visibilityOff: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46A11.804 11.804 0 001 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg>`,
    palette: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>`,
    download: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`,
    keyboard: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 5H4c-1.1 0-1.99.9-1.99 2L2 17c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-9 3h2v2h-2V8zm0 3h2v2h-2v-2zM8 8h2v2H8V8zm0 3h2v2H8v-2zm-1 2H5v-2h2v2zm0-3H5V8h2v2zm9 7H8v-2h8v2zm0-4h-2v-2h2v2zm0-3h-2V8h2v2zm3 3h-2v-2h2v2zm0-3h-2V8h2v2z"/></svg>`,
};

// =============================================================================
// Settings Options
// =============================================================================

const SETTING_OPTIONS = {
    size: [
        { val: 'small', label: 'Small' },
        { val: 'medium', label: 'Medium' },
        { val: 'large', label: 'Large' },
        { val: 'xlarge', label: 'Extra Large' },
        { val: 'huge', label: 'Huge' },
        { val: 'gigantic', label: 'Gigantic' }
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
        { val: 'monospace', label: 'Monospace' },
        { val: 'casual', label: 'Casual' }
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

const PRESETS = {
    cinema: {
        size: 'large',
        position: 'bottom',
        background: 'dark',
        color: 'white',
        font: 'sans-serif',
        outline: 'medium',
        opacity: 'full'
    },
    minimal: {
        size: 'medium',
        position: 'bottom',
        background: 'transparent',
        color: 'white',
        font: 'sans-serif',
        outline: 'heavy',
        opacity: 'high'
    },
    highContrast: {
        size: 'xlarge',
        position: 'bottom',
        background: 'darker',
        color: 'yellow',
        font: 'sans-serif',
        outline: 'heavy',
        opacity: 'full'
    }
};

// =============================================================================
// Control Bar
// =============================================================================

/**
 * Create the control bar HTML
 * @param {string} selectedLang - Current selected language code
 * @returns {string} HTML string
 */
function createControlBarHTML(selectedLang) {
    const langName = LANGUAGES.find(l => l.code === selectedLang)?.name || selectedLang;

    return `
        <button class="vt-translate-btn" title="Translate video (Alt+T)">
            ${ICONS.translate}
            <span class="vt-translate-label">Translate</span>
        </button>

        <div class="vt-lang-dropdown">
            <button class="vt-lang-btn" title="Select language">
                <span class="vt-lang-code">${selectedLang.toUpperCase()}</span>
                ${ICONS.chevronDown}
            </button>
            <div class="vt-lang-menu">
                <div class="vt-lang-search">
                    <input type="text" placeholder="Search languages..." />
                </div>
                <div class="vt-lang-list"></div>
            </div>
        </div>

        <div class="vt-inline-status" style="display: none;">
            <span class="vt-status-message"></span>
            <div class="vt-inline-progress">
                <div class="vt-inline-progress-fill"></div>
            </div>
        </div>

        <button class="vt-subtitle-toggle-btn" title="Toggle subtitles (Alt+S)">
            ${ICONS.visibility}
        </button>

        <button class="vt-settings-btn" title="Settings">
            ${ICONS.settings}
        </button>
    `;
}

/**
 * Create the control bar element
 * @param {HTMLVideoElement} video - Video element
 * @param {Object} options - Options including selectedLanguage, onTranslate, onLanguageChange, etc.
 * @returns {HTMLElement} Control bar element
 */
function createControlBar(video, options) {
    const controlBar = document.createElement('div');
    controlBar.className = 'vt-generic-control-bar';
    controlBar.innerHTML = createControlBarHTML(options.selectedLanguage || 'en');

    // Setup event listeners
    setupControlBarEvents(controlBar, options);

    // Auto-hide logic
    setupAutoHide(video, controlBar);

    return controlBar;
}

/**
 * Setup control bar event listeners
 */
function setupControlBarEvents(controlBar, options) {
    const translateBtn = controlBar.querySelector('.vt-translate-btn');
    const settingsBtn = controlBar.querySelector('.vt-settings-btn');
    const subtitleToggleBtn = controlBar.querySelector('.vt-subtitle-toggle-btn');
    const langDropdown = controlBar.querySelector('.vt-lang-dropdown');
    const langBtn = langDropdown.querySelector('.vt-lang-btn');
    const langMenu = langDropdown.querySelector('.vt-lang-menu');
    const langSearch = langMenu.querySelector('input');
    const langList = langMenu.querySelector('.vt-lang-list');

    // Translate button
    translateBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (options.onTranslate) {
            options.onTranslate();
        }
    });

    // Subtitle toggle button
    subtitleToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (options.onToggleSubtitles) {
            const visible = options.onToggleSubtitles();
            updateSubtitleToggleButton(subtitleToggleBtn, visible);
        }
    });

    // Settings button
    settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (options.onSettingsOpen) {
            options.onSettingsOpen();
        }
    });

    // Language dropdown toggle
    langBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = langDropdown.classList.toggle('open');
        if (isOpen) {
            renderLanguageList(langList, options.selectedLanguage, (code) => {
                options.selectedLanguage = code;
                controlBar.querySelector('.vt-lang-code').textContent = code.toUpperCase();
                langDropdown.classList.remove('open');
                if (options.onLanguageChange) {
                    options.onLanguageChange(code);
                }
                // Add to recent
                if (!recentLanguages.includes(code)) {
                    recentLanguages.unshift(code);
                    if (recentLanguages.length > 5) recentLanguages.pop();
                }
            });
            langSearch.value = '';
            langSearch.focus();
        }
    });

    // Language search
    langSearch.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        renderLanguageList(langList, options.selectedLanguage, (code) => {
            options.selectedLanguage = code;
            controlBar.querySelector('.vt-lang-code').textContent = code.toUpperCase();
            langDropdown.classList.remove('open');
            if (options.onLanguageChange) {
                options.onLanguageChange(code);
            }
        }, query);
    });

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
        if (!langDropdown.contains(e.target)) {
            langDropdown.classList.remove('open');
        }
    });
}

/**
 * Render language list with optional search filter
 */
function renderLanguageList(container, selectedLang, onSelect, searchQuery = '') {
    container.innerHTML = '';

    const filtered = searchQuery
        ? LANGUAGES.filter(l =>
            l.name.toLowerCase().includes(searchQuery) ||
            l.native.toLowerCase().includes(searchQuery) ||
            l.code.toLowerCase().includes(searchQuery)
        )
        : LANGUAGES;

    // Recent section (only if no search)
    if (!searchQuery && recentLanguages.length > 0) {
        const recentSection = document.createElement('div');
        recentSection.className = 'vt-lang-section';
        recentSection.innerHTML = `<div class="vt-lang-section-title">Recent</div>`;

        recentLanguages.forEach(code => {
            const lang = LANGUAGES.find(l => l.code === code);
            if (lang) {
                const item = createLanguageItem(lang, selectedLang, onSelect);
                recentSection.appendChild(item);
            }
        });

        container.appendChild(recentSection);
    }

    // All languages section
    const allSection = document.createElement('div');
    allSection.className = 'vt-lang-section';
    if (!searchQuery) {
        allSection.innerHTML = `<div class="vt-lang-section-title">All Languages</div>`;
    }

    filtered.forEach(lang => {
        const item = createLanguageItem(lang, selectedLang, onSelect);
        allSection.appendChild(item);
    });

    container.appendChild(allSection);
}

/**
 * Create a single language item
 */
function createLanguageItem(lang, selectedLang, onSelect) {
    const item = document.createElement('div');
    item.className = 'vt-lang-item' + (lang.code === selectedLang ? ' selected' : '');
    item.textContent = `${lang.name} (${lang.native})`;
    item.addEventListener('click', () => onSelect(lang.code));
    return item;
}

/**
 * Update subtitle toggle button icon based on visibility state
 */
function updateSubtitleToggleButton(btn, visible) {
    if (!btn) return;
    btn.innerHTML = visible ? ICONS.visibility : ICONS.visibilityOff;
    btn.title = visible ? 'Hide subtitles (Alt+S)' : 'Show subtitles (Alt+S)';
    btn.classList.toggle('subtitles-hidden', !visible);
}

/**
 * Setup auto-hide behavior for control bar
 */
function setupAutoHide(video, controlBar) {
    const parent = video.parentElement;
    if (!parent) return;

    const showControlBar = () => {
        controlBar.classList.add('visible');
        if (uiState.hideTimeout) {
            clearTimeout(uiState.hideTimeout);
        }
        uiState.hideTimeout = setTimeout(() => {
            if (!uiState.settingsPanelOpen) {
                controlBar.classList.remove('visible');
            }
        }, 3000);
    };

    const hideControlBar = () => {
        if (!uiState.settingsPanelOpen) {
            controlBar.classList.remove('visible');
        }
    };

    parent.addEventListener('mouseenter', showControlBar);
    parent.addEventListener('mousemove', showControlBar);
    parent.addEventListener('mouseleave', hideControlBar);

    // Show initially
    showControlBar();
}

// =============================================================================
// Status Panel
// =============================================================================

/**
 * Create status panel HTML
 */
function createStatusPanelHTML() {
    return `
        <div class="vt-status-content">
            <div class="vt-step-indicator pulsing">
                <span class="vt-step-text">Step 1 of 3</span>
            </div>
            <div class="vt-status-text">Initializing...</div>
            <div class="vt-sub-status"></div>
            <div class="vt-progress-bar">
                <div class="vt-progress-fill"></div>
            </div>
            <div class="vt-progress-percent">0%</div>
        </div>
    `;
}

/**
 * Create status panel element
 */
function createStatusPanel() {
    const panel = document.createElement('div');
    panel.className = 'vt-generic-status-panel';
    panel.innerHTML = createStatusPanelHTML();
    return panel;
}

/**
 * Update status panel
 * @param {HTMLElement} panel - Status panel element
 * @param {Object} status - Status update object
 */
function updateStatusPanel(panel, status) {
    if (!panel) return;

    const stepEl = panel.querySelector('.vt-step-indicator');
    const stepText = panel.querySelector('.vt-step-text');
    const textEl = panel.querySelector('.vt-status-text');
    const subStatusEl = panel.querySelector('.vt-sub-status');
    const progressBar = panel.querySelector('.vt-progress-bar');
    const progressFill = panel.querySelector('.vt-progress-fill');
    const percentEl = panel.querySelector('.vt-progress-percent');

    // Update step indicator
    if (status.step && status.totalSteps) {
        stepText.textContent = `Step ${status.step} of ${status.totalSteps}`;
        stepEl.style.display = 'flex';
    } else {
        stepEl.style.display = 'none';
    }

    // Update main text
    if (status.text) {
        textEl.textContent = status.text;
    }

    // Update sub status
    if (status.subText) {
        subStatusEl.textContent = status.subText;
        subStatusEl.style.display = 'block';
    } else {
        subStatusEl.style.display = 'none';
    }

    // Update progress
    if (status.percent !== undefined && status.percent >= 0) {
        progressFill.style.width = `${status.percent}%`;
        percentEl.textContent = `${Math.round(status.percent)}%`;
        progressBar.style.display = 'block';
        percentEl.style.display = 'block';
    } else {
        progressBar.style.display = 'none';
        percentEl.style.display = 'none';
    }

    // Update type (loading, success, error)
    panel.className = 'vt-generic-status-panel show ' + (status.type || 'loading');

    // Auto-hide on success
    if (status.type === 'success') {
        stepEl.classList.remove('pulsing');
        setTimeout(() => {
            panel.classList.remove('show');
        }, 2000);
    } else {
        stepEl.classList.add('pulsing');
    }
}

/**
 * Hide status panel
 */
function hideStatusPanel(panel) {
    if (panel) {
        panel.classList.remove('show');
    }
}

// =============================================================================
// Settings Panel
// =============================================================================

/**
 * Create settings panel HTML
 */
function createSettingsPanelHTML(settings) {
    return `
        <div class="vt-settings-header">
            ${ICONS.back}
            <span class="vt-settings-header-title">Back</span>
        </div>

        <div class="vt-menu-content vt-main-menu">
            <!-- Subtitle Appearance Section -->
            <div class="vt-menu-section">
                <div class="vt-menu-option" data-setting="size">
                    <span class="vt-menu-option-label">Subtitle Size</span>
                    <span class="vt-menu-option-value" data-value="size">${getOptionLabel('size', settings.size)}</span>
                    <span class="vt-menu-option-arrow">${ICONS.chevronRight}</span>
                </div>
                <div class="vt-menu-option" data-setting="position">
                    <span class="vt-menu-option-label">Position</span>
                    <span class="vt-menu-option-value" data-value="position">${getOptionLabel('position', settings.position)}</span>
                    <span class="vt-menu-option-arrow">${ICONS.chevronRight}</span>
                </div>
                <div class="vt-menu-option" data-setting="background">
                    <span class="vt-menu-option-label">Background</span>
                    <span class="vt-menu-option-value" data-value="background">${getOptionLabel('background', settings.background)}</span>
                    <span class="vt-menu-option-arrow">${ICONS.chevronRight}</span>
                </div>
                <div class="vt-menu-option" data-setting="color">
                    <span class="vt-menu-option-label">Text Color</span>
                    <span class="vt-menu-option-value" data-value="color">${getOptionLabel('color', settings.color)}</span>
                    <span class="vt-menu-option-arrow">${ICONS.chevronRight}</span>
                </div>
                <div class="vt-menu-option" data-setting="font">
                    <span class="vt-menu-option-label">Font</span>
                    <span class="vt-menu-option-value" data-value="font">${getOptionLabel('font', settings.font)}</span>
                    <span class="vt-menu-option-arrow">${ICONS.chevronRight}</span>
                </div>
                <div class="vt-menu-option" data-setting="outline">
                    <span class="vt-menu-option-label">Text Outline</span>
                    <span class="vt-menu-option-value" data-value="outline">${getOptionLabel('outline', settings.outline)}</span>
                    <span class="vt-menu-option-arrow">${ICONS.chevronRight}</span>
                </div>
                <div class="vt-menu-option" data-setting="opacity">
                    <span class="vt-menu-option-label">Opacity</span>
                    <span class="vt-menu-option-value" data-value="opacity">${getOptionLabel('opacity', settings.opacity)}</span>
                    <span class="vt-menu-option-arrow">${ICONS.chevronRight}</span>
                </div>
            </div>

            <div class="vt-menu-separator"></div>

            <!-- Presets -->
            <div class="vt-presets">
                <button class="vt-preset-btn" data-preset="cinema">Cinema</button>
                <button class="vt-preset-btn" data-preset="minimal">Minimal</button>
                <button class="vt-preset-btn" data-preset="highContrast">High Contrast</button>
            </div>

            <div class="vt-menu-separator"></div>

            <!-- Toggle Subtitles -->
            <div class="vt-menu-section">
                <div class="vt-menu-option vt-toggle-subtitles">
                    ${ICONS.visibility}
                    <span class="vt-menu-option-label">Toggle Subtitles</span>
                    <span class="vt-shortcut-hint">Alt+S</span>
                </div>
            </div>

            <div class="vt-menu-separator"></div>

            <!-- Keyboard Shortcuts -->
            <div class="vt-shortcuts-section">
                <div class="vt-shortcuts-title">Keyboard Shortcuts</div>
                <div class="vt-shortcut-row">
                    <span class="vt-shortcut-key">Alt+T</span>
                    <span class="vt-shortcut-desc">Translate video</span>
                </div>
                <div class="vt-shortcut-row">
                    <span class="vt-shortcut-key">Alt+S</span>
                    <span class="vt-shortcut-desc">Toggle subtitles</span>
                </div>
                <div class="vt-shortcut-row">
                    <span class="vt-shortcut-key">Alt+L</span>
                    <span class="vt-shortcut-desc">Change language</span>
                </div>
                <div class="vt-shortcut-row">
                    <span class="vt-shortcut-key">Esc</span>
                    <span class="vt-shortcut-desc">Close menu</span>
                </div>
            </div>
        </div>

        <!-- Submenus for each setting -->
        ${createSubmenusHTML(settings)}
    `;
}

/**
 * Create submenus HTML for all settings
 */
function createSubmenusHTML(settings) {
    return Object.keys(SETTING_OPTIONS).map(key => {
        const options = SETTING_OPTIONS[key];
        return `
            <div class="vt-submenu" data-for="${key}">
                ${options.map(opt => `
                    <div class="vt-submenu-item${settings[key] === opt.val ? ' selected' : ''}" data-val="${opt.val}">
                        ${opt.label}
                    </div>
                `).join('')}
            </div>
        `;
    }).join('');
}

/**
 * Get display label for an option
 */
function getOptionLabel(key, value) {
    const options = SETTING_OPTIONS[key];
    if (!options) return value;
    const opt = options.find(o => o.val === value);
    return opt ? opt.label : value;
}

/**
 * Create settings panel element
 */
function createSettingsPanel(settings, options) {
    const panel = document.createElement('div');
    panel.className = 'vt-generic-settings-panel';
    panel.innerHTML = createSettingsPanelHTML(settings);

    setupSettingsPanelEvents(panel, settings, options);

    return panel;
}

/**
 * Setup settings panel event listeners
 */
function setupSettingsPanelEvents(panel, settings, options) {
    const header = panel.querySelector('.vt-settings-header');
    const headerTitle = panel.querySelector('.vt-settings-header-title');
    const mainMenu = panel.querySelector('.vt-main-menu');
    let menuStack = [];

    // Navigation functions
    const showSubmenu = (key) => {
        mainMenu.style.display = 'none';
        panel.querySelectorAll('.vt-submenu').forEach(s => s.classList.remove('visible'));

        const submenu = panel.querySelector(`[data-for="${key}"]`);
        if (submenu) {
            submenu.classList.add('visible');
            header.classList.add('visible');

            const option = panel.querySelector(`[data-setting="${key}"]`);
            headerTitle.textContent = option?.querySelector('.vt-menu-option-label')?.textContent || 'Back';

            menuStack.push(key);
        }
    };

    const goBack = () => {
        menuStack.pop();
        if (menuStack.length === 0) {
            panel.querySelectorAll('.vt-submenu').forEach(s => s.classList.remove('visible'));
            mainMenu.style.display = 'block';
            header.classList.remove('visible');
        } else {
            showSubmenu(menuStack[menuStack.length - 1]);
            menuStack.pop(); // Remove duplicate from showSubmenu
        }
    };

    // Header back button
    header.addEventListener('click', goBack);

    // Main menu options -> show submenu
    panel.querySelectorAll('.vt-menu-option[data-setting]').forEach(option => {
        option.addEventListener('click', () => {
            const setting = option.dataset.setting;
            showSubmenu(setting);
        });
    });

    // Submenu item click -> apply setting
    panel.querySelectorAll('.vt-submenu-item').forEach(item => {
        item.addEventListener('click', () => {
            const submenu = item.closest('.vt-submenu');
            const key = submenu.dataset.for;
            const value = item.dataset.val;

            // Update setting
            settings[key] = value;

            // Update checkmarks
            submenu.querySelectorAll('.vt-submenu-item').forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');

            // Update displayed value
            const valueEl = panel.querySelector(`[data-value="${key}"]`);
            if (valueEl) {
                valueEl.textContent = getOptionLabel(key, value);
            }

            // Callback
            if (options.onSettingChange) {
                options.onSettingChange(key, value, settings);
            }

            goBack();
        });
    });

    // Preset buttons
    panel.querySelectorAll('.vt-preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const presetName = btn.dataset.preset;
            const preset = PRESETS[presetName];
            if (preset) {
                Object.assign(settings, preset);

                // Update all displayed values
                Object.keys(preset).forEach(key => {
                    const valueEl = panel.querySelector(`[data-value="${key}"]`);
                    if (valueEl) {
                        valueEl.textContent = getOptionLabel(key, preset[key]);
                    }

                    // Update checkmarks
                    const submenu = panel.querySelector(`[data-for="${key}"]`);
                    if (submenu) {
                        submenu.querySelectorAll('.vt-submenu-item').forEach(i => {
                            i.classList.toggle('selected', i.dataset.val === preset[key]);
                        });
                    }
                });

                // Update active preset button
                panel.querySelectorAll('.vt-preset-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                if (options.onSettingChange) {
                    options.onSettingChange('preset', presetName, settings);
                }
            }
        });
    });

    // Toggle subtitles
    const toggleBtn = panel.querySelector('.vt-toggle-subtitles');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            if (options.onToggleSubtitles) {
                options.onToggleSubtitles();
            }
        });
    }
}

/**
 * Toggle settings panel visibility
 */
function toggleSettingsPanel(panel, show) {
    if (panel) {
        if (show === undefined) {
            panel.classList.toggle('show');
        } else {
            panel.classList.toggle('show', show);
        }
        uiState.settingsPanelOpen = panel.classList.contains('show');
    }
}

// =============================================================================
// Subtitle Overlay
// =============================================================================

/**
 * Create subtitle overlay element
 */
function createSubtitleOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'vt-generic-overlay';
    overlay.innerHTML = '<span class="vt-subtitle-text"></span>';
    return overlay;
}

/**
 * Update subtitle text
 * @param {HTMLElement} overlay - Overlay element
 * @param {Object|null} subtitle - Subtitle object or null to clear
 * @param {Object} settings - Current settings
 */
function updateSubtitleOverlay(overlay, subtitle, settings) {
    if (!overlay) return;

    const textEl = overlay.querySelector('.vt-subtitle-text');
    if (!textEl) return;

    if (!subtitle || !subtitle.text || !uiState.subtitlesVisible) {
        textEl.textContent = '';
        overlay.classList.remove('visible');
        return;
    }

    // Format text with speaker label if applicable
    let displayText = subtitle.text;

    if (subtitle.speaker !== undefined && settings.showSpeaker !== 'off') {
        const speakerNum = parseInt(subtitle.speaker) || 0;
        const speakerClass = `vt-speaker-${speakerNum % 6}`;

        if (settings.showSpeaker === 'label' || settings.showSpeaker === 'both') {
            displayText = `[Speaker ${speakerNum + 1}] ${displayText}`;
        }

        if (settings.showSpeaker === 'color' || settings.showSpeaker === 'both') {
            textEl.className = `vt-subtitle-text ${speakerClass}`;
        } else {
            textEl.className = 'vt-subtitle-text';
        }
    } else {
        textEl.className = 'vt-subtitle-text';
    }

    textEl.textContent = displayText;
    overlay.classList.add('visible');
}

/**
 * Toggle subtitle visibility
 */
function toggleSubtitleVisibility(overlay) {
    uiState.subtitlesVisible = !uiState.subtitlesVisible;
    if (overlay) {
        overlay.classList.toggle('visible', uiState.subtitlesVisible);
    }
    return uiState.subtitlesVisible;
}

// =============================================================================
// Keyboard Shortcuts
// =============================================================================

/**
 * Setup keyboard shortcuts
 */
function setupKeyboardShortcuts(options) {
    // Remove existing handler if any
    if (window._vtGenericKeyboardHandler) {
        document.removeEventListener('keydown', window._vtGenericKeyboardHandler);
    }

    window._vtGenericKeyboardHandler = (e) => {
        // Ignore if typing in an input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }

        // Alt+T - Translate
        if (e.altKey && e.key === 't') {
            e.preventDefault();
            if (options.onTranslate) {
                options.onTranslate();
            }
        }

        // Alt+S - Toggle subtitles
        if (e.altKey && e.key === 's') {
            e.preventDefault();
            if (options.onToggleSubtitles) {
                options.onToggleSubtitles();
            }
        }

        // Alt+L - Open language menu
        if (e.altKey && e.key === 'l') {
            e.preventDefault();
            if (options.onOpenLanguageMenu) {
                options.onOpenLanguageMenu();
            }
        }

        // Escape - Close menus
        if (e.key === 'Escape') {
            if (options.onCloseMenus) {
                options.onCloseMenus();
            }
        }
    };

    document.addEventListener('keydown', window._vtGenericKeyboardHandler);
}

// =============================================================================
// Update Inline Status
// =============================================================================

/**
 * Update inline status in control bar
 */
function updateInlineStatus(controlBar, status) {
    if (!controlBar) return;

    const statusEl = controlBar.querySelector('.vt-inline-status');
    const messageEl = controlBar.querySelector('.vt-status-message');
    const progressFill = controlBar.querySelector('.vt-inline-progress-fill');
    const translateBtn = controlBar.querySelector('.vt-translate-btn');
    const translateLabel = controlBar.querySelector('.vt-translate-label');

    if (!status || status.hide) {
        statusEl.style.display = 'none';
        translateBtn.classList.remove('translating');
        translateLabel.textContent = 'Translate';
        return;
    }

    statusEl.style.display = 'flex';
    translateBtn.classList.add('translating');
    translateLabel.textContent = status.text || 'Processing...';

    if (status.message) {
        messageEl.textContent = status.message;
    }

    if (status.percent !== undefined) {
        progressFill.style.width = `${status.percent}%`;
    }
}

// =============================================================================
// Export
// =============================================================================

// Expose functions globally
window.VTGenericUI = {
    // Control Bar
    createControlBar,
    updateInlineStatus,

    // Status Panel
    createStatusPanel,
    updateStatusPanel,
    hideStatusPanel,

    // Settings Panel
    createSettingsPanel,
    toggleSettingsPanel,

    // Subtitle Overlay
    createSubtitleOverlay,
    updateSubtitleOverlay,
    toggleSubtitleVisibility,

    // Keyboard Shortcuts
    setupKeyboardShortcuts,

    // Data
    LANGUAGES,
    SETTING_OPTIONS,
    PRESETS,

    // State access
    getUIState: () => uiState,
    setUIState: (state) => Object.assign(uiState, state),
};
