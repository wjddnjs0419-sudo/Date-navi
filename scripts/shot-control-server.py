#!/usr/bin/env python3
"""스크린샷 제어 서버. 앱의 ScreenshotNavigator 가 /route 를 폴링한다.
캡처 스크립트가 /set?p=<route> 로 목표 라우트를 바꾼다."""
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs, unquote

STATE = {"route": "IDLE"}


class Handler(BaseHTTPRequestHandler):
    def _send(self, body: str):
        data = body.encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        u = urlparse(self.path)
        if u.path == "/route":
            self._send(STATE["route"])
        elif u.path == "/set":
            q = parse_qs(u.query)
            STATE["route"] = unquote(q.get("p", ["IDLE"])[0])
            self._send("ok:" + STATE["route"])
        else:
            self._send("IDLE")

    def log_message(self, *args):
        pass  # 조용히


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8099
    HTTPServer(("127.0.0.1", port), Handler).serve_forever()
