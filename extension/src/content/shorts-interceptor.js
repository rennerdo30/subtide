/**
 * Shorts Interceptor - runs in page context to capture video IDs
 * Injected via script src to bypass CSP
 */
(function() {
    if (window._vtShortsInterceptorSetup) return;
    window._vtShortsInterceptorSetup = true;
    window._vtShortsVideoIds = window._vtShortsVideoIds || new Set();

    // Intercept fetch
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const response = await originalFetch.apply(this, args);

        try {
            const url = (args[0]?.url || args[0]?.toString() || '');
            if (url.includes('reel') || url.includes('/shorts')) {
                const clone = response.clone();
                clone.text().then(text => {
                    const matches = text.match(/"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/g);
                    if (matches) {
                        const ids = [];
                        matches.forEach(match => {
                            const id = match.match(/"([a-zA-Z0-9_-]{11})"/)?.[1];
                            if (id && !window._vtShortsVideoIds.has(id)) {
                                window._vtShortsVideoIds.add(id);
                                ids.push(id);
                            }
                        });
                        if (ids.length > 0) {
                            console.log('[VideoTranslate] Fetch intercepted', ids.length, 'video IDs:', ids);
                            window.postMessage({ type: 'vt-shorts-videos', ids: ids }, '*');
                        }
                    }
                }).catch(() => {});
            }
        } catch (e) {}

        return response;
    };

    // Intercept XMLHttpRequest
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this._vtUrl = url;
        return originalXHROpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function(...args) {
        this.addEventListener('load', function() {
            try {
                const url = this._vtUrl || '';
                if (url.includes('reel') || url.includes('/shorts')) {
                    const text = this.responseText;
                    const matches = text.match(/"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/g);
                    if (matches) {
                        const ids = [];
                        matches.forEach(match => {
                            const id = match.match(/"([a-zA-Z0-9_-]{11})"/)?.[1];
                            if (id && !window._vtShortsVideoIds.has(id)) {
                                window._vtShortsVideoIds.add(id);
                                ids.push(id);
                            }
                        });
                        if (ids.length > 0) {
                            console.log('[VideoTranslate] XHR intercepted', ids.length, 'video IDs');
                            window.postMessage({ type: 'vt-shorts-videos', ids: ids }, '*');
                        }
                    }
                }
            } catch (e) {}
        });
        return originalXHRSend.apply(this, args);
    };

    // Scan for video IDs in page data
    function scanPageData() {
        const ids = [];
        try {
            // Method 1: ytInitialData
            if (window.ytInitialData) {
                const text = JSON.stringify(window.ytInitialData);
                const matches = text.match(/"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/g);
                if (matches) {
                    matches.forEach(match => {
                        const id = match.match(/"([a-zA-Z0-9_-]{11})"/)?.[1];
                        if (id && !window._vtShortsVideoIds.has(id)) {
                            window._vtShortsVideoIds.add(id);
                            ids.push(id);
                        }
                    });
                }
            }

            // Method 2: ytInitialPlayerResponse
            if (window.ytInitialPlayerResponse) {
                const videoId = window.ytInitialPlayerResponse?.videoDetails?.videoId;
                if (videoId && !window._vtShortsVideoIds.has(videoId)) {
                    window._vtShortsVideoIds.add(videoId);
                    ids.push(videoId);
                }
            }

            // Method 3: Script tags with JSON data
            document.querySelectorAll('script').forEach(s => {
                const text = s.textContent || '';
                if (text.includes('reelWatchSequenceResponse') || text.includes('shortsSequence') || text.includes('reelItemRenderer')) {
                    const matches = text.match(/"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/g);
                    if (matches) {
                        matches.forEach(match => {
                            const id = match.match(/"([a-zA-Z0-9_-]{11})"/)?.[1];
                            if (id && !window._vtShortsVideoIds.has(id)) {
                                window._vtShortsVideoIds.add(id);
                                ids.push(id);
                            }
                        });
                    }
                }
            });

            // Method 4: yt.config_
            if (window.yt && window.yt.config_ && window.yt.config_.PLAYER_VARS) {
                const videoId = window.yt.config_.PLAYER_VARS.video_id;
                if (videoId && !window._vtShortsVideoIds.has(videoId)) {
                    window._vtShortsVideoIds.add(videoId);
                    ids.push(videoId);
                }
            }
        } catch (e) {}
        return ids;
    }

    // Scan immediately and after delays
    setTimeout(() => {
        const ids = scanPageData();
        if (ids.length > 0) {
            console.log('[VideoTranslate] Initial scan found', ids.length, 'video IDs');
            window.postMessage({ type: 'vt-shorts-videos', ids: ids }, '*');
        }
    }, 500);

    setTimeout(() => {
        const ids = scanPageData();
        if (ids.length > 0) {
            console.log('[VideoTranslate] Delayed scan found', ids.length, 'video IDs');
            window.postMessage({ type: 'vt-shorts-videos', ids: ids }, '*');
        }
    }, 2000);

    // Expose scan function for manual triggering
    window._vtScanShortsData = function() {
        const ids = scanPageData();
        if (ids.length > 0) {
            window.postMessage({ type: 'vt-shorts-videos', ids: ids }, '*');
        }
        return Array.from(window._vtShortsVideoIds);
    };

    // Listen for trigger message from content script
    window.addEventListener('message', (e) => {
        if (e.source !== window) return;
        if (e.data?.type !== 'vt-trigger-scan') return;

        const ids = scanPageData();
        if (ids.length > 0) {
            console.log('[VideoTranslate] Triggered scan found', ids.length, 'video IDs');
            window.postMessage({ type: 'vt-shorts-videos', ids: ids }, '*');
        }
    });

    console.log('[VideoTranslate] Shorts interceptor installed');
})();
