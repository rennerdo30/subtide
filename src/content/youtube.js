/**
 * YouTube Content Script
 * Main entry point for YouTube integration
 */

// Store state
let currentVideoId = null;
let translatedSubtitles = null;
let selectedLanguage = null;
let sourceSubtitles = null;
let isTranslating = false;

// Import modules (will be bundled for production)
// For now, we'll use inline implementations

/**
 * Initialize the extension on YouTube
 */
function init() {
    console.log('[VideoTranslate] Initializing on YouTube');

    // Watch for navigation changes (YouTube is SPA)
    observeNavigation();

    // Initial check
    checkForVideo();
}

/**
 * Observe navigation changes in YouTube SPA
 */
function observeNavigation() {
    // YouTube uses History API for navigation
    let lastUrl = location.href;

    const observer = new MutationObserver(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            console.log('[VideoTranslate] Navigation detected:', lastUrl);
            onNavigate();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Also listen for popstate
    window.addEventListener('popstate', onNavigate);
}

/**
 * Handle navigation
 */
function onNavigate() {
    // Reset state
    translatedSubtitles = null;
    isTranslating = false;

    // Remove old UI
    removeTranslateUI();

    // Check for new video
    setTimeout(checkForVideo, 1000);
}

/**
 * Check if we're on a video page
 */
function checkForVideo() {
    const videoId = getVideoId();

    if (videoId && videoId !== currentVideoId) {
        currentVideoId = videoId;
        console.log('[VideoTranslate] Video detected:', videoId);
        setupVideoPage(videoId);
    }
}

/**
 * Extract video ID from URL
 */
function getVideoId() {
    const url = new URL(window.location.href);
    return url.searchParams.get('v');
}

/**
 * Setup the video page with translation UI
 */
async function setupVideoPage(videoId) {
    // Wait for player to be ready
    await waitForPlayer();

    // Load default language from storage
    const config = await sendMessage({ action: 'getConfig' });
    selectedLanguage = config.defaultLanguage || 'en';

    // Add translate button and language selector to player
    injectTranslateUI();

    // Auto-fetch subtitles info
    await fetchSubtitleTracks(videoId);
}

/**
 * Wait for YouTube player to be ready
 */
function waitForPlayer() {
    return new Promise((resolve) => {
        const check = () => {
            const player = document.querySelector('.html5-video-player');
            if (player) {
                resolve(player);
            } else {
                setTimeout(check, 500);
            }
        };
        check();
    });
}

/**
 * Remove translate UI elements
 */
function removeTranslateUI() {
    const existingUI = document.querySelector('.vt-translate-container');
    if (existingUI) {
        existingUI.remove();
    }

    const existingSubtitles = document.querySelector('.vt-subtitle-overlay');
    if (existingSubtitles) {
        existingSubtitles.remove();
    }
}

/**
 * Inject translation UI into YouTube player
 */
function injectTranslateUI() {
    // Find the right controls container
    const rightControls = document.querySelector('.ytp-right-controls');
    if (!rightControls) {
        console.error('[VideoTranslate] Could not find player controls');
        return;
    }

    // Check if already injected
    if (document.querySelector('.vt-translate-container')) {
        return;
    }

    // Create container
    const container = document.createElement('div');
    container.className = 'vt-translate-container';

    // Create translate button
    const button = document.createElement('button');
    button.className = 'vt-translate-btn ytp-button';
    button.title = 'Translate Subtitles';
    button.innerHTML = `
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
      <path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/>
    </svg>
  `;

    // Create dropdown menu
    const dropdown = document.createElement('div');
    dropdown.className = 'vt-dropdown';
    dropdown.style.display = 'none';

    // Build dropdown content
    dropdown.innerHTML = `
    <div class="vt-dropdown-header">Translate to:</div>
    <div class="vt-language-list"></div>
    <div class="vt-dropdown-footer">
      <div class="vt-status"></div>
    </div>
  `;

    // Populate language list
    populateLanguageList(dropdown.querySelector('.vt-language-list'));

    // Toggle dropdown
    button.addEventListener('click', (e) => {
        e.stopPropagation();
        const isVisible = dropdown.style.display !== 'none';
        dropdown.style.display = isVisible ? 'none' : 'block';
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });

    container.appendChild(button);
    container.appendChild(dropdown);



    // Insert at the beginning of right controls (prepend is safer than insertBefore)
    // This places our button on the left side of the right controls area
    rightControls.prepend(container);

    // Add subtitle overlay
    injectSubtitleOverlay();
}

/**
 * Populate language list in dropdown
 */
async function populateLanguageList(container) {
    const languages = [
        { code: 'en', name: 'English', flag: '🇬🇧' },
        { code: 'ja', name: '日本語', flag: '🇯🇵' },
        { code: 'ko', name: '한국어', flag: '🇰🇷' },
        { code: 'zh-CN', name: '简体中文', flag: '🇨🇳' },
        { code: 'zh-TW', name: '繁體中文', flag: '🇹🇼' },
        { code: 'es', name: 'Español', flag: '🇪🇸' },
        { code: 'fr', name: 'Français', flag: '🇫🇷' },
        { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
        { code: 'pt', name: 'Português', flag: '🇵🇹' },
        { code: 'ru', name: 'Русский', flag: '🇷🇺' },
        { code: 'ar', name: 'العربية', flag: '🇸🇦' },
        { code: 'hi', name: 'हिन्दी', flag: '🇮🇳' },
    ];

    // Add "Off" option
    const offItem = document.createElement('div');
    offItem.className = 'vt-language-item';
    offItem.dataset.code = 'off';
    offItem.innerHTML = `<span class="vt-flag">❌</span><span class="vt-lang-name">Off</span>`;
    offItem.addEventListener('click', () => {
        hideSubtitles();
        updateSelectedLanguage('off');
    });
    container.appendChild(offItem);

    // Add language options
    for (const lang of languages) {
        const item = document.createElement('div');
        item.className = 'vt-language-item';
        item.dataset.code = lang.code;
        item.innerHTML = `
      <span class="vt-flag">${lang.flag}</span>
      <span class="vt-lang-name">${lang.name}</span>
      <span class="vt-lang-status"></span>
    `;

        item.addEventListener('click', () => selectLanguage(lang.code));
        container.appendChild(item);
    }
}

/**
 * Update selected language UI
 */
function updateSelectedLanguage(code) {
    const items = document.querySelectorAll('.vt-language-item');
    items.forEach(item => {
        item.classList.toggle('vt-selected', item.dataset.code === code);
    });
    selectedLanguage = code;
}

/**
 * Select a language for translation
 */
async function selectLanguage(languageCode) {
    if (isTranslating) {
        console.log('[VideoTranslate] Translation already in progress');
        return;
    }

    updateSelectedLanguage(languageCode);

    if (!sourceSubtitles || sourceSubtitles.length === 0) {
        updateStatus('No subtitles available', 'error');
        return;
    }

    // Check if already translated
    if (translatedSubtitles && translatedSubtitles.targetLanguage === languageCode) {
        showSubtitles();
        return;
    }

    // Start translation
    await translateAndShow(languageCode);
}

/**
 * Fetch available subtitle tracks from YouTube
 */
async function fetchSubtitleTracks(videoId) {
    updateStatus('Loading subtitles...', 'loading');

    try {
        const subtitles = await extractYouTubeSubtitles(videoId);

        if (subtitles && subtitles.length > 0) {
            sourceSubtitles = subtitles;
            updateStatus(`${subtitles.length} subtitles loaded`, 'success');
            console.log('[VideoTranslate] Loaded subtitles:', subtitles.length);
        } else {
            updateStatus('No subtitles found', 'warning');
        }
    } catch (error) {
        console.error('[VideoTranslate] Failed to fetch subtitles:', error);
        updateStatus('Failed to load subtitles', 'error');
    }
}

/**
 * Extract subtitles from YouTube
 */
async function extractYouTubeSubtitles(videoId) {
    // Try to get player response from window object first (most reliable)
    let playerResponse = window.ytInitialPlayerResponse;

    // If not available, try to extract from script tags
    if (!playerResponse) {
        const scripts = document.querySelectorAll('script');

        for (const script of scripts) {
            const content = script.textContent || '';
            if (content.includes('ytInitialPlayerResponse')) {
                // Use a more robust extraction method
                const startIndex = content.indexOf('ytInitialPlayerResponse');
                if (startIndex !== -1) {
                    // Find the start of the JSON object
                    const jsonStart = content.indexOf('{', startIndex);
                    if (jsonStart !== -1) {
                        // Find the matching closing brace by counting braces
                        let braceCount = 0;
                        let jsonEnd = jsonStart;
                        for (let i = jsonStart; i < content.length; i++) {
                            if (content[i] === '{') braceCount++;
                            if (content[i] === '}') braceCount--;
                            if (braceCount === 0) {
                                jsonEnd = i + 1;
                                break;
                            }
                        }

                        try {
                            const jsonStr = content.substring(jsonStart, jsonEnd);
                            playerResponse = JSON.parse(jsonStr);
                            console.log('[VideoTranslate] Found player response in script tag');
                            break;
                        } catch (e) {
                            console.warn('[VideoTranslate] Failed to parse player response:', e.message);
                        }
                    }
                }
            }
        }
    }

    if (!playerResponse) {
        throw new Error('Could not find player response');
    }

    // Get caption tracks
    const captions = playerResponse.captions;
    if (!captions || !captions.playerCaptionsTracklistRenderer) {
        throw new Error('No captions available for this video');
    }

    const tracks = captions.playerCaptionsTracklistRenderer.captionTracks;
    if (!tracks || tracks.length === 0) {
        throw new Error('No caption tracks found');
    }

    // Prefer auto-generated or first available track
    const track = tracks.find(t => t.kind === 'asr') || tracks[0];
    console.log('[VideoTranslate] Using caption track:', track.languageCode, track.name?.simpleText);

    // Try multiple URL formats
    const subtitles = await fetchSubtitlesWithFallback(track, videoId);

    if (subtitles.length === 0) {
        throw new Error('No subtitle content found');
    }

    // Store source language
    sourceSubtitles = subtitles;
    sourceSubtitles.sourceLanguage = track.languageCode;

    return subtitles;
}

/**
 * Try fetching subtitles with multiple URL formats
 */
async function fetchSubtitlesWithFallback(track, videoId) {
    const baseUrl = track.baseUrl;

    // Build different URL variants to try
    // IMPORTANT: YouTube's baseUrl contains signed parameters - don't remove them!
    const urlsToTry = [];

    // Method 1: Use baseUrl exactly as provided, just add fmt=json3
    // This preserves all signature parameters (ei, caps, opi, etc.)
    if (baseUrl.includes('fmt=')) {
        urlsToTry.push(baseUrl.replace(/fmt=[^&]+/, 'fmt=json3'));
    } else {
        urlsToTry.push(baseUrl + (baseUrl.includes('?') ? '&' : '?') + 'fmt=json3');
    }

    // Method 2: Original baseUrl as-is (might return XML or other format)
    urlsToTry.push(baseUrl);

    // Method 3: Try with tlang parameter for translation URLs
    const url3 = new URL(baseUrl);
    url3.searchParams.set('fmt', 'json3');
    urlsToTry.push(url3.toString());

    for (const url of urlsToTry) {
        console.log('[VideoTranslate] Trying subtitle URL:', url.substring(0, 100) + '...');

        try {
            // IMPORTANT: Include credentials to send YouTube cookies
            const response = await fetch(url, {
                credentials: 'include',
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                }
            });

            if (!response.ok) {
                console.warn('[VideoTranslate] HTTP error:', response.status);
                continue;
            }

            const text = await response.text();

            if (!text || text.trim() === '' || text.trim() === '{}') {
                console.warn('[VideoTranslate] Empty response, trying next URL');
                continue;
            }

            // Check if it's XML (starts with <transcript> or <?xml)
            if (text.trim().startsWith('<?xml') || text.trim().startsWith('<transcript')) {
                console.log('[VideoTranslate] Received XML subtitles, parsing...');
                const subtitles = parseXMLSubtitles(text);
                if (subtitles.length > 0) return subtitles;
            }

            // Try parsing as JSON
            let data;
            try {
                data = JSON.parse(text);
                const subtitles = parseSubtitleEvents(data);
                if (subtitles.length > 0) return subtitles;
            } catch (e) {
                // Not JSON, and not XML matched above
                console.warn('[VideoTranslate] Invalid format, trying next URL');
            }
        } catch (error) {
            console.warn('[VideoTranslate] Fetch error:', error.message);
            continue;
        }
    }



    // Fallback 1: Try the Transcript API (Internal YouTube API)
    // This is the most robust modern method, bypassing legacy timedtext blocking
    console.log('[VideoTranslate] Direct fetch failed. Trying Internal Transcript API...');
    try {
        // We use the background script to execute this in the MAIN world to access ytcfg
        const transcriptResult = await sendMessage({
            action: 'fetchTranscriptMainWorld',
            videoId: videoId
        });

        if (transcriptResult && transcriptResult.success && transcriptResult.subtitles) {
            console.log('[VideoTranslate] Transcript API (Main World) successful:', transcriptResult.subtitles.length, 'subtitles');
            return transcriptResult.subtitles;
        } else if (transcriptResult && transcriptResult.error) {
            console.warn('[VideoTranslate] Transcript API (Main World) error:', transcriptResult.error);
        }
    } catch (e) {
        console.warn('[VideoTranslate] Transcript API fallback failed:', e.message);
    }

    // Fallback 2: Enable YouTube's native subtitles and read from TextTrack API
    // This is disruptive (clicks UI), so we try it after the API approach
    console.log('[VideoTranslate] Trying to enable native subtitles and extract from TextTrack...');
    try {
        const textTrackResult = await sendMessage({
            action: 'enableAndExtractSubtitles'
        });

        if (textTrackResult && textTrackResult.success && textTrackResult.subtitles) {
            console.log('[VideoTranslate] TextTrack extraction successful:', textTrackResult.subtitles.length, 'subtitles');
            return textTrackResult.subtitles;
        } else if (textTrackResult && textTrackResult.error) {
            console.warn('[VideoTranslate] TextTrack extraction error:', textTrackResult.error);
        }
    } catch (e) {
        console.warn('[VideoTranslate] TextTrack extraction failed:', e.message);
    }

    // Fallback 2: Try fetching via MAIN WORLD execution
    console.log('[VideoTranslate] Trying to fetch via main world execution...');
    try {
        const mainWorldResult = await sendMessage({
            action: 'fetchSubtitlesMainWorld',
            subtitleUrl: baseUrl
        });

        if (mainWorldResult && mainWorldResult.success && mainWorldResult.subtitles) {
            console.log('[VideoTranslate] Main world fetch successful:', mainWorldResult.subtitles.length, 'subtitles');
            return mainWorldResult.subtitles;
        } else if (mainWorldResult && mainWorldResult.error) {
            console.warn('[VideoTranslate] Main world fetch error:', mainWorldResult.error);
        }
    } catch (e) {
        console.warn('[VideoTranslate] Main world fetch failed:', e.message);
    }

    // Fallback 3: Try fetching via background script
    console.log('[VideoTranslate] Trying to fetch via background script...');
    try {
        const response = await sendMessage({
            action: 'fetchSubtitles',
            subtitleUrl: baseUrl,
            videoId: videoId,
            languageCode: track.languageCode
        });

        if (response && response.success && response.subtitles) {
            console.log('[VideoTranslate] Background fetch successful');
            return response.subtitles;
        }
    } catch (e) {
        console.warn('[VideoTranslate] Background fetch failed:', e.message);
    }

    // Fallback 4: Try extracting directly from player state (no network request)
    console.log('[VideoTranslate] Trying to extract from player state...');
    try {
        const playerStateResult = await sendMessage({
            action: 'extractSubtitlesFromPlayer'
        });

        if (playerStateResult && playerStateResult.success && playerStateResult.subtitles) {
            console.log('[VideoTranslate] Player state extraction successful:', playerStateResult.subtitles.length, 'subtitles');
            return playerStateResult.subtitles;
        } else if (playerStateResult && playerStateResult.trackUrl) {
            let trackUrl = playerStateResult.trackUrl;
            // Force JSON3 format if not present, as it's often more robust against blocking
            if (!trackUrl.includes('fmt=')) {
                trackUrl += '&fmt=json3';
            }

            console.log('[VideoTranslate] Player state found new track URL. Fetching:', trackUrl.substring(0, 50) + '...');

            // Try fetching this specific URL via XHR in main world (most robust)
            const xhrResult = await sendMessage({
                action: 'fetchSubtitlesXHR',
                subtitleUrl: trackUrl
            });

            if (xhrResult && xhrResult.success && xhrResult.subtitles) {
                console.log('[VideoTranslate] Fetched subtitles from new track URL:', xhrResult.subtitles.length);
                return xhrResult.subtitles;
            } else {
                console.warn('[VideoTranslate] Failed to fetch new track URL via XHR:', xhrResult?.error || 'Unknown error');
            }
        }
    } catch (e) {
        console.warn('[VideoTranslate] Player state extraction failed:', e.message);
    }

    // Fallback 4: Try XMLHttpRequest via main world (some ad blockers only block fetch)
    console.log('[VideoTranslate] Trying XMLHttpRequest via main world...');
    try {
        const xhrResult = await sendMessage({
            action: 'fetchSubtitlesXHR',
            subtitleUrl: baseUrl
        });

        if (xhrResult && xhrResult.success && xhrResult.subtitles) {
            console.log('[VideoTranslate] XHR fetch successful:', xhrResult.subtitles.length, 'subtitles');
            return xhrResult.subtitles;
        }
    } catch (e) {
        console.warn('[VideoTranslate] XHR fetch failed:', e.message);
    }

    // Fallback 5: Try the Transcript API (Internal YouTube API)
    try {
        const transcriptSubtitles = await fetchTranscriptApi(videoId);
        if (transcriptSubtitles && transcriptSubtitles.length > 0) {
            return transcriptSubtitles;
        }
    } catch (e) {
        console.warn('[VideoTranslate] Transcript API fallback failed:', e);
    }

    // Fallback 6: Invidious API (Bypass network blocks)
    console.log('[VideoTranslate] Trying Invidious API fallback...');
    const invidiousSubtitles = await fetchSubtitlesViaInvidious(videoId);
    if (invidiousSubtitles) {
        console.log('[VideoTranslate] Invidious fallback successful:', invidiousSubtitles.length, 'subtitles');
        return invidiousSubtitles;
    }

    // Provide a detailed error message
    throw new Error('Failed to load subtitles. This may be caused by a VPN, proxy, or browser extension interfering with requests. Try: 1) Disabling your VPN/proxy, 2) Disabling ad blockers, 3) Testing in an incognito window with extensions disabled.');
}

/**
 * Parse subtitle events from JSON data
 */
function parseSubtitleEvents(data) {
    const subtitles = [];

    if (data.events) {
        for (const event of data.events) {
            if (event.segs) {
                const text = event.segs.map(s => s.utf8 || '').join('');
                if (text.trim()) {
                    subtitles.push({
                        startMs: event.tStartMs || 0,
                        durationMs: event.dDurationMs || 3000,
                        text: text.trim(),
                    });
                }
            }
        }
    }

    return subtitles;
}

/**
 * Parse XML subtitles
 */
function parseXMLSubtitles(xml) {
    const subtitles = [];
    try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xml, "text/xml");
        const textuals = xmlDoc.getElementsByTagName('text');

        for (let i = 0; i < textuals.length; i++) {
            const node = textuals[i];
            const start = parseFloat(node.getAttribute('start')) * 1000;
            const duration = parseFloat(node.getAttribute('dur')) * 1000;
            const text = node.textContent;

            if (text && text.trim()) {
                subtitles.push({
                    startMs: start,
                    durationMs: duration,
                    text: text.trim()
                });
            }
        }
        console.log('[VideoTranslate] Parsed', subtitles.length, 'XML subtitles');
    } catch (e) {
        console.warn('[VideoTranslate] XML parsing failed:', e.message);
    }
    return subtitles;
}

/**
 * Try to get subtitles directly from the YouTube player
 */
async function getSubtitlesFromPlayer() {
    // Try to access YouTube's internal player API
    const player = document.querySelector('#movie_player');
    if (!player) {
        console.warn('[VideoTranslate] Player element not found');
        return [];
    }

    // Check if player has getPlayerResponse
    if (typeof player.getPlayerResponse === 'function') {
        try {
            const playerResponse = player.getPlayerResponse();
            if (playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks) {
                const tracks = playerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;
                const track = tracks.find(t => t.kind === 'asr') || tracks[0];

                if (track?.baseUrl) {
                    // Add fmt=json3 while preserving all other parameters
                    const url = track.baseUrl.includes('fmt=')
                        ? track.baseUrl.replace(/fmt=[^&]+/, 'fmt=json3')
                        : track.baseUrl + '&fmt=json3';

                    const response = await fetch(url, {
                        credentials: 'include',
                        headers: {
                            'Accept': 'application/json, text/plain, */*',
                        }
                    });
                    if (response.ok) {
                        const text = await response.text();
                        if (text && text.trim() && text.trim() !== '{}') {
                            try {
                                const data = JSON.parse(text);
                                return parseSubtitleEvents(data);
                            } catch (e) {
                                console.warn('[VideoTranslate] Player API JSON parse error:', e.message);
                            }
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('[VideoTranslate] Player API error:', e.message);
        }
    }

    return [];
}

/**
 * Translate and show subtitles
 */
async function translateAndShow(targetLanguage) {
    console.log('[VideoTranslate] translateAndShow called for:', targetLanguage);

    if (!sourceSubtitles || sourceSubtitles.length === 0) {
        updateStatus('No subtitles to translate', 'error');
        console.error('[VideoTranslate] No source subtitles available');
        return;
    }

    console.log('[VideoTranslate] Source subtitles count:', sourceSubtitles.length);
    isTranslating = true;
    updateStatus('Checking cache...', 'loading');

    const videoId = getVideoId();
    const sourceLanguage = sourceSubtitles.sourceLanguage || 'auto';
    console.log('[VideoTranslate] Video ID:', videoId, 'Source lang:', sourceLanguage);

    try {
        // Check cache first via background script
        const cacheResult = await sendMessage({
            action: 'getCachedTranslation',
            videoId,
            sourceLanguage,
            targetLanguage,
        });

        console.log('[VideoTranslate] Cache result:', cacheResult);

        if (cacheResult.found) {
            translatedSubtitles = {
                subtitles: cacheResult.cached,
                targetLanguage,
            };
            console.log('[VideoTranslate] Loaded from cache:', translatedSubtitles.subtitles.length, 'subtitles');
            updateStatus('Loaded from cache', 'success');
            showSubtitles();
            isTranslating = false;
            return;
        }

        // Translate via background script
        updateStatus('Translating...', 'loading');
        console.log('[VideoTranslate] Starting translation...');

        const result = await sendMessage({
            action: 'translate',
            videoId,
            subtitles: sourceSubtitles,
            sourceLanguage,
            targetLanguage,
        });

        console.log('[VideoTranslate] Translation result:', result);

        if (result.success) {
            translatedSubtitles = {
                subtitles: result.translations,
                targetLanguage,
            };
            console.log('[VideoTranslate] Translation complete:', translatedSubtitles.subtitles.length, 'subtitles');
            console.log('[VideoTranslate] First subtitle:', translatedSubtitles.subtitles[0]);
            updateStatus('Translation complete', 'success');
            showSubtitles();
        } else {
            throw new Error(result.error || 'Translation failed');
        }
    } catch (error) {
        console.error('[VideoTranslate] Translation error:', error);
        updateStatus(error.message, 'error');
    }

    isTranslating = false;
}

/**
 * Update status display
 */
function updateStatus(message, type) {
    // Update dropdown status
    const status = document.querySelector('.vt-status');
    if (status) {
        status.textContent = message;
        status.className = `vt-status vt-status-${type}`;
    }

    // Show status in subtitle overlay
    const overlay = document.querySelector('.vt-subtitle-overlay');
    const textDiv = document.querySelector('.vt-subtitle-text');

    if (overlay && textDiv) {
        textDiv.textContent = message;
        textDiv.className = `vt-subtitle-text vt-status-${type}`;

        // Show overlay
        overlay.style.display = 'block';

        // Handle auto-hide for success or long-running errors
        if (type === 'success') {
            setTimeout(() => {
                // Only hide if we haven't started showing subtitles yet (i.e. still has success class)
                if (textDiv.classList.contains('vt-status-success')) {
                    // Reset class to default
                    textDiv.className = 'vt-subtitle-text';
                    // Check logic will hide it if needed
                    updateCurrentSubtitle();
                }
            }, 3000);
        }
    }
}

/**
 * Inject subtitle overlay into player
 */
function injectSubtitleOverlay() {
    const player = document.querySelector('.html5-video-player');
    if (!player) return;

    // Check if already exists
    if (document.querySelector('.vt-subtitle-overlay')) return;

    const overlay = document.createElement('div');
    overlay.className = 'vt-subtitle-overlay';
    overlay.innerHTML = `
    <div class="vt-subtitle-text"></div>
  `;

    player.appendChild(overlay);

    // Setup subtitle sync
    setupSubtitleSync();
}

/**
 * Setup subtitle synchronization with video
 */
function setupSubtitleSync() {
    const video = document.querySelector('video');
    if (!video) {
        console.error('[VideoTranslate] No video element found for sync');
        return;
    }

    console.log('[VideoTranslate] Setting up subtitle sync');

    // Remove any existing listeners to avoid duplicates
    video.removeEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('timeupdate', onTimeUpdate);
}

/**
 * Time update handler
 */
function onTimeUpdate(e) {
    const video = e.target;
    if (translatedSubtitles && selectedLanguage !== 'off') {
        updateCurrentSubtitle(video.currentTime * 1000);
    }
}

/**
 * Update current subtitle based on video time
 */
function updateCurrentSubtitle(currentTimeMs) {
    if (!translatedSubtitles || !translatedSubtitles.subtitles) {
        return;
    }

    const subtitleText = document.querySelector('.vt-subtitle-text');
    if (!subtitleText) {
        console.warn('[VideoTranslate] Subtitle text element not found');
        return;
    }

    // Find current subtitle
    const current = translatedSubtitles.subtitles.find(sub => {
        const endMs = sub.startMs + sub.durationMs;
        return currentTimeMs >= sub.startMs && currentTimeMs < endMs;
    });

    if (current) {
        const text = current.translatedText || current.text;
        subtitleText.textContent = text;
        subtitleText.style.display = 'inline-block';
        subtitleText.parentElement.style.display = 'block';
    } else {
        subtitleText.style.display = 'none';
    }
}

/**
 * Show subtitles
 */
function showSubtitles() {
    console.log('[VideoTranslate] Showing subtitles, count:', translatedSubtitles?.subtitles?.length || 0);

    // Make sure overlay exists
    let overlay = document.querySelector('.vt-subtitle-overlay');
    if (!overlay) {
        console.log('[VideoTranslate] Creating subtitle overlay');
        injectSubtitleOverlay();
        overlay = document.querySelector('.vt-subtitle-overlay');
    }

    if (overlay) {
        overlay.style.display = 'block';
        overlay.style.visibility = 'visible';
        console.log('[VideoTranslate] Overlay visible');
    }

    // Re-setup sync in case it wasn't done
    setupSubtitleSync();

    // Close dropdown
    const dropdown = document.querySelector('.vt-dropdown');
    if (dropdown) {
        dropdown.style.display = 'none';
    }

    // Trigger an immediate subtitle check
    const video = document.querySelector('video');
    if (video && translatedSubtitles) {
        updateCurrentSubtitle(video.currentTime * 1000);
    }
}

/**
 * Hide subtitles
 */
function hideSubtitles() {
    const overlay = document.querySelector('.vt-subtitle-overlay');
    if (overlay) {
        overlay.style.display = 'none';
    }

    // Close dropdown
    const dropdown = document.querySelector('.vt-dropdown');
    if (dropdown) {
        dropdown.style.display = 'none';
    }
}

/**
 * Send message to background script
 */
function sendMessage(message) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                resolve(response);
            }
        });
    });
}

/**
 * Listen for messages from background script
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'translationProgress') {
        updateStatus(`Translating... ${message.progress.percentage}%`, 'loading');
    }
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

/**
 * Fetch subtitles using YouTube's Internal Transcript API (Innertube)
 */
async function fetchTranscriptApi(videoId) {
    try {
        console.log('[VideoTranslate] Attempting to fetch via Transcript API...');
        let apiKey = null;
        let clientDetails = null;

        try {
            if (typeof window.ytcfg !== 'undefined' && window.ytcfg.data_) {
                apiKey = window.ytcfg.data_.INNERTUBE_API_KEY;
                clientDetails = window.ytcfg.data_.INNERTUBE_CONTEXT;
            } else if (document.body.innerHTML.includes('INNERTUBE_API_KEY')) {
                const keyMatch = document.body.innerHTML.match(/"INNERTUBE_API_KEY":"(.+?)"/);
                if (keyMatch) apiKey = keyMatch[1];
                const contextMatch = document.body.innerHTML.match(/"INNERTUBE_CONTEXT":({.+?})/);
                if (contextMatch) { try { clientDetails = JSON.parse(contextMatch[1]); } catch (e) { } }
            }
        } catch (e) { console.warn('Context extraction error', e); }

        if (!apiKey) return null;

        const context = clientDetails || {
            client: { hl: 'en', gl: 'US', clientName: 'WEB', clientVersion: '2.20230920.01.00' }
        };

        const response = await fetch(`https://www.youtube.com/youtubei/v1/get_transcript?key=${apiKey}`, {
            method: 'POST',
            body: JSON.stringify({ context, params: '', videoId })
        });

        if (!response.ok) return null;
        const data = await response.json();
        const segments = findValuesByKey(data, 'transcriptSegmentRenderer');

        const subtitles = [];
        for (const segment of segments) {
            if (segment.startTimeText && segment.snippet) {
                const startMs = parseTimeText(segment.startTimeText.simpleText);
                const text = segment.snippet.runs.map(r => r.text).join(' ');
                subtitles.push({ startMs, durationMs: 0, text: text.trim() });
            }
        }

        for (let i = 0; i < subtitles.length; i++) {
            subtitles[i].durationMs = (i < subtitles.length - 1) ? subtitles[i + 1].startMs - subtitles[i].startMs : 3000;
        }

        if (subtitles.length > 0) {
            console.log('[VideoTranslate] Successfully parsed', subtitles.length, 'lines from Transcript API');
            return subtitles;
        }
    } catch (e) { console.warn('[VideoTranslate] Transcript API error:', e.message); }
    return null;
}

function findValuesByKey(obj, key) {
    let list = [];
    if (!obj) return list;
    if (obj instanceof Array) {
        for (var i in obj) { list = list.concat(findValuesByKey(obj[i], key)); }
        return list;
    }
    if (obj[key]) list.push(obj[key]);
    if ((typeof obj == "object") && (obj !== null)) {
        for (var child in obj) { list = list.concat(findValuesByKey(obj[child], key)); }
    }
    return list;
}

function parseTimeText(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.split(':').map(Number);
    if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
    if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
    return 0;
}

/**
 * Fallback: Fetch subtitles via Invidious API
 * Used when direct YouTube access is blocked
 */
async function fetchSubtitlesViaInvidious(videoId) {
    const instances = [
        'https://inv.tux.pizza',
        'https://yewtu.be',
        'https://vid.puffyan.us',
        'https://invidious.projectsegfau.lt'
    ];

    for (const instance of instances) {
        try {
            console.log(`[VideoTranslate] Trying Invidious instance: ${instance}`);
            // Get caption metadata first
            const metaResponse = await fetch(`${instance}/api/v1/captions/${videoId}`);
            if (!metaResponse.ok) continue;

            const captions = await metaResponse.json();
            if (!captions || captions.length === 0) continue;

            // Prefer English, then auto-generated, then first available
            let track = captions.find(c => c.languageCode === 'en' && !c.autoGenerated);
            if (!track) track = captions.find(c => c.languageCode === 'en');
            if (!track) track = captions[0];

            if (track) {
                console.log(`[VideoTranslate] Found track on Invidious: ${track.label} (${track.languageCode})`);

                const subtitleUrl = track.url.startsWith('http') ? track.url : `${instance}${track.url}`;

                const subResponse = await fetch(subtitleUrl);
                if (!subResponse.ok) continue;

                const text = await subResponse.text();
                // Invidious returns WebVTT usually
                const subtitles = parseWebVTT(text);
                if (subtitles.length > 0) return subtitles;
            }
        } catch (e) {
            console.warn(`[VideoTranslate] Invidious instance ${instance} failed:`, e.message);
        }
    }
    return null;
}

function parseWebVTT(vttText) {
    const lines = vttText.split('\n');
    const subtitles = [];
    let currentSub = null;

    // Simple parser
    for (let line of lines) {
        line = line.trim();
        if (!line || line === 'WEBVTT') continue;
        if (line.includes('-->')) {
            const times = line.split('-->');
            if (times.length === 2) {
                currentSub = {
                    startMs: parseVTTTime(times[0].trim()),
                    durationMs: parseVTTTime(times[1].trim()) - parseVTTTime(times[0].trim()),
                    text: ''
                };
                subtitles.push(currentSub);
            }
        } else if (currentSub) {
            // Skip sequence numbers if pure digits
            if (/^\d+$/.test(line)) continue;
            currentSub.text = currentSub.text ? currentSub.text + ' ' + line : line;
        }
    }
    return subtitles;
}

function parseVTTTime(timeStr) {
    // 00:00:01.500 or 01:500
    const parts = timeStr.split('.');
    const ms = parts[1] ? parseInt(parts[1]) : 0;
    const timeParts = parts[0].split(':').map(Number);
    let seconds = 0;
    if (timeParts.length === 3) {
        seconds = timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2];
    } else if (timeParts.length === 2) {
        seconds = timeParts[0] * 60 + timeParts[1];
    }
    return seconds * 1000 + ms;
}
