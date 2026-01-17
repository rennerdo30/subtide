/**
 * Generic Video Player - Styles
 * CSS architecture with design tokens for modern YouTube-quality UI
 */

// Design tokens - CSS custom properties
const VT_DESIGN_TOKENS = {
    bgPrimary: 'rgba(18, 18, 18, 0.95)',
    bgSecondary: 'rgba(28, 28, 28, 0.9)',
    bgHover: 'rgba(255, 255, 255, 0.1)',
    bgActive: 'rgba(255, 255, 255, 0.15)',
    textPrimary: '#ffffff',
    textSecondary: 'rgba(255, 255, 255, 0.7)',
    textMuted: 'rgba(255, 255, 255, 0.5)',
    accent: '#10b981',
    accentHover: '#059669',
    accentLight: 'rgba(16, 185, 129, 0.15)',
    border: 'rgba(255, 255, 255, 0.1)',
    borderLight: 'rgba(255, 255, 255, 0.06)',
    shadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
    shadowLarge: '0 8px 32px rgba(0, 0, 0, 0.5)',
    radius: '8px',
    radiusLarge: '12px',
    transition: '0.15s ease',
    transitionSlow: '0.3s ease',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
};

// Subtitle style mappings
const SUBTITLE_STYLE_VALUES = {
    size: {
        small: '14px',
        medium: '18px',
        large: '24px',
        xlarge: '32px',
        huge: '42px',
        gigantic: '56px'
    },
    background: {
        dark: 'rgba(0, 0, 0, 0.75)',
        darker: 'rgba(0, 0, 0, 0.9)',
        transparent: 'rgba(0, 0, 0, 0.4)',
        none: 'transparent'
    },
    color: {
        white: '#ffffff',
        yellow: '#ffeb3b',
        cyan: '#00bcd4'
    },
    font: {
        'sans-serif': "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        'serif': "Georgia, 'Times New Roman', serif",
        'monospace': "'SF Mono', Monaco, Consolas, monospace",
        'casual': "'Comic Sans MS', cursive"
    },
    outline: {
        none: 'none',
        light: '1px 1px 2px rgba(0, 0, 0, 0.5)',
        medium: '2px 2px 3px rgba(0, 0, 0, 0.7)',
        heavy: '2px 2px 4px rgba(0, 0, 0, 0.9), -1px -1px 4px rgba(0, 0, 0, 0.7)'
    },
    opacity: {
        full: '1',
        high: '0.9',
        medium: '0.75',
        low: '0.5'
    },
    position: {
        bottom: { top: 'auto', bottom: '10%' },
        top: { top: '10%', bottom: 'auto' }
    }
};

/**
 * Get computed subtitle styles based on current settings
 * @param {Object} settings - Current subtitle settings
 * @returns {Object} Computed style values
 */
function getGenericSubtitleStyleValues(settings) {
    return {
        fontSize: SUBTITLE_STYLE_VALUES.size[settings.size] || SUBTITLE_STYLE_VALUES.size.medium,
        background: SUBTITLE_STYLE_VALUES.background[settings.background] || SUBTITLE_STYLE_VALUES.background.dark,
        color: SUBTITLE_STYLE_VALUES.color[settings.color] || SUBTITLE_STYLE_VALUES.color.white,
        fontFamily: SUBTITLE_STYLE_VALUES.font[settings.font] || SUBTITLE_STYLE_VALUES.font['sans-serif'],
        textShadow: SUBTITLE_STYLE_VALUES.outline[settings.outline] || SUBTITLE_STYLE_VALUES.outline.medium,
        opacity: SUBTITLE_STYLE_VALUES.opacity[settings.opacity] || SUBTITLE_STYLE_VALUES.opacity.full,
        position: SUBTITLE_STYLE_VALUES.position[settings.position] || SUBTITLE_STYLE_VALUES.position.bottom
    };
}

/**
 * Inject or update styles based on current settings
 * @param {Object} settings - Current subtitle settings
 */
function injectGenericStyles(settings) {
    // Remove existing styles
    document.querySelector('#vt-generic-styles')?.remove();

    const styleValues = getGenericSubtitleStyleValues(settings);
    const tokens = VT_DESIGN_TOKENS;

    const style = document.createElement('style');
    style.id = 'vt-generic-styles';
    style.textContent = `
        /* ================================ */
        /* CSS Custom Properties (Tokens)   */
        /* ================================ */
        :root {
            --vt-bg-primary: ${tokens.bgPrimary};
            --vt-bg-secondary: ${tokens.bgSecondary};
            --vt-bg-hover: ${tokens.bgHover};
            --vt-bg-active: ${tokens.bgActive};
            --vt-text-primary: ${tokens.textPrimary};
            --vt-text-secondary: ${tokens.textSecondary};
            --vt-text-muted: ${tokens.textMuted};
            --vt-accent: ${tokens.accent};
            --vt-accent-hover: ${tokens.accentHover};
            --vt-accent-light: ${tokens.accentLight};
            --vt-border: ${tokens.border};
            --vt-border-light: ${tokens.borderLight};
            --vt-shadow: ${tokens.shadow};
            --vt-shadow-large: ${tokens.shadowLarge};
            --vt-radius: ${tokens.radius};
            --vt-radius-large: ${tokens.radiusLarge};
            --vt-transition: ${tokens.transition};
            --vt-transition-slow: ${tokens.transitionSlow};
            --vt-font: ${tokens.fontFamily};
        }

        /* ================================ */
        /* Control Bar                      */
        /* ================================ */
        /* IMPORTANT: Position at TOP to avoid blocking native video controls */
        .vt-generic-control-bar {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            display: flex !important;
            align-items: center !important;
            padding: 8px 12px !important;
            background: linear-gradient(rgba(0, 0, 0, 0.7), transparent) !important;
            opacity: 0 !important;
            transition: opacity var(--vt-transition-slow) !important;
            z-index: 99998 !important;
            font-family: var(--vt-font) !important;
            pointer-events: none !important;
        }

        .vt-generic-control-bar.visible {
            opacity: 1 !important;
            pointer-events: auto !important;
        }

        .vt-generic-control-bar > * {
            pointer-events: auto !important;
        }

        /* Translate Button */
        .vt-translate-btn {
            display: flex !important;
            align-items: center !important;
            gap: 6px !important;
            padding: 8px 14px !important;
            background: var(--vt-accent) !important;
            color: white !important;
            border: none !important;
            border-radius: var(--vt-radius) !important;
            font-size: 13px !important;
            font-weight: 500 !important;
            font-family: var(--vt-font) !important;
            cursor: pointer !important;
            transition: all var(--vt-transition) !important;
            white-space: nowrap !important;
        }

        .vt-translate-btn:hover {
            background: var(--vt-accent-hover) !important;
            transform: scale(1.02) !important;
        }

        .vt-translate-btn:active {
            transform: scale(0.98) !important;
        }

        .vt-translate-btn.translating {
            background: rgba(255, 255, 255, 0.1) !important;
            cursor: default !important;
        }

        .vt-translate-btn svg {
            width: 16px !important;
            height: 16px !important;
        }

        /* Inline Status (in control bar) */
        .vt-inline-status {
            margin-left: 12px !important;
            color: var(--vt-text-secondary) !important;
            font-size: 12px !important;
            display: flex !important;
            align-items: center !important;
            gap: 8px !important;
        }

        .vt-inline-progress {
            width: 80px !important;
            height: 4px !important;
            background: rgba(255, 255, 255, 0.2) !important;
            border-radius: 2px !important;
            overflow: hidden !important;
        }

        .vt-inline-progress-fill {
            height: 100% !important;
            background: var(--vt-accent) !important;
            transition: width 0.3s ease !important;
        }

        /* Language Dropdown (Quick Select) */
        .vt-lang-dropdown {
            position: relative !important;
            margin-left: 8px !important;
        }

        .vt-lang-btn {
            display: flex !important;
            align-items: center !important;
            gap: 4px !important;
            padding: 6px 10px !important;
            background: rgba(255, 255, 255, 0.1) !important;
            border: 1px solid var(--vt-border) !important;
            border-radius: var(--vt-radius) !important;
            color: var(--vt-text-primary) !important;
            font-size: 12px !important;
            font-family: var(--vt-font) !important;
            cursor: pointer !important;
            transition: all var(--vt-transition) !important;
        }

        .vt-lang-btn:hover {
            background: rgba(255, 255, 255, 0.15) !important;
        }

        .vt-lang-btn svg {
            width: 14px !important;
            height: 14px !important;
            transition: transform var(--vt-transition) !important;
        }

        .vt-lang-dropdown.open .vt-lang-btn svg {
            transform: rotate(180deg) !important;
        }

        .vt-lang-menu {
            position: absolute !important;
            top: calc(100% + 8px) !important;
            left: 0 !important;
            min-width: 180px !important;
            max-height: 300px !important;
            overflow-y: auto !important;
            background: var(--vt-bg-primary) !important;
            border: 1px solid var(--vt-border) !important;
            border-radius: var(--vt-radius-large) !important;
            box-shadow: var(--vt-shadow-large) !important;
            backdrop-filter: blur(10px) !important;
            -webkit-backdrop-filter: blur(10px) !important;
            opacity: 0 !important;
            visibility: hidden !important;
            transform: translateY(8px) !important;
            transition: all var(--vt-transition) !important;
            z-index: 100000 !important;
        }

        .vt-lang-dropdown.open .vt-lang-menu {
            opacity: 1 !important;
            visibility: visible !important;
            transform: translateY(0) !important;
        }

        .vt-lang-search {
            padding: 8px !important;
            border-bottom: 1px solid var(--vt-border-light) !important;
            position: sticky !important;
            top: 0 !important;
            background: var(--vt-bg-primary) !important;
            z-index: 1 !important;
        }

        .vt-lang-search input {
            width: 100% !important;
            padding: 8px 12px !important;
            background: rgba(255, 255, 255, 0.06) !important;
            border: 1px solid var(--vt-border) !important;
            border-radius: 6px !important;
            color: var(--vt-text-primary) !important;
            font-size: 13px !important;
            font-family: var(--vt-font) !important;
            outline: none !important;
        }

        .vt-lang-search input:focus {
            border-color: var(--vt-accent) !important;
        }

        .vt-lang-search input::placeholder {
            color: var(--vt-text-muted) !important;
        }

        .vt-lang-section {
            padding: 4px 0 !important;
        }

        .vt-lang-section-title {
            padding: 6px 12px !important;
            font-size: 10px !important;
            font-weight: 600 !important;
            text-transform: uppercase !important;
            letter-spacing: 0.5px !important;
            color: var(--vt-text-muted) !important;
        }

        .vt-lang-item {
            display: flex !important;
            align-items: center !important;
            padding: 8px 12px !important;
            cursor: pointer !important;
            transition: background var(--vt-transition) !important;
            color: var(--vt-text-primary) !important;
            font-size: 13px !important;
        }

        .vt-lang-item:hover {
            background: var(--vt-bg-hover) !important;
        }

        .vt-lang-item.selected {
            background: var(--vt-accent-light) !important;
            color: var(--vt-accent) !important;
        }

        .vt-lang-item.selected::before {
            content: '\\2713' !important;
            margin-right: 8px !important;
            color: var(--vt-accent) !important;
        }

        /* Subtitle Toggle Button */
        .vt-subtitle-toggle-btn {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            width: 36px !important;
            height: 36px !important;
            margin-left: auto !important;
            background: transparent !important;
            border: none !important;
            border-radius: var(--vt-radius) !important;
            color: var(--vt-text-secondary) !important;
            cursor: pointer !important;
            transition: all var(--vt-transition) !important;
        }

        .vt-subtitle-toggle-btn:hover {
            background: var(--vt-bg-hover) !important;
            color: var(--vt-text-primary) !important;
        }

        .vt-subtitle-toggle-btn.subtitles-hidden {
            color: var(--vt-text-muted) !important;
        }

        .vt-subtitle-toggle-btn svg {
            width: 20px !important;
            height: 20px !important;
        }

        /* Settings Gear Button */
        .vt-settings-btn {
            margin-left: 4px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            width: 36px !important;
            height: 36px !important;
            margin-left: auto !important;
            background: transparent !important;
            border: none !important;
            border-radius: var(--vt-radius) !important;
            color: var(--vt-text-secondary) !important;
            cursor: pointer !important;
            transition: all var(--vt-transition) !important;
        }

        .vt-settings-btn:hover {
            background: var(--vt-bg-hover) !important;
            color: var(--vt-text-primary) !important;
        }

        .vt-settings-btn svg {
            width: 20px !important;
            height: 20px !important;
        }

        /* ================================ */
        /* Status Panel (Centered Overlay)  */
        /* ================================ */
        .vt-generic-status-panel {
            position: absolute !important;
            top: 50% !important;
            left: 50% !important;
            transform: translate(-50%, -50%) !important;
            z-index: 99999 !important;
            pointer-events: none !important;
            opacity: 0 !important;
            visibility: hidden !important;
            transition: all var(--vt-transition-slow) !important;
        }

        .vt-generic-status-panel.show {
            opacity: 1 !important;
            visibility: visible !important;
        }

        .vt-status-content {
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            min-width: 280px !important;
            max-width: 400px !important;
            padding: 20px 28px !important;
            background: var(--vt-bg-primary) !important;
            border: 1px solid var(--vt-border) !important;
            border-radius: var(--vt-radius-large) !important;
            box-shadow: var(--vt-shadow-large) !important;
            backdrop-filter: blur(16px) !important;
            -webkit-backdrop-filter: blur(16px) !important;
            font-family: var(--vt-font) !important;
        }

        .vt-step-indicator {
            display: flex !important;
            align-items: center !important;
            gap: 8px !important;
            margin-bottom: 12px !important;
            padding: 4px 10px !important;
            background: var(--vt-accent-light) !important;
            border: 1px solid rgba(16, 185, 129, 0.3) !important;
            border-radius: 20px !important;
            font-size: 11px !important;
            font-weight: 600 !important;
            color: var(--vt-accent) !important;
            text-transform: uppercase !important;
            letter-spacing: 0.5px !important;
        }

        @keyframes vt-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }

        .vt-step-indicator.pulsing {
            animation: vt-pulse 1.5s infinite ease-in-out !important;
        }

        .vt-status-text {
            font-size: 16px !important;
            font-weight: 500 !important;
            color: var(--vt-text-primary) !important;
            text-align: center !important;
            margin-bottom: 6px !important;
        }

        .vt-sub-status {
            font-size: 12px !important;
            color: var(--vt-text-muted) !important;
            text-align: center !important;
            font-style: italic !important;
            margin-bottom: 16px !important;
        }

        .vt-progress-bar {
            width: 100% !important;
            height: 6px !important;
            background: rgba(255, 255, 255, 0.1) !important;
            border-radius: 3px !important;
            overflow: hidden !important;
            margin-bottom: 8px !important;
        }

        .vt-progress-fill {
            height: 100% !important;
            background: linear-gradient(90deg, var(--vt-accent), #8bc34a) !important;
            border-radius: 3px !important;
            transition: width 0.3s ease !important;
            width: 0% !important;
        }

        .vt-progress-percent {
            font-size: 13px !important;
            font-weight: 600 !important;
            color: var(--vt-accent) !important;
        }

        /* Status panel states */
        .vt-generic-status-panel.loading .vt-progress-fill {
            background: linear-gradient(90deg, #ffc107, #ffeb3b) !important;
        }

        .vt-generic-status-panel.success .vt-status-text {
            color: var(--vt-accent) !important;
        }

        .vt-generic-status-panel.error .vt-status-text {
            color: #f44336 !important;
        }

        /* ================================ */
        /* Settings Panel (Flat Menu)       */
        /* ================================ */
        /* Positioned below the top control bar */
        .vt-generic-settings-panel {
            position: absolute !important;
            top: 50px !important;
            right: 12px !important;
            width: 300px !important;
            max-height: 450px !important;
            overflow-y: auto !important;
            background: var(--vt-bg-primary) !important;
            border: 1px solid var(--vt-border) !important;
            border-radius: var(--vt-radius-large) !important;
            box-shadow: var(--vt-shadow-large) !important;
            backdrop-filter: blur(16px) !important;
            -webkit-backdrop-filter: blur(16px) !important;
            opacity: 0 !important;
            visibility: hidden !important;
            transform: translateY(8px) scale(0.95) !important;
            transition: all var(--vt-transition) !important;
            z-index: 100000 !important;
            font-family: var(--vt-font) !important;
        }

        .vt-generic-settings-panel.show {
            opacity: 1 !important;
            visibility: visible !important;
            transform: translateY(0) scale(1) !important;
        }

        /* Settings Header (Back Button) */
        .vt-settings-header {
            display: none;
            align-items: center !important;
            padding: 12px 16px !important;
            border-bottom: 1px solid var(--vt-border-light) !important;
            cursor: pointer !important;
            transition: background var(--vt-transition) !important;
        }

        .vt-settings-header.visible {
            display: flex !important;
        }

        .vt-settings-header:hover {
            background: var(--vt-bg-hover) !important;
        }

        .vt-settings-header svg {
            width: 20px !important;
            height: 20px !important;
            color: var(--vt-text-secondary) !important;
            margin-right: 12px !important;
        }

        .vt-settings-header-title {
            font-size: 14px !important;
            font-weight: 500 !important;
            color: var(--vt-text-primary) !important;
        }

        /* Menu Content */
        .vt-menu-content {
            padding: 8px 0 !important;
        }

        .vt-menu-section {
            padding: 4px 0 !important;
        }

        .vt-menu-separator {
            height: 1px !important;
            background: var(--vt-border-light) !important;
            margin: 8px 0 !important;
        }

        .vt-menu-option {
            display: flex !important;
            align-items: center !important;
            padding: 12px 16px !important;
            cursor: pointer !important;
            transition: background var(--vt-transition) !important;
            color: var(--vt-text-primary) !important;
        }

        .vt-menu-option:hover {
            background: var(--vt-bg-hover) !important;
        }

        .vt-menu-option svg {
            width: 20px !important;
            height: 20px !important;
            color: var(--vt-text-secondary) !important;
            margin-right: 12px !important;
        }

        .vt-menu-option-label {
            flex: 1 !important;
            font-size: 14px !important;
        }

        .vt-menu-option-value {
            font-size: 14px !important;
            color: var(--vt-text-muted) !important;
            margin-right: 8px !important;
        }

        .vt-menu-option-arrow {
            width: 20px !important;
            height: 20px !important;
            color: var(--vt-text-muted) !important;
        }

        /* Shortcut hints */
        .vt-shortcut-hint {
            font-size: 11px !important;
            color: var(--vt-text-muted) !important;
            font-family: monospace !important;
            padding: 2px 6px !important;
            background: rgba(255, 255, 255, 0.06) !important;
            border-radius: 4px !important;
            margin-left: auto !important;
        }

        /* Preset Buttons */
        .vt-presets {
            display: flex !important;
            gap: 8px !important;
            padding: 12px 16px !important;
        }

        .vt-preset-btn {
            flex: 1 !important;
            padding: 8px 12px !important;
            background: rgba(255, 255, 255, 0.06) !important;
            border: 1px solid var(--vt-border) !important;
            border-radius: 6px !important;
            color: var(--vt-text-secondary) !important;
            font-size: 12px !important;
            font-family: var(--vt-font) !important;
            cursor: pointer !important;
            transition: all var(--vt-transition) !important;
        }

        .vt-preset-btn:hover {
            background: var(--vt-bg-hover) !important;
            color: var(--vt-text-primary) !important;
        }

        .vt-preset-btn.active {
            background: var(--vt-accent-light) !important;
            border-color: var(--vt-accent) !important;
            color: var(--vt-accent) !important;
        }

        /* Keyboard Shortcuts Section */
        .vt-shortcuts-section {
            padding: 12px 16px !important;
            border-top: 1px solid var(--vt-border-light) !important;
        }

        .vt-shortcuts-title {
            font-size: 11px !important;
            font-weight: 600 !important;
            text-transform: uppercase !important;
            letter-spacing: 0.5px !important;
            color: var(--vt-text-muted) !important;
            margin-bottom: 8px !important;
        }

        .vt-shortcut-row {
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            padding: 4px 0 !important;
        }

        .vt-shortcut-key {
            font-size: 11px !important;
            font-family: monospace !important;
            padding: 2px 8px !important;
            background: rgba(255, 255, 255, 0.06) !important;
            border-radius: 4px !important;
            color: var(--vt-text-secondary) !important;
        }

        .vt-shortcut-desc {
            font-size: 12px !important;
            color: var(--vt-text-secondary) !important;
        }

        /* Submenu Items */
        .vt-submenu {
            display: none;
        }

        .vt-submenu.visible {
            display: block !important;
        }

        .vt-submenu-item {
            display: flex !important;
            align-items: center !important;
            padding: 10px 16px 10px 48px !important;
            cursor: pointer !important;
            transition: background var(--vt-transition) !important;
            color: var(--vt-text-primary) !important;
            font-size: 14px !important;
            position: relative !important;
        }

        .vt-submenu-item:hover {
            background: var(--vt-bg-hover) !important;
        }

        .vt-submenu-item.selected::before {
            content: '\\2713' !important;
            position: absolute !important;
            left: 16px !important;
            color: var(--vt-accent) !important;
            font-weight: bold !important;
        }

        /* ================================ */
        /* Subtitle Overlay                 */
        /* ================================ */
        .vt-generic-overlay {
            position: absolute !important;
            ${styleValues.position.bottom !== 'auto' ? `bottom: ${styleValues.position.bottom} !important;` : ''}
            ${styleValues.position.top !== 'auto' ? `top: ${styleValues.position.top} !important;` : ''}
            left: 50% !important;
            transform: translateX(-50%) !important;
            max-width: 80% !important;
            text-align: center !important;
            z-index: 99997 !important;
            pointer-events: none !important;
            display: none;
        }

        .vt-generic-overlay.visible {
            display: block !important;
        }

        .vt-subtitle-text {
            display: inline-block !important;
            padding: 8px 16px !important;
            background: ${styleValues.background} !important;
            color: ${styleValues.color} !important;
            font-size: ${styleValues.fontSize} !important;
            font-family: ${styleValues.fontFamily} !important;
            line-height: 1.4 !important;
            border-radius: 4px !important;
            text-shadow: ${styleValues.textShadow} !important;
            opacity: ${styleValues.opacity} !important;
            transition: opacity 0.12s ease-out !important;
        }

        .vt-subtitle-text.fading {
            opacity: 0 !important;
        }

        /* Speaker label */
        .vt-speaker-label {
            font-size: 0.85em !important;
            opacity: 0.8 !important;
            margin-right: 8px !important;
            font-weight: 500 !important;
        }

        /* Speaker colors */
        .vt-speaker-0 { color: #64B5F6 !important; }
        .vt-speaker-1 { color: #81C784 !important; }
        .vt-speaker-2 { color: #FFB74D !important; }
        .vt-speaker-3 { color: #BA68C8 !important; }
        .vt-speaker-4 { color: #4DD0E1 !important; }
        .vt-speaker-5 { color: #FF8A65 !important; }

        /* ================================ */
        /* Animations                       */
        /* ================================ */
        @keyframes vt-spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }

        .vt-spinner {
            width: 16px !important;
            height: 16px !important;
            border: 2px solid rgba(255, 255, 255, 0.2) !important;
            border-top-color: var(--vt-accent) !important;
            border-radius: 50% !important;
            animation: vt-spin 0.8s linear infinite !important;
        }

        @keyframes vt-progress-indeterminate {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
        }

        .vt-progress-bar.indeterminate .vt-progress-fill {
            width: 50% !important;
            animation: vt-progress-indeterminate 1.5s infinite ease-in-out !important;
        }

        /* ================================ */
        /* Responsive Adjustments           */
        /* ================================ */
        @media (max-width: 600px) {
            .vt-generic-settings-panel {
                width: 280px !important;
                right: 8px !important;
                top: 45px !important;
            }

            .vt-translate-btn {
                padding: 6px 10px !important;
                font-size: 12px !important;
            }

            .vt-status-content {
                min-width: 220px !important;
                padding: 16px 20px !important;
            }

            .vt-subtitle-text {
                font-size: calc(${styleValues.fontSize} * 0.85) !important;
                padding: 6px 12px !important;
            }
        }

        /* ================================ */
        /* Fullscreen Mode                  */
        /* ================================ */
        :fullscreen .vt-generic-settings-panel,
        :-webkit-full-screen .vt-generic-settings-panel {
            position: fixed !important;
            top: 60px !important;
        }

        :fullscreen .vt-generic-overlay,
        :-webkit-full-screen .vt-generic-overlay {
            position: fixed !important;
        }

        :fullscreen .vt-subtitle-text,
        :-webkit-full-screen .vt-subtitle-text {
            font-size: calc(${styleValues.fontSize} * 1.2) !important;
        }
    `;

    document.head.appendChild(style);
}

// Expose functions globally for content script access
window.VTGenericStyles = {
    inject: injectGenericStyles,
    getStyleValues: getGenericSubtitleStyleValues,
    tokens: VT_DESIGN_TOKENS,
    styleValues: SUBTITLE_STYLE_VALUES
};
