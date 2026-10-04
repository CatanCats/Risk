"""Turn index.html into a body fragment for the hosted (claude.ai artifact) copy.

Usage: python3 scripts/build-artifact.py <out.html>
"""
import re, sys
html = open('index.html').read()
html = re.sub(r'<!doctype html>|</?html[^>]*>|</?head>|</?body>|<meta [^>]*>', '', html, flags=re.I)
open(sys.argv[1], 'w').write(html.strip() + '\n')
