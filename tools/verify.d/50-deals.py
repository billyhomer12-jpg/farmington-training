#!/usr/bin/env python3
# Deals config invariants (config.js on VERIFY_BASE), checked in BOTH states: LAUNCH_AT as deployed and
# LAUNCH_AT=2026-10-16T18:15-06:00 (override with VERIFY_LAUNCH_AT_SIM). Rendered-copy rules live in 60-render.py.
# Optional: reads training.deals via the public anon/publishable key only (never service_role); SKIP if not exposed.
import sys, os, re, json, urllib.request
from datetime import datetime, timedelta
sys.path.insert(0, os.path.dirname(__file__)); from _lib import *
src=get('config.js'); SIM=os.environ.get('VERIFY_LAUNCH_AT_SIM','2026-10-16T18:15:00-06:00')
def iso(s): return datetime.fromisoformat(s.replace('Z','+00:00'))
alt='null' if eval_config(src).get('LAUNCH_AT') else SIM
for label,L in (('deployed',None),('LAUNCH_AT='+alt,alt)):
    S=eval_config(src,L); pk=S.get('packages',{}); deals=S.get('deals',[])
    tiers=set((S.get('MEMBERSHIP_PRICES') or {}).keys())|{'single'}
    print(f"-- state {label}: LAUNCH_AT={S.get('LAUNCH_AT')} PRELAUNCH_AT={S.get('PRELAUNCH_AT')}")
    win=[]
    for d in deals:
        i=d['id']; live=d.get('status') in ('approved','live')
        if i=='grand-opening-2026' and not S.get('PRELAUNCH_AT') and d.get('start_at'): fail(f"{label} {i}: can render while PRELAUNCH_AT is null")
        if live and (not d.get('start_at') or not d.get('end_at')): print(f"INFO {i}: start/end null, deals.js will not render it"); continue
        if not live: continue
        if is_discount(d):
            pc=pct_of(d)
            if pc is None or not 0<pc<=20: fail(f"{label} {i}: discount {pc}% not in (0,20]")
            reg=regular_prices(S); sp=sale_prices(S,d)
            unk=[k for k in d.get('eligible_packages',[]) if k not in reg]
            if unk: fail(f"{label} {i}: unknown eligible packages {unk}")
            for k,v in sp.items():
                if k not in reg or reg[k] is None: fail(f"{label} {i}: sale price for unknown package {k}"); continue
                want=rnd(reg[k]*(1-(pc or 0)/100))
                if round(float(v))!=want: fail(f"{label} {i}: {k} sale ${v} != round(${reg[k]}x{1-(pc or 0)/100:g}) = ${want}")
            if pc: ok(f"{label} {i}: {pc:g}% off, {len(sp)} sale prices checked")
        else:
            bad=[k for k in d.get('eligible_packages',[]) if k in tiers or pk.get(k,{}).get('sessions')==1 or k not in pk]
            if bad: fail(f"{label} {i}: value_add eligible_packages includes single/membership/unknown {bad}")
        a,b=iso(d['start_at']),iso(d['end_at']); days=(b-a)/timedelta(days=1)
        if not 3<=days<=10.0001: fail(f"{label} {i}: duration {days:.2f} days outside 3-10")
        else: ok(f"{label} {i}: {a.isoformat()} -> {b.isoformat()} ({days:.2f} d), eligible ok")
        if not S.get('LAUNCH_AT') and (d.get('countdown') or d.get('countdown_hours')): fail(f"{label} {i}: countdown enabled while LAUNCH_AT null")
        if not S.get('LAUNCH_AT') and i=='grand-opening-2026' and '72' in (d.get('banner_text','')+d.get('fine_print','')): fail(f"{label} {i}: 72h copy while LAUNCH_AT null")
        if d.get('offer_type')=='value_add' and d.get('price_display'): fail(f"{label} {i}: value_add deal sets price_display")
        if d.get('offer_type')=='value_add' and (d.get('price_override') or d.get('sale_prices') or d.get('promo_code')): fail(f"{label} {i}: value_add deal changes price/promo")
        if i=='grand-opening-2026' and re.search(r'founding family|free 5th session',json.dumps(d),re.I): fail(f"{label} {i}: still has 'Founding Family'/'free 5th session' copy")
        if d.get('countdown_hours') and d['countdown_hours']>days*24+0.01: fail(f"{label} {i}: countdown window {d['countdown_hours']}h longer than the deal window")
        if i=='grand-opening-2026' and S.get('LAUNCH_AT'):
            exp=b if is_discount(d) else min(iso(S['LAUNCH_AT'])+timedelta(hours=72),iso(S['PRELAUNCH_AT'])+timedelta(days=10))
            if b!=exp: fail(f"{label} {i}: effective end {b} != min(LAUNCH_AT+72h,cap) {exp}")
            if S['LAUNCH_AT'].startswith('2026-10-16T18:15') and b!=iso('2026-10-19T18:15:00-06:00'): fail(f"{label} {i}: end {b} != 2026-10-19T18:15-06:00")
            else: ok(f"{label} {i}: effective end {b.astimezone(iso(S['PRELAUNCH_AT']).tzinfo).isoformat()}")
        win.append((a,b,i))
    win.sort()
    for (a1,b1,i1),(a2,b2,i2) in zip(win,win[1:]):
        if a2<b1: fail(f"{label}: deal windows overlap {i1} / {i2}")
S=eval_config(src)
try:
    req=urllib.request.Request(S['supabaseUrl']+'/rest/v1/deals?select=id,start_at,end_at,status',headers={'apikey':S['supabaseKey'],'Accept-Profile':'training'})
    rows=json.load(urllib.request.urlopen(req,timeout=15)); print(f"INFO training.deals (anon): {rows}")
    for r in rows:
        if r.get('status') in ('approved','live') and r.get('start_at') and r.get('end_at'):
            days=(iso(r['end_at'])-iso(r['start_at']))/timedelta(days=1)
            if not 3<=days<=10.0001: fail(f"training.deals {r['id']}: duration {days:.2f} d outside 3-10")
except Exception as e: print(f"SKIP training.deals: no public anon read path ({str(e)[:60]})")
done('deals')
