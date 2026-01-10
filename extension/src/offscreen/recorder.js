let socket = null;
let stream = null;
let audioContext = null;
let workletNode = null;
let currentTabId = null;
let chunkCount = 0;

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
    chunkCount = 0;

    try {
        console.log('[OFFSCREEN] Connecting to:', apiUrl);
        // 1. Connect to WebSocket
        socket = io(`${apiUrl}/live`, {
            transports: ['websocket'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000
        });

        socket.on('connect', () => {
            console.log('[OFFSCREEN] Connected to WebSocket');
            socket.emit('start_stream', { target_lang: targetLang });
        });

        socket.on('connect_error', (error) => {
            console.error('[OFFSCREEN] WebSocket connection error:', error.message);
            chrome.runtime.sendMessage({
                action: 'live-transcription-result',
                tabId: currentTabId,
                data: {
                    status: 'error',
                    error: `Connection failed: ${error.message}. Is the backend running?`
                }
            });
        });

        socket.on('disconnect', (reason) => {
            console.log('[OFFSCREEN] WebSocket disconnected:', reason);
            if (reason === 'io server disconnect' || reason === 'transport close') {
                // Server disconnected us or connection lost
                chrome.runtime.sendMessage({
                    action: 'live-transcription-result',
                    tabId: currentTabId,
                    data: {
                        status: 'disconnected',
                        error: `Connection lost: ${reason}`
                    }
                });
            }
        });

        socket.on('reconnect', (attemptNumber) => {
            console.log(`[OFFSCREEN] Reconnected after ${attemptNumber} attempts`);
            socket.emit('start_stream', { target_lang: targetLang });
        });

        socket.on('reconnect_attempt', (attemptNumber) => {
            console.log(`[OFFSCREEN] Reconnection attempt ${attemptNumber}`);
        });

        socket.on('reconnect_failed', () => {
            console.error('[OFFSCREEN] Reconnection failed after max attempts');
            chrome.runtime.sendMessage({
                action: 'live-transcription-result',
                tabId: currentTabId,
                data: {
                    status: 'error',
                    error: 'Connection lost. Please restart live translation.'
                }
            });
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

        // 3. Setup AudioContext with AudioWorklet for PCM capture
        audioContext = new AudioContext({ sampleRate: 16000 });
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }

        // Register AudioWorklet processor
        const workletUrl = chrome.runtime.getURL('src/offscreen/audio-processor.js');
        await audioContext.audioWorklet.addModule(workletUrl);

        const source = audioContext.createMediaStreamSource(stream);
        workletNode = new AudioWorkletNode(audioContext, 'audio-capture-processor');

        // Handle audio data from worklet
        workletNode.port.onmessage = (event) => {
            if (!socket || !socket.connected) return;

            if (event.data.type === 'audio') {
                chunkCount++;
                if (chunkCount % 50 === 0) { // Every ~12s at 16kHz
                    console.log(`[OFFSCREEN] Sent ${chunkCount} audio chunks`);
                }
                socket.emit('audio_chunk', { audio: event.data.buffer });
            }
        };

        source.connect(workletNode);
        // Don't connect to destination - we don't want to play the audio back

        console.log('[OFFSCREEN] PCM Recording started (AudioWorklet, 16kHz)');

    } catch (error) {
        console.error('[OFFSCREEN] Error starting recording:', error);
        const errorMsg = error.name === 'NotAllowedError' ? 'Permission denied' : error.message || 'Unknown error';
        chrome.runtime.sendMessage({ action: 'error', message: `Recorder error: ${errorMsg}` });
        stopRecording();
    }
}

function stopRecording() {
    if (workletNode) {
        workletNode.disconnect();
        workletNode = null;
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
    currentTabId = null;
    chunkCount = 0;
    console.log('[OFFSCREEN] Recording stopped');
}
