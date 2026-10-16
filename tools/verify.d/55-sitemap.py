#!/usr/bin/env python3
# Sitemap (Web Growth): every <loc> in sitemap.xml returns 200, has a non-empty <title> and meta description
# (either attribute order), and does not contain 'Text us to join'. For --local runs, locs are rewritten onto VERIFY_BASE.
import sys, os, re, html, urllib.request, urllib.parse, urllib.error
sys.path.insert(0, os.path.dirname(__file__)); from _lib import *
try: sm=get('sitemap.xml')
except Exception as e: fail(f"sitemap.xml: {e}"); done('sitemap')
locs=[html.unescape(x.strip()) for x in re.findall(r'<loc>\s*(.*?)\s*</loc>',sm,re.S)]
if not locs: fail("sitemap.xml has no <loc> entries")
for u in locs:
    fu=u
    if os.environ.get('VERIFY_LOCAL'): fu=BASE+(urllib.parse.urlparse(u).path or '/')
    try:
        with urllib.request.urlopen(urllib.request.Request(fu,headers={'User-Agent':'fc-verify'}),timeout=20) as r:
            code=r.status; t=r.read().decode('utf-8','replace')
    except urllib.error.HTTPError as e: fail(f"{u}: HTTP {e.code}"); continue
    except Exception as e: fail(f"{u}: fetch error {e}"); continue
    if code!=200: fail(f"{u}: HTTP {code}"); continue
    why=[]
    m=re.search(r'<title[^>]*>(.*?)</title>',t,re.S|re.I)
    if not m or not html.unescape(m.group(1)).strip(): why.append('missing/empty <title>')
    desc=''
    for tag in re.findall(r'<meta\b[^>]*>',t,re.I):
        if re.search(r'\bname\s*=\s*["\']?description\b',tag,re.I):
            c=re.search(r'\bcontent\s*=\s*(?:"([^"]*)"|\'([^\']*)\')',tag,re.I); desc=(c.group(1) or c.group(2) or '') if c else ''
    if not html.unescape(desc).strip(): why.append('missing/empty meta description')
    if re.search(r'text\s+us\s+to\s+join',html.unescape(t),re.I): why.append("contains 'Text us to join'")
    if why: fail(f"{u}: "+'; '.join(why))
    else: ok(u)
done('sitemap')
