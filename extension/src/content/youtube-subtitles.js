/**
 * YouTube Content Script - Subtitle Processing
 * Handles subtitle parsing, merging, and synchronization
 */

/**
 * Parse subtitles from backend response
 * @param {Object} data - Response data from backend
 * @returns {Array} Parsed subtitles array
 */
function parseSubtitles(data) {
    const subtitles = [];

    // Whisper format
    if (data.segments) {
        for (const seg of data.segments) {
            subtitles.push({
                start: seg.start * 1000,
                end: seg.end * 1000,
                text: seg.text.trim(),
                speaker: seg.speaker
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
 * @param {Array} subs - Subtitle segments
 * @param {number} maxGap - Maximum gap between segments to merge (ms)
 * @param {number} maxDur - Maximum duration after merge (ms)
 * @returns {Array} Merged subtitles
 */
function mergeSegments(subs, maxGap = 500, maxDur = 8000) {
    if (subs.length <= 1) return subs;

    const merged = [];
    let curr = { ...subs[0] };

    for (let i = 1; i < subs.length; i++) {
        const next = subs[i];
        const gap = next.start - curr.end;
        const newDur = next.end - curr.start;

        if (gap <= maxGap && newDur <= maxDur && curr.speaker === next.speaker) {
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
 * Density analysis result for adaptive tolerance calculation
 */
let subtitleDensity = {
    avgDuration: 3000,      // Average subtitle duration in ms
    avgGap: 500,            // Average gap between subtitles in ms
    minGap: 100,            // Minimum gap found
    subsPerMinute: 10,      // Subtitles per minute (density metric)
    toleranceStart: 50,     // Computed: show subtitle early
    toleranceEnd: 100,      // Computed: keep subtitle longer
    lookahead: 150,         // Computed: look ahead for next subtitle
    gapBridge: 300,         // Computed: max gap to bridge
    isHighDensity: false,   // Flag for rapid-fire dialogue
    isLowDensity: false,    // Flag for sparse subtitles
};

/**
 * Manual sync offset in milliseconds (positive = subtitles appear later)
 */
let syncOffset = 0;

/**
 * Adjust sync offset by given amount
 * @param {number} deltaMs - Amount to adjust in ms (positive or negative)
 */
function adjustSyncOffset(deltaMs) {
    syncOffset += deltaMs;
    console.log('[VideoTranslate] Sync offset:', syncOffset, 'ms');
    updateSyncOffsetDisplay();
}

/**
 * Reset sync offset to zero
 */
function resetSyncOffset() {
    syncOffset = 0;
    console.log('[VideoTranslate] Sync offset reset');
    updateSyncOffsetDisplay();
}

/**
 * Update the sync offset display in the UI
 */
function updateSyncOffsetDisplay() {
    const display = document.querySelector('.vt-sync-display');
    if (display) {
        const sign = syncOffset >= 0 ? '+' : '';
        display.textContent = `${sign}${(syncOffset / 1000).toFixed(1)}s`;
    }
}

/**
 * Windowed subtitle access for very long videos
 */
let subtitleWindow = {
    isEnabled: false,       // Only enabled for 1000+ subtitles
    windowSize: 200,        // Number of subtitles in active window
    windowStart: 0,         // Start index of current window
    windowEnd: 0,           // End index of current window
    fullList: null,         // Reference to full subtitle list
    activeList: null,       // Currently active window slice
    lastAccessTime: 0,      // For tracking access patterns
};

/**
 * Analyze subtitle density and calculate adaptive tolerances
 * @param {Array} subs - Subtitle array to analyze
 * @returns {Object} Density analysis result
 */
function analyzeSubtitleDensity(subs) {
    if (!subs || subs.length < 2) {
        console.log('[VideoTranslate] Not enough subtitles for density analysis');
        return subtitleDensity;
    }

    const durations = [];
    const gaps = [];
    let totalDuration = 0;

    for (let i = 0; i < subs.length; i++) {
        const sub = subs[i];
        const duration = sub.end - sub.start;
        durations.push(duration);
        totalDuration += duration;

        if (i < subs.length - 1) {
            const gap = subs[i + 1].start - sub.end;
            if (gap > 0) gaps.push(gap);
        }
    }

    // Calculate statistics
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    const avgGap = gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 500;
    const minGap = gaps.length > 0 ? Math.min(...gaps) : 100;

    // Calculate video duration from subtitles
    const videoDuration = subs[subs.length - 1].end - subs[0].start;
    const subsPerMinute = (subs.length / videoDuration) * 60000;

    // Determine density classification
    // High density: >20 subs/min or avg gap < 200ms (rapid dialogue)
    const isHighDensity = subsPerMinute > 20 || avgGap < 200;
    // Low density: <5 subs/min or avg gap > 2000ms (sparse subtitles)
    const isLowDensity = subsPerMinute < 5 || avgGap > 2000;

    // Calculate adaptive tolerances based on density
    let toleranceStart, toleranceEnd, lookahead, gapBridge;

    if (isHighDensity) {
        // Tight tolerances for rapid-fire dialogue to prevent overlap
        toleranceStart = Math.min(30, minGap * 0.3);
        toleranceEnd = Math.min(50, minGap * 0.4);
        lookahead = Math.min(80, avgGap * 0.5);
        gapBridge = Math.min(150, avgGap * 0.8);
        console.log('[VideoTranslate] High density detected - using tight tolerances');
    } else if (isLowDensity) {
        // Generous tolerances for sparse subtitles
        toleranceStart = 100;
        toleranceEnd = 200;
        lookahead = 300;
        gapBridge = 500;
        console.log('[VideoTranslate] Low density detected - using generous tolerances');
    } else {
        // Normal density - balanced tolerances
        toleranceStart = Math.max(30, Math.min(80, avgGap * 0.15));
        toleranceEnd = Math.max(50, Math.min(150, avgGap * 0.25));
        lookahead = Math.max(100, Math.min(250, avgGap * 0.4));
        gapBridge = Math.max(200, Math.min(400, avgGap * 0.6));
        console.log('[VideoTranslate] Normal density - using balanced tolerances');
    }

    subtitleDensity = {
        avgDuration: Math.round(avgDuration),
        avgGap: Math.round(avgGap),
        minGap: Math.round(minGap),
        subsPerMinute: Math.round(subsPerMinute * 10) / 10,
        toleranceStart: Math.round(toleranceStart),
        toleranceEnd: Math.round(toleranceEnd),
        lookahead: Math.round(lookahead),
        gapBridge: Math.round(gapBridge),
        isHighDensity,
        isLowDensity,
    };

    console.log('[VideoTranslate] Density analysis:', subtitleDensity);
    return subtitleDensity;
}

/**
 * Initialize windowed subtitle access for very long videos
 * @param {Array} subs - Full subtitle array
 */
function initSubtitleWindow(subs) {
    const WINDOW_THRESHOLD = 1000; // Enable windowing for 1000+ subtitles

    if (!subs || subs.length < WINDOW_THRESHOLD) {
        subtitleWindow.isEnabled = false;
        subtitleWindow.fullList = subs;
        subtitleWindow.activeList = subs;
        return;
    }

    console.log(`[VideoTranslate] Enabling windowed access for ${subs.length} subtitles`);

    subtitleWindow = {
        isEnabled: true,
        windowSize: 200,
        windowStart: 0,
        windowEnd: Math.min(200, subs.length),
        fullList: subs,
        activeList: subs.slice(0, 200),
        lastAccessTime: performance.now(),
    };
}

/**
 * Update subtitle window based on current playback position
 * @param {number} currentIndex - Current subtitle index in full list
 */
function updateSubtitleWindow(currentIndex) {
    if (!subtitleWindow.isEnabled) return;

    const now = performance.now();
    // Avoid updating too frequently (every 500ms max)
    if (now - subtitleWindow.lastAccessTime < 500) return;

    const halfWindow = Math.floor(subtitleWindow.windowSize / 2);
    const idealStart = Math.max(0, currentIndex - halfWindow);
    const idealEnd = Math.min(subtitleWindow.fullList.length, currentIndex + halfWindow);

    // Only update if we're near the window edges (within 20% of boundary)
    const edgeThreshold = Math.floor(subtitleWindow.windowSize * 0.2);
    const distanceToStart = currentIndex - subtitleWindow.windowStart;
    const distanceToEnd = subtitleWindow.windowEnd - currentIndex;

    if (distanceToStart < edgeThreshold || distanceToEnd < edgeThreshold) {
        subtitleWindow.windowStart = idealStart;
        subtitleWindow.windowEnd = idealEnd;
        subtitleWindow.activeList = subtitleWindow.fullList.slice(idealStart, idealEnd);
        subtitleWindow.lastAccessTime = now;
        console.log(`[VideoTranslate] Window updated: ${idealStart}-${idealEnd}`);
    }
}

/**
 * Get active subtitle list (windowed for long videos)
 * @returns {Array} Active subtitle list
 */
function getActiveSubtitles() {
    return subtitleWindow.activeList || translatedSubtitles;
}

/**
 * Update active subtitles during streaming (Tier 4)
 * Called when new subtitle batches arrive progressively
 * @param {Array} newSubtitles - Updated subtitle array with new entries
 */
function updateActiveSubtitles(newSubtitles) {
    if (!newSubtitles || newSubtitles.length === 0) return;

    // Update the window's reference to the full list
    if (subtitleWindow.isEnabled) {
        subtitleWindow.fullList = newSubtitles;

        // Update the active window slice
        const start = subtitleWindow.windowStart;
        const end = Math.min(subtitleWindow.windowEnd, newSubtitles.length);
        subtitleWindow.activeList = newSubtitles.slice(start, end);

        // Extend window end if new subtitles exceed current window
        if (newSubtitles.length > subtitleWindow.windowEnd) {
            subtitleWindow.windowEnd = Math.min(
                subtitleWindow.windowStart + subtitleWindow.windowSize,
                newSubtitles.length
            );
            subtitleWindow.activeList = newSubtitles.slice(
                subtitleWindow.windowStart,
                subtitleWindow.windowEnd
            );
        }
    } else {
        // For non-windowed access, just update the reference
        subtitleWindow.fullList = newSubtitles;
        subtitleWindow.activeList = newSubtitles;
    }

    console.log(`[VideoTranslate] Active subtitles updated: ${newSubtitles.length} total`);
}

/**
 * Convert window-local index to full list index
 * @param {number} localIndex - Index within active window
 * @returns {number} Index in full subtitle list
 */
function toFullIndex(localIndex) {
    if (!subtitleWindow.isEnabled || localIndex < 0) return localIndex;
    return subtitleWindow.windowStart + localIndex;
}

/**
 * Convert full list index to window-local index
 * @param {number} fullIndex - Index in full subtitle list
 * @returns {number} Index within active window, or -1 if outside window
 */
function toLocalIndex(fullIndex) {
    if (!subtitleWindow.isEnabled || fullIndex < 0) return fullIndex;
    if (fullIndex < subtitleWindow.windowStart || fullIndex >= subtitleWindow.windowEnd) {
        return -1; // Outside window, will trigger window update
    }
    return fullIndex - subtitleWindow.windowStart;
}

/**
 * Sync state for tracking playback
 */
let syncState = {
    animationFrameId: null,
    lastVideoTime: -1,
    lastSyncTime: 0,
    currentSubIndex: -1,      // Index in full list
    currentLocalIndex: -1,    // Index in active window
    isStalled: false,
    stallStartTime: 0,
    playbackRate: 1,
};

/**
 * Setup video time sync for subtitle display
 * Uses requestAnimationFrame for smooth, frequent updates (~60fps)
 */
function setupSync() {
    const video = document.querySelector('video');
    if (!video) return;

    // Cancel any existing animation frame
    if (syncState.animationFrameId) {
        cancelAnimationFrame(syncState.animationFrameId);
        syncState.animationFrameId = null;
    }

    // Reset sync state
    syncState = {
        animationFrameId: null,
        lastVideoTime: -1,
        lastSyncTime: 0,
        currentSubIndex: -1,
        isStalled: false,
        stallStartTime: 0,
        playbackRate: video.playbackRate || 1,
    };

    // Remove existing event listeners
    if (video._vtSyncHandler) {
        video.removeEventListener('seeked', video._vtSyncHandler);
        video.removeEventListener('ratechange', video._vtRateHandler);
        video.removeEventListener('waiting', video._vtWaitingHandler);
        video.removeEventListener('playing', video._vtPlayingHandler);
    }

    /**
     * Main sync loop using requestAnimationFrame
     * This provides ~60fps updates vs ~4fps with timeupdate
     */
    const syncLoop = () => {
        if (!translatedSubtitles?.length) {
            syncState.animationFrameId = requestAnimationFrame(syncLoop);
            return;
        }

        const time = video.currentTime * 1000;
        const now = performance.now();

        // Detect if video is stalled (time hasn't changed for 200ms while playing)
        if (!video.paused && !video.ended) {
            if (Math.abs(time - syncState.lastVideoTime) < 1) {
                // Video time hasn't changed
                if (!syncState.isStalled && now - syncState.lastSyncTime > 200) {
                    syncState.isStalled = true;
                    syncState.stallStartTime = now;
                    console.log('[VideoTranslate] Detected buffering/stall');
                }
            } else {
                // Video is playing normally
                if (syncState.isStalled) {
                    console.log('[VideoTranslate] Resumed from stall');
                    syncState.isStalled = false;
                }
                syncState.lastSyncTime = now;
            }
        }

        syncState.lastVideoTime = time;

        // Skip sync updates during stall to prevent flickering
        if (syncState.isStalled) {
            syncState.animationFrameId = requestAnimationFrame(syncLoop);
            return;
        }

        // Use windowed access for performance on long videos
        const activeSubs = getActiveSubtitles();
        const localIndex = subtitleWindow.isEnabled ? toLocalIndex(syncState.currentSubIndex) : syncState.currentSubIndex;

        // Use optimized subtitle lookup with adaptive tolerance
        const sub = findSubtitleAtTimeWithTolerance(activeSubs, time, localIndex);

        const textEl = document.querySelector('.vt-text');
        if (textEl && sub) {
            // Track current subtitle index for optimized lookups
            const foundLocalIndex = activeSubs.indexOf(sub);
            const fullIndex = subtitleWindow.isEnabled ? toFullIndex(foundLocalIndex) : foundLocalIndex;
            syncState.currentSubIndex = fullIndex;

            // Update window position if using windowed access
            if (subtitleWindow.isEnabled && fullIndex >= 0) {
                updateSubtitleWindow(fullIndex);
            }

            const styleValues = getSubtitleStyleValues();

            // Build display text with optional speaker label
            let displayText = sub.translatedText || sub.text;

            // Add speaker label if enabled
            const showSpeaker = styleValues.showSpeaker;
            if (sub.speaker && (showSpeaker === 'label' || showSpeaker === 'both')) {
                const speakerNum = sub.speaker.match(/\d+/)?.[0] || '?';
                displayText = `[S${speakerNum}] ${displayText}`;
            }

            // Only update DOM if content actually changed
            if (textEl.textContent !== displayText) {
                textEl.textContent = displayText || '';
            }

            // Apply speaker color based on settings
            const useSpeakerColor = styleValues.useSpeakerColor ||
                showSpeaker === 'color' ||
                showSpeaker === 'both';

            if (useSpeakerColor && sub.speaker) {
                const speakerColor = getSpeakerColor(sub.speaker);
                textEl.style.setProperty('color', speakerColor || styleValues.color || '#fff', 'important');
            } else {
                textEl.style.setProperty('color', styleValues.color || '#fff', 'important');
            }
        } else if (textEl && textEl.textContent !== '') {
            textEl.textContent = '';
            syncState.currentSubIndex = -1;
        }

        syncState.animationFrameId = requestAnimationFrame(syncLoop);
    };

    // Handle seeking - reset state and force immediate sync
    video._vtSyncHandler = () => {
        syncState.lastVideoTime = -1;
        syncState.currentSubIndex = -1;
        syncState.isStalled = false;
    };
    video.addEventListener('seeked', video._vtSyncHandler);

    // Handle playback rate changes
    video._vtRateHandler = () => {
        syncState.playbackRate = video.playbackRate;
        console.log('[VideoTranslate] Playback rate changed to:', video.playbackRate);
    };
    video.addEventListener('ratechange', video._vtRateHandler);

    // Handle buffering/waiting events
    video._vtWaitingHandler = () => {
        syncState.isStalled = true;
        console.log('[VideoTranslate] Video waiting (buffering)');
    };
    video.addEventListener('waiting', video._vtWaitingHandler);

    // Handle playing after buffer
    video._vtPlayingHandler = () => {
        if (syncState.isStalled) {
            syncState.isStalled = false;
            syncState.lastSyncTime = performance.now();
            console.log('[VideoTranslate] Video playing (resumed from buffer)');
        }
    };
    video.addEventListener('playing', video._vtPlayingHandler);

    // Start the sync loop
    syncState.animationFrameId = requestAnimationFrame(syncLoop);
    console.log('[VideoTranslate] Subtitle sync started with requestAnimationFrame');
}

/**
 * Stop the subtitle sync loop
 */
function stopSync() {
    if (syncState.animationFrameId) {
        cancelAnimationFrame(syncState.animationFrameId);
        syncState.animationFrameId = null;
    }

    const video = document.querySelector('video');
    if (video) {
        if (video._vtSyncHandler) video.removeEventListener('seeked', video._vtSyncHandler);
        if (video._vtRateHandler) video.removeEventListener('ratechange', video._vtRateHandler);
        if (video._vtWaitingHandler) video.removeEventListener('waiting', video._vtWaitingHandler);
        if (video._vtPlayingHandler) video.removeEventListener('playing', video._vtPlayingHandler);
    }
}

/**
 * Binary search for subtitle at given time (more efficient for large lists)
 * @param {Array} subs - Sorted subtitle array
 * @param {number} time - Current time in ms
 * @returns {Object|null} Matching subtitle or null
 */
function findSubtitleAtTime(subs, time) {
    if (!subs || subs.length === 0) return null;

    let left = 0;
    let right = subs.length - 1;

    while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const sub = subs[mid];

        if (time >= sub.start && time <= sub.end) {
            return sub;
        } else if (time < sub.start) {
            right = mid - 1;
        } else {
            left = mid + 1;
        }
    }

    return null;
}

/**
 * Find subtitle at given time with adaptive tolerance and last-index optimization
 * This prevents flickering at segment boundaries and provides smoother transitions
 * Uses adaptive tolerances calculated from subtitle density analysis
 * @param {Array} subs - Sorted subtitle array
 * @param {number} time - Current time in ms
 * @param {number} lastIndex - Last known subtitle index for optimization
 * @returns {Object|null} Matching subtitle or null
 */
function findSubtitleAtTimeWithTolerance(subs, time, lastIndex = -1) {
    if (!subs || subs.length === 0) return null;

    // Apply manual sync offset (positive offset = subtitles appear later)
    const adjustedTime = time - syncOffset;

    // Use adaptive tolerances from density analysis
    const TOLERANCE_START = subtitleDensity.toleranceStart;
    const TOLERANCE_END = subtitleDensity.toleranceEnd;
    const LOOKAHEAD = subtitleDensity.lookahead;
    const GAP_BRIDGE = subtitleDensity.gapBridge;

    // First, check if we're still in the current subtitle (optimization for sequential playback)
    if (lastIndex >= 0 && lastIndex < subs.length) {
        const current = subs[lastIndex];
        // Add tolerance to end time to prevent premature switching
        if (adjustedTime >= current.start - TOLERANCE_START && adjustedTime <= current.end + TOLERANCE_END) {
            return current;
        }

        // Check the next subtitle (common case during playback)
        if (lastIndex + 1 < subs.length) {
            const next = subs[lastIndex + 1];
            if (adjustedTime >= next.start - TOLERANCE_START && adjustedTime <= next.end + TOLERANCE_END) {
                return next;
            }
        }

        // Check previous subtitle (for small backwards jumps)
        if (lastIndex > 0) {
            const prev = subs[lastIndex - 1];
            if (adjustedTime >= prev.start - TOLERANCE_START && adjustedTime <= prev.end + TOLERANCE_END) {
                return prev;
            }
        }
    }

    // Binary search for new position
    let left = 0;
    let right = subs.length - 1;
    let result = null;

    while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const sub = subs[mid];

        // Check with tolerance
        if (adjustedTime >= sub.start - TOLERANCE_START && adjustedTime <= sub.end + TOLERANCE_END) {
            result = sub;
            break;
        } else if (adjustedTime < sub.start - TOLERANCE_START) {
            right = mid - 1;
        } else {
            left = mid + 1;
        }
    }

    // If no exact match found, check if we're in a gap but close to next subtitle
    if (!result && left < subs.length) {
        const nextSub = subs[left];
        // If we're within lookahead range of the next subtitle, wait (don't return null)
        // This prevents gaps from flickering the subtitle display
        if (nextSub.start - adjustedTime <= LOOKAHEAD && nextSub.start - adjustedTime > 0) {
            // We're in a small gap, keep showing the previous subtitle if it exists
            if (left > 0) {
                const prevSub = subs[left - 1];
                // Only keep previous if the gap isn't too large (use adaptive gap bridge)
                if (adjustedTime - prevSub.end <= GAP_BRIDGE) {
                    return prevSub;
                }
            }
        }
    }

    return result;
}

/**
 * Show subtitle overlay on video
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
 * Get subtitle style values based on settings
 * @returns {Object} Style values for subtitle display
 */
function getSubtitleStyleValues() {
    // Font sizes
    const sizes = {
        small: '20px',
        medium: '28px',
        large: '36px',
        xlarge: '48px',
        huge: '64px',
        gigantic: '80px',
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
        speaker: null, // Special: use speaker colors
    };

    // Position (bottom or top)
    const positions = {
        bottom: { bottom: '70px', top: 'auto' },
        top: { bottom: 'auto', top: '70px' },
    };

    // Font families
    const fonts = {
        'sans-serif': '"YouTube Noto", Roboto, Arial, sans-serif',
        'serif': 'Georgia, "Times New Roman", serif',
        'monospace': '"Courier New", Consolas, monospace',
        'casual': '"Comic Sans MS", cursive',
    };

    // Text outlines (text-shadow)
    const outlines = {
        none: 'none',
        light: '1px 1px 2px rgba(0,0,0,0.7)',
        medium: '2px 2px 3px rgba(0,0,0,0.9), -1px -1px 2px rgba(0,0,0,0.7)',
        heavy: '3px 3px 4px #000, -2px -2px 3px #000, 2px -2px 3px #000, -2px 2px 3px #000',
    };

    // Opacity values
    const opacities = {
        full: '1',
        high: '0.85',
        medium: '0.7',
        low: '0.5',
    };

    return {
        fontSize: sizes[subtitleSettings.size] || sizes.medium,
        background: backgrounds[subtitleSettings.background] || backgrounds.dark,
        color: colors[subtitleSettings.color] || colors.white,
        position: positions[subtitleSettings.position] || positions.bottom,
        fontFamily: fonts[subtitleSettings.font] || fonts['sans-serif'],
        textShadow: outlines[subtitleSettings.outline] || outlines.medium,
        opacity: opacities[subtitleSettings.opacity] || opacities.full,
        showSpeaker: subtitleSettings.showSpeaker || 'off',
        useSpeakerColor: subtitleSettings.color === 'speaker',
    };
}
