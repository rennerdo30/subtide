/**
 * YouTube Content Script - Constants
 * Shared constants and configuration
 */

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
    finalizing: [
        { lang: 'en', text: 'Finalizing transcription, almost done...' },
        { lang: 'ja', text: '文字起こしを完了しています。もうすぐです...' },
        { lang: 'ko', text: '전사를 마무리 중입니다. 거의 완료됐습니다...' },
        { lang: 'zh', text: '正在完成转录，即将完成...' },
        { lang: 'es', text: 'Finalizando la transcripción, casi listo...' },
        { lang: 'fr', text: 'Finalisation de la transcription, presque terminé...' },
        { lang: 'de', text: 'Transkription wird abgeschlossen, fast fertig...' },
    ],
    whisper: [
        { lang: 'en', text: 'AI is listening and transcribing...' },
        { lang: 'ja', text: 'AIが音声を聞いて文字起こししています...' },
        { lang: 'ko', text: 'AI가 듣고 전사하는 중...' },
        { lang: 'zh', text: 'AI正在聆听并转录...' },
        { lang: 'es', text: 'La IA está escuchando y transcribiendo...' },
        { lang: 'fr', text: "L'IA écoute et transcrit..." },
        { lang: 'de', text: 'KI hört zu und transkribiert...' },
    ],
    diarization: [
        { lang: 'en', text: 'Identifying speakers in the audio...' },
        { lang: 'ja', text: '音声内の話者を識別しています...' },
        { lang: 'ko', text: '오디오에서 발언자를 식별하는 중...' },
        { lang: 'zh', text: '正在识别音频中的说话者...' },
        { lang: 'es', text: 'Identificando hablantes en el audio...' },
        { lang: 'fr', text: 'Identification des locuteurs dans l\'audio...' },
        { lang: 'de', text: 'Sprecher im Audio werden identifiziert...' },
    ],
};

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
