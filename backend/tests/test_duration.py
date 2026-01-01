import soundfile as sf
import os
import wave
import numpy as np

filename = "test_duration.wav"

# Create dummy wav
with wave.open(filename, 'wb') as wav_file:
    wav_file.setnchannels(1)
    wav_file.setsampwidth(2)
    wav_file.setframerate(16000)
    # 5 seconds
    data = b'\x00\x00' * 16000 * 5
    wav_file.writeframes(data)

try:
    print(f"Testing soundfile on {filename}...")
    info = sf.info(filename)
    print(f"Duration: {info.duration}")
    if abs(info.duration - 5.0) < 0.1:
        print("SUCCESS")
    else:
        print("FAILURE: Incorrect duration")
except Exception as e:
    print(f"FAILURE: {e}")
finally:
    if os.path.exists(filename):
        os.remove(filename)
