# Project Guidelines for Claude

## Git Commit Rules

- Do NOT commit review files (e.g., CODE_REVIEW.md, REVIEW.md, or similar temporary analysis documents)
- Review files should be deleted or added to .gitignore before committing

## Testing Requirements

- Goal is to have as close to 100% unit test coverage as possible
- All new features and bug fixes should include corresponding unit tests
- Run tests before committing to ensure nothing is broken

## UI Positioning Guidelines

### Critical: Never Block Native Video Controls

When adding UI elements to video players:

1. **YouTube**: Inject into existing `.ytp-right-controls` (bottom right). This integrates with YouTube's native UI.

2. **Generic/Third-party players**: Position controls at the **TOP** of the video, NOT the bottom.
   - Native video controls are always at the bottom
   - Our UI at the bottom would block play/pause, seek bar, volume, fullscreen buttons
   - Top positioning avoids all conflicts with any video player

3. **Dropdowns/Menus**:
   - If control bar is at TOP: menus open DOWNWARD (`top: calc(100% + 8px)`)
   - If control bar is at BOTTOM: menus open UPWARD (`bottom: calc(100% + 8px)`)

4. **Settings panels**: Position relative to the control bar location
   - TOP control bar → settings panel below it (`top: 50px`)
   - BOTTOM control bar → settings panel above it (`bottom: 60px`)

### File Structure for Generic Player

```
extension/src/content/
  generic-styles.js   # CSS with design tokens (control bar at TOP)
  generic-sync.js     # Subtitle synchronization logic
  generic-ui.js       # UI components (control bar, menus, overlays)
  generic.js          # Entry point, orchestration
```
