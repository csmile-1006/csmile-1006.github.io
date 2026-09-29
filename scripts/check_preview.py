#!/usr/bin/env python3
"""Check the read-only preview server: python3 scripts/check_preview.py."""

import http.client
import socket
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread

from serve import PreviewHandler


class QuietHandler(PreviewHandler):
    def log_message(self, *args):
        pass


def check():
    with TemporaryDirectory() as directory:
        root = Path(directory)
        (root / "index.html").write_text("Homepage")
        (root / "accrue").mkdir()
        (root / "accrue/index.html").write_text("ACCRUE")
        payload = bytes(range(256)) * 1024
        (root / "video.mp4").write_bytes(payload)
        (root / "empty.mp4").write_bytes(b"")
        handler = partial(QuietHandler, directory=directory)
        with ThreadingHTTPServer(("127.0.0.1", 0), handler) as server:
            worker = Thread(target=server.serve_forever, daemon=True)
            worker.start()

            def request(method="GET", path="/video.mp4", headers=None):
                connection = http.client.HTTPConnection(*server.server_address, timeout=5)
                try:
                    connection.request(method, path, headers=headers or {})
                    response = connection.getresponse()
                    return response.status, dict((k.lower(), v) for k, v in response.getheaders()), response.read()
                finally:
                    connection.close()

            try:
                status, headers, body = request()
                assert status == 200 and body == payload
                assert headers["content-length"] == str(len(payload))
                assert headers["accept-ranges"] == "bytes"
                assert headers["content-type"] == "video/mp4"
                modified = headers["last-modified"]
                status, headers, body = request("HEAD")
                assert status == 200 and not body and int(headers["content-length"]) == len(payload)
                status, headers, body = request("HEAD", headers={"Range": "bytes=1-3"})
                assert status == 200 and not body and int(headers["content-length"]) == len(payload)
                assert request(path="/")[2] == b"Homepage"
                status, headers, body = request(path="/accrue?view=all")
                assert status == 301 and headers["location"] == "/accrue/?view=all" and not body
                assert request(path="/accrue/")[2] == b"ACCRUE"

                for value, start, end in [("bytes=2-5", 2, 5), ("bytes=65500-131200", 65500, 131200),
                                          ("bytes=100-", 100, len(payload) - 1),
                                          ("bytes=-7", len(payload) - 7, len(payload) - 1),
                                          ("bytes=0-999999", 0, len(payload) - 1),
                                          ("bytes=-999999", 0, len(payload) - 1)]:
                    status, headers, body = request(headers={"Range": value})
                    assert status == 206 and body == payload[start:end + 1], value
                    assert headers["content-range"] == f"bytes {start}-{end}/{len(payload)}"
                    assert int(headers["content-length"]) == end - start + 1
                for value in ["bytes=262144-", "bytes=9-3", "bytes=-0", "bytes=-", "bytes=oops", "bytes=0-1,4-5"]:
                    status, headers, body = request(headers={"Range": value})
                    assert status == 416 and not body, value
                    assert headers["content-range"] == f"bytes */{len(payload)}"
                    assert headers["content-length"] == "0"
                status, headers, body = request(path="/empty.mp4")
                assert status == 200 and headers["content-length"] == "0" and not body
                for value in ["bytes=0-", "bytes=-1"]:
                    status, headers, body = request(path="/empty.mp4", headers={"Range": value})
                    assert status == 416 and headers["content-range"] == "bytes */0" and not body
                status, _, body = request(headers={"Range": "bytes=1-3", "If-Range": modified})
                assert status == 206 and body == payload[1:4]
                for mismatch in ['"unrecognized-etag"', "Thu, 01 Jan 1970 00:00:00 GMT"]:
                    status, _, body = request(headers={"Range": "bytes=1-3", "If-Range": mismatch})
                    assert status == 200 and body == payload
                assert request(headers={"Range": "items=0-1"})[0] == 200
                assert request(headers={"If-Modified-Since": modified})[0] == 304
                assert request(path="/missing.mp4", headers={"Range": "bytes=1-3"})[0] == 404
                assert request("POST", "/api/content-overrides")[0] == 501

                # Read to EOF to catch extra bytes hidden by a correct Content-Length.
                with socket.create_connection(server.server_address, timeout=5) as connection:
                    connection.sendall(b"GET /video.mp4 HTTP/1.0\r\nHost: localhost\r\nRange: bytes=65500-131200\r\n\r\n")
                    with connection.makefile("rb") as response:
                        raw = response.read()
                assert raw.split(b"\r\n\r\n", 1)[1] == payload[65500:131201]
                assert (root / "video.mp4").read_bytes() == payload
            finally:
                server.shutdown()
                worker.join()
    print("OK: preview GET/HEAD, redirects, byte ranges, conditional ranges, bounded copies, and read-only behavior.")


if __name__ == "__main__":
    check()
