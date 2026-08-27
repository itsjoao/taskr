# taskr v1.1.0

Offline daily task tracker for Windows — epics, an editable template, a calendar view, and now per-day notes.

## New in this release
- **Search** — a slide-out bar over epics, tasks and linked files (`Ctrl+F` or `/`).
- **Per-day notes** — a drawer from the bottom, one `.txt` per day, day navigator, resizable height. Type `@` to link a task; the pick lands as a bold header line.
- **Dark mode** — toggle in the header or `Ctrl+D`, remembered between sessions.
- **The day that passed stays exactly as it was** — completed tasks stay on the day they happened; unfinished work is copied forward instead of moved.
- **Carry-over preview** — open a future day and it already shows the open tasks that will roll in (greyed), no waiting on the clock.
- **All data in the open** — everything lives in `Documents\taskr` (`tracker-data.json` + `notes\*.txt`), migrated automatically from the old location on first run.

## Install (Windows)
- **Installer:** `taskr Setup 1.1.0.exe` — lets you choose the folder, creates a desktop shortcut.
- **Portable:** `taskr-portable-1.1.0.exe` — no install, run from anywhere.

Both are unsigned, so Windows SmartScreen shows an "unknown publisher" warning — click *More info → Run anyway*.
