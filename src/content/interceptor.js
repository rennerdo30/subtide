(function () {
    console.log('[VideoTranslate] Interceptor loaded');

    // Store original methods
    const originalFetch = window.fetch;
    const originalXHR = window.XMLHttpRequest;

    // Hook fetch
    window.fetch = async function (...args) {
        const response = await originalFetch.apply(this, args);

        try {
            const url = response.url;
            if (url && url.includes('/api/timedtext')) {
                console.log('[VideoTranslate] Intercepted timedtext fetch:', url);
                const clone = response.clone();
                clone.text().then(text => {
                    window.dispatchEvent(new CustomEvent('VideoTranslate_SubtitleData', {
                        detail: { url, data: text, type: 'fetch' }
                    }));
                }).catch(e => console.error('[VideoTranslate] Interceptor read error:', e));
            }
        } catch (e) {
            console.error('[VideoTranslate] Interceptor error:', e);
        }

        return response;
    };

    // Hook XHR
    window.XMLHttpRequest = function () {
        const xhr = new originalXHR();
        const open = xhr.open;

        xhr.open = function (method, url) {
            this._url = url;
            return open.apply(this, arguments);
        };

        xhr.addEventListener('load', function () {
            if (this._url && this._url.includes('/api/timedtext')) {
                console.log('[VideoTranslate] Intercepted timedtext XHR:', this._url);
                try {
                    window.dispatchEvent(new CustomEvent('VideoTranslate_SubtitleData', {
                        detail: { url: this._url, data: this.responseText, type: 'xhr' }
                    }));
                } catch (e) {
                    console.error('[VideoTranslate] Interceptor XHR error:', e);
                }
            }
        });

        return xhr;
    };
})();
