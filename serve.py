"""Tiny static server for local preview:  python3 serve.py  ->  http://localhost:4173"""
import os, http.server, socketserver, functools

ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)
handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
with socketserver.TCPServer(("127.0.0.1", 4173), handler) as httpd:
    print("serving", ROOT, "on http://localhost:4173", flush=True)
    httpd.serve_forever()
