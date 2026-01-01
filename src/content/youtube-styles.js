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
    `;
    document.head.appendChild(style);
}
