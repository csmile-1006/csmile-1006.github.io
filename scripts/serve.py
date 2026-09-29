#!/usr/bin/env python3
"""Preview the static site at http://127.0.0.1:8000, including video seeking."""

import os
import re
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class PreviewHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Accept-Ranges", "bytes")
        super().end_headers()

    def send_head(self):
        self.remaining = None
        requested = self.headers.get("Range", "").strip()
        path = self.translate_path(self.path)
        # Let the standard handler own redirects, indexes, caching, and HEAD.
        if (self.command != "GET" or not requested.startswith("bytes=")
                or not os.path.isfile(path) or path.endswith("/")
                or "If-Modified-Since" in self.headers or "If-None-Match" in self.headers):
            return super().send_head()
        try:
            source = open(path, "rb")
        except OSError:
            self.send_error(404, "File not found")
            return None
        try:
            stat = os.fstat(source.fileno())
            size = stat.st_size
            modified = self.date_time_string(stat.st_mtime)
            if self.headers.get("If-Range") not in (None, modified):
                source.close()
                return super().send_head()
            match = re.fullmatch(r"bytes=(\d*)-(\d*)", requested)
            try:
                if not match or not any(match.groups()):
                    raise ValueError
                first, last = match.groups()
                start = int(first) if first else max(0, size - int(last))
                end = min(size - 1, int(last)) if first and last else size - 1
                if start >= size or start > end or (not first and int(last) == 0):
                    raise ValueError
            except ValueError:
                source.close()
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{size}")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return None
            source.seek(start)
            self.remaining = end - start + 1
            self.send_response(206)
            self.send_header("Content-Type", self.guess_type(path))
            self.send_header("Content-Length", str(self.remaining))
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            self.send_header("Last-Modified", modified)
            self.end_headers()
            return source
        except Exception:
            source.close()
            raise

    def copyfile(self, source, output):
        try:
            if self.remaining is None:
                return super().copyfile(source, output)
            while self.remaining:
                chunk = source.read(min(65536, self.remaining))
                if not chunk:
                    break
                output.write(chunk)
                self.remaining -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass  # Browsers cancel media requests when switching videos.


if __name__ == "__main__":
    handler = partial(PreviewHandler, directory=str(ROOT))
    with ThreadingHTTPServer(("127.0.0.1", 8000), handler) as server:
        print(f"Serving {ROOT} at http://127.0.0.1:8000/", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
