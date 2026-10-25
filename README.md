# History of Western Music — Midterm Comprehensive Revision Suite

An interactive, high-precision revision web application and study suite built for the **History of Western Music Midterm Examination** (Covering Antiquity, Medieval, Renaissance, Baroque, and Classical Eras).

Designed in strict **Urtext Editorial Format** with zero third-party dependencies, offline audio fallback for embed-restricted YouTube tracks, continuous playlist looping, slide-by-slide narrative lecture reconstructions, and simulated examination scoring.

---

## Quickstart Guide

### Option 1: Instant Web Access (Zero Installation)
If hosted on GitHub Pages, you can use the web app directly in any browser on macOS, Windows, Linux, iOS, or Android:
- Visit: `https://<your-username>.github.io/<repo-name>/`
*(No terminal commands, no downloads, and no Python setup required).*

---

### Option 2: 1-Click Launch on macOS & Linux
Every modern Mac and Linux system includes Python 3 by default. Zero `pip` packages are required.

1. Clone this repository:
   ```bash
   git clone <repo-url>
   cd <repo-name>
   ```
2. Double-click or run the launcher script:
   ```bash
   ./run.sh
   ```
3. Your default web browser will automatically open to `http://localhost:8765`.

---

### Option 3: 1-Click Launch on Windows
1. Clone or download and extract the repository zip.
2. Double-click `run.bat` in File Explorer (or run `run.bat` in Command Prompt / PowerShell).
3. If Python is installed, the browser will automatically open to `http://localhost:8765`.

---

### Option 4: Manual Terminal Command
From the project folder, run:
```bash
python3 server.py 8765
```
*(On Windows: `python server.py 8765`)*

---

## Revision App Modules

The application consists of 5 dedicated examination preparation tools accessible from the persistent navigation header:

### I. Blind Drop-the-Needle Listening Quiz
- Randomly samples from the 49 required midterm listening pieces with smart distractors (shared trap groups, periods, and musical forces).
- **Needle Drop Modes**:
  - `Professor's Cue / Opening`: Starts at exact exam timestamp cues specified in class (e.g. Track #13 at 2:33, Track #21 at 0:28, Track #35 at 2:05).
  - `Random Mid-Movement Drop`: Simulates exam needle drops anywhere across the movement to test structural texture identification.
  - `Direct Main Theme Entry`: Drops directly at the iconic melodic subject or vocal entry.
- Visual curtain conceals video metadata and titles during blind testing.
- Number keys `1`–`4` submit choices, `N` or `Enter` advances.

### II. Confusable Traps Comparison Matrix
- Side-by-side diagnostic breakdown of 29 easily confused works:
  - *Madrigal vs. Chanson* (#2 vs. #3)
  - *Vivaldi vs. Bach vs. Mozart Solo Concertos*
  - *Handel Messiah vs. Bach Mass in B minor vs. Mozart Requiem*
  - *Beethoven Eroica vs. Haydn London vs. Mozart No. 40*
  - *Bach WTC Prelude No. 1 vs. Beethoven Moonlight Sonata*
  - *Mozart Operas*: *Marriage of Figaro* vs. *Don Giovanni* vs. *The Magic Flute*
- Direct cue audio comparison toggles for immediate aural distinction.

### III. 49-Piece Urtext Track Library & Looping Player
- Complete catalogue of all 49 examination pieces with sonic signatures, historical background, lecture context, musical form, and trap warnings.
- **Continuous Category-Scoped Playlist & Looping**:
  - Select category scope: All 49 Works, Period (Early, Baroque, Classical), Composer (Bach, Mozart, Haydn, Beethoven, Vivaldi, Handel), or Genre (Symphonies, Sonatas, Concertos, Chamber Strings, Vocal/Choral, Operas).
  - **Looping Toggle (`↻ Loop: ON`)**: Automatically advances to the next track upon completion, wrapping seamlessly around the category.
  - Track counter pill displays live position (`Track X of Y · [Category] ↻`).

### IV. Reconstructed Lecture Notes (58 Slide-by-Slide Modules)
- Exhaustive slide-by-slide narrative reconstructs all **67 raw lecture slides** across:
  - **PPT I**: Slides 1–39 (Antiquity, Medieval, Renaissance, Baroque).
  - **PPT II**: Slides 1–28 (Classical Period, Sonata-Allegro Form, Haydn, Mozart, Beethoven).
- Contains 297 high-resolution score excerpts, instrument diagrams, and historical paintings.
- Links over 120 audio and film demonstrations with 1-click in-deck playback.
- Search filter and direct slide jump bar for rapid lookup.

### V. 25-Question Simulation Mock Exam
- Timed examination simulator combining blind listening identification, formal diagram analysis, catalogue number matching, and historical theory.
- Live progress indicator, immediate diagnostic explanations, and final grade calculation.

---

## Master Study Guide

For offline reading or physical printing, refer to the standalone companion document:
- [`Midterm_Study_Guide.md`](Midterm_Study_Guide.md) *(322 KB comprehensive revision notes covering all lecture modules and track analyses)*.

---

## Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Space` | Play / Pause active track |
| `P` or `[` | Previous track in active category playlist |
| `]` or `Shift+Space` | Next track in active category playlist |
| `L` | Toggle Playlist Looping (ON / OFF) |
| `R` | Replay current track from Professor's cue timestamp |
| `J` | Random mid-movement needle drop |
| `1`, `2`, `3`, `4` | Select quiz option 1–4 |
| `N` or `Enter` | Next quiz question |

---

## Offline Audio Bypass Architecture

Certain record labels enforce YouTube IFrame embedding restrictions (Errors 101/150 on `localhost`). To ensure uninterrupted study:
- Pre-cached 128 kbps AAC audio streams (`.m4a`) are bundled in [`audio_cache/`](audio_cache/) for the restricted tracks (Track #3 Madrigal, Track #12 Bach Brandenburg 5, Track #26 Haydn Lark Quartet, Track #31 Mozart Symphony 40).
- When running locally via `server.py`, the server provides HTTP 206 partial-content byte-range streaming.
- When hosted statically on GitHub Pages, `app.js` automatically falls back to fetching `audio_cache/*.m4a` directly, ensuring 100% playback reliability across all devices.
