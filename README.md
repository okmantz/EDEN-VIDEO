# EDEN VIDEO

Two editions live in this repo:

| | **EDEN Studio (web)** | **Server edition** |
|---|---|---|
| What it is | A full multi-track video editor that runs in the browser, in the style of CapCut | The original Python + FFmpeg auto-editor |
| Where it runs | **GitHub Pages**, on any computer, phone or tablet. Nothing to install | Your own computer (download or run from source) |
| Best for | Hands-on editing, effects, transitions, music, text, mobile | Hands-free automatic edits of long recordings (Whisper transcripts) |
| Code | [`docs/`](docs) | [`eden/`](eden) and everything else |

## EDEN Studio (web)

**Live site:** `https://<your-github-username>.github.io/<repo-name>/`

### Turn it on (one time, about a minute)

1. Push this repo to GitHub.
2. Open **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**, **Branch** to `main`, then **Save**. Either folder works: **`/ (root)`** forwards visitors to the app automatically, and **`/docs`** serves it directly.
4. Wait a minute, then open the link GitHub shows at the top of that page.

### Install it like an app

- **iPhone / iPad (Safari):** Share → **Add to Home Screen**.
- **Android (Chrome):** tap **Install** in the app's top bar, or menu → **Install app**.
- **Desktop (Chrome / Edge):** click **Install** in the top bar, or the install icon in the address bar.

It then opens full screen and works offline. Your projects and media stay on your device.

**Updates:** the app checks for a new version each time it opens. When one is ready, a message appears; tap **Reload** to switch to it.

### Edit for me, templates and your brand

The web app opens on four tabs: **Home**, **Templates**, **Projects** and **Brand**.

- **Edit for me.** Drop in a video and pick a style (Viral Short, Authority, Clean Pro, Podcast, Cinematic). It cuts dead air, "um"s, stutters and false starts without clipping words, adds word-timed captions in 19 caption looks, mixes quiet music that ducks under your voice, adds b-roll, and applies your brand. **Fine-tune** exposes pacing, caption look, position and size, music, b-roll amount, colour grade, end card and format. Captions use Whisper in the browser: it downloads once, so be online the first time, or import an `.srt` instead.
- **Real stock b-roll (optional).** Paste a free [Pexels](https://www.pexels.com/api/) key in **Brand** and b-roll cutaways use real footage that matches what you say, with animated backgrounds as the fallback.
- **Templates.** 43 ready-made videos with live animated previews (Quick Cuts, Day in My Life, Photo Dump, Product Showcase, Before & After, Top 3, Travel Film, Movie Trailer, Fitness Pump, Recipe Steps and more). Drop in clips, change the words, tap Create. Empty slots get an animated background. The result is a normal project you can keep editing.
- **Brand.** Name, handle, colours, font, logo, default caption look and music, end card. Everything above uses it. It is stored on your device, with a JSON backup you can download.

Tests for the planning logic and template catalog: `node tests/web/autoedit.test.mjs` and `node tests/web/templates.test.mjs`.

### What's inside

- **Multi-track timeline** with video, overlay, text, effect and audio tracks. Drag, trim, split, duplicate, snap, pinch-to-zoom, unlimited undo and redo, copy and paste, and ripple delete.
- **Preview you can touch**: tap an item in the preview to select it, drag to move, pull the corner to scale, use the top handle to rotate, or pinch and twist with two fingers.
- **47 effects**: glitch, VHS, RGB split, blur, zoom, shake, film, light leaks, distortion, stylise and more. Apply to one clip or as an effect layer over everything beneath it.
- **59 transitions**: crossfade, slides, wipes, zooms, spins, glitch, ripple, doors, shapes and more, with adjustable length.
- **26 colour looks** plus full manual grading (exposure, contrast, saturation, vibrance, temperature, tint, hue, highlights, shadows, sharpen, vignette, grain).
- **79 B-roll backgrounds in 15 genres** (Nature, City, Tech, Space, Lifestyle, Food, Music, Gaming, Fitness, Cinematic, Education, Travel, Romance, Dark, Fun). They are drawn live in any aspect ratio, so they are royalty-free and tiny.
- **Music and sound**: upload your own background music (MP3, WAV, M4A), or use 26 original built-in tracks and 28 sound effects. Volume, fades, looping, auto-ducking under speech, and loudness normalisation on export.
- **Text and stickers**: 14 text styles, 18 fonts, outline, glow, shadow, background box, animated in/out, typewriter, plus emoji and shape stickers.
- **Keyframes** for position, scale, rotation and opacity; speed from 0.25x to 4x; masks, chroma key (green screen), blend modes, crop, flip, picture-in-picture.
- **Edit for me (one click)**: pick a video and press one button. Eden cuts dead air (the threshold adapts to how loud your recording is), removes "um" / "uh" and stutters, adds word-by-word captions in one of 12 looks, mixes a quiet music track that fades and ducks under your voice, drops in b-roll cutaways with keyword cards, and applies your brand. Everything stays editable afterwards in the full editor.
- **Brand profile**: the **Brand profile** button on the home screen stores your brand name, handle, three colors, font and logo (position and size) on this device, with a live preview. The app's accent color can follow your brand.
- **Speech to text**: captions and filler removal use Whisper running in your browser. The speech model (about 40 to 80 MB) downloads once the first time and is then cached; it needs an internet connection that can reach `cdn.jsdelivr.net` and `huggingface.co`. If it cannot load, the rest of the edit still runs, and you can attach a `.srt` / `.vtt` file instead.
- **Captions**: import `.srt` / `.vtt`, or paste lines. **Remove silences** automatically from a clip.
- **Export** to MP4 (H.264) up to 4K at 24, 30 or 60 fps, rendered on your own device. Share straight from your phone.
- **Private**: your files never leave your device. Projects autosave locally in your browser.

### Good to know

- Needs a recent browser: Chrome, Edge, Safari 16.4+ or Firefox. Fast export uses WebCodecs; if a browser lacks it, EDEN falls back to a real-time recording (keep the tab open).
- Projects and imported media are stored in your browser. Clearing site data deletes them, so export finished videos.
- Very large 4K files and long timelines work best on a computer; phones are great for short-form edits.
- The built-in music is generated on first use (a few seconds) and cached afterwards.
- It does not do automatic speech-to-text. Use the server edition for Whisper captions, or import an `.srt`.

### Run it locally

Any static server works, for example `cd docs && python3 -m http.server 8000`, then open <http://localhost:8000>. Modules and the service worker need `http://`, not `file://`.

---

## EDEN VIDEO Server Edition (Python + FFmpeg)

**Automatic one-click editing: silence and filler removal, Whisper captions, B-roll, per-platform exports**

Upload a short clip or a long recording and get a finished edit for Instagram, TikTok, Facebook and YouTube. Eden cuts the silence and the "ums", adds styled captions, drops in B-roll cutaways, reframes to each platform's aspect ratio and exports one polished file per platform.

Eden runs on your own computer. Your footage is never uploaded anywhere, and it works fully offline once set up.

## What's new in 1.1 (Server Edition)

- **One-click "Edit for me".** Upload a video and press one button. Eden cuts pauses, filler words and stutters, adds captions, a quiet music bed and b-roll, and applies your brand. Every part can be changed under "Make it yours", and your choices are remembered.
- **Smarter cuts.** Pause detection adapts to each recording's own noise floor, so quiet speakers are not clipped. Accidental repeats like "the the" are removed.
- **11 caption looks**, separate from the edit style, with exact previews rendered by the same engine as your video: Viral Pop, Bold Impact, Clean Pro, Podcast Box, Highlighter, Neon Glow, Cinematic, Elegant, Minimal, Comic Pop, Handwritten, plus "Your brand". 24 fonts are bundled, so captions look identical on every computer.
- **Brand kit.** Brand name, handle, three colors, font, logo (position and size) and a live preview. Colors tint captions and cards; the handle and logo are placed in the safe area of each platform.
- **Built-in music.** Six royalty-free loops generated by Eden (needs `numpy`, installed with the app). Music fades in and out and ducks under your voice.
- **B-roll.** Your library first, then Pexels (optional key), then animated keyword cards in your brand colors so there is always a cutaway.
- **New interface.** New design, dark and light themes, a mobile layout, a step-by-step progress view, and a Brand kit page.

The browser-only EDEN Studio in `docs/` has its own one-click editor and brand profile (see "Edit for me" below).

## What it does

| | |
|---|---|
| **Silence removal** | Detects pauses with FFmpeg and shortens them to a natural beat. Three pacing levels: relaxed, balanced, tight. |
| **Filler-word removal** | Finds "um", "uh", "er" and similar sounds in the transcript and cuts them, along with the pause that came before them. Optional: "you know" and "I mean". |
| **Captions** | Burned-in, styled captions with word-by-word highlighting, safe-zone placement for each platform, plus a clean `.srt` file for every video. |
| **B-roll** | Cuts to clips from your library when a tagged word is spoken, and fills long talking stretches. Optional stock footage from Pexels. |
| **Reframing** | Fill the frame (with an adjustable crop position) or fit the whole frame over a blurred backdrop. |
| **Polish** | Punch-in zooms at cuts, a colour grade per style, noise reduction, compression and loudness normalisation (-14 LUFS by default). |
| **Music & sound effects** | Your own uploaded tracks, ducked under your voice automatically (sidechain compression), plus optional whoosh-on-zoom and pop-on-emphasis effects. Nothing is generated — every sound is a file you uploaded. |
| **Fine-tune editor** | After the one-click edit, optionally tweak segments (keep/cut/trim), fix caption text, and add or remove B-roll cutaways, then re-render. |
| **Multi-platform** | Pick any mix of Instagram Reels / Feed, TikTok, Facebook Reels / Feed, YouTube Shorts / YouTube. One render per platform. |
| **Optional AI** | Ollama can write a title, description and hashtags and choose emphasis words. **Nothing depends on it.** |

### It is fully functional without AI

Every editing step has a deterministic implementation:

- Silence trimming, zooms, reframing, grading, audio polish and B-roll placement use FFmpeg and plain algorithms.
- **Captions and filler-word removal need a transcript.** Eden gets one from [Whisper](https://github.com/SYSTRAN/faster-whisper) running locally on your machine (a speech-to-text model, not a language model, and nothing is sent online). If you would rather not install it, attach your own `.srt` or `.vtt` file to any video and Eden uses that instead.
- **Ollama is optional.** With it off, unreachable or erroring, Eden falls back to built-in keyword extraction and tells you it did.

## Install and run

Eden is a web app that runs on your own computer and opens in your browser. There are two ways to get it. **The download is the easy one.**

### Option A: Download the app (nothing to install)

This is a ready-to-run build for **Windows, Mac and Linux**. Python, FFmpeg and the speech engine are all inside it.

**Get it from GitHub (one time):**

1. In your repo, open the **Actions** tab, choose **Build downloadable app** on the left, click **Run workflow**, and wait about 15 to 25 minutes.
2. Open the finished run and download **EDEN-VIDEO-windows**, **EDEN-VIDEO-macos** or **EDEN-VIDEO-linux** from the *Artifacts* section at the bottom.
3. To give anyone a normal download link instead, publish a release: `git tag v1.0.0 && git push --tags`. The three downloads are attached to the release page automatically.

**Run it:**

| Your computer | Do this |
|---|---|
| **Windows** | Unzip, then double-click **`eden-video.exe`**. If Windows says it "protected your PC", click **More info → Run anyway** (once). |
| **Mac** | Unpack, then right-click **`Start EDEN VIDEO.command`** → **Open** → **Open** (once). Apple-silicon Macs. |
| **Linux** | Unpack, then run `./eden-video` in that folder. |

Eden opens at <http://localhost:8000>. Keep the black window open while you use it; close it to stop. Your videos live in the `data` folder next to the app. The download is large (roughly 250 MB packed) because it contains everything.

### Option B: Run from the source code

Use this if you want to change the code. It needs nothing installed first: the launcher sets everything up.

#### 1. Get the code

Click **Code → Download ZIP** on GitHub and unzip it, or:

```bash
git clone https://github.com/okmantz/EDEN-VIDEO.git
cd EDEN-VIDEO
```

#### 2. Start it

| Your computer | Do this |
|---|---|
| **Windows** | Double-click **`start.bat`** |
| **Mac** | Double-click **`start.command`** (first time: right-click → Open) |
| **Linux** | Run `bash start.sh` in the folder |

The first run takes a minute or two. Eden:

1. creates its own private Python environment (`.venv`), so it never touches your system Python;
2. installs its packages, including the local speech engine for captions;
3. checks for **FFmpeg** and, if it is missing, shows the exact install command for *your* system and offers to run it for you;
4. starts and opens <http://localhost:8000> in your browser.

Every run after that starts in a couple of seconds. To stop Eden, press **Ctrl+C** in its window (or close the window).

You do not need to install anything first. If Python or FFmpeg is missing, the launcher installs it (Windows: through `winget`, or python.org as a fallback; Mac: through Homebrew). On Linux it prints the one command to run.

If the automatic install cannot finish, install Python yourself from <https://www.python.org/downloads/> and tick **"Add python.exe to PATH"**, then double-click `start.bat` again.

### Options

Add these after the command, for example `bash start.sh --lan` or `start.bat --lite`:

| Option | What it does |
|---|---|
| `--lan` | Lets your phone and other computers on your Wi-Fi use Eden. A password is created for you and printed. |
| `--lite` | Skips the speech engine (smaller install). Captions then need an `.srt` file. |
| `--port 9000` | Use another port. If 8000 is busy, Eden picks the next free one by itself. |
| `--no-browser` | Do not open the browser. |
| `doctor` | Check that everything Eden needs is installed, and say how to fix what is not. |
| `download-model` | Download the speech model now, so the first edit starts straight away. |

### Docker

If you prefer containers (FFmpeg and fonts are included, nothing else to install):

```bash
docker compose up --build
```

Open <http://localhost:8000>. Data lives in the `eden-data` volume, including the downloaded Whisper model. The compose file binds to `127.0.0.1` only; see [Security](#security) before exposing it.

### Run it online instead (nothing installed on your computer)

Eden can also live on a server and be opened from any browser, like any hosted web app. Use a small always-on machine that has Docker (a cloud VM, for example), run `docker compose up -d --build`, set `EDEN_PASSWORD`, and put HTTPS in front of it (Caddy or nginx). Serverless hosts such as Cloud Run are a poor fit: they cap upload size, and video renders can take longer than their request limits. This hosted setup is documented but not tested here. See [Security](#security).

### Keep it running in the background (Linux)

Copy [`deploy/eden.service`](deploy/eden.service), edit the three `CHANGE_ME` values, and follow the steps at the top of the file. Eden then starts at boot and restarts if it stops.

### Updating

```bash
git pull
bash start.sh        # or start.bat / start.command: new packages install automatically
```

Your videos and settings live in the `data` folder and are not touched.

### Troubleshooting

Run **`python -m eden doctor`** (or `.venv/bin/python -m eden doctor`) first. It lists what is missing and the fix for each item.

| Problem | Fix |
|---|---|
| **"FFmpeg was not found"** | Run the command Eden prints; it is already right for your system. By hand: Ubuntu/Debian `sudo apt-get install -y ffmpeg`, Mac `brew install ffmpeg`, Windows `winget install --id Gyan.FFmpeg -e`. On Windows, close and reopen the window afterwards. |
| `No module named EDEN` | The name is lowercase: `python -m eden`. Easier still: use `start.sh` / `start.bat`. |
| `Permission denied: ./start.sh` | Run it as `bash start.sh`. Files uploaded through the GitHub website lose their "executable" flag. |
| Linux: "ensurepip is not available" / venv error | `sudo apt install -y python3-venv python3-pip`, then run the launcher again. |
| `winget` is "not found" on Linux, or `apt` on Windows | Those commands belong to different systems. Eden prints the right one for yours. |
| Port 8000 is busy | Nothing to do: Eden uses the next free port and prints the address. Or choose one with `--port`. |
| Captions are missing | Run `doctor`. Either the speech engine is not installed (run the launcher without `--lite`), or this FFmpeg build has no caption support (install a full build). You can also attach an `.srt` file. |
| First edit sits on "Getting the speech model ready" | Eden is downloading the speech model (about 150 MB, one time). Needs internet once; then it works offline. |
| Pip cannot download packages | Check your connection, proxy or VPN, then run the launcher again; it resumes where it stopped. |

## Using Eden

1. **Create** – drag a video onto the drop zone (or choose a file). Eden reads it and measures how much dead air it can trim.
2. **Choose a look** – pick a style, tick the platforms you post to, and switch features on or off.
3. **Create video** – watch progress per platform. Finished videos can be played, downloaded, renamed and re-edited from **Saved videos**.

Other pages: **Home**, **B-roll library** (upload and tag cutaway clips), **Music & sounds** (background tracks and sound effects), **Settings** (profile, branding and logo, defaults, speech model, Ollama, Pexels, system status).

After the one-click edit, any finished video has a **Fine-tune** button (the scissors icon on its card, also in Saved videos). It opens an editor where you can untick or trim segments, fix caption text line by line, remove cutaways or add your own at an exact time, and change the music and sound effects — then **Re-render**. Transcription is reused, so re-renders skip straight to the new cut. The main flow stays one click: the editor is always optional.

### Styles

| Style | Pacing | Captions |
|---|---|---|
| Viral Pop | Tight, punch-in zooms | Bold, uppercase, word-by-word highlight |
| Clean Pro | Balanced | Understated, bottom |
| Podcast Clip | Balanced, zooms | Boxed |
| Bold Impact | Tight, zooms, more B-roll | Huge, centred, word-by-word |
| Cinematic | Relaxed | Elegant, filmic colour grade |

Styles are plain data in [`eden/presets.py`](eden/presets.py). Adding or tweaking one takes a few lines.

### Platforms

| Target | Output | Recommended length* |
|---|---|---|
| Instagram Reels | 1080×1920 (9:16) | 90 s |
| Instagram Feed | 1080×1350 (4:5) | 60 s |
| TikTok | 1080×1920 (9:16) | 3 min |
| Facebook Reels | 1080×1920 (9:16) | 90 s |
| Facebook Feed | 1080×1080 (1:1) | 3 min |
| YouTube Shorts | 1080×1920 (9:16) | 3 min |
| YouTube | 1920×1080 (16:9) | none |

\*Soft guidance only. Eden warns but never refuses. Platforms change their limits often, so check current specs and edit `PLATFORMS` in `eden/presets.py` to match.

### How B-roll is chosen

1. If a spoken word matches a tag on one of your clips (after simple stemming), that clip is placed on the word.
2. If the talking head runs longer than the density setting allows (5.5 s, 9 s or 16 s), the next clip in rotation fills the gap.
3. Cutaways never cover the opening hook or the final beat, never overlap, and snap to word boundaries. Audio always continues underneath.

With no library clips and no Pexels key, Eden skips cutaways and relies on punch-in zooms to keep the edit lively.

### Music and sound effects

**Music & sounds** holds your own audio files — background tracks and short effects. Eden never generates audio.

- **Background music:** pick a track when you create a video and set its volume. The track loops to the video length and is ducked under your voice with sidechain compression, so speech always stays on top. Videos with no audio track get the music at full set volume.
- **Whoosh on punch-in zooms:** plays your chosen whoosh just before each zoom cut.
- **Pop on emphasized words:** plays your chosen pop on the words Eden emphasises in the captions (capped at 12 per video).

### How the edit is built

```
upload ─ probe ─ detect silence ─ transcribe (Whisper or .srt) ─ find fillers
      └─ keep-segments = speech − fillers, snapped to the frame grid
Stage 1  FFmpeg: trim + concat segments, reframe, zoom, grade, clean audio, normalise loudness
Stage 2  FFmpeg: overlay B-roll, burn captions (ASS), add logo, mix music (ducked) + SFX, encode to platform spec
```

Transcripts are cached per upload, so rendering the same video for several platforms transcribes once.

## Configuration

Environment variables (see [`.env.example`](.env.example)). Most things are also in the Settings page.

| Variable | Default | Purpose |
|---|---|---|
| `EDEN_DATA_DIR` | `./data` | Uploads, renders, database, caches |
| `EDEN_HOST` / `EDEN_PORT` | `127.0.0.1` / `8000` | Where Eden listens (or use `--lan`, `--port`) |
| `EDEN_FFMPEG` / `EDEN_FFPROBE` | *(auto-detected)* | Full path to FFmpeg if it is somewhere unusual |
| `EDEN_PASSWORD` | *(none)* | Enables HTTP basic auth (any username) |
| `EDEN_MAX_UPLOAD_MB` | `4096` | Largest accepted upload |
| `EDEN_WORKERS` | `1` | Concurrent renders |
| `EDEN_X264_PRESET` | `veryfast` | Final-encode speed vs size |
| `EDEN_WHISPER_MODEL` | `base` | `tiny`, `base`, `small`, `medium`, `large-v3` |
| `EDEN_WHISPER_DEVICE` | `auto` | `auto`, `cpu`, `cuda` |
| `OLLAMA_URL` / `OLLAMA_MODEL` | `http://127.0.0.1:11434` / `llama3.2` | Optional AI assist |
| `PEXELS_API_KEY` | *(none)* | Optional stock footage |

### Optional: Ollama

Install [Ollama](https://ollama.com), run `ollama pull llama3.2`, then turn on **Settings → AI assist** and test the connection. When you tick *AI assist* on a video, Eden sends the transcript to the Ollama address you configured and uses the reply for the title, description, hashtags and emphasis words. Invalid or missing replies are ignored.

### Optional: working offline from the first run

Run `python -m eden download-model` once on a connected machine and copy the Hugging Face cache (`~/.cache/huggingface`) to the offline machine, or set `HF_HOME`.

### Fonts

Captions default to **Inter**. Install it, or set a different installed font under **Settings → Branding**. You can also drop `.ttf` or `.otf` files into `data/assets/fonts/` and Eden will use them.

## Third-party software in the download

The downloadable app bundles an unmodified FFmpeg build (GPL, <https://ffmpeg.org>; Windows and Linux builds from [BtbN/FFmpeg-Builds](https://github.com/BtbN/FFmpeg-Builds)) as a separate program that Eden runs, plus Python and the packages in `requirements.txt` under their own licences.

## Security

Eden is a single-user app with no accounts. By default it listens on `127.0.0.1`, so only your computer can reach it. If you bind it to a network interface or put it on a server:

- set `EDEN_PASSWORD` (HTTP basic auth) **and** put it behind HTTPS, for example a reverse proxy such as Caddy or nginx, because basic auth over plain HTTP is readable on the network;
- remember that uploaded files are stored unencrypted in the data directory.

## Project layout

```
eden/
  __main__.py    Command line: run, doctor, download-model
  system.py      FFmpeg discovery, per-OS install help, health checks
  main.py        FastAPI app and routes
  pipeline.py    The end-to-end edit
  editor.py      FFmpeg filter graphs (cut, reframe, zoom, overlay, captions, encode)
  timeline.py    Keep-segment planning, filler cuts, source→output time mapping
  transcript.py  Whisper, SRT/VTT import, caching
  captions.py    Chunking, ASS and SRT generation
  broll.py       Cutaway planning and Pexels lookup
  keywords.py    Dependency-free keyword extraction
  ai.py          Optional Ollama client
  presets.py     Platforms, styles, pacing, filler lists
  jobs.py        Background render queue
  db.py          SQLite storage
  static/        The web interface (plain HTML, CSS and ES modules, no build step)
packaging/       Recipe for the downloadable app (PyInstaller), FFmpeg fetcher, smoke test
run_eden.py      Entry point of the downloadable app
scripts/         bootstrap.py (the one-step installer behind start.sh / start.bat)
deploy/          systemd service for running Eden in the background
start.sh  start.bat  start.command   double-click launchers
tests/           pytest suite (includes real FFmpeg renders)
```

## API

Interactive docs are served at `/api/docs`. The main endpoints:

| Method | Path | |
|---|---|---|
| `POST` | `/api/projects` | Upload a video |
| `POST` | `/api/projects/{id}/render` | Render for one or more platforms |
| `GET` | `/api/videos` | List videos (filters: `status`, `platform`, `q`) |
| `GET` | `/api/videos/{id}` | Status, progress, stats |
| `GET` | `/api/videos/{id}/download` | The finished MP4 |

## Development

```bash
bash start.sh --setup --lite            # creates .venv
.venv/bin/pip install -r requirements-dev.txt
make test PY=.venv/bin/python      # pytest
make lint      # ruff
```

The test suite runs real FFmpeg renders (about three minutes). Tests that need FFmpeg skip themselves if it is missing, and CI runs without the speech engine to keep the no-Whisper path honest.

## Known limits

- **Speech accuracy.** Whisper's `base` model is fast but can mishear; use `small` or larger for important videos. Whisper tends to leave out disfluencies, so Eden primes it to keep them, but some "ums" will still slip through.
- **Reframing is geometric, not subject-aware.** There is no face tracking; use the crop-position slider or "Fit with blurred backdrop" for off-centre subjects.
- **Very long, very choppy videos.** Cuts are built as one FFmpeg filter graph. Hours of footage with thousands of cuts will use a lot of memory and time.
- **The fine-tune editor re-renders, it does not scrub a timeline.** Edits are applied by running the pipeline again (transcription is reused, so it is fast), not by dragging clips on a timeline.
- **Stock footage** requires your own Pexels API key and follows [Pexels' licence and terms](https://www.pexels.com/license/).
- Make sure you have the rights to footage, music and B-roll you publish.

## License

MIT. See [LICENSE](LICENSE).
