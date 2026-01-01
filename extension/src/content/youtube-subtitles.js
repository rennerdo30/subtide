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
 * Setup video time sync for subtitle display
 */
function setupSync() {
    const video = document.querySelector('video');
    if (!video) return;

    // Remove existing listeners if any
    if (video._vtSyncHandler) {
        video.removeEventListener('timeupdate', video._vtSyncHandler);
        video.removeEventListener('seeked', video._vtSyncHandler);
    }

    video._vtSyncHandler = () => {
        if (!translatedSubtitles?.length) return;

        const time = video.currentTime * 1000;

        // Binary search for better performance on large subtitle lists
        const sub = findSubtitleAtTime(translatedSubtitles, time);

        const textEl = document.querySelector('.vt-text');
        if (textEl && sub) {
            const styleValues = getSubtitleStyleValues();

            // Build display text with optional speaker label
            let displayText = sub.translatedText || sub.text;

            // Add speaker label if enabled
            const showSpeaker = styleValues.showSpeaker;
            if (sub.speaker && (showSpeaker === 'label' || showSpeaker === 'both')) {
                const speakerNum = sub.speaker.match(/\d+/)?.[0] || '?';
                displayText = `[S${speakerNum}] ${displayText}`;
            }

            textEl.textContent = displayText || '';

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
        } else if (textEl) {
            textEl.textContent = '';
        }
    };

    // Listen to timeupdate for regular playback
    video.addEventListener('timeupdate', video._vtSyncHandler);

    // Listen to seeked for immediate sync after seeking
    video.addEventListener('seeked', video._vtSyncHandler);
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
