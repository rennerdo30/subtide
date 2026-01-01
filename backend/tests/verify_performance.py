import wave
import os
import sys
import logging
import time

# Configure logging to see whisper logs
logging.basicConfig(level=logging.INFO)

# Checks
if 'faster_whisper' in sys.modules:
    print("WARNING: faster_whisper ALREADY loaded (unexpected)")
else:
    print("Pre-check: faster_whisper not loaded.")

# Add project root to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from backend.services.whisper_service import run_whisper_process

def create_dummy_wav(filename, duration=2):
    with wave.open(filename, 'wb') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(16000)
        # Generate silence
        data = b'\x00\x00' * 16000 * duration
        wav_file.writeframes(data)

def test_whisper():
    dummy_wav = os.path.abspath("dummy_direct.wav")
    create_dummy_wav(dummy_wav)
    print(f"Created {dummy_wav}")
    
    try:
        print("Starting transcription DEBUG run...")
        start = time.time()
        # Mock callback
        def callback(stage, msg, pct):
            print(f"Callback: [{stage}] {msg} ({pct}%)")
            
        result = run_whisper_process(dummy_wav, progress_callback=callback)
        elapsed = time.time() - start
        
        print(f"Transcription result: {result}")
        print(f"Total time: {elapsed:.2f}s")
        
        # Check if faster_whisper got loaded during run
        if 'faster_whisper' in sys.modules:
            print("FAILURE: faster_whisper was loaded during execution!")
        else:
            print("SUCCESS: faster_whisper was NOT loaded.")
            
    except Exception as e:
        print("Transcription failed:", e)
    finally:
        if os.path.exists(dummy_wav):
            os.remove(dummy_wav)

if __name__ == "__main__":
    test_whisper()
