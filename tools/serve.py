#!/usr/bin/env python3
# Local dev server for www/ - like "python3 -m http.server", but with
# "Cache-Control: no-cache": without that header, browsers guess how long to
# cache files and often keep serving the old version after code or data
# changes (JS modules, vokabeln.json).
import functools
import http.server
import pathlib
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8567
WWW = pathlib.Path(__file__).resolve().parent.parent / 'www'


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


handler = functools.partial(NoCacheHandler, directory=str(WWW))
with http.server.ThreadingHTTPServer(('', PORT), handler) as server:
    print(f'Serving {WWW} on http://localhost:{PORT}/')
    server.serve_forever()
