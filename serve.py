"""Tiny static server for local preview:  python3 serve.py  ->  http://localhost:4173"""
import os, http.server, socketserver, functools

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = 4173


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # never cache while developing, so a reload always shows the latest edit
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


class Server(socketserver.TCPServer):
    allow_reuse_address = True


os.chdir(ROOT)
with Server(("127.0.0.1", PORT), functools.partial(Handler, directory=ROOT)) as httpd:
    print(f"serving {ROOT} on http://localhost:{PORT}", flush=True)
    httpd.serve_forever()
