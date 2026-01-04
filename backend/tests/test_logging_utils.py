import json
import logging
import pytest
import time
import sys
from backend.utils.logging_utils import (
    JSONFormatter, ColoredFormatter, LogContext, log_with_context,
    log_timing, log_stage, timed, setup_logging
)

def test_json_formatter():
    formatter = JSONFormatter()
    record = logging.LogRecord('test', logging.INFO, 'path', 1, 'message', (), None)
    record.video_id = 'vid123'
    
    output = formatter.format(record)
    data = json.loads(output)
    
    assert data['level'] == 'INFO'
    assert data['message'] == 'message'
    assert data['video_id'] == 'vid123'
    assert 'timestamp' in data

def test_json_formatter_exception():
    formatter = JSONFormatter()
    try:
        raise ValueError("oops")
    except ValueError:
        record = logging.LogRecord('test', logging.ERROR, 'path', 1, 'err', (), sys.exc_info())
    
    output = formatter.format(record)
    data = json.loads(output)
    assert 'exception' in data
    assert data['exception']['type'] == 'ValueError'
    assert data['exception']['message'] == 'oops'
    assert isinstance(data['exception']['traceback'], list)

def test_colored_formatter():
    formatter = ColoredFormatter('%(levelname)s %(message)s')
    record = logging.LogRecord('test', logging.INFO, 'path', 1, 'msg', (), None)
    output = formatter.format(record)
    assert '\033[32m' in output # Green for INFO

def test_colored_formatter_context():
    formatter = ColoredFormatter('%(message)s')
    record = logging.LogRecord('test', logging.INFO, 'path', 1, 'msg', (), None)
    record.video_id = 'v1'
    output = formatter.format(record)
    assert '[video=v1] msg' in output

def test_log_context():
    LogContext.clear()
    LogContext.set(req_id='123')
    assert LogContext.get('req_id') == '123'
    assert LogContext.get_all() == {'req_id': '123'}
    LogContext.clear()
    assert LogContext.get_all() == {}

def test_log_with_context(caplog):
    logger = logging.getLogger('test_ctx')
    logger.setLevel(logging.INFO)
    
    LogContext.set(global_ctx='g1')
    log_with_context(logger, 'INFO', 'hello', local_ctx='l1')
    
    assert len(caplog.records) == 1
    rec = caplog.records[0]
    assert rec.global_ctx == 'g1'
    assert rec.local_ctx == 'l1'
    assert rec.message == 'hello'

def test_log_timing(caplog):
    logger = logging.getLogger('test_timing')
    logger.setLevel(logging.INFO)
    
    with log_timing(logger, 'op1', extra='val'):
        time.sleep(0.01)
        
    assert len(caplog.records) == 1
    rec = caplog.records[0]
    assert 'op1 completed' in rec.message
    assert rec.duration >= 0.01
    assert rec.extra == 'val'

def test_log_stage(caplog):
    logger = logging.getLogger('test_stage')
    logger.setLevel(logging.INFO)
    
    log_stage(logger, 'stage1', 'msg', step=1, total_steps=2)
    
    rec = caplog.records[0]
    assert rec.stage == 'stage1'
    assert rec.step == 1
    assert rec.total_steps == 2

def test_timed_decorator(caplog):
    logger = logging.getLogger('test_dec')
    logger.setLevel(logging.DEBUG)
    
    @timed(logger)
    def ok_func():
        return 'ok'
        
    assert ok_func() == 'ok'
    assert len(caplog.records) == 1
    assert 'ok_func completed' in caplog.records[0].message
    assert caplog.records[0].levelname == 'DEBUG'

def test_timed_decorator_exception(caplog):
    logger = logging.getLogger('test_dec_exc')
    logger.setLevel(logging.ERROR)
    
    @timed(logger)
    def fail_func():
        raise ValueError("fail")
        
    with pytest.raises(ValueError):
        fail_func()
        
    assert len(caplog.records) == 1
    assert 'fail_func failed' in caplog.records[0].message
    assert caplog.records[0].levelname == 'ERROR'
    assert caplog.records[0].error_type == 'ValueError'

def test_setup_logging(tmp_path):
    f = tmp_path / "test.log"
    logger = setup_logging(level='DEBUG', json_format=True, log_file=str(f))
    
    assert logger.level == logging.DEBUG
    assert len(logger.handlers) == 2 # Console + File
    
    logger.info("test log")
    
    content = f.read_text()
    assert '"message": "test log"' in content
