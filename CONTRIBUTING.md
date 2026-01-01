# Contributing to Video Translate

Thank you for your interest in contributing to Video Translate!

## Development Setup

### Backend

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Run the server:
   ```bash
   # Development mode with hot reload
   export FLASK_ENV=development
   python app.py
   # OR
   ./run.sh
   ```

### Extension

1. Load `src` directory as "Unpacked Extension" in Chrome.
2. Make changes to JS/HTML/CSS.
3. Reload extension in Chrome to see changes.

## Project Structure

- `backend/`: Python Flask server
  - `services/`: Core logic (Whisper, YouTube, Translation)
  - `routes/`: API endpoint definitions
  - `utils/`: Helper functions
- `src/`: Chrome Extension source
  - `popup/`: UI logic

## Testing

We use `pytest` for backend testing. All new features should include unit tests.

1.  **Run all tests**:
    ```bash
    cd backend
    export PYTHONPATH=$PYTHONPATH:$(dirname $(pwd))
    python -m pytest tests/
    ```
2.  **Check Coverage**:
    ```bash
    python -m pytest tests/ --cov=. --cov-report=term-missing
    ```
3.  **CI Integration**: Every push to GitHub triggers the `test-backend` job. Builds will fail if tests do not pass.

## Code Style

- **Python**: Follow PEP 8. Use type hints where possible.
- **JavaScript**: Use modern ES6+. Clean, readable code.
- **Commits**: Use clear, descriptive commit messages.

## Pull Requests

1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/amazing-feature`).
3. Commit your changes.
4. Push to the branch.
5. Open a Pull Request.

## Issues

Please check `ISSUES.md` for known bugs and limitations before opening a new issue.
