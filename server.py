#!/usr/bin/env python3
"""
Local HTTP Server with yt-dlp Audio Bypass & Range-enabled Cache for History of Western Music Revision App.
Bypasses YouTube IFrame Embed Restrictions (Error 101 / 150) by streaming/caching m4a audio locally.
"""
import os
import re
import sys
import time
import shutil
import subprocess
import threading
import urllib.parse
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

APP_DIR = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.path.join(APP_DIR, "audio_cache")
os.makedirs(CACHE_DIR, exist_ok=True)

# In-memory cache of direct stream URLs: ytId -> (url, timestamp)
STREAM_URL_CACHE = {}
DOWNLOAD_LOCKS = {}
LOCK_GUARD = threading.Lock()

# Pre-warm known embed-restricted tracks immediately on server start
PREWARM_YT_IDS = [
    "4pwfNap4DFM",  # Track #3: Italian Madrigal
    "_V7oujd9djk",  # Track #12: Bach Brandenburg Concerto No. 5
    "vNN_Kbuf7_U",  # Track #26: Haydn String Quartet 'The Lark'
    "wqkXqpQMk2k",  # Track #31: Mozart Symphony No. 40 (original link)
]


def is_valid_yt_id(yt_id: str) -> bool:
    return bool(yt_id and re.match(r"^[A-Za-z0-9_-]{6,15}$", yt_id))


def get_cached_file(yt_id: str):
    path = os.path.join(CACHE_DIR, f"{yt_id}.m4a")
    if os.path.isfile(path) and os.path.getsize(path) > 16384:
        return path
    return None


def find_yt_dlp():
    which = shutil.which("yt-dlp")
    if which:
        return which
    for candidate in [
        "/opt/homebrew/bin/yt-dlp",
        "/usr/local/bin/yt-dlp",
        os.path.expanduser("~/.local/bin/yt-dlp"),
        "C:\\yt-dlp\\yt-dlp.exe",
    ]:
        if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate
    return None


def ensure_cached_file(yt_id: str):
    if not is_valid_yt_id(yt_id):
        return None
    existing = get_cached_file(yt_id)
    if existing:
        return existing

    yt_bin = find_yt_dlp()
    if not yt_bin:
        return None

    with LOCK_GUARD:
        lock = DOWNLOAD_LOCKS.setdefault(yt_id, threading.Lock())

    with lock:
        existing = get_cached_file(yt_id)
        if existing:
            return existing
        try:
            tmp_path = os.path.join(CACHE_DIR, f"{yt_id}.part.m4a")
            final_path = os.path.join(CACHE_DIR, f"{yt_id}.m4a")
            cmd = [
                yt_bin,
                "--no-playlist",
                "-f", "bestaudio[ext=m4a]/bestaudio",
                "-o", tmp_path,
                f"https://www.youtube.com/watch?v={yt_id}"
            ]
            subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=120)
            if os.path.isfile(tmp_path) and os.path.getsize(tmp_path) > 16384:
                os.replace(tmp_path, final_path)
                return final_path
        except Exception:
            pass
    return get_cached_file(yt_id)


def download_audio_bg(yt_id: str):
    threading.Thread(target=ensure_cached_file, args=(yt_id,), daemon=True).start()


class RevisionAppHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=APP_DIR, **kwargs)

    def log_message(self, format, *args):
        pass

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/audio":
            qs = urllib.parse.parse_qs(parsed.query)
            yt_id = (qs.get("id") or [""])[0].strip()
            if not is_valid_yt_id(yt_id):
                self.send_error(400, "Invalid YouTube ID")
                return

            local_file = ensure_cached_file(yt_id)
            if local_file:
                self.serve_range_file(local_file, "audio/mp4")
                return

            self.send_error(502, "Could not extract audio stream")
            return

        return super().do_GET()

    def serve_range_file(self, filepath: str, mime_type: str):
        file_size = os.path.getsize(filepath)
        range_header = self.headers.get("Range")
        start = 0
        end = file_size - 1
        status = 200

        if range_header:
            m = re.match(r"bytes=(\d+)-(\d*)", range_header)
            if m:
                start = int(m.group(1))
                if m.group(2):
                    end = min(file_size - 1, int(m.group(2)))
                if start < file_size:
                    status = 206

        length = end - start + 1
        self.send_response(status)
        self.send_header("Content-Type", mime_type)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(length))
        if status == 206:
            self.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
        self.send_header("Cache-Control", "public, max-age=86400")
        self.end_headers()

        try:
            with open(filepath, "rb") as f:
                f.seek(start)
                remaining = length
                while remaining > 0:
                    chunk = f.read(min(65536, remaining))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remaining -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass


def auto_open_browser(url: str):
    time.sleep(0.6)
    try:
        webbrowser.open_new_tab(url)
    except Exception:
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    for yid in PREWARM_YT_IDS:
        download_audio_bg(yid)
    url = f"http://localhost:{port}"
    threading.Thread(target=auto_open_browser, args=(url,), daemon=True).start()
    server = ThreadingHTTPServer(("0.0.0.0", port), RevisionAppHandler)
    print(f"==================================================", flush=True)
    print(f" History of Western Music Revision Server Live", flush=True)
    print(f" URL: {url}", flush=True)
    print(f" Press Ctrl+C to stop.", flush=True)
    print(f"==================================================", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped gracefully.")
