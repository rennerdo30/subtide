from flask import Blueprint, request
import logging
import json
import base64
import os
import time
import threading
from backend.services.live_whisper_service import LiveWhisperService

logger = logging.getLogger('subtide')
live_bp = Blueprint('live', __name__)

# Global dictionary to track active live sessions
active_sessions = {}
# Track chunk statistics per session
chunk_stats = {}
# Lock for thread-safe access to session dicts
_sessions_lock = threading.Lock()

# Session timeout in seconds (clean up sessions with no activity)
SESSION_TIMEOUT = 600  # 10 minutes


def _cleanup_stale_sessions():
    """Remove sessions that haven't received data within SESSION_TIMEOUT."""
    now = time.time()
    stale_sids = []
    stale_sessions = []
    with _sessions_lock:
        for sid, stats in chunk_stats.items():
            last_active = stats.get('last_active', stats.get('start_time', 0))
            if now - last_active > SESSION_TIMEOUT:
                stale_sids.append(sid)
        for sid in stale_sids:
            logger.warning(f"[LIVE] Cleaning up stale session: {sid}")
            chunk_stats.pop(sid, None)
            session = active_sessions.pop(sid, None)
            if session:
                stale_sessions.append((sid, session))
    # Stop sessions outside the lock to avoid blocking other threads
    for sid, session in stale_sessions:
        try:
            session.stop()
        except Exception as e:
            logger.error(f"[LIVE] Error stopping stale session {sid}: {e}")


def _start_session_cleanup_timer():
    """Start a periodic timer to clean up stale sessions."""
    _cleanup_stale_sessions()
    timer = threading.Timer(SESSION_TIMEOUT / 2, _start_session_cleanup_timer)
    timer.daemon = True
    timer.start()

def init_socketio(socketio):
    # Start background cleanup timer for stale sessions
    _start_session_cleanup_timer()

    @socketio.on('connect', namespace='/live')
    def handle_connect():
        sid = request.sid
        logger.info(f"[LIVE] Client connected: {sid}")

    @socketio.on('disconnect', namespace='/live')
    def handle_disconnect():
        sid = request.sid
        logger.info(f"[LIVE] Client disconnected: {sid}")
        with _sessions_lock:
            stats = chunk_stats.pop(sid, {})
            session = active_sessions.pop(sid, None)
        if stats:
            logger.info(f"[LIVE] Session stats for {sid}: chunks={stats.get('count', 0)}, bytes={stats.get('bytes', 0)}")
        if session:
            session.stop()

    @socketio.on('start_stream', namespace='/live')
    def handle_start_stream(data):
        sid = request.sid
        target_lang = data.get('target_lang', 'en')
        logger.info(f"[LIVE] Starting stream for {sid}, target_lang={target_lang}")

        # Initialize the live whisper service for this session
        service = LiveWhisperService(sid, target_lang, socketio)
        with _sessions_lock:
            active_sessions[sid] = service
            chunk_stats[sid] = {'count': 0, 'bytes': 0, 'start_time': time.time(), 'last_active': time.time()}
        service.start()

    @socketio.on('audio_chunk', namespace='/live')
    def handle_audio_chunk(data):
        sid = request.sid
        with _sessions_lock:
            session = active_sessions.get(sid)
            stats = chunk_stats.get(sid)
        if session:
            # Data is expected to be binary PCM bytes or dict with 'audio' key
            audio_bytes = data if isinstance(data, (bytes, bytearray)) else data.get('audio')
            if audio_bytes:
                # Update stats
                if stats:
                    stats['count'] += 1
                    stats['bytes'] += len(audio_bytes)
                    stats['last_active'] = time.time()
                    # Log every 100 chunks
                    if stats['count'] % 100 == 0:
                        elapsed = time.time() - stats['start_time']
                        rate = stats['count'] / elapsed if elapsed > 0 else 0
                        logger.debug(f"[LIVE] Session {sid}: {stats['count']} chunks, {stats['bytes']/1024:.1f}KB, {rate:.1f} chunks/s")
                session.add_audio(audio_bytes)
        else:
            logger.warning(f"[LIVE] Received audio chunk for inactive session: {sid}")

    @socketio.on('stop_stream', namespace='/live')
    def handle_stop_stream():
        sid = request.sid
        logger.info(f"[LIVE] Stopping stream for {sid}")
        with _sessions_lock:
            stats = chunk_stats.pop(sid, {})
            session = active_sessions.pop(sid, None)
        if stats:
            elapsed = time.time() - stats.get('start_time', time.time())
            logger.info(f"[LIVE] Final stats for {sid}: chunks={stats.get('count', 0)}, bytes={stats.get('bytes', 0)}, duration={elapsed:.1f}s")
        if session:
            session.stop()
