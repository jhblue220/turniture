"""Tiny static server for local preview:  python3 serve.py  ->  http://localhost:4173"""
import os, http.server, socketserver, functools

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = 4173


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # never cache while developing, so a reload always shows the latest edit
        self.send_header("Cache-Control", "no-store")
        # the scroll film is seeked, not played, and a browser will not seek a
        # film the server cannot serve a slice of
        self.send_header("Accept-Ranges", "bytes")
        super().end_headers()

    def do_GET(self):
        """Serve one byte range when asked for one.

        `SimpleHTTPRequestHandler` answers every request with the whole file,
        Range header or not. A browser reads that as "this cannot be seeked"
        and reports `video.seekable` as empty, so `currentTime` goes nowhere
        and a scroll-driven film sits on frame one. GitHub Pages serves ranges
        and so does every real host; this is only so that the preview here
        behaves like the live site.
        """
        rng = self.headers.get("Range", "")
        path = self.translate_path(self.path)
        if not rng.startswith("bytes=") or not os.path.isfile(path):
            return super().do_GET()

        size = os.path.getsize(path)
        first, _, last = rng[6:].partition("-")
        try:
            if first:
                start = int(first)
                end = int(last) if last else size - 1
            else:                                   # bytes=-500, the last 500
                start, end = max(0, size - int(last)), size - 1
        except ValueError:
            return super().do_GET()

        start, end = max(0, start), min(end, size - 1)
        if start > end:
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.end_headers()
            return

        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        try:
            with open(path, "rb") as f:
                f.seek(start)
                left = end - start + 1
                while left > 0:
                    chunk = f.read(min(1 << 16, left))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    left -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass                                    # the tab moved on; nothing to do


class Server(socketserver.ThreadingTCPServer):
    # One request at a time was fine with a single film on the page. With two
    # of them preloading, the second waits for the first to finish downloading
    # and the page never finishes loading at all.
    allow_reuse_address = True
    daemon_threads = True


os.chdir(ROOT)
with Server(("127.0.0.1", PORT), functools.partial(Handler, directory=ROOT)) as httpd:
    print(f"serving {ROOT} on http://localhost:{PORT}", flush=True)
    httpd.serve_forever()
