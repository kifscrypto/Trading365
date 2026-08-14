"""Tiny local ops API — stdlib ``http.server`` only, port 4173 (env OPS_API_PORT).

Endpoints:
  GET /api/<collection>    → JSON array (content, tasks, inbox, outreach, ...)
  PUT /api/<collection>    → replace the collection from the request body
  GET /api/briefing/latest → newest briefing file
  GET /api/traffic/latest  → newest traffic snapshot

CORS is wide open (``Access-Control-Allow-Origin: *``) for the local dashboard.
"""

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from ops import config, store

DEFAULT_PORT = 4173


class OpsHandler(BaseHTTPRequestHandler):
    server_version = "OpsAPI/1.0"

    # -- helpers --------------------------------------------------------------

    def _send_json(self, data: Any, status: int = 200) -> None:
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"  {self.address_string()} {fmt % args}")

    # -- routes -----------------------------------------------------------------

    def do_OPTIONS(self) -> None:
        self._send_json({})

    def do_GET(self) -> None:
        path = self.path.split("?", 1)[0].strip("/")
        parts = path.split("/")
        if len(parts) < 2 or parts[0] != "api":
            return self._send_json({"error": "not found"}, 404)
        if parts[1:] == ["briefing", "latest"]:
            data = store.latest_briefing()
            return self._send_json(data if data is not None else {"error": "no briefing yet"}, 200 if data else 404)
        if parts[1:] == ["traffic", "latest"]:
            data = store.latest_traffic()
            return self._send_json(data if data is not None else {"error": "no traffic snapshot yet"}, 200 if data else 404)
        if len(parts) == 2 and parts[1] in store.COLLECTIONS:
            return self._send_json(store.load(parts[1]))
        return self._send_json({"error": "not found"}, 404)

    def do_PUT(self) -> None:
        path = self.path.split("?", 1)[0].strip("/")
        parts = path.split("/")
        if len(parts) != 2 or parts[0] != "api" or parts[1] not in store.COLLECTIONS:
            return self._send_json({"error": "not found"}, 404)
        try:
            length = int(self.headers.get("Content-Length", "0"))
            items = json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, json.JSONDecodeError):
            return self._send_json({"error": "invalid JSON body"}, 400)
        if not isinstance(items, list):
            return self._send_json({"error": "body must be a JSON array"}, 400)
        store.save(parts[1], items)
        self._send_json({"ok": True, "count": len(items)})


def main() -> int:
    port = int(config.get("OPS_API_PORT") or DEFAULT_PORT)
    server = ThreadingHTTPServer(("127.0.0.1", port), OpsHandler)
    print(f"ops api listening on http://127.0.0.1:{port} (data dir: {config.DATA_DIR})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nops api stopped")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
