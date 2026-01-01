from flask import Blueprint, request
import logging
import json
import base64
import os
import time
from backend.services.live_whisper_service import LiveWhisperService

logger = logging.getLogger('video-translate')
live_bp = Blueprint('live', __name__)

# Global dictionary to track active live sessions
active_sessions = {}
# Track chunk statistics per session
chunk_stats = {}

def init_socketio(socketio):
    @socketio.on('connect', namespace='/live')
    def handle_connect():
        sid = request.sid
        logger.info(f"[LIVE] Client connected: {sid}")

    @socketio.on('disconnect', namespace='/live')
    def handle_disconnect():
        sid = request.sid
        logger.info(f"[LIVE] Client disconnected: {sid}")
        if sid in active_sessions:
            stats = chunk_stats.pop(sid, {})
            if stats:
                logger.info(f"[LIVE] Session stats for {sid}: chunks={stats.get('count', 0)}, bytes={stats.get('bytes', 0)}")
            active_sessions[sid].stop()
            del active_sessions[sid]

    @socketio.on('start_stream', namespace='/live')
    def handle_start_stream(data):
        sid = request.sid
        target_lang = data.get('target_lang', 'en')
        logger.info(f"[LIVE] Starting stream for {sid}, target_lang={target_lang}")
        
        # Initialize the live whisper service for this session
        service = LiveWhisperService(sid, target_lang, socketio)
        active_sessions[sid] = service
        chunk_stats[sid] = {'count': 0, 'bytes': 0, 'start_time': time.time()}
        service.start()

    @socketio.on('audio_chunk', namespace='/live')
    def handle_audio_chunk(data):
        sid = request.sid
        if sid in active_sessions:
            # Data is expected to be binary PCM bytes or dict with 'audio' key
            audio_bytes = data if isinstance(data, (bytes, bytearray)) else data.get('audio')
            if audio_bytes:
                # Update stats
                if sid in chunk_stats:
                    chunk_stats[sid]['count'] += 1
                    chunk_stats[sid]['bytes'] += len(audio_bytes)
                    # Log every 100 chunks
                    if chunk_stats[sid]['count'] % 100 == 0:
                        elapsed = time.time() - chunk_stats[sid]['start_time']
                        rate = chunk_stats[sid]['count'] / elapsed if elapsed > 0 else 0
                        logger.debug(f"[LIVE] Session {sid}: {chunk_stats[sid]['count']} chunks, {chunk_stats[sid]['bytes']/1024:.1f}KB, {rate:.1f} chunks/s")
                active_sessions[sid].add_audio(audio_bytes)
        else:
            logger.warning(f"[LIVE] Received audio chunk for inactive session: {sid}")

    @socketio.on('stop_stream', namespace='/live')
    def handle_stop_stream():
        sid = request.sid
        logger.info(f"[LIVE] Stopping stream for {sid}")
        if sid in active_sessions:
            stats = chunk_stats.pop(sid, {})
            if stats:
                elapsed = time.time() - stats.get('start_time', time.time())
                logger.info(f"[LIVE] Final stats for {sid}: chunks={stats.get('count', 0)}, bytes={stats.get('bytes', 0)}, duration={elapsed:.1f}s")
            active_sessions[sid].stop()
            del active_sessions[sid]
