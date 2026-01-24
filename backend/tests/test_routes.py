import pytest
from unittest.mock import patch, MagicMock

def test_health_check(client):
    response = client.get('/health')
    assert response.status_code == 200
    data = response.get_json()
    assert data['status'] == 'ok'
    assert 'features' in data

def test_get_subtitles_missing_id(client):
    response = client.get('/api/subtitles')
    assert response.status_code == 400
    assert 'error' in response.get_json()

@patch('backend.routes.subtitles.fetch_subtitles')
def test_get_subtitles_success(mock_fetch, client):
    mock_fetch.return_value = ({'events': []}, 200)
    
    response = client.get('/api/subtitles?video_id=123')
    assert response.status_code == 200
    assert response.get_json() == {'events': []}

@patch('backend.routes.transcribe.await_whisper_transcribe')
@patch('backend.routes.transcribe.ENABLE_WHISPER', True)
def test_transcribe_video_success(mock_transcribe, client):
    mock_transcribe.return_value = [{'start': 0, 'end': 1, 'text': 'Hi'}]
    
    # Needs Tier 2
    response = client.get('/api/transcribe?video_id=123&tier=tier2')
    
    assert response.status_code == 200
    data = response.get_json()
    assert len(data['segments']) == 1
    assert data['segments'][0]['text'] == 'Hi'

def test_transcribe_video_tier1_forbidden(client):
    response = client.get('/api/transcribe?video_id=123&tier=tier1')
    assert response.status_code == 403
    assert response.get_json()['upgrade'] is True

@patch('backend.routes.translation.SERVER_API_KEY', None)
def test_translate_subtitles_tier1_api_key_required(client):
    # Missing API key and no server key - should require client API key
    response = client.post('/api/translate', json={
        'subtitles': [{'text': 'Hi'}],
        'model': 'gpt'
    })
    assert response.status_code == 400
    assert 'API key is required' in response.get_json()['error']

@patch('backend.routes.translation.translate_subtitles_simple')
def test_translate_subtitles_success(mock_translate, client):
    mock_translate.return_value = {'translations': ['Hola']}
    
    response = client.post('/api/translate', json={
        'subtitles': [{'text': 'Hello'}],
        'model': 'gpt',
        'api_key': 'sk-fake',
        'tier': 'tier1'
    })
    
    assert response.status_code == 200
    assert response.get_json()['translations'] == ['Hola']
