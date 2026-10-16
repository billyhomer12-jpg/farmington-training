# shared helpers for verify.d python checks
import os, re, sys, urllib.request, json, subprocess
BASE=os.environ.get('VERIFY_BASE','https://fourcornershoopsandperformance.com').rstrip('/')
ROOT=os.environ.get('VERIFY_ROOT',os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..'))); OUT=os.environ.get('VERIFY_OUT','/tmp/verify-out')
PAGES=['index.html','pricing.html','coaches.html','locations.html','reviews.html','book.html','availability.html','membership-terms.html','privacy.html','waiver.html','reschedule.html','my.html']
fails=[]
def fail(m): fails.append(m); print('FAIL', m)
def ok(m): print('PASS', m)
def get(path):
    u=path if path.startswith('http') else f"{BASE}/{path}?vfy={os.getpid()}"
    with urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'fc-verify','Cache-Control':'no-cache'}),timeout=20) as r: return r.read().decode('utf-8','replace')
def site_config():
    """Evaluate config.js (from BASE) in node; optional LAUNCH_AT override. Returns window.SITE as JSON."""
    src=get('config.js'); return eval_config(src)
def eval_config(src, launch_at=None):
    js=("const vm=require('vm');const fs=require('fs');let s=fs.readFileSync(0,'utf8');"
        "const L=process.argv[1];if(L)s=s.replace(/window\\.SITE\\.LAUNCH_AT\\s*=\\s*[^;]+;/,'window.SITE.LAUNCH_AT='+(L==='null'?'null':JSON.stringify(L))+';');"
        "const w={location:{search:'',hostname:'x'},document:{},navigator:{}};w.window=w;vm.createContext(w);vm.runInContext(s,w);"
        "process.stdout.write(JSON.stringify(w.SITE))")
    r=subprocess.run(['node','-e',js,launch_at or ''],input=src,capture_output=True,text=True)
    if r.returncode: raise RuntimeError(r.stderr[-500:])
    return json.loads(r.stdout)
def done(name):
    print(f"{name}: {'FAIL ('+str(len(fails))+')' if fails else 'PASS'}"); sys.exit(1 if fails else 0)

import math
def pct_of(d):
    for k in ('percent_off','discount_pct','percent','pct_off','discount_percent'):
        if d.get(k) is not None: return float(d[k])
    return None
def is_discount(d): return d.get('offer_type') in ('percent_off','discount','percent','sale') or pct_of(d) is not None
def rnd(x): return math.floor(x+0.5)
def regular_prices(S):
    r={k:v.get('price') for k,v in (S.get('packages') or {}).items()}
    r.update({k:(v.get('price') if isinstance(v,dict) else v) for k,v in (S.get('MEMBERSHIP_PRICES') or {}).items()})
    return r
def sale_prices(S,d):
    out=dict(d.get('sale_prices') or {})
    for src in (S.get('packages') or {}, S.get('MEMBERSHIP_PRICES') or {}):
        for k,v in src.items():
            if isinstance(v,dict) and v.get('sale_price') is not None: out.setdefault(k,v['sale_price'])
    return out
def sale_links(S):
    u=set()
    for d in S.get('deals') or []:
        v=d.get('sale_links') or d.get('sale_link') or {}
        u|=set(v.values()) if isinstance(v,dict) else ({v} if isinstance(v,str) else set(v))
    for src in (S.get('packages') or {}, S.get('MEMBERSHIP_PRICES') or {}, S.get('sale_links') or {}):
        for k,v in src.items():
            if isinstance(v,dict) and v.get('sale_link'): u.add(v['sale_link'])
            elif isinstance(v,str) and v.startswith('https://'): u.add(v)
    return u
