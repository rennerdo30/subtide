(function () {
    // Only run in the main world
    if (window.VT_INTERCEPTOR_LOADED) return;
    window.VT_INTERCEPTOR_LOADED = true;

    console.log('[Subtide] Network Interceptor Loaded');

    const OriginalXHR = window.XMLHttpRequest;
    const OriginalFetch = window.fetch;

    function checkUrl(url) {
        if (!url) return;
        if (typeof url !== 'string') {
            if (url instanceof URL) url = url.href;
            else if (url instanceof Request) url = url.url;
            else return;
        }

        if (url.includes('.m3u8') || url.includes('.mpd')) {
            console.log('[Subtide] Intercepted Stream URL:', url);
            window.dispatchEvent(new CustomEvent('vt-stream-found', {
                detail: { url: url }
            }));
        }
    }

    // Intercept Fetch - preserve function properties
    const wrappedFetch = async function (...args) {
        const [resource] = args;
        checkUrl(resource);
        return OriginalFetch.apply(this, args);
    };
    // Copy all properties from original fetch
    Object.keys(OriginalFetch).forEach(key => {
        wrappedFetch[key] = OriginalFetch[key];
    });
    window.fetch = wrappedFetch;

    // Intercept XHR - preserve prototype chain and static properties
    function WrappedXHR() {
        const xhr = new OriginalXHR();
        const originalOpen = xhr.open;

        xhr.open = function (method, url, ...args) {
            checkUrl(url);
            return originalOpen.apply(this, [method, url, ...args]);
        };

        return xhr;
    }
    // Preserve prototype chain
    WrappedXHR.prototype = OriginalXHR.prototype;
    // Copy static properties (DONE, HEADERS_RECEIVED, LOADING, OPENED, UNSENT)
    Object.keys(OriginalXHR).forEach(key => {
        WrappedXHR[key] = OriginalXHR[key];
    });
    // Copy constants that may be on the constructor
    ['UNSENT', 'OPENED', 'HEADERS_RECEIVED', 'LOADING', 'DONE'].forEach(constant => {
        if (OriginalXHR[constant] !== undefined) {
            WrappedXHR[constant] = OriginalXHR[constant];
        }
    });
    window.XMLHttpRequest = WrappedXHR;

    // Provide cleanup mechanism for debugging
    window.VT_DISABLE_INTERCEPTOR = function() {
        window.fetch = OriginalFetch;
        window.XMLHttpRequest = OriginalXHR;
        window.VT_INTERCEPTOR_LOADED = false;
        console.log('[Subtide] Network Interceptor Disabled');
    };

})();
