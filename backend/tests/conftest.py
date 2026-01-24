import os
import sys
import pytest
import tempfile
import shutil

# Add backend to path so we can import modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))


def pytest_configure(config):
    """Configure custom pytest markers."""
    config.addinivalue_line("markers", "slow: marks tests as slow (network required)")
    config.addinivalue_line("markers", "network: marks tests that require network access")

from app import app as flask_app

@pytest.fixture
def app():
    flask_app.config.update({
        "TESTING": True,
    })
    yield flask_app

@pytest.fixture
def client(app):
    return app.test_client()

@pytest.fixture
def runner(app):
    return app.test_cli_runner()

@pytest.fixture
def mock_cache_dir():
    # Create a temporary directory for cache
    temp_dir = tempfile.mkdtemp()
    
    # Mock CACHE_DIR in config (requires config to be patchable or use env var)
    # Since config values are loaded at import time, we might need to patch os.path.join 
    # or the imported config module variable.
    # For now, we will rely on shutil to clean up.
    
    yield temp_dir
    
    # Cleanup
    shutil.rmtree(temp_dir)
