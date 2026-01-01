/**
 * YouTube Content Script
 * Handles UI injection and subtitle synchronization
 */

// State
let currentVideoId = null;
let sourceSubtitles = null;
let translatedSubtitles = null;
let selectedLanguage = null;
let isProcessing = false;
let userTier = 'tier1';
let backendUrl = 'http://localhost:5001';

// Subtitle appearance settings
let subtitleSettings = {
    size: 'medium',
    position: 'bottom',
    background: 'dark',
    color: 'white',
};

// Multilingual status messages for cool animation effect
const STATUS_MESSAGES = {
    translating: [
        { lang: 'en', text: 'Translating subtitles into your language...' },
        { lang: 'ja', text: '字幕をあなたの言語に翻訳しています...' },
        { lang: 'ko', text: '자막을 사용자의 언어로 번역 중...' },
        { lang: 'zh', text: '正在将字幕翻译为您选择的语言...' },
        { lang: 'es', text: 'Traduciendo subtítulos a su idioma...' },
        { lang: 'fr', text: 'Traduction des sous-titres dans votre langue...' },
        { lang: 'de', text: 'Untertitel werden in Ihre Sprache übersetzt...' },
        { lang: 'pt', text: 'Traduzindo legendas para o seu idioma...' },
        { lang: 'ru', text: 'Перевод субтитров на ваш язык...' },
    ],
    loading: [
        { lang: 'en', text: 'Loading AI model and components...' },
        { lang: 'ja', text: 'AIモデルとコンポーネントを読み込み中...' },
        { lang: 'zh', text: '正在加载 AI 模型和组件...' },
        { lang: 'fr', text: 'Chargement du modèle AI et des composants...' },
        { lang: 'de', text: 'KI-Modell und Komponenten werden geladen...' },
    ],
    processing: [
        { lang: 'en', text: 'Optimizing video for AI translation...' },
        { lang: 'ja', text: 'AI翻訳用にビデオを最適化しています...' },
        { lang: 'zh', text: '正在为 AI 翻译优化视频...' },
        { lang: 'ko', text: 'AI 번역을 위해 동영상을 최적화하는 중...' },
        { lang: 'es', text: 'Optimizando el video para la traducción por IA...' },
        { lang: 'fr', text: 'Optimisation de la vidéo pour la traduction par IA...' },
        { lang: 'de', text: 'Video für die KI-Übersetzung optimieren...' },
    ],
    transcribing: [
        { lang: 'en', text: 'Generating AI-powered transcriptions...' },
        { lang: 'ja', text: 'AIによる文字起こしを生成しています...' },
        { lang: 'ko', text: 'AI 기반 스크립트를 생성하는 중...' },
        { lang: 'zh', text: '正在生成 AI 驱动的转录内容...' },
        { lang: 'es', text: 'Generando transcripciones mediante IA...' },
        { lang: 'fr', text: 'Génération de transcriptions par IA...' },
        { lang: 'de', text: 'KI-gestützte Transkriptionen werden erstellt...' },
        { lang: 'pt', text: 'Gerando transcrições alimentadas por IA...' },
        { lang: 'ru', text: 'Генерация транскрипции с помощью ИИ...' },
    ],
    checking: [
        { lang: 'en', text: 'Verifying subtitle tracks and segments...' },
        { lang: 'ja', text: '字幕トラックとセグメントを確認しています...' },
        { lang: 'ko', text: '자막 트랙 및 세그먼트 확인 중...' },
        { lang: 'zh', text: '正在验证字幕轨道和分段...' },
        { lang: 'es', text: 'Verificando pistas de subtítulos y segmentos...' },
        { lang: 'fr', text: 'Vérification des pistes de sous-titres...' },
        { lang: 'de', text: 'Untertitelspuren und Segmente werden geprüft...' },
    ],
    downloading: [
        { lang: 'en', text: 'Retrieving audio data for analysis...' },
        { lang: 'ja', text: '分析用のオーディオデータを取得しています...' },
        { lang: 'ko', text: '분석을 위한 오디오 데이터를 가져오는 중...' },
        { lang: 'zh', text: '正在检索音频数据以供分析...' },
        { lang: 'es', text: 'Obteniendo datos de audio para el análisis...' },
        { lang: 'fr', text: 'Récupération des données audio pour analyse...' },
        { lang: 'de', text: 'Audiodaten werden zur Analyse abgerufen...' },
    ],
    generic: [
        { lang: 'en', text: 'Completing your request, please wait...' },
        { lang: 'ja', text: 'リクエストを完了しています、お待ちください...' },
        { lang: 'ko', text: '요청을 완료하고 있습니다. 잠시만 기다려 주세요...' },
        { lang: 'zh', text: '正在完成您的请求，请稍候...' },
        { lang: 'es', text: 'Completando su solicitud, espere...' },
        { lang: 'fr', text: 'Traitement de votre demande, veuillez patienter...' },
        { lang: 'de', text: 'Ihre Anfrage wird abgeschlossen...' },
    ],
};
let statusAnimationInterval = null;
let currentStatusIndex = 0;

/**
 * Initialize on YouTube
 */
function init() {
    console.log('[VideoTranslate] Initializing');
    observeNavigation();
    checkForVideo();
}

/**
 * Watch for YouTube SPA navigation
 */
function observeNavigation() {
    let lastUrl = location.href;

    const observer = new MutationObserver(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            onNavigate();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('popstate', onNavigate);
}

function onNavigate() {
    translatedSubtitles = null;
    sourceSubtitles = null;
    isProcessing = false;
    removeUI();
    setTimeout(checkForVideo, 1000);
}

/**
 * Check if on video page
 */
function checkForVideo() {
    const videoId = new URL(location.href).searchParams.get('v');

    if (videoId && videoId !== currentVideoId) {
        currentVideoId = videoId;
        console.log('[VideoTranslate] Video:', videoId);
        setupPage(videoId);
    }
}

/**
 * Setup page with UI
 */
async function setupPage(videoId) {
    await waitForPlayer();

    // Load config
    const config = await sendMessage({ action: 'getConfig' });
    selectedLanguage = config.defaultLanguage || 'en';
    userTier = config.tier || 'tier1';
    backendUrl = config.backendUrl || 'http://localhost:5001';

    // Load subtitle appearance settings
    subtitleSettings = {
        size: config.subtitleSize || 'medium',
        position: config.subtitlePosition || 'bottom',
        background: config.subtitleBackground || 'dark',
        color: config.subtitleColor || 'white',
    };

    console.log('[VideoTranslate] Tier:', userTier);
    console.log('[VideoTranslate] Subtitle settings:', subtitleSettings);

    // Try to inject UI with error handling
    waitForControls().then(controls => {
        injectUI(controls);
        watchControls(controls);
    }).catch(err => {
        console.error('[VideoTranslate] Failed to find controls:', err);
        // Retry after a delay
        setTimeout(() => {
            const retryControls = document.querySelector('.ytp-right-controls');
            if (retryControls) {
                injectUI(retryControls);
                watchControls(retryControls);
            }
        }, 2000);
    });

    // Periodic check to ensure UI stays injected (YouTube can remove it)
    setInterval(() => {
        if (!document.querySelector('.vt-container')) {
            const controls = document.querySelector('.ytp-right-controls');
            if (controls && controls.offsetParent !== null) {
                console.log('[VideoTranslate] Periodic re-injection');
                injectUI(controls);
            }
        }
    }, 5000);


    // For Tier 1/2: Pre-fetch subtitles so they're ready when user clicks translate
    // For Tier 3: We'll do everything in one call when user clicks translate
    if (userTier !== 'tier3') {
        await prefetchSubtitles(videoId);
    }
}



function waitForControls(maxRetries = 30) {
    return new Promise((resolve, reject) => {
        let retries = 0;
        const check = () => {
            const controls = document.querySelector('.ytp-right-controls');
            // Ensure controls exist and are visible
            if (controls && controls.offsetParent !== null) {
                resolve(controls);
            } else if (retries < maxRetries) {
                retries++;
                setTimeout(check, 500);
            } else {
                console.warn('[VideoTranslate] Controls not found after max retries');
                reject(new Error('Controls not found'));
            }
        };
        check();
    });
}



function waitForPlayer() {
    return new Promise((resolve) => {
        const check = () => {
            const player = document.querySelector('.html5-video-player');
            if (player) resolve(player);
            else setTimeout(check, 500);
        };
        check();
    });
}

let controlsObserver = null;

function watchControls(controls) {
    if (controlsObserver) controlsObserver.disconnect();

    controlsObserver = new MutationObserver((mutations) => {
        if (!document.querySelector('.vt-container')) {
            console.log('[VideoTranslate] UI missing, re-injecting...');
            injectUI(controls);
        }
    });

    controlsObserver.observe(controls, { childList: true });

    // Also watch parent in case controls itself is replaced
    const parent = controls.parentElement;
    if (parent) {
        const parentObserver = new MutationObserver(() => {
            const newControls = document.querySelector('.ytp-right-controls');
            if (newControls && newControls !== controls) {
                console.log('[VideoTranslate] Controls replaced, re-initializing...');
                controls = newControls;
                injectUI(controls);
                watchControls(controls); // Re-attach observer
            }
        });
        parentObserver.observe(parent, { childList: true });
    }
}

/**
 * Pre-fetch subtitles (Tier 1/2)
 */
async function prefetchSubtitles(videoId) {
    updateStatus(chrome.i18n.getMessage('loading'), 'loading', null, { animationKey: 'loading' });

    try {
        const data = await sendMessage({ action: 'fetchSubtitles', videoId });

        if (data.error) throw new Error(data.error);

        sourceSubtitles = parseSubtitles(data);

        if (sourceSubtitles.length > 0) {
            updateStatus(chrome.i18n.getMessage('subsCount', [sourceSubtitles.length.toString()]), 'success');
        } else {
            updateStatus(chrome.i18n.getMessage('noSubtitles'), 'error');
        }
    } catch (error) {
        console.error('[VideoTranslate] Prefetch failed:', error);
        updateStatus(chrome.i18n.getMessage('noSubtitles'), 'error');
    }
}

/**
 * Parse subtitles from backend response
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
 * Remove UI elements
 */
// Helper to remove only our buttons, not the whole UI if we are refreshing
function removeButtonsOnly() {
    document.querySelector('.vt-container')?.remove();
}

/**
 * Remove UI elements
 */
function removeUI() {
    removeButtonsOnly();
    document.querySelector('.vt-overlay')?.remove();
    document.querySelector('.vt-status-panel')?.remove();
    document.querySelector('.vt-settings-panel')?.remove();

    if (controlsObserver) {
        controlsObserver.disconnect();
        controlsObserver = null;
    }
}

/**
 * Inject translate UI
 */
function injectUI(controlsElement) {
    // Avoid duplicates
    if (document.querySelector('.vt-container')) return;

    const controls = controlsElement || document.querySelector('.ytp-right-controls');
    if (!controls) return;

    const container = document.createElement('div');
    container.className = 'vt-container';


    controls.prepend(container);

    // Status panel overlay on video
    const player = document.querySelector('.html5-video-player');
    if (player && !player.querySelector('.vt-status-panel')) {
        const statusPanel = document.createElement('div');
        statusPanel.className = 'vt-status-panel';
        statusPanel.innerHTML = `
            <div class="vt-status-content">
                <div class="vt-step-indicator"></div>
                <div class="vt-status-main">
                    <span class="vt-status-text"></span>
                    <span class="vt-sub-status"></span>
                </div>
                <div class="vt-progress-bar">
                    <div class="vt-progress-fill"></div>
                </div>
                <div class="vt-status-details">
                    <span class="vt-batch-info"></span>
                    <span class="vt-eta"></span>
                </div>
            </div>
        `;
        player.appendChild(statusPanel);
    }

    // Add settings panel for subtitle appearance (YouTube-native style)
    if (player && !player.querySelector('.vt-settings-panel')) {
        const settingsPanel = document.createElement('div');
        settingsPanel.className = 'vt-settings-panel ytp-popup ytp-settings-menu';
        settingsPanel.innerHTML = `
            <div class="vt-settings-menu-content">
                    <div class="vt-settings-back header-hidden">
                        <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
                        <span class="vt-back-title">${chrome.i18n.getMessage('menuBack')}</span>
                    </div>
                <div class="vt-main-menu">
                    <div class="vt-menu-section-group">
                        <div class="vt-menu-option vt-translate-action">
                            <svg viewBox="0 0 24 24" width="24" height="24" style="color: #fff;"><path fill="currentColor" d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/></svg>
                            <span class="vt-option-label" style="font-weight: 500;">${chrome.i18n.getMessage('translateVideo')}</span>
                        </div>
                        <div class="vt-menu-option" data-setting="lang">
                            <span class="vt-option-label">${chrome.i18n.getMessage('targetLanguage')}</span>
                            <span class="vt-option-value" data-value="lang">English</span>
                        </div>
                    </div>
                    <div class="vt-menu-separator"></div>
                    <div class="vt-menu-title">${chrome.i18n.getMessage('subtitleStyle')}</div>
                    <div class="vt-menu-option" data-setting="size">
                        <span class="vt-option-label">${chrome.i18n.getMessage('size')}</span>
                        <span class="vt-option-value" data-value="size">${chrome.i18n.getMessage('sizeMedium')}</span>
                        <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
                    </div>
                    <div class="vt-menu-option" data-setting="position">
                        <span class="vt-option-label">${chrome.i18n.getMessage('position')}</span>
                        <span class="vt-option-value" data-value="position">${chrome.i18n.getMessage('posBottom')}</span>
                        <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
                    </div>
                    <div class="vt-menu-option" data-setting="background">
                        <span class="vt-option-label">${chrome.i18n.getMessage('background')}</span>
                        <span class="vt-option-value" data-value="background">${chrome.i18n.getMessage('bgDark')}</span>
                        <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
                    </div>
                    <div class="vt-menu-option" data-setting="color">
                        <span class="vt-option-label">${chrome.i18n.getMessage('textColor')}</span>
                        <span class="vt-option-value" data-value="color">${chrome.i18n.getMessage('colorWhite')}</span>
                        <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
                    </div>
                </div>
                <div class="vt-submenu" data-for="lang" style="display: none;">
                    <div class="vt-submenu-item" data-val="en">${chrome.i18n.getMessage('langEn')}</div>
                    <div class="vt-submenu-item" data-val="ja">${chrome.i18n.getMessage('langJa')}</div>
                    <div class="vt-submenu-item" data-val="ko">${chrome.i18n.getMessage('langKo')}</div>
                    <div class="vt-submenu-item" data-val="zh-CN">${chrome.i18n.getMessage('langZhCN')}</div>
                    <div class="vt-submenu-item" data-val="es">${chrome.i18n.getMessage('langEs')}</div>
                    <div class="vt-submenu-item" data-val="fr">${chrome.i18n.getMessage('langFr')}</div>
                    <div class="vt-submenu-item" data-val="de">${chrome.i18n.getMessage('langDe')}</div>
                    <div class="vt-submenu-item" data-val="pt">${chrome.i18n.getMessage('langPt')}</div>
                    <div class="vt-submenu-item" data-val="ru">${chrome.i18n.getMessage('langRu')}</div>
                </div>
                <div class="vt-submenu" data-for="size" style="display: none;">
                    <div class="vt-submenu-item" data-val="small">Small</div>
                    <div class="vt-submenu-item" data-val="medium">Medium</div>
                    <div class="vt-submenu-item" data-val="large">Large</div>
                    <div class="vt-submenu-item" data-val="xlarge">Extra Large</div>
                </div>
                <div class="vt-submenu" data-for="position" style="display: none;">
                    <div class="vt-submenu-item" data-val="bottom">Bottom</div>
                    <div class="vt-submenu-item" data-val="top">Top</div>
                </div>
                <div class="vt-submenu" data-for="background" style="display: none;">
                    <div class="vt-submenu-item" data-val="dark">Dark</div>
                    <div class="vt-submenu-item" data-val="darker">Darker</div>
                    <div class="vt-submenu-item" data-val="transparent">Semi-transparent</div>
                    <div class="vt-submenu-item" data-val="none">None</div>
                </div>
                <div class="vt-submenu" data-for="color" style="display: none;">
                    <div class="vt-submenu-item" data-val="white">White</div>
                    <div class="vt-submenu-item" data-val="yellow">Yellow</div>
                    <div class="vt-submenu-item" data-val="cyan">Cyan</div>
                </div>
            </div>
        `;
        player.appendChild(settingsPanel);

        const mainMenu = settingsPanel.querySelector('.vt-main-menu');
        const backBtn = settingsPanel.querySelector('.vt-settings-back');
        const backTitle = settingsPanel.querySelector('.vt-back-title');



        // Value display labels
        const valueLabels = {
            size: {
                small: chrome.i18n.getMessage('sizeSmall'),
                medium: chrome.i18n.getMessage('sizeMedium'),
                large: chrome.i18n.getMessage('sizeLarge'),
                xlarge: chrome.i18n.getMessage('sizeExtraLarge')
            },
            position: {
                bottom: chrome.i18n.getMessage('posBottom'),
                top: chrome.i18n.getMessage('posTop')
            },
            background: {
                dark: chrome.i18n.getMessage('bgDark'),
                darker: chrome.i18n.getMessage('bgDarker'),
                transparent: chrome.i18n.getMessage('bgTransparent'),
                none: chrome.i18n.getMessage('bgNone')
            },
            color: {
                white: chrome.i18n.getMessage('colorWhite'),
                yellow: chrome.i18n.getMessage('colorYellow'),
                cyan: chrome.i18n.getMessage('colorCyan')
            },
            lang: {
                'en': chrome.i18n.getMessage('langEn'),
                'ja': chrome.i18n.getMessage('langJa'),
                'ko': chrome.i18n.getMessage('langKo'),
                'zh-CN': chrome.i18n.getMessage('langZhCN'),
                'es': chrome.i18n.getMessage('langEs'),
                'fr': chrome.i18n.getMessage('langFr'),
                'de': chrome.i18n.getMessage('langDe'),
                'pt': chrome.i18n.getMessage('langPt'),
                'ru': chrome.i18n.getMessage('langRu')
            }
        };

        // Update displayed values from saved settings
        const updateDisplayedValues = () => {
            // Language
            const langEl = settingsPanel.querySelector('[data-value="lang"]');
            if (langEl) {
                langEl.textContent = valueLabels.lang[selectedLanguage] || selectedLanguage;
            }

            Object.keys(subtitleSettings).forEach(key => {
                const el = settingsPanel.querySelector(`[data-value="${key}"]`);
                if (el && valueLabels[key]) {
                    el.textContent = valueLabels[key][subtitleSettings[key]] || subtitleSettings[key];
                }
            });
            // Update checkmarks in submenus
            settingsPanel.querySelectorAll('.vt-submenu-item').forEach(item => {
                item.classList.remove('selected');
            });

            // Language checkmark
            const langSubmenu = settingsPanel.querySelector('[data-for="lang"]');
            if (langSubmenu) {
                const selected = langSubmenu.querySelector(`[data-val="${selectedLanguage}"]`);
                if (selected) selected.classList.add('selected');
            }

            Object.keys(subtitleSettings).forEach(key => {
                const submenu = settingsPanel.querySelector(`[data-for="${key}"]`);
                if (submenu) {
                    const selected = submenu.querySelector(`[data-val="${subtitleSettings[key]}"]`);
                    if (selected) selected.classList.add('selected');
                }
            });
        };
        updateDisplayedValues();

        // Add translate action
        const translateBtn = settingsPanel.querySelector('.vt-translate-action');
        translateBtn.addEventListener('click', () => {
            translateVideo(selectedLanguage);
            settingsPanel.classList.remove('show');
        });

        // Main menu option click -> show submenu
        settingsPanel.querySelectorAll('.vt-menu-option').forEach(option => {
            option.addEventListener('click', () => {
                const setting = option.dataset.setting;
                // Skip if not a setting row (e.g. translate button which we handled above)
                if (!setting) return;

                const submenu = settingsPanel.querySelector(`[data-for="${setting}"]`);
                if (submenu) {
                    mainMenu.style.display = 'none';
                    submenu.style.display = 'block';
                    backBtn.classList.remove('header-hidden');
                    backTitle.textContent = option.querySelector('.vt-option-label').textContent;
                }
            });
        });

        // Back button click -> return to main menu
        backBtn.addEventListener('click', () => {
            settingsPanel.querySelectorAll('.vt-submenu').forEach(s => s.style.display = 'none');
            mainMenu.style.display = 'block';
            backBtn.classList.add('header-hidden');
        });

        // Submenu item click -> apply setting
        settingsPanel.querySelectorAll('.vt-submenu-item').forEach(item => {
            item.addEventListener('click', () => {
                const submenu = item.closest('.vt-submenu');
                const setting = submenu.dataset.for;
                const value = item.dataset.val;

                if (setting === 'lang') {
                    selectedLanguage = value;
                    updateDisplayedValues();
                    // Save to storage
                    sendMessage({
                        action: 'saveConfig',
                        config: { defaultLanguage: value }
                    });
                    return;
                }

                subtitleSettings[setting] = value;
                addStyles(); // Instant apply

                // Save to storage
                sendMessage({
                    action: 'saveConfig',
                    config: {
                        subtitleSize: subtitleSettings.size,
                        subtitlePosition: subtitleSettings.position,
                        subtitleBackground: subtitleSettings.background,
                        subtitleColor: subtitleSettings.color,
                    }
                });

                // Update display (but stay in submenu for easy switching)
                updateDisplayedValues();

                // Do NOT go back to main menu automatically
                // submenu.style.display = 'none';
                // mainMenu.style.display = 'block';
                // backBtn.style.display = 'none';
            });
        });
    }

    // Add main button (now just toggles the native menu)
    const mainBtn = document.createElement('button');
    mainBtn.className = 'vt-main-btn ytp-button';
    mainBtn.title = 'Video Translate';
    mainBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/>
        </svg>
        `;
    container.appendChild(mainBtn);

    mainBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const panel = document.querySelector('.vt-settings-panel');
        if (panel) {
            panel.classList.toggle('show');

            // If opening, ensure main menu is shown
            if (panel.classList.contains('show')) {
                const mainMenu = panel.querySelector('.vt-main-menu');
                const backBtn = panel.querySelector('.vt-settings-back');

                panel.querySelectorAll('.vt-submenu').forEach(s => s.style.display = 'none');
                if (mainMenu) mainMenu.style.display = 'block';
                if (backBtn) backBtn.classList.add('header-hidden');
            }
        }
    });

    // Close menu on outside click - managed more safely
    if (!window._vtGlobalClickAttached) {
        document.addEventListener('click', (e) => {
            const panel = document.querySelector('.vt-settings-panel');
            const container = document.querySelector('.vt-container');
            if (panel && panel.classList.contains('show')) {
                const isClickInside = container?.contains(e.target) || panel?.contains(e.target);
                if (!isClickInside) {
                    panel.classList.remove('show');
                }
            }
        });
        window._vtGlobalClickAttached = true;
    }


    addStyles();
    setupSync();
}


/**
 * Translate video subtitles
 */
async function translateVideo(targetLang) {
    if (isProcessing) {
        updateStatus(chrome.i18n.getMessage('processing'), 'loading', null, { animationKey: 'processing' });
        return;
    }

    isProcessing = true;
    updateStatus(chrome.i18n.getMessage('translating'), 'loading', null, { animationKey: 'translating' });

    try {
        let result;

        if (userTier === 'tier3') {
            // Tier 3: Single combined call (subtitle fetch + translate on server)
            result = await sendMessage({
                action: 'process',
                videoId: currentVideoId,
                targetLanguage: targetLang
            });
        } else {
            // Tier 1/2: Subtitles already fetched, translate via direct LLM
            if (!sourceSubtitles || sourceSubtitles.length === 0) {
                throw new Error(chrome.i18n.getMessage('noSubtitles'));
            }

            result = await sendMessage({
                action: 'translate',
                videoId: currentVideoId,
                subtitles: sourceSubtitles,
                sourceLanguage: 'auto',
                targetLanguage: targetLang
            });
        }

        if (result.error) throw new Error(result.error);

        translatedSubtitles = result.translations;
        console.log('[VideoTranslate] Received translations:', translatedSubtitles?.length, 'items');
        console.log('[VideoTranslate] First subtitle:', JSON.stringify(translatedSubtitles?.[0]));
        console.log('[VideoTranslate] Has translatedText:', !!translatedSubtitles?.[0]?.translatedText);

        if (!translatedSubtitles || translatedSubtitles.length === 0) {
            throw new Error(chrome.i18n.getMessage('noTranslations'));
        }

        updateStatus(result.cached ? chrome.i18n.getMessage('cachedSuccess') : chrome.i18n.getMessage('doneSuccess'), 'success');

        // Hide status panel after 2 seconds on success
        setTimeout(() => {
            const panel = document.querySelector('.vt-status-panel');
            if (panel) panel.style.display = 'none';
        }, 2000);

        showOverlay();
        setupSync(); // Re-setup sync to ensure listener is attached

    } catch (error) {
        console.error('[VideoTranslate] Translation failed:', error);
        updateStatus(chrome.i18n.getMessage('failed'), 'error');
    } finally {
        isProcessing = false;
    }
}

/**
 * Update status display - shows in overlay panel on video
 */
/**
 * Update status display with enhanced progress information
 * @param {string} text - Main status message
 * @param {string} type - Status type: 'loading', 'success', 'error'
 * @param {number|null} percent - Progress percentage (0-100)
 * @param {object|null} options - Extended options
 * @param {number} options.step - Current step number
 * @param {number} options.totalSteps - Total number of steps
 * @param {string} options.eta - Estimated time remaining
 * @param {object} options.batchInfo - Batch progress info {current, total}
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

        // Always show the specific text as sub-status if we are animating
        // or as main text if we are not.
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

const SPEAKER_COLORS = [
    '#00bcd4', // Cyan
    '#ffeb3b', // Yellow
    '#4caf50', // Green
    '#ff9800', // Orange
    '#e91e63', // Pink
    '#9c27b0', // Purple
];

function getSpeakerColor(speakerId) {
    if (!speakerId) return null;
    const match = speakerId.match(/\d+/);
    if (match) {
        const index = parseInt(match[0]);
        return SPEAKER_COLORS[index % SPEAKER_COLORS.length];
    }
    return null;
}

/**
 * Show subtitle overlay
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
 * Setup video time sync
 */
function setupSync() {
    const video = document.querySelector('video');
    if (!video) return;

    // Remove existing listener if any
    if (video._vtSyncHandler) {
        video.removeEventListener('timeupdate', video._vtSyncHandler);
    }

    video._vtSyncHandler = () => {
        if (!translatedSubtitles?.length) return;

        const time = video.currentTime * 1000;
        const sub = translatedSubtitles.find(s => time >= s.start && time <= s.end);

        const textEl = document.querySelector('.vt-text');
        if (textEl && sub) {
            // Use translatedText, fallback to original if empty
            const displayText = sub.translatedText || sub.text;
            textEl.textContent = displayText || '';

            // Apply speaker color if available
            const speakerColor = getSpeakerColor(sub.speaker);
            if (speakerColor) {
                textEl.style.color = speakerColor;
            } else {
                // Fallback to chosen setting
                const styleValues = getSubtitleStyleValues();
                textEl.style.color = styleValues.color;
            }
        } else if (textEl) {

            textEl.textContent = '';
        }
    };

    video.addEventListener('timeupdate', video._vtSyncHandler);
}

/**
 * Get subtitle style values based on settings
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
    };

    // Position (bottom or top)
    const positions = {
        bottom: { bottom: '70px', top: 'auto' },
        top: { bottom: 'auto', top: '70px' },
    };

    return {
        fontSize: sizes[subtitleSettings.size] || sizes.medium,
        background: backgrounds[subtitleSettings.background] || backgrounds.dark,
        color: colors[subtitleSettings.color] || colors.white,
        position: positions[subtitleSettings.position] || positions.bottom,
    };
}

/**
 * Add styles
 */
function addStyles() {
    // Remove existing styles to apply new settings
    document.querySelector('#vt-styles')?.remove();

    const styleValues = getSubtitleStyleValues();

    const style = document.createElement('style');
    style.id = 'vt-styles';
    style.textContent = `
        .vt-container {
            position: relative !important;
            display: flex !important;
            align-items: center !important;
            margin-right: 6px !important;
        }
        .vt-btn {
            position: relative !important;
            opacity: 0.9 !important;
        }
        .vt-btn:hover {
            opacity: 1 !important;
        }
        .vt-badge {
            position: absolute !important;
            bottom: 4px !important;
            right: 4px !important;
            background: #fff !important;
            color: #000 !important;
            font-size: 9px !important;
            font-weight: bold !important;
            padding: 1px 3px !important;
            border-radius: 2px !important;
            line-height: 1 !important;
        }
        .vt-menu {
            display: none;
            position: absolute !important;
            bottom: 100% !important;
            left: 50% !important;
            transform: translateX(-50%) !important;
            background: rgba(28,28,28,0.95) !important;
            border-radius: 3px !important;
            padding: 3px 0 !important;
            margin-bottom: 4px !important;
            min-width: 110px !important;
            box-shadow: 0 2px 6px rgba(0,0,0,0.4) !important;
            z-index: 9999 !important;
        }
        .vt-menu.show {
            display: block !important;
        }
        .vt-menu-item {
            padding: 3px 10px !important;
            color: #fff !important;
            font-size: 14px !important;
            line-height: 1.3 !important;
            cursor: pointer !important;
            white-space: nowrap !important;
        }
        .vt-menu-item:hover {
            background: rgba(255,255,255,0.15) !important;
        }
        .vt-status-panel {
            position: absolute !important;
            top: 12px !important;
            left: 50% !important;
            transform: translateX(-50%) !important;
            z-index: 60 !important;
            pointer-events: none !important;
            display: none;
        }
        .vt-status-panel.show {
            display: block !important;
        }
        .vt-status-content {
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            background: rgba(0,0,0,0.92) !important;
            padding: 12px 24px !important;
            border-radius: 8px !important;
            min-width: 280px !important;
            max-width: 450px !important;
            box-shadow: 0 4px 12px rgba(0,0,0,0.5) !important;
            border: 1px solid rgba(255,255,255,0.1) !important;
        }
        .vt-status-main {
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            margin-bottom: 10px !important;
            gap: 4px !important;
            width: 100% !important;
        }
        .vt-status-text {
            color: #fff !important;
            font-size: 14px !important;
            font-weight: 500 !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
            transition: opacity 0.15s ease !important;
            opacity: 1 !important;
            line-height: 1.4 !important;
            text-align: center !important;
        }
        .vt-sub-status {
            color: rgba(255,255,255,0.6) !important;
            font-size: 11px !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
            display: none;
            line-height: 1.3 !important;
            text-align: center !important;
            font-style: italic !important;
        }
        .vt-text-fade {
            min-width: 100px !important;
            text-align: center !important;
        }
        .vt-progress-bar {
            width: 100% !important;
            height: 4px !important;
            background: rgba(255,255,255,0.2) !important;
            border-radius: 2px !important;
            overflow: hidden !important;
            display: none;
        }
        .vt-progress-fill {
            height: 100% !important;
            background: linear-gradient(90deg, #4caf50, #8bc34a) !important;
            border-radius: 2px !important;
            transition: width 0.3s ease !important;
            width: 0%;
        }
        @keyframes vt-pulse {
            0% { opacity: 0.4; transform: scale(0.98); }
            50% { opacity: 1; transform: scale(1); }
            100% { opacity: 0.4; transform: scale(0.98); }
        }
        .vt-step-indicator {
            color: #4caf50 !important;
            font-size: 10px !important;
            font-weight: 700 !important;
            text-transform: uppercase !important;
            letter-spacing: 1px !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
            margin-bottom: 6px !important;
            display: none;
            animation: vt-pulse 2s infinite ease-in-out !important;
            background: rgba(74, 175, 80, 0.1) !important;
            padding: 2px 6px !important;
            border-radius: 4px !important;
            border: 1px solid rgba(74, 175, 80, 0.2) !important;
        }
        .vt-status-details {
            display: flex !important;
            gap: 12px !important;
            justify-content: center !important;
            margin-top: 6px !important;
        }
        .vt-batch-info, .vt-eta {
            color: rgba(255,255,255,0.7) !important;
            font-size: 11px !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
            display: none;
        }
        .header-hidden {
             display: none !important;
        }
        .vt-eta {
            color: #8bc34a !important;
            font-weight: 500 !important;
        }
        .vt-status-panel.loading .vt-status-text {
            color: #ffc107 !important;
        }
        .vt-status-panel.loading .vt-progress-fill {
            background: linear-gradient(90deg, #ffc107, #ffeb3b) !important;
        }
        .vt-status-panel.success .vt-status-text {
            color: #4caf50 !important;
        }
        .vt-status-panel.error .vt-status-text {
            color: #f44336 !important;
        }
        .vt-overlay {
            position: absolute !important;
            ${styleValues.position.bottom !== 'auto' ? `bottom: ${styleValues.position.bottom}` : `top: ${styleValues.position.top}`} !important;
            left: 50% !important;
            transform: translateX(-50%) !important;
            max-width: 80% !important;
            text-align: center !important;
            z-index: 60 !important;
            pointer-events: none !important;
        }
        .vt-text {
            display: inline-block !important;
            background: ${styleValues.background} !important;
            color: ${styleValues.color} !important;
            padding: 8px 16px !important;
            border-radius: 4px !important;
            font-size: ${styleValues.fontSize} !important;
            line-height: 1.4 !important;
            text-shadow: ${subtitleSettings.background === 'none' ? '1px 1px 2px rgba(0,0,0,0.8), -1px -1px 2px rgba(0,0,0,0.8)' : 'none'} !important;
        }
        .vt-settings-btn {
            opacity: 0.9 !important;
            margin-left: 4px !important;
        }
        .vt-settings-btn:hover {
            opacity: 1 !important;
        }
        .vt-settings-panel {
            display: none;
            position: absolute !important;
            bottom: 60px !important;
            right: 12px !important;
            background: rgba(28, 28, 28, 0.9) !important;
            border-radius: 12px !important;
            padding: 0 !important;
            min-width: 250px !important;
            box-shadow: 0 0 20px rgba(0,0,0,0.5) !important;
            z-index: 9999 !important;
            overflow: hidden !important;
        }
        .vt-settings-panel.show {
            display: block !important;
        }
        .vt-settings-menu-content {
            font-family: 'YouTube Noto', Roboto, Arial, sans-serif !important;
        }
        .vt-settings-back {
            display: flex !important;
            align-items: center !important;
            padding: 12px 16px !important;
            cursor: pointer !important;
            color: #fff !important;
            border-bottom: 1px solid rgba(255,255,255,0.1) !important;
        }
        .vt-settings-back:hover {
            background: rgba(255,255,255,0.1) !important;
        }
        .vt-settings-back svg {
            margin-right: 16px !important;
            color: #fff !important;
        }
        .vt-back-title {
            font-size: 14px !important;
            font-weight: 500 !important;
        }
        .vt-menu-title {
            padding: 12px 16px 8px !important;
            color: rgba(255,255,255,0.7) !important;
            font-size: 12px !important;
            text-transform: uppercase !important;
            letter-spacing: 0.5px !important;
        }
        .vt-menu-option {
            display: flex !important;
            align-items: center !important;
            padding: 10px 16px !important;
            cursor: pointer !important;
            color: #fff !important;
        }
        .vt-menu-option:hover {
            background: rgba(255,255,255,0.1) !important;
        }
        .vt-option-label {
            flex: 1 !important;
            font-size: 14px !important;
        }
        .vt-option-value {
            color: rgba(255,255,255,0.5) !important;
            font-size: 14px !important;
            margin-right: 8px !important;
        }
        .vt-menu-option svg {
            color: rgba(255,255,255,0.5) !important;
        }
        .vt-submenu {
            padding: 8px 0 !important;
        }
        .vt-submenu-item {
            display: flex !important;
            align-items: center !important;
            padding: 10px 16px 10px 48px !important;
            cursor: pointer !important;
            color: #fff !important;
            font-size: 14px !important;
            position: relative !important;
        }
        .vt-submenu-item:hover {
            background: rgba(255,255,255,0.1) !important;
        }
        .vt-submenu-item.selected::before {
            content: '' !important;
            position: absolute !important;
            left: 16px !important;
            top: 50% !important;
            transform: translateY(-50%) !important;
            width: 16px !important;
            height: 16px !important;
            background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='white'%3E%3Cpath d='M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z'/%3E%3C/svg%3E") center/contain no-repeat !important;
        }
        .vt-menu-separator {
            height: 1px !important;
            background: rgba(255,255,255,0.1) !important;
            margin: 8px 0 !important;
        }
        .vt-menu-section-group {
            padding: 8px 0 !important;
        }
        .vt-translate-action {
            margin-bottom: 4px !important;
        }
        .vt-translate-action:hover {
            background: rgba(255,255,255,0.2) !important;
        }
        .vt-main-btn {
            opacity: 0.9 !important;
        }
        .vt-main-btn:hover {
            opacity: 1 !important;
        }
    `;
    document.head.appendChild(style);
}

/**
 * Send message to background script
 */
function sendMessage(msg) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(msg, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                resolve(response);
            }
        });
    });
}

/**
 * Listen for progress updates from background script
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'progress') {
        const { stage, message: msg, percent, step, totalSteps, eta, batchInfo } = message;

        // Map stages to status types
        const stageTypes = {
            'checking': 'loading',
            'downloading': 'loading',
            'whisper': 'loading',
            'translating': 'loading',
            'complete': 'success',
        };

        // Build options object with all progress details
        const options = {};
        if (step !== undefined) options.step = step;
        if (totalSteps !== undefined) options.totalSteps = totalSteps;
        if (eta) options.eta = eta;
        if (batchInfo) options.batchInfo = batchInfo;

        // Use stage as animation key
        if (stage === 'whisper') options.animationKey = 'transcribing';
        else options.animationKey = stage;

        updateStatus(msg, stageTypes[stage] || 'loading', percent, options);
        sendResponse({ received: true });
    }
    return true;
});

// Initialize
init();
