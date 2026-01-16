/**
 * YouTube Content Script - Dynamic Styles
 * Handles CSS injection and style updates
 */

/**
 * Add or update styles based on current settings
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
            display: none;
        }
        .vt-status-panel.show {
            display: block !important;
        }
        .vt-status-content {
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            background: rgba(0,0,0,0.92) !important;
            padding: 12px 24px !important;
            border-radius: 8px !important;
            min-width: 280px !important;
            max-width: 450px !important;
            box-shadow: 0 4px 12px rgba(0,0,0,0.5) !important;
            border: 1px solid rgba(255,255,255,0.1) !important;
        }
        .vt-status-main {
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            margin-bottom: 10px !important;
            gap: 4px !important;
            width: 100% !important;
        }
        .vt-status-text {
            color: #fff !important;
            font-size: 14px !important;
            font-weight: 500 !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
            transition: opacity 0.15s ease !important;
            opacity: 1 !important;
            line-height: 1.4 !important;
            text-align: center !important;
        }
        .vt-sub-status {
            color: rgba(255,255,255,0.6) !important;
            font-size: 11px !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
            display: none;
            line-height: 1.3 !important;
            text-align: center !important;
            font-style: italic !important;
        }
        .vt-text-fade {
            min-width: 100px !important;
            text-align: center !important;
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
        @keyframes vt-pulse {
            0% { opacity: 0.4; transform: scale(0.98); }
            50% { opacity: 1; transform: scale(1); }
            100% { opacity: 0.4; transform: scale(0.98); }
        }
        .vt-step-indicator {
            color: #4caf50 !important;
            font-size: 10px !important;
            font-weight: 700 !important;
            text-transform: uppercase !important;
            letter-spacing: 1px !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
            margin-bottom: 6px !important;
            display: none;
            animation: vt-pulse 2s infinite ease-in-out !important;
            background: rgba(74, 175, 80, 0.1) !important;
            padding: 2px 6px !important;
            border-radius: 4px !important;
            border: 1px solid rgba(74, 175, 80, 0.2) !important;
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
        .header-hidden {
             display: none !important;
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
        .vt-overlay {
            position: absolute !important;
            ${styleValues.position.bottom !== 'auto' ? `bottom: ${styleValues.position.bottom} !important;` : ''}
            ${styleValues.position.top !== 'auto' ? `top: ${styleValues.position.top} !important;` : ''}
            left: 50% !important;
            transform: translateX(-50%) !important;
            z-index: 50 !important;
            text-align: center !important;
            width: 80% !important;
            pointer-events: none !important;
        }
        .vt-text {
            display: inline-block !important;
            background: ${styleValues.background} !important;
            color: ${styleValues.color || '#fff'} !important;
            padding: 8px 16px !important;
            border-radius: 4px !important;
            font-size: ${styleValues.fontSize} !important;
            font-family: ${styleValues.fontFamily} !important;
            line-height: 1.4 !important;
            text-shadow: ${styleValues.textShadow} !important;
            opacity: ${styleValues.opacity} !important;
            transition: opacity 0.12s ease-out !important;
        }
        .vt-text.vt-fading {
            opacity: 0 !important;
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
            bottom: 60px !important;
            right: 12px !important;
            background: rgba(28, 28, 28, 0.9) !important;
            border-radius: 12px !important;
            padding: 0 !important;
            min-width: 250px !important;
            box-shadow: 0 0 20px rgba(0,0,0,0.5) !important;
            z-index: 9999 !important;
            overflow: hidden !important;
        }
        .vt-settings-panel.show {
            display: block !important;
        }
        .vt-settings-menu-content {
            font-family: 'YouTube Noto', Roboto, Arial, sans-serif !important;
        }
        .vt-settings-back {
            display: flex !important;
            align-items: center !important;
            padding: 12px 16px !important;
            cursor: pointer !important;
            color: #fff !important;
            border-bottom: 1px solid rgba(255,255,255,0.1) !important;
        }
        .vt-settings-back.header-hidden {
            display: none !important;
        }
        .vt-settings-back:hover {
            background: rgba(255,255,255,0.1) !important;
        }
        .vt-settings-back svg {
            margin-right: 16px !important;
            color: #fff !important;
        }
        .vt-back-title {
            font-size: 14px !important;
            font-weight: 500 !important;
        }
        .vt-menu-title {
            padding: 12px 16px 8px !important;
            color: rgba(255,255,255,0.7) !important;
            font-size: 12px !important;
            text-transform: uppercase !important;
            letter-spacing: 0.5px !important;
        }
        .vt-menu-option {
            display: flex !important;
            align-items: center !important;
            padding: 10px 16px !important;
            cursor: pointer !important;
            color: #fff !important;
        }
        .vt-menu-option:hover {
            background: rgba(255,255,255,0.1) !important;
        }
        .vt-option-label {
            flex: 1 !important;
            font-size: 14px !important;
        }
        .vt-option-value {
            color: rgba(255,255,255,0.5) !important;
            font-size: 14px !important;
            margin-right: 8px !important;
        }
        .vt-menu-option svg {
            color: rgba(255,255,255,0.5) !important;
        }
        .vt-submenu {
            padding: 8px 0 !important;
        }
        .vt-submenu-item {
            display: flex !important;
            align-items: center !important;
            padding: 10px 16px 10px 48px !important;
            cursor: pointer !important;
            color: #fff !important;
            font-size: 14px !important;
            position: relative !important;
        }
        .vt-submenu-item:hover {
            background: rgba(255,255,255,0.1) !important;
        }
        .vt-submenu-item.selected::before {
            content: '' !important;
            position: absolute !important;
            left: 16px !important;
            top: 50% !important;
            transform: translateY(-50%) !important;
            width: 16px !important;
            height: 16px !important;
            background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='white'%3E%3Cpath d='M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z'/%3E%3C/svg%3E") center/contain no-repeat !important;
        }
        .vt-menu-separator {
            height: 1px !important;
            background: rgba(255,255,255,0.1) !important;
            margin: 8px 0 !important;
        }
        .vt-menu-section-group {
            padding: 8px 0 !important;
        }
        .vt-translate-action {
            margin-bottom: 4px !important;
        }
        .vt-translate-action:hover {
            background: rgba(255,255,255,0.2) !important;
        }
        .vt-main-btn {
            opacity: 0.9 !important;
        }
        .vt-main-btn:hover {
            opacity: 1 !important;
        }
        /* Dual Subtitle Mode */
        .vt-overlay.vt-dual-mode {
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            gap: 4px !important;
        }
        .vt-text-original {
            display: inline-block !important;
            background: rgba(0,0,0,0.5) !important;
            color: rgba(255,255,255,0.7) !important;
            padding: 4px 12px !important;
            border-radius: 4px !important;
            font-size: calc(${styleValues.fontSize} * 0.7) !important;
            font-family: ${styleValues.fontFamily} !important;
            line-height: 1.3 !important;
            font-style: italic !important;
        }
        .vt-text-translated {
            display: inline-block !important;
            background: ${styleValues.background} !important;
            color: ${styleValues.color || '#fff'} !important;
            padding: 8px 16px !important;
            border-radius: 4px !important;
            font-size: ${styleValues.fontSize} !important;
            font-family: ${styleValues.fontFamily} !important;
            line-height: 1.4 !important;
            text-shadow: ${styleValues.textShadow} !important;
            opacity: ${styleValues.opacity} !important;
        }
        /* Sync Offset Controls */
        .vt-sync-controls {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 8px !important;
            padding: 8px 16px !important;
        }
        .vt-sync-btn {
            background: rgba(255,255,255,0.1) !important;
            border: 1px solid rgba(255,255,255,0.2) !important;
            color: #fff !important;
            padding: 4px 12px !important;
            border-radius: 4px !important;
            cursor: pointer !important;
            font-size: 12px !important;
            font-family: 'YouTube Noto', Roboto, Arial, sans-serif !important;
        }
        .vt-sync-btn:hover {
            background: rgba(255,255,255,0.2) !important;
        }
        .vt-sync-btn.vt-sync-fine {
            padding: 4px 8px !important;
            font-size: 11px !important;
            opacity: 0.8 !important;
        }
        .vt-sync-btn.vt-sync-fine:hover {
            opacity: 1 !important;
        }
        .vt-sync-display {
            color: rgba(255,255,255,0.7) !important;
            font-size: 12px !important;
            min-width: 50px !important;
            text-align: center !important;
        }
        .vt-shortcut-hint {
            color: rgba(255,255,255,0.4) !important;
            font-size: 11px !important;
            margin-left: auto !important;
            padding-left: 12px !important;
            font-family: monospace !important;
        }

        /* Calibration Overlay */
        .vt-calibration-overlay {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            background: rgba(0, 0, 0, 0.85) !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            z-index: 9999 !important;
        }
        .vt-calibration-content {
            text-align: center !important;
            color: #fff !important;
            font-family: 'YouTube Noto', Roboto, Arial, sans-serif !important;
            padding: 24px !important;
        }
        .vt-calibration-title {
            font-size: 24px !important;
            font-weight: 500 !important;
            margin-bottom: 16px !important;
        }
        .vt-calibration-instructions {
            font-size: 16px !important;
            line-height: 1.6 !important;
            margin-bottom: 20px !important;
            color: rgba(255, 255, 255, 0.9) !important;
        }
        .vt-calibration-instructions kbd {
            background: rgba(255, 255, 255, 0.2) !important;
            padding: 4px 12px !important;
            border-radius: 4px !important;
            font-family: monospace !important;
            font-size: 14px !important;
        }
        .vt-calibration-instructions small {
            display: block !important;
            margin-top: 8px !important;
            color: rgba(255, 255, 255, 0.6) !important;
        }
        .vt-calibration-status {
            font-size: 18px !important;
            color: #4CAF50 !important;
            margin-bottom: 20px !important;
            min-height: 24px !important;
        }
        .vt-calibration-cancel {
            background: transparent !important;
            border: 1px solid rgba(255, 255, 255, 0.3) !important;
            color: rgba(255, 255, 255, 0.7) !important;
            padding: 8px 16px !important;
            border-radius: 4px !important;
            cursor: pointer !important;
            font-size: 14px !important;
        }
        .vt-calibration-cancel:hover {
            background: rgba(255, 255, 255, 0.1) !important;
            color: #fff !important;
        }

        /* ================================ */
        /* YouTube Shorts Mode Styles       */
        /* Refined, compact floating UI     */
        /* ================================ */

        /* Widget Container - fixed to viewport */
        .vt-shorts-widget {
            position: fixed !important;
            bottom: 120px !important;
            right: 12px !important;
            z-index: 2147483647 !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
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

        .vt-shorts-toggle:focus-visible {
            outline: 2px solid rgba(255, 255, 255, 0.5) !important;
            outline-offset: 2px !important;
        }

        .vt-shorts-toggle.active {
            background: rgba(16, 185, 129, 0.9) !important;
            border-color: rgba(16, 185, 129, 1) !important;
            color: #fff !important;
            box-shadow: 0 2px 16px rgba(16, 185, 129, 0.4) !important;
        }

        .vt-shorts-toggle.active:hover {
            background: rgba(16, 185, 129, 1) !important;
        }

        .vt-shorts-icon {
            width: 18px !important;
            height: 18px !important;
        }

        /* Status Dot - tiny indicator on button */
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
            animation: vt-dot-pulse 1s infinite ease-in-out !important;
        }

        @keyframes vt-dot-pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(1.2); }
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

        /* Power Toggle Button */
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
            opacity: 0.9 !important;
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

        /* Size Picker */
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

        /* Dropdown Footer */
        .vt-shorts-dropdown-footer {
            padding: 8px 14px !important;
            border-top: 1px solid rgba(255, 255, 255, 0.06) !important;
            background: rgba(0, 0, 0, 0.2) !important;
        }

        .vt-shorts-queue-status {
            font-size: 10px !important;
            color: rgba(255, 255, 255, 0.4) !important;
            display: block !important;
        }

        .vt-shorts-queue-status.active {
            color: #10b981 !important;
        }

        /* Shorts Subtitle Overlay */
        .vt-shorts-overlay {
            position: fixed !important;
            bottom: 180px !important;
            left: 50% !important;
            transform: translateX(-50%) !important;
            max-width: 85% !important;
            z-index: 2147483646 !important;
            text-align: center !important;
            pointer-events: none !important;
        }

        .vt-shorts-overlay .vt-text {
            display: inline-block !important;
            background: rgba(0, 0, 0, 0.85) !important;
            color: #fff !important;
            padding: 10px 18px !important;
            border-radius: 6px !important;
            font-size: 17px !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
            line-height: 1.45 !important;
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3) !important;
            max-width: 100% !important;
            word-wrap: break-word !important;
            letter-spacing: -0.01em !important;
        }

        /* Translating Status - positioned near toggle */
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
            animation: vt-dot-pulse 1s infinite ease-in-out !important;
        }

        /* Mobile Adjustments */
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
                max-width: 92% !important;
            }

            .vt-shorts-overlay .vt-text {
                font-size: 15px !important;
                padding: 8px 14px !important;
            }

            .vt-shorts-status {
                bottom: 145px !important;
                font-size: 10px !important;
                padding: 5px 8px !important;
            }
        }
    `;
    document.head.appendChild(style);
}
