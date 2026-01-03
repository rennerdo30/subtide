#!/usr/bin/env python3
"""
Whisper Runner - Subprocess helper for streaming transcription.

This script runs mlx-whisper transcription in a subprocess so the parent
process can capture stdout line-by-line for real-time streaming.

Output format (verbose=True from mlx-whisper):
[00:00.000 --> 00:04.440]  You saw the title you know what's up.

The parent process parses these lines to extract segments progressively.
"""

import sys
import json
import argparse


def main():
    parser = argparse.ArgumentParser(description='Run Whisper transcription')
    parser.add_argument('--audio', required=True, help='Path to audio file')
    parser.add_argument('--model', required=True, help='Model path or HF repo')
    parser.add_argument('--no-speech-threshold', type=float, default=0.4)
    parser.add_argument('--compression-ratio-threshold', type=float, default=2.4)
    parser.add_argument('--logprob-threshold', type=float, default=-1.0)
    parser.add_argument('--condition-on-previous', action='store_true', default=True)
    parser.add_argument('--initial-prompt', type=str, default=None)
    parser.add_argument('--output-json', type=str, default=None, help='Path to write final JSON result')
    
    args = parser.parse_args()
    
    # Import mlx-whisper (this ensures Metal GPU is used)
    import mlx_whisper
    import mlx.core as mx
    
    # Log device info to stderr (so it doesn't interfere with segment parsing)
    device = mx.default_device()
    print(f"[WHISPER_RUNNER] Device: {device}", file=sys.stderr)
    print(f"[WHISPER_RUNNER] Model: {args.model}", file=sys.stderr)
    print(f"[WHISPER_RUNNER] Audio: {args.audio}", file=sys.stderr)
    
    # Build transcription kwargs
    transcribe_kwargs = {
        'path_or_hf_repo': args.model,
        'verbose': True,  # This prints segments to stdout as they're generated
        'word_timestamps': True,
        'no_speech_threshold': args.no_speech_threshold,
        'compression_ratio_threshold': args.compression_ratio_threshold,
        'logprob_threshold': args.logprob_threshold,
        'condition_on_previous_text': args.condition_on_previous,
    }
    
    if args.initial_prompt:
        transcribe_kwargs['initial_prompt'] = args.initial_prompt
    
    # Run transcription - this will print segments to stdout
    result = mlx_whisper.transcribe(args.audio, **transcribe_kwargs)
    
    # Write final JSON result if requested
    if args.output_json:
        # Add metadata
        result['meta'] = {
            'mlx_device': str(device),
            'model': args.model,
        }
        with open(args.output_json, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        print(f"[WHISPER_RUNNER] Result written to {args.output_json}", file=sys.stderr)
    
    # Signal completion
    print("[WHISPER_RUNNER_COMPLETE]", file=sys.stderr)


if __name__ == '__main__':
    main()
