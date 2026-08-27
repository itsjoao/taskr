# taskr v1.2.0

Offline daily task tracker for Windows — epics, an editable template, a calendar view, per-day notes.

## New in this release

### Backlog
- **Move to backlog** parks a task below the day's epics, tagged with the epic it belongs to. Parked work carries no hours and never rolls over; bring it back onto the current day with `↑`.

### Weekly review
- A **week column in the calendar** selects a week; the panel below reads back the hours, the shape of each day, and the completed work grouped by epic. Copyable as text, and available as an export scope.

### Notes
- **`Ctrl+Z` undoes and `Ctrl+Shift+Z` / `Ctrl+Y` redoes inside the note** — by run of typing or of deletes, not letter by letter. The editor rebuilds its own DOM on every structural edit, which used to throw the browser's undo away; it now keeps a history of its own.
- **`Ctrl+F` with the caret in the drawer searches the open note** instead of the whole app. Hits are marked in place, the counter shows `current/total`, `Enter` / `Shift+Enter` step between them, `Esc` closes leaving the caret on the hit. The `.txt` on disk never sees the highlighting.
- **`Ctrl+Backspace` and `Ctrl+Delete` remove a word**, stopping at the end of a line.

### Time
- Time **reads and edits as `h:mm` in 15-minute steps**, accepting `1:15`, `1.25`, `75m` or `2`. Hours stay decimal on disk, so existing files and JSON exports are unaffected.

### Interaction
- **Epics holding work float to the top of the day**, with up/down controls that reorder within each group, so the sort never undoes a move.
- **Reveal in Explorer** by ctrl+click or right-click on file chips, epic folders, sidebar entries and search hits.
- **`A−` / `A+` scale the content only** — scaling the whole frame moved the buttons out from under the pointer between clicks. Time and total fields have fixed widths, so stepping a value never shifts the `+`/`−` beside it.
- **The footer meter fills only for completed work**; an open task holds its slot as an outline.

## Install (Windows)
- **Zip:** `taskr-1.2.0-win.zip` — unpack anywhere and run `taskr.exe`.
- **Portable:** `taskr-portable-1.2.0.exe` — no install, run from anywhere.

The executables are unsigned, so Windows SmartScreen shows an "unknown publisher" warning — click *More info → Run anyway*.

## Data
Everything stays in `Documents\taskr` (`tracker-data.json` + `notes\*.txt`). Upgrading in place keeps it — nothing to migrate from v1.1.0.
