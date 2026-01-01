let socket = null;
let stream = null;
let audioContext = null;
let scriptProcessor = null;
let currentTabId = null;
let loopbackAudio = null;

// Listen for messages from the service worker
chrome.runtime.onMessage.addListener(async (message) => {
    if (message.target !== 'offscreen') return;

    switch (message.type) {
        case 'start-recording':
            startRecording(message.data);
            break;
        case 'stop-recording':
            stopRecording();
            break;
    }
});

async function startRecording({ streamId, tabId, targetLang, apiUrl }) {
    if (audioContext) return;
    
    currentTabId = tabId;

    try {
        console.log('[OFFSCREEN] Connecting to:', apiUrl);
        // 1. Connect to WebSocket
        socket = io(`${apiUrl}/live`, {
            transports: ['websocket']
        });

        socket.on('connect', () => {
            console.log('[OFFSCREEN] Connected to WebSocket');
            socket.emit('start_stream', { target_lang: targetLang });
        });

        socket.on('live_result', (data) => {
            chrome.runtime.sendMessage({
                action: 'live-transcription-result',
                tabId: currentTabId,
                data: data
            });
        });

        console.log('[OFFSCREEN] using streamId:', streamId);
        // 2. Capture the stream
        stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                mandatory: {
                    chromeMediaSource: 'tab',
                    chromeMediaSourceId: streamId
                }
            },
            video: false
        });

        console.log('[OFFSCREEN] Tab capture stream obtained');

        // Play audio locally (Loopback) to unmute the tab for the user
        loopbackAudio = new Audio();
        loopbackAudio.srcObject = stream;
        loopbackAudio.play();

        // 3. Setup AudioContext for PCM capture

        audioContext = new AudioContext({ sampleRate: 16000 });
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }

        const source = audioContext.createMediaStreamSource(stream);
        scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);

        source.connect(scriptProcessor);
        scriptProcessor.connect(audioContext.destination);

        let chunkCount = 0;
        scriptProcessor.onaudioprocess = (event) => {
            if (!socket || !socket.connected) return;

            const inputData = event.inputBuffer.getChannelData(0);

            // Calculate volume for debugging
            let sum = 0;
            for (let i = 0; i < inputData.length; i++) {
                sum += inputData[i] * inputData[i];
            }
            const rms = Math.sqrt(sum / inputData.length);

            if (chunkCount % 50 === 0) { // Every ~12s
                console.log(`[OFFSCREEN] Audio level: ${(rms * 100).toFixed(2)}%`);
            }
            chunkCount++;

            // Convert Float32 to Int16 PCM
            const pcmData = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
                const s = Math.max(-1, Math.min(1, inputData[i]));
                pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }

            // Send binary packet
            socket.emit('audio_chunk', { audio: pcmData.buffer });
        };

        console.log('[OFFSCREEN] PCM Recording started (Binary, 16kHz)');

    } catch (error) {
        console.error('[OFFSCREEN] Error starting recording:', error);
        const errorMsg = error.name === 'NotAllowedError' ? 'Permission denied' : error.message || 'Unknown error';
        chrome.runtime.sendMessage({ action: 'error', message: `Recorder error: ${errorMsg}` });
        stopRecording();
    }
}

function stopRecording() {
    if (scriptProcessor) {
        scriptProcessor.disconnect();
        scriptProcessor = null;
    }
    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
    if (socket) {
        socket.disconnect();
        socket = null;
    }
    if (loopbackAudio) {
        loopbackAudio.pause();
        loopbackAudio.srcObject = null;
        loopbackAudio = null;
    }
    currentTabId = null;
    console.log('[OFFSCREEN] Recording stopped');
}
