# Project Guidelines for Claude

## General Rules

- Keep content precise and short
- Keep SPECIFICATION.md up to date with any architectural changes
- Only say "done" when all tests pass with no errors

## Testing Requirements

- Target 100% unit test coverage
- All new features and bug fixes must include unit tests
- Run tests before committing: `cd backend && python -m pytest tests/ -v`

## Git Commit Rules

- Do NOT commit review files (CODE_REVIEW.md, REVIEW.md, etc.)
- Review files should be deleted or added to .gitignore

## UI Positioning Guidelines

### Never Block Native Video Controls

1. **YouTube**: Inject into `.ytp-right-controls` (bottom right)

2. **Generic players**: Position controls at **TOP**, not bottom
   - Native controls are always at bottom
   - Top positioning avoids conflicts

3. **Dropdowns/Menus**:
   - TOP control bar: menus open DOWNWARD
   - BOTTOM control bar: menus open UPWARD

4. **Settings panels**: Position relative to control bar location
