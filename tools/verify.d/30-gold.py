#!/usr/bin/env python3
# No gold colors in public CSS/HTML/JS (fetched from VERIFY_BASE): known gold hexes + any hex in the gold hue band.
import re, sys, os, colorsys
sys.path.insert(0, os.path.dirname(__file__)); from _lib import *
KNOWN={'c5b358','d4af37','ffd700','cfb53b','b8860b','daa520','e6be8a','c9a227','b29700','ffc300','f4c430','e5c100'}
def gold(h):
    h=h.lower()
    if len(h)==3: h=''.join(c*2 for c in h)
    if len(h)==8: h=h[:6]
    if h in KNOWN: return True
    r,g,b=(int(h[i:i+2],16)/255 for i in (0,2,4)); H,L,S=colorsys.rgb_to_hls(r,g,b)
    return 40<=H*360<=56 and S>=0.45 and 0.3<=L<=0.7
for f in PAGES+['style.css','main.js','deals.js','pricing-tabs.js','config.js']:
    try: t=get(f)
    except Exception as e: fail(f"{f}: fetch {e}"); continue
    for m in set(re.findall(r'#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b',t)):
        if gold(m): fail(f"{f}: gold color #{m}")
    for m in set(re.findall(r'\b(gold|goldenrod)\b(?=\s*[;}"\)!])',t,re.I)): fail(f"{f}: named color {m}")
if not fails: ok("no gold colors")
done('gold')
