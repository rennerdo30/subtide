/**
 * AudioWorkletProcessor for capturing PCM audio data.
 * Runs on a separate audio rendering thread for better performance.
 */
class AudioCaptureProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.bufferSize = 4096;
        this.buffer = new Float32Array(this.bufferSize);
        this.bufferIndex = 0;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (!input || input.length === 0) return true;

        const inputChannel = input[0];
        if (!inputChannel) return true;

        // Accumulate samples into buffer
        for (let i = 0; i < inputChannel.length; i++) {
            this.buffer[this.bufferIndex++] = inputChannel[i];

            // When buffer is full, send to main thread
            if (this.bufferIndex >= this.bufferSize) {
                // Convert Float32 to Int16 PCM
                const pcmData = new Int16Array(this.bufferSize);
                for (let j = 0; j < this.bufferSize; j++) {
                    const s = Math.max(-1, Math.min(1, this.buffer[j]));
                    pcmData[j] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }

                // Post message to main thread
                this.port.postMessage({
                    type: 'audio',
                    buffer: pcmData.buffer
                }, [pcmData.buffer]);

                // Reset buffer
                this.bufferIndex = 0;
                this.buffer = new Float32Array(this.bufferSize);
            }
        }

        return true;
    }
}

registerProcessor('audio-capture-processor', AudioCaptureProcessor);
