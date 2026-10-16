#!/usr/bin/env python3
# Secret scan over tracked files. Allows pk_ / sb_publishable_ keys and Supabase anon JWTs.
import re, subprocess, base64, json, sys, os
sys.path.insert(0, os.path.dirname(__file__)); from _lib import *
files=subprocess.run(['git','-C',ROOT,'ls-files'],capture_output=True,text=True).stdout.split()
pat=re.compile(r'(sk_(?:live|test)_[A-Za-z0-9]{10,}|rk_(?:live|test)_[A-Za-z0-9]{10,}|whsec_[A-Za-z0-9]{10,}|sb_secret_[A-Za-z0-9_\-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)')
jwt=re.compile(r'eyJ[A-Za-z0-9_\-]{10,}\.(eyJ[A-Za-z0-9_\-]+)\.[A-Za-z0-9_\-]+')
n=0
for f in files:
    p=os.path.join(ROOT,f)
    if not os.path.isfile(p) or os.path.getsize(p)>3_000_000: continue
    try: t=open(p,encoding='utf-8').read()
    except Exception: continue
    n+=1
    for m in pat.finditer(t): fail(f"{f}: secret-like token {m.group(1)[:8]}… (value not printed)")
    for m in jwt.finditer(t):
        try: role=json.loads(base64.urlsafe_b64decode(m.group(1)+'==')).get('role')
        except Exception: role='?'
        if role!='anon': fail(f"{f}: JWT with role={role} (only anon allowed)")
    if re.search(r'service_role["\']?\s*[:=]\s*["\']ey',t): fail(f"{f}: hard-coded service_role key")
if not fails: ok(f"no secrets in {n} tracked files")
done('secrets')
