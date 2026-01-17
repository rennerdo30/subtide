/**
 * Generic Video Player - Subtitle Synchronization
 * Handles subtitle timing, windowing, and sync loop for smooth playback
 */

// =============================================================================
// Constants
// =============================================================================

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

// Sync state for tracking playback
const syncState = {
    animationFrameId: null,
    lastVideoTime: -1,
    currentSubIndex: -1,
    isActive: false,
    subtitles: [],
    syncOffset: 0,  // Manual sync offset in ms
};

// Subtitle display window for performance on long videos
const subtitleWindow = {
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

// =============================================================================
// Windowing Functions
// =============================================================================

/**
 * Initialize windowed viewing for long subtitle lists
 * @param {Array} subs - Subtitle array
 */
function initSubtitleWindow(subs) {
    if (!subs || subs.length < SUBTITLE_WINDOW_THRESHOLD) {
        subtitleWindow.isEnabled = false;
        subtitleWindow.activeList = subs || [];
        subtitleWindow.fullList = subs || [];
        return;
    }

    subtitleWindow.isEnabled = true;
    subtitleWindow.windowSize = SUBTITLE_WINDOW_SIZE;
    subtitleWindow.windowStart = 0;
    subtitleWindow.windowEnd = SUBTITLE_WINDOW_SIZE;
    subtitleWindow.fullList = subs;
    subtitleWindow.activeList = subs.slice(0, SUBTITLE_WINDOW_SIZE);
    subtitleWindow.lastAccessTime = performance.now();

    console.log('[VideoTranslate] Windowed access enabled for', subs.length, 'subtitles');
}

/**
 * Update active window based on current position
 * @param {number} currentIndex - Current subtitle index
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

// =============================================================================
// Density Analysis
// =============================================================================

/**
 * Analyze density to adjust sync tolerances
 * @param {Array} subtitles - Subtitle array
 */
function analyzeSubtitleDensity(subtitles) {
    if (!subtitles || subtitles.length < 10) {
        subtitleDensity = { ...DEFAULT_TIMING };
        return;
    }

    const totalTime = (subtitles[subtitles.length - 1].end - subtitles[0].start) / 1000;
    const subsPerMinute = (subtitles.length / totalTime) * 60;

    if (subsPerMinute > DENSITY_HIGH_THRESHOLD) {
        subtitleDensity = { ...HIGH_DENSITY_TIMING };
        console.log('[VideoTranslate] High density subtitles:', Math.round(subsPerMinute), 'subs/min');
    } else if (subsPerMinute < DENSITY_LOW_THRESHOLD) {
        subtitleDensity = { ...LOW_DENSITY_TIMING };
        console.log('[VideoTranslate] Low density subtitles:', Math.round(subsPerMinute), 'subs/min');
    } else {
        subtitleDensity = { ...DEFAULT_TIMING };
        console.log('[VideoTranslate] Normal density subtitles:', Math.round(subsPerMinute), 'subs/min');
    }
}

// =============================================================================
// Subtitle Finding
// =============================================================================

/**
 * Find subtitle at given time using binary search for efficiency
 * @param {number} timeMs - Current time in milliseconds
 * @returns {Object|null} Found subtitle or null
 */
function findSubtitleAt(timeMs) {
    // Apply sync offset
    const adjustedTime = timeMs - syncState.syncOffset;

    // Use windowed list if available for performance
    const subs = subtitleWindow.isEnabled ? subtitleWindow.activeList : syncState.subtitles;
    const offset = subtitleWindow.isEnabled ? subtitleWindow.windowStart : 0;

    if (!subs || subs.length === 0) return null;

    // 1. Sequential check (most common case: linear playback)
    const localIdx = syncState.currentSubIndex - offset;
    if (localIdx >= 0 && localIdx < subs.length) {
        const current = subs[localIdx];
        if (adjustedTime >= current.start - subtitleDensity.toleranceStart &&
            adjustedTime <= current.end + subtitleDensity.toleranceEnd) {
            return current;
        }

        // Check next subtitle (lookahead)
        if (localIdx + 1 < subs.length) {
            const next = subs[localIdx + 1];
            if (adjustedTime >= next.start - subtitleDensity.toleranceStart &&
                adjustedTime <= next.end + subtitleDensity.toleranceEnd) {
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

        if (adjustedTime < sub.start - subtitleDensity.lookahead) {
            hi = mid - 1;
        } else if (adjustedTime > sub.end + subtitleDensity.toleranceEnd) {
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
        if (nextSub.start - adjustedTime <= subtitleDensity.gapBridge) {
            syncState.currentSubIndex = offset + lo;
            return nextSub;
        }
    }

    return null;
}

// =============================================================================
// Sync Loop
// =============================================================================

/**
 * Setup video event handlers for seek and state changes
 * @param {HTMLVideoElement} video - Video element
 * @param {Function} onSubtitleUpdate - Callback when subtitle changes
 */
function setupSyncHandlers(video, onSubtitleUpdate) {
    // Remove existing handlers
    if (video._vtSeekHandler) {
        video.removeEventListener('seeked', video._vtSeekHandler);
        video.removeEventListener('ended', video._vtEndHandler);
    }

    // Handle seek - reset find position
    video._vtSeekHandler = () => {
        syncState.currentSubIndex = -1;
        syncState.lastVideoTime = -1;
        // Trigger immediate update after seek
        if (onSubtitleUpdate) {
            const currentTimeMs = video.currentTime * 1000;
            const sub = findSubtitleAt(currentTimeMs);
            onSubtitleUpdate(sub);
        }
    };
    video.addEventListener('seeked', video._vtSeekHandler);

    // Handle video end
    video._vtEndHandler = () => {
        if (onSubtitleUpdate) {
            onSubtitleUpdate(null);
        }
    };
    video.addEventListener('ended', video._vtEndHandler);
}

/**
 * Start the RAF-based sync loop for smooth subtitle updates
 * @param {HTMLVideoElement} video - Video element
 * @param {Function} onSubtitleUpdate - Callback with current subtitle (or null)
 */
function startSyncLoop(video, onSubtitleUpdate) {
    // Cancel existing loop
    if (syncState.animationFrameId) {
        cancelAnimationFrame(syncState.animationFrameId);
    }

    syncState.isActive = true;

    const syncLoop = () => {
        if (!syncState.isActive || !video) {
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

        // Notify callback
        if (onSubtitleUpdate) {
            onSubtitleUpdate(sub);
        }

        // Update window if needed
        if (sub && syncState.currentSubIndex >= 0) {
            updateSubtitleWindow(syncState.currentSubIndex);
        }

        syncState.animationFrameId = requestAnimationFrame(syncLoop);
    };

    syncState.animationFrameId = requestAnimationFrame(syncLoop);
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

// =============================================================================
// Sync Offset Management
// =============================================================================

/**
 * Adjust sync offset
 * @param {number} offsetMs - Offset change in milliseconds
 */
function adjustSyncOffset(offsetMs) {
    syncState.syncOffset += offsetMs;
    console.log('[VideoTranslate] Sync offset adjusted to:', syncState.syncOffset, 'ms');
    return syncState.syncOffset;
}

/**
 * Reset sync offset to zero
 */
function resetSyncOffset() {
    syncState.syncOffset = 0;
    console.log('[VideoTranslate] Sync offset reset');
    return 0;
}

/**
 * Get current sync offset
 * @returns {number} Current offset in milliseconds
 */
function getSyncOffset() {
    return syncState.syncOffset;
}

/**
 * Set sync offset directly
 * @param {number} offsetMs - New offset in milliseconds
 */
function setSyncOffset(offsetMs) {
    syncState.syncOffset = offsetMs;
    return syncState.syncOffset;
}

// =============================================================================
// Subtitle Management
// =============================================================================

/**
 * Load subtitles and initialize sync
 * @param {Array} subtitles - Array of subtitle objects with start, end, text
 */
function loadSubtitles(subtitles) {
    if (!subtitles || !subtitles.length) {
        console.warn('[VideoTranslate] No subtitles to load');
        return;
    }

    console.log('[VideoTranslate] Loading', subtitles.length, 'subtitles');

    // Normalize subtitles
    const normalized = subtitles.map(s => ({
        start: s.start,
        end: s.end,
        text: s.translatedText || s.text,
        originalText: s.text,
        speaker: s.speaker
    }));

    syncState.subtitles = normalized;
    syncState.currentSubIndex = -1;
    syncState.lastVideoTime = -1;

    // Analyze and prepare
    analyzeSubtitleDensity(normalized);
    initSubtitleWindow(normalized);

    return normalized;
}

/**
 * Clear all subtitles
 */
function clearSubtitles() {
    stopSyncLoop();
    syncState.subtitles = [];
    syncState.currentSubIndex = -1;
    syncState.lastVideoTime = -1;
    subtitleWindow.isEnabled = false;
    subtitleWindow.activeList = [];
    subtitleWindow.fullList = [];
}

/**
 * Get current subtitles
 * @returns {Array} Current subtitle array
 */
function getSubtitles() {
    return syncState.subtitles;
}

/**
 * Check if subtitles are loaded
 * @returns {boolean}
 */
function hasSubtitles() {
    return syncState.subtitles && syncState.subtitles.length > 0;
}

// =============================================================================
// Export
// =============================================================================

// Expose functions globally for content script access
window.VTGenericSync = {
    // Sync control
    startSyncLoop,
    stopSyncLoop,
    setupSyncHandlers,

    // Subtitle management
    loadSubtitles,
    clearSubtitles,
    getSubtitles,
    hasSubtitles,
    findSubtitleAt,

    // Sync offset
    adjustSyncOffset,
    resetSyncOffset,
    getSyncOffset,
    setSyncOffset,

    // State access
    getSyncState: () => syncState,

    // Constants (for UI to use)
    constants: {
        SUBTITLE_WINDOW_THRESHOLD,
        SUBTITLE_WINDOW_SIZE,
        SUBTITLE_SYNC_TARGET_FPS
    }
};
