# PDR: Desktop Polish

## Problem

Cockpit works but doesn't feel like a native desktop app yet. No tray icon, no keyboard-first navigation, no offline resilience, and untested on Windows/Linux.

## Proposal

A collection of small improvements that compound into a polished desktop experience.

### Tray / Menubar integration

- Tray icon showing connection status (green dot = all good, yellow = datasource expired)
- Click tray → show/hide window (quick toggle)
- Right-click tray → menu: Show, Daily Briefing, Quit
- Keep app alive when window is closed (macOS already does this via `window-all-closed` handler — extend to tray on Windows/Linux)

Already importing `Tray` and `nativeImage` in `electron/main.js`. Just need to instantiate.

### Keyboard-first UX

| Shortcut | Action |
|----------|--------|
| Cmd+P | Quick open file (done) |
| Cmd+K | Universal search (see search PDR) |
| Cmd+1/2/3 | Switch agent tabs |
| Cmd+N | New agent |
| Cmd+W | Close current editor tab |
| Cmd+, | Open settings |
| Cmd+. | Toggle right column (context ↔ editor) |
| Esc | Close any modal/overlay |

Register via Electron `globalShortcut` for app-level, or `window.addEventListener` for page-level.

### Offline caching

- Cache last-known datasource data in `~/.cockpit/cache/` so the dashboard isn't empty when offline
- Show "offline" badge on datasource panels when fetch fails
- Agent chat still works offline if using Ollama (local LLM)
- Graceful degradation: everything renders, just with stale data and a timestamp

### Auto-update

- Use `electron-updater` with GitHub Releases as the update source
- Check for updates on launch (non-blocking)
- Show "Update available" badge in header, user clicks to install
- No forced updates

### Cross-platform testing

- **Windows:** Test NSIS installer, verify deep links (`cockpit://`), path separators in file editor
- **Linux:** Test AppImage, verify tray icon (some DEs don't support it), verify file permissions on `~/.cockpit/`
- CI: Add GitHub Actions matrix build for mac/win/linux

### Window state persistence

- Remember window size/position across restarts
- Store in `~/.cockpit/window-state.json`
- Use `electron-window-state` package or manual save on `resize`/`move` events

## Effort

~2-3 sessions. All small, independent changes. Can be done incrementally.
