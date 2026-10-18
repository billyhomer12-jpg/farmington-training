#!/usr/bin/env python3
# CSS integrity gate: every stylesheet must parse with all rules intact.
#  - brace depth returns to 0, never negative; no unterminated comment
#  - no line ends mid-declaration followed by a comment/selector (truncated paste, e.g. 'width:100/* ...')
#  - local HTML references one consistent ?v= on every page and admin asset (cache bust actually bumped)
import sys, os, re, glob
sys.path.insert(0, os.path.dirname(__file__)); from _lib import *
for f in ['style.css']+[p for p in glob.glob(os.path.join(ROOT,'*.css')) if not p.endswith('style.css')]:
    p=f if os.path.isabs(f) else os.path.join(ROOT,f); s=open(p,encoding='utf-8').read(); n=os.path.basename(p)
    t=re.sub(r'/\*.*?\*/','',s,flags=re.S)
    if '/*' in t: fail(f'{n}: unterminated comment')
    t=re.sub(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'','""',t)
    d=0;bad=None
    for i,ch in enumerate(t):
        d+=(ch=='{')-(ch=='}')
        if d<0 and bad is None: bad=i
    if d!=0: fail(f'{n}: brace depth {d} at end of file (truncated or unclosed rule)')
    elif bad is not None: fail(f'{n}: stray closing brace')
    else: ok(f'{n}: braces balanced ({s.count("{")} rules/blocks)')
    for ln,l in enumerate(s.split('\n'),1):
        if re.search(r':[^;{}]*[0-9a-z%)]\s*/\*',l) and not re.search(r';\s*/\*|\}\s*/\*|\{\s*/\*',l): fail(f'{n}:{ln}: declaration runs into a comment (truncated line?)')
vs=set()
for h in glob.glob(os.path.join(ROOT,'*.html'))+glob.glob(os.path.join(ROOT,'admin','*.html')):
    vs|=set(re.findall(r'\.(?:css|js)\?v=(\d+)',open(h,encoding='utf-8').read()))
if len(vs)>1: fail(f'mixed asset versions in HTML: {sorted(vs)}')
else: ok(f'asset version consistent: v={",".join(vs)}')
done('15-css-integrity')
