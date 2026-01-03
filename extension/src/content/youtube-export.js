/**
 * YouTube Content Script - Subtitle Export
 * Handles exporting subtitles to SRT and VTT formats
 */

/**
 * Format time for SRT (HH:MM:SS,mmm)
 * @param {number} ms - Time in milliseconds
 * @returns {string} Formatted time
 */
function formatSRTTime(ms) {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const milliseconds = ms % 1000;

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
}

/**
 * Format time for VTT (HH:MM:SS.mmm)
 * @param {number} ms - Time in milliseconds
 * @returns {string} Formatted time
 */
function formatVTTTime(ms) {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const milliseconds = ms % 1000;

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
}

/**
 * Export subtitles as SRT format
 * @param {Array} subtitles - Array of subtitle objects with start, end, text
 * @returns {string} SRT formatted string
 */
function exportAsSRT(subtitles) {
    if (!subtitles || subtitles.length === 0) {
        console.error('[VideoTranslate] No subtitles to export');
        return null;
    }

    return subtitles.map((sub, index) => {
        const start = formatSRTTime(sub.start);
        const end = formatSRTTime(sub.end);
        const text = sub.translatedText || sub.text;

        return `${index + 1}\n${start} --> ${end}\n${text}`;
    }).join('\n\n');
}

/**
 * Export subtitles as VTT format
 * @param {Array} subtitles - Array of subtitle objects with start, end, text
 * @returns {string} VTT formatted string
 */
function exportAsVTT(subtitles) {
    if (!subtitles || subtitles.length === 0) {
        console.error('[VideoTranslate] No subtitles to export');
        return null;
    }

    const header = 'WEBVTT\n\n';
    const body = subtitles.map((sub, index) => {
        const start = formatVTTTime(sub.start);
        const end = formatVTTTime(sub.end);
        const text = sub.translatedText || sub.text;

        return `${index + 1}\n${start} --> ${end}\n${text}`;
    }).join('\n\n');

    return header + body;
}

/**
 * Trigger file download
 * @param {string} content - File content
 * @param {string} filename - File name
 * @param {string} mimeType - MIME type
 */
function triggerDownload(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
    console.log('[VideoTranslate] Downloaded:', filename);
}

/**
 * Download subtitles in specified format
 * @param {string} format - 'srt' or 'vtt'
 */
function downloadSubtitles(format = 'srt') {
    // Use translated subtitles if available, otherwise source
    const subs = translatedSubtitles || sourceSubtitles;

    if (!subs || subs.length === 0) {
        console.error('[VideoTranslate] No subtitles available for download');
        alert('No subtitles available to download. Please translate a video first.');
        return;
    }

    const videoTitle = document.querySelector('h1.ytd-video-primary-info-renderer')?.textContent?.trim()
        || document.querySelector('h1.title')?.textContent?.trim()
        || currentVideoId
        || 'subtitles';

    // Sanitize filename
    const safeTitle = videoTitle.replace(/[<>:"/\\|?*]/g, '_').substring(0, 100);

    let content, filename, mimeType;

    if (format === 'vtt') {
        content = exportAsVTT(subs);
        filename = `${safeTitle}.vtt`;
        mimeType = 'text/vtt';
    } else {
        content = exportAsSRT(subs);
        filename = `${safeTitle}.srt`;
        mimeType = 'text/plain';
    }

    if (content) {
        triggerDownload(content, filename, mimeType);
    }
}

/**
 * Download both original and translated subtitles (for dual mode)
 * @param {string} format - 'srt' or 'vtt'
 */
function downloadDualSubtitles(format = 'srt') {
    if (translatedSubtitles && sourceSubtitles) {
        // Download translated version
        downloadSubtitles(format);

        // Also download original with different name
        const videoTitle = document.querySelector('h1.ytd-video-primary-info-renderer')?.textContent?.trim()
            || currentVideoId
            || 'subtitles';
        const safeTitle = videoTitle.replace(/[<>:"/\\|?*]/g, '_').substring(0, 100);

        let content, filename, mimeType;

        if (format === 'vtt') {
            content = exportAsVTT(sourceSubtitles);
            filename = `${safeTitle}_original.vtt`;
            mimeType = 'text/vtt';
        } else {
            content = exportAsSRT(sourceSubtitles);
            filename = `${safeTitle}_original.srt`;
            mimeType = 'text/plain';
        }

        if (content) {
            setTimeout(() => triggerDownload(content, filename, mimeType), 500);
        }
    } else {
        downloadSubtitles(format);
    }
}
