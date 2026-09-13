"""Local video downloader for the Top-10 channel workflow — yt-dlp wrapper.

Paste a YouTube/TikTok/etc. link, get an MP4 (or MP3) in
``automation/data/downloads/`` (gitignored). Runs locally only — YouTube blocks
datacenter IPs, so this can never live on the Vercel site.

Usage:
  python video_dl.py "https://youtube.com/watch?v=..."   # one-off CLI download
  python video_dl.py --serve                              # web UI on 127.0.0.1:4174

Requires: pip install yt-dlp imageio-ffmpeg (ffmpeg binary comes from
imageio-ffmpeg — no separate ffmpeg install needed).
"""

import json
import re
import sys
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import quote, unquote, urlparse, parse_qs

import yt_dlp
from imageio_ffmpeg import get_ffmpeg_exe

DATA_DIR = Path(__file__).resolve().parent / "data"
DOWNLOADS_DIR = DATA_DIR / "downloads"
DEFAULT_PORT = 4174

JOBS: dict[str, dict[str, Any]] = {}

PAGE = """<!doctype html>
<html><head><meta charset="utf-8"><title>Video Downloader</title>
<style>
  body { background:#09090b; color:#f4f4f5; font-family:system-ui,sans-serif; max-width:720px; margin:40px auto; padding:0 16px; }
  input, select, button { font:inherit; padding:8px 12px; border-radius:6px; border:1px solid #3f3f46; background:#27272a; color:#f4f4f5; }
  input { flex:1; } button { background:#0891b2; border:none; cursor:pointer; font-weight:600; }
  button:hover { background:#0e7490; }
  .row { display:flex; gap:8px; margin-bottom:24px; }
  .card { background:#18181b; border:1px solid #3f3f46; border-radius:10px; padding:12px 16px; margin-bottom:10px; font-size:14px; }
  .muted { color:#71717a; font-size:12px; }
  .err { color:#f87171; } .ok { color:#34d399; }
  a { color:#22d3ee; }
  h2 { font-size:15px; color:#a1a1aa; text-transform:uppercase; letter-spacing:.05em; }
</style></head><body>
<h1>Video Downloader</h1>
<p class="muted">Downloads land in automation/data/downloads/</p>
<div class="row">
  <input id="url" placeholder="Paste a YouTube / TikTok / any video link…" autofocus>
  <select id="fmt"><option value="video">MP4 video</option><option value="audio">MP3 audio</option></select>
  <button onclick="start()">Download</button>
</div>
<h2>Jobs</h2><div id="jobs"></div>
<h2>Downloaded files</h2><div id="files"></div>
<script>
async function start() {
  const url = document.getElementById('url').value.trim();
  if (!url) return;
  await fetch('/download', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ url, audio: document.getElementById('fmt').value === 'audio' }) });
  document.getElementById('url').value = '';
}
document.getElementById('url').addEventListener('keydown', e => { if (e.key === 'Enter') start(); });
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
async function refresh() {
  const jobs = await (await fetch('/jobs')).json();
  document.getElementById('jobs').innerHTML = jobs.length ? jobs.map(j =>
    `<div class="card"><b>${esc(j.title || j.url)}</b><br>
     <span class="${j.status === 'error' ? 'err' : j.status === 'done' ? 'ok' : ''}">${j.status}</span>
     ${j.percent != null ? ' — ' + j.percent + '%' : ''}
     ${j.error ? '<br><span class="err">' + esc(j.error) + '</span>' : ''}
     ${j.file ? '<br><a href="/files/' + encodeURIComponent(j.file) + '">' + esc(j.file) + '</a>' : ''}
     <br><span class="muted">${j.audio ? 'mp3' : 'mp4'} · ${new Date(j.started * 1000).toLocaleTimeString()}</span>
    </div>`).join('') : '<p class="muted">No jobs yet.</p>';
  const files = await (await fetch('/files')).json();
  document.getElementById('files').innerHTML = files.length ? files.map(f =>
    `<div class="card"><a href="/files/${encodeURIComponent(f.name)}">${esc(f.name)}</a>
     <span class="muted"> — ${(f.size / 1048576).toFixed(1)} MB</span></div>`).join('')
    : '<p class="muted">Nothing downloaded yet.</p>';
}
refresh(); setInterval(refresh, 2000);
</script></body></html>"""


def _make_hook(job_id: str):
    def hook(d: dict[str, Any]) -> None:
        job = JOBS[job_id]
        if d.get("status") == "downloading":
            job["status"] = "downloading"
            total = d.get("total_bytes") or d.get("total_bytes_estimate")
            if total:
                job["percent"] = round(d.get("downloaded_bytes", 0) / total * 100, 1)
            job["title"] = d.get("info_dict", {}).get("title") or job.get("title")
        elif d.get("status") == "finished":
            job["percent"] = 100
    return hook


def run_download(job_id: str, url: str, audio: bool) -> None:
    job = JOBS[job_id]
    DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)
    opts: dict[str, Any] = {
        "outtmpl": str(DOWNLOADS_DIR / "%(title).80s [%(id)s].%(ext)s"),
        "noplaylist": True,
        "ffmpeg_location": get_ffmpeg_exe(),
        # YouTube now needs a JS runtime for full format lists (deno is the only
        # default); node is installed on this machine, so enable it too.
        "js_runtimes": {"deno": {}, "node": {}},
        "progress_hooks": [_make_hook(job_id)],
        "quiet": True,
    }
    if audio:
        opts["format"] = "bestaudio/best"
        opts["postprocessors"] = [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "mp3",
            "preferredquality": "192",
        }]
    else:
        opts["format"] = "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"
        opts["merge_output_format"] = "mp4"
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=True)
            job["title"] = info.get("title") or job.get("title")
            path = Path(ydl.prepare_filename(info))
            if audio:
                path = path.with_suffix(".mp3")
            job["file"] = path.name
            job["status"] = "done"
    except Exception as exc:
        job["status"] = "error"
        job["error"] = str(exc)[:500]


def start_job(url: str, audio: bool) -> str:
    job_id = uuid.uuid4().hex[:8]
    JOBS[job_id] = {
        "id": job_id, "url": url, "audio": audio,
        "status": "queued", "percent": None, "title": None,
        "file": None, "error": None, "started": time.time(),
    }
    threading.Thread(target=run_download, args=(job_id, url, audio), daemon=True).start()
    return job_id


class Handler(BaseHTTPRequestHandler):
    server_version = "VideoDL/1.0"

    def _send_json(self, data: Any, status: int = 200) -> None:
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"  {self.address_string()} {fmt % args}")

    def do_GET(self) -> None:
        path = unquote(urlparse(self.path).path)
        if path == "/":
            body = PAGE.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/jobs":
            jobs = sorted(JOBS.values(), key=lambda j: j["started"], reverse=True)
            return self._send_json(jobs)
        if path == "/files":
            if not DOWNLOADS_DIR.exists():
                return self._send_json([])
            files = [
                {"name": p.name, "size": p.stat().st_size}
                for p in sorted(DOWNLOADS_DIR.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True)
                if p.is_file()
            ]
            return self._send_json(files)
        m = re.match(r"^/files/([^/]+)$", path)
        if m:
            name = m.group(1)
            if name in (".", "..") or ".." in name:
                return self._send_json({"error": "bad name"}, 400)
            fp = DOWNLOADS_DIR / name
            if not fp.is_file():
                return self._send_json({"error": "not found"}, 404)
            data = fp.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Disposition", f"inline; filename*=UTF-8''{quote(name)}")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        return self._send_json({"error": "not found"}, 404)

    def do_POST(self) -> None:
        if urlparse(self.path).path != "/download":
            return self._send_json({"error": "not found"}, 404)
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, json.JSONDecodeError):
            return self._send_json({"error": "invalid JSON body"}, 400)
        url = str(body.get("url") or "").strip()
        if not url.startswith(("http://", "https://")):
            return self._send_json({"error": "url must start with http(s)"}, 400)
        job_id = start_job(url, bool(body.get("audio")))
        self._send_json({"id": job_id}, 201)


def serve(port: int) -> int:
    DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"video downloader UI on http://127.0.0.1:{port} (downloads → {DOWNLOADS_DIR})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")
    finally:
        server.server_close()
    return 0


def cli(urls: list[str], audio: bool) -> int:
    DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)
    rc = 0
    for url in urls:
        job_id = start_job(url, audio)
        job = JOBS[job_id]
        while job["status"] in ("queued", "downloading"):
            pct = f" {job['percent']}%" if job["percent"] is not None else ""
            print(f"\r{job['status']}{pct}   ", end="", flush=True)
            time.sleep(0.5)
        if job["status"] == "done":
            print(f"\n✓ {job['file']}")
        else:
            print(f"\n✗ {job['error']}")
            rc = 1
    return 0


def main() -> int:
    # Windows consoles default to cp1252 — force UTF-8 for status output.
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass
    args = [a for a in sys.argv[1:]]
    audio = "--audio" in args
    args = [a for a in args if a != "--audio"]
    if "--serve" in args:
        port = DEFAULT_PORT
        if "--port" in args:
            port = int(args[args.index("--port") + 1])
        return serve(port)
    args = [a for a in args if not a.startswith("--")]
    if not args:
        print(__doc__)
        return 1
    return cli(args, audio)


if __name__ == "__main__":
    raise SystemExit(main())
