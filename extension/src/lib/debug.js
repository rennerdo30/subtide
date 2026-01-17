/**
 * Debug logging utility for Video Translate extension
 *
 * In production, logs are disabled by default.
 * Enable debug mode by setting localStorage.vtDebug = 'true'
 * Or set window.VT_DEBUG = true in the console.
 */

const DEBUG_KEY = 'vtDebug';

/**
 * Check if debug mode is enabled
 * @returns {boolean}
 */
function isDebugEnabled() {
    try {
        // Check window flag first (useful for temporary debugging)
        if (typeof window !== 'undefined' && window.VT_DEBUG) {
            return true;
        }
        // Check localStorage
        if (typeof localStorage !== 'undefined') {
            return localStorage.getItem(DEBUG_KEY) === 'true';
        }
    } catch (e) {
        // localStorage not available (e.g., in service worker)
    }
    return false;
}

/**
 * Debug logger - only logs when debug mode is enabled
 */
const vtLog = {
    /**
     * Log debug message
     * @param {...any} args - Arguments to log
     */
    debug: (...args) => {
        if (isDebugEnabled()) {
            console.log('[Subtide]', ...args);
        }
    },

    /**
     * Log info message (always shown)
     * @param {...any} args - Arguments to log
     */
    info: (...args) => {
        console.log('[Subtide]', ...args);
    },

    /**
     * Log warning message (always shown)
     * @param {...any} args - Arguments to log
     */
    warn: (...args) => {
        console.warn('[Subtide]', ...args);
    },

    /**
     * Log error message (always shown)
     * @param {...any} args - Arguments to log
     */
    error: (...args) => {
        console.error('[Subtide]', ...args);
    },

    /**
     * Enable debug mode
     */
    enable: () => {
        try {
            localStorage.setItem(DEBUG_KEY, 'true');
            console.log('[Subtide] Debug mode enabled. Reload the page to see debug logs.');
        } catch (e) {
            window.VT_DEBUG = true;
            console.log('[Subtide] Debug mode enabled (session only).');
        }
    },

    /**
     * Disable debug mode
     */
    disable: () => {
        try {
            localStorage.removeItem(DEBUG_KEY);
            window.VT_DEBUG = false;
            console.log('[Subtide] Debug mode disabled.');
        } catch (e) {
            window.VT_DEBUG = false;
        }
    },

    /**
     * Check if debug is enabled
     * @returns {boolean}
     */
    isEnabled: isDebugEnabled,
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.vtLog = vtLog;
}

// Usage:
// vtLog.debug('This only shows in debug mode');
// vtLog.info('This always shows');
// vtLog.warn('Warning message');
// vtLog.error('Error message');
//
// To enable: vtLog.enable() or localStorage.vtDebug = 'true'
// To disable: vtLog.disable()
