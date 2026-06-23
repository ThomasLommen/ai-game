#!/usr/bin/env python3
# No-cache static server for phone playtesting, with AUTOMATIC cache-busting + ON-THE-FLY
# SCRIPT BUNDLING.
#
# Two problems this solves:
#  1) Mobile browsers cache JS even with no-store headers, so a half-updated build silently
#     breaks. Fix: change the asset URL when content changes (?v=<mtime>), so the cache has
#     never seen it.
#  2) The game loads ~70 separate <script> files. The browser requests them all at once; over
#     the cloudflare quick tunnel that burst exceeds what the tunnel/origin can serve, so many
#     requests 502 -> a script silently fails to load -> a global is undefined -> the boot dies
#     ("empty box"). Fix: serve all local scripts as ONE concatenated bundle (3 requests total,
#     not ~70). Concatenation is in index.html order; a leading ';' guards against ASI hazards
#     between the IIFE modules. (Root cause of the 2026-06-20 empty-box bug.)
#
# file:// and the test harness still load the individual files (this bundling is server-only),
# so per-file debugging + `node --check` are unaffected.
#
#   python serve.py [port] [dir]    (defaults: 8777, this folder)
import http.server, socketserver, sys, os, re

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8777
DIRECTORY = sys.argv[2] if len(sys.argv) > 2 else os.path.dirname(os.path.abspath(__file__))
BUNDLE_PATH = '/__bundle.js'

SCRIPT_RE = re.compile(r'[ \t]*<script src="([^"]+)"></script>\n?')

def _path(url):
    return os.path.join(DIRECTORY, url.split('?', 1)[0].replace('/', os.sep))

def _is_local(url):
    return not url.startswith(('http://', 'https://', '//', 'data:'))

def local_scripts():
    """Ordered list of local <script src> URLs from index.html."""
    with open(os.path.join(DIRECTORY, 'index.html'), 'r', encoding='utf-8') as f:
        html = f.read()
    return [m.group(1) for m in SCRIPT_RE.finditer(html) if _is_local(m.group(1))]

def versioned_index():
    with open(os.path.join(DIRECTORY, 'index.html'), 'r', encoding='utf-8') as f:
        html = f.read()
    scripts = local_scripts()
    # max mtime across all bundled scripts -> the bundle's cache-bust version (edit any file -> busts).
    mt = 0
    for s in scripts:
        try: mt = max(mt, int(os.path.getmtime(_path(s))))
        except OSError: pass
    # Replace the whole run of local <script> tags with ONE bundle tag (at the first's spot).
    state = {'first': True}
    def repl(m):
        if not _is_local(m.group(1)):
            return m.group(0)
        if state['first']:
            state['first'] = False
            return '<script src="%s?v=%d"></script>\n' % (BUNDLE_PATH, mt)
        return ''
    html = SCRIPT_RE.sub(repl, html)
    # Cache-bust the stylesheet too.
    def css_repl(m):
        fp = _path(m.group(1))
        try: return 'href="%s?v=%d"' % (m.group(1), int(os.path.getmtime(fp)))
        except OSError: return m.group(0)
    html = re.sub(r'href="([^"]+\.css)"', css_repl, html)
    return html.encode('utf-8')

def build_bundle():
    parts = []
    for s in local_scripts():
        try:
            with open(_path(s), 'r', encoding='utf-8') as f:
                src = f.read()
        except OSError:
            continue
        # Leading ';' + newline guards against ASI gluing two IIFEs (`})()` + `(`).
        parts.append('\n;\n/* ==== %s ==== */\n%s' % (s, src))
    return ''.join(parts).encode('utf-8')

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=DIRECTORY, **k)
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()
    def _send(self, body, ctype):
        try:
            self.send_response(200)
            self.send_header('Content-Type', ctype)
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass   # the phone aborted mid-load; harmless with a threading server
    def do_GET(self):
        clean = self.path.split('?', 1)[0]
        if clean in ('/', '/index.html'):
            return self._send(versioned_index(), 'text/html; charset=utf-8')
        if clean == BUNDLE_PATH:
            return self._send(build_bundle(), 'application/javascript; charset=utf-8')
        try:
            return super().do_GET()   # SimpleHTTPRequestHandler strips ?v=... when resolving the file
        except (BrokenPipeError, ConnectionResetError):
            pass
    def log_message(self, *a):
        pass

# THREADING server so a load (index + bundle + css) is never serialized behind a slow client.
class ThreadingServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

with ThreadingServer(('127.0.0.1', PORT), Handler) as httpd:
    print('cache-busting BUNDLING server: http://127.0.0.1:%d  (serving %s)' % (PORT, DIRECTORY), flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
