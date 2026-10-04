"""Turn index.html into a body fragment for the hosted (claude.ai artifact) copy.

Module URLs get a content hash (through an import map) so a browser never
mixes a fresh page with stale cached modules after a republish.

Usage: python3 scripts/build-artifact.py <out.html>
"""
import hashlib, json, pathlib, re, sys

html = open('index.html').read()
html = re.sub(r'<!doctype html>|</?html[^>]*>|</?head>|</?body>|<meta [^>]*>', '', html, flags=re.I)

modules = sorted(pathlib.Path('src').glob('*.js'))
version = lambda p: hashlib.sha1(p.read_bytes()).hexdigest()[:10]
imports = {f'./{p.as_posix()}': f'./{p.as_posix()}?v={version(p)}' for p in modules}
importmap = '<script type="importmap">' + json.dumps({'imports': imports}) + '</script>\n'
loadcheck = ('<script>window.addEventListener("error",function(e){var t=e.target;'
             'if(t&&t.tagName==="SCRIPT"||/import|export|module/i.test(e.message||"")){var s=document.getElementById("side");'
             'if(s)s.innerHTML="<section class=\\"panel\\"><p class=\\"err\\">The game failed to load. Reload the page.</p></section>";}},true);</script>\n')
html = html.replace('<script type="module" src="src/ui.js"></script>',
                    importmap + loadcheck + f'<script type="module" src="{imports["./src/ui.js"]}"></script>')
open(sys.argv[1], 'w').write(html.strip() + '\n')
