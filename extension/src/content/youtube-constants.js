/**
 * YouTube Content Script - Constants
 * Shared constants and configuration
 */

// Multilingual status messages for cool animation effect
// Status messages are now handled via chrome.i18n in youtube-status.js

// Speaker colors for diarization display
const SPEAKER_COLORS = [
    '#00bcd4', // Cyan
    '#ffeb3b', // Yellow
    '#4caf50', // Green
    '#ff9800', // Orange
    '#e91e63', // Pink
    '#9c27b0', // Purple
];

/**
 * Get color for a speaker ID
 * @param {string} speakerId - Speaker identifier (e.g., "SPEAKER_01")
 * @returns {string|null} - Color hex code or null
 */
function getSpeakerColor(speakerId) {
    if (!speakerId) return null;
    const match = speakerId.match(/\d+/);
    if (match) {
        const index = parseInt(match[0]);
        return SPEAKER_COLORS[index % SPEAKER_COLORS.length];
    }
    return null;
}
