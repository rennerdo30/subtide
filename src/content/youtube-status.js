/**
 * YouTube Content Script - Status Management
 * Handles status panel updates and animations
 */

let statusAnimationInterval = null;
let currentStatusIndex = 0;

/**
 * Update status display with enhanced progress information
 * @param {string} text - Main status message
 * @param {string} type - Status type: 'loading', 'success', 'error'
 * @param {number|null} percent - Progress percentage (0-100)
 * @param {object|null} options - Extended options
 */
function updateStatus(text, type = '', percent = null, options = {}) {
    const panel = document.querySelector('.vt-status-panel');
    const stepIndicator = panel?.querySelector('.vt-step-indicator');
    const textEl = panel?.querySelector('.vt-status-text');
    const progressBar = panel?.querySelector('.vt-progress-bar');
    const progressFill = panel?.querySelector('.vt-progress-fill');
    const batchInfoEl = panel?.querySelector('.vt-batch-info');
    const etaEl = panel?.querySelector('.vt-eta');

    // Stop any existing language cycling animation
    if (statusAnimationInterval) {
        clearInterval(statusAnimationInterval);
        statusAnimationInterval = null;
    }

    if (panel && textEl) {
        const subStatusEl = panel.querySelector('.vt-sub-status');

        // Update step indicator (e.g., "Step 2/4")
        if (stepIndicator) {
            if (options.step && options.totalSteps) {
                stepIndicator.textContent = chrome.i18n.getMessage('stepProgress', [options.step.toString(), options.totalSteps.toString()]);
                stepIndicator.style.display = 'block';
            } else {
                stepIndicator.style.display = 'none';
            }
        }

        const isSuccess = type === 'success';
        const isError = type === 'error';
        const shouldAnimate = type === 'loading' && (options.animationKey || text.length > 0);

        if (subStatusEl) {
            if (shouldAnimate && text) {
                subStatusEl.textContent = text;
                subStatusEl.style.display = 'block';
            } else {
                subStatusEl.style.display = 'none';
            }
        }

        if (shouldAnimate) {
            // Determine which message set to use
            let messageSet = STATUS_MESSAGES.translating;

            if (options.animationKey && STATUS_MESSAGES[options.animationKey]) {
                messageSet = STATUS_MESSAGES[options.animationKey];
            } else if (text.toLowerCase().includes('loading')) {
                messageSet = STATUS_MESSAGES.loading;
            } else if (text.toLowerCase().includes('process')) {
                messageSet = STATUS_MESSAGES.processing;
            } else {
                messageSet = STATUS_MESSAGES.generic;
            }

            textEl.classList.add('vt-text-fade');

            // Start with target language if available, otherwise browser language
            const browserLang = navigator.language.split('-')[0];
            const targetLang = (selectedLanguage || browserLang).split('-')[0];
            const startIndex = messageSet.findIndex(m => m.lang === targetLang);
            currentStatusIndex = startIndex >= 0 ? startIndex : 0;

            // Set initial text
            textEl.textContent = messageSet[currentStatusIndex].text;
            textEl.style.opacity = '1';

            // Cycle through languages
            let cycleCount = 0;
            statusAnimationInterval = setInterval(() => {
                cycleCount++;

                const showPrimary = (cycleCount % 4 !== 0);

                let nextIndex;
                if (showPrimary) {
                    nextIndex = messageSet.findIndex(m => m.lang === targetLang);
                    if (nextIndex === -1) nextIndex = 0;
                } else {
                    const others = messageSet.filter(m => m.lang !== targetLang);
                    if (others.length > 0) {
                        const randomOther = others[Math.floor(Math.random() * others.length)];
                        nextIndex = messageSet.indexOf(randomOther);
                    } else {
                        nextIndex = (currentStatusIndex + 1) % messageSet.length;
                    }
                }

                currentStatusIndex = nextIndex;

                textEl.style.opacity = '0';
                setTimeout(() => {
                    textEl.textContent = messageSet[currentStatusIndex].text;
                    textEl.style.opacity = '1';
                }, 100);
            }, 1500);
        } else {
            // Static text
            textEl.textContent = text;
            textEl.style.opacity = '1';
            textEl.classList.remove('vt-text-fade');
        }

        panel.className = 'vt-status-panel ' + type;

        // Update progress bar
        if (progressBar && progressFill) {
            if (percent !== null && percent > 0) {
                progressBar.style.display = 'block';
                progressFill.style.width = `${percent}%`;
            } else {
                progressBar.style.display = 'none';
            }
        }

        // Update batch info (e.g., "Batch 3/10")
        if (batchInfoEl) {
            if (options.batchInfo && options.batchInfo.current && options.batchInfo.total) {
                batchInfoEl.textContent = chrome.i18n.getMessage('batchProgress', [options.batchInfo.current.toString(), options.batchInfo.total.toString()]);
                batchInfoEl.style.display = 'inline';
            } else {
                batchInfoEl.style.display = 'none';
            }
        }

        // Update ETA
        if (etaEl) {
            if (options.eta && type === 'loading') {
                etaEl.textContent = chrome.i18n.getMessage('eta', [options.eta]);
                etaEl.style.display = 'inline';
            } else {
                etaEl.style.display = 'none';
            }
        }

        // Show panel for loading/error, hide on success after delay
        if (type === 'loading' || type === 'error') {
            panel.classList.add('show');
        } else if (type === 'success') {
            // Stop animation on success
            if (statusAnimationInterval) {
                clearInterval(statusAnimationInterval);
                statusAnimationInterval = null;
            }
            panel.classList.add('show');
            if (progressBar) progressBar.style.display = 'none';
            if (stepIndicator) stepIndicator.style.display = 'none';
            if (batchInfoEl) batchInfoEl.style.display = 'none';
            if (etaEl) etaEl.style.display = 'none';
            setTimeout(() => {
                if (panel.classList.contains('success')) {
                    panel.classList.remove('show');
                }
            }, 2000);
        }
    }
}
