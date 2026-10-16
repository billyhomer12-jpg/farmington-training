#!/usr/bin/env python3
# Prices + payment links (config.js on VERIFY_BASE, single source of truth) must match the committed read-only
# Stripe snapshot (tools/verify-fixtures/stripe-payment-links.json). Every buy.stripe.com link on public pages must be known.
# Monthly: window.SITE.MEMBERSHIP_PRICES must exist, match the Stripe recurring prices, and (render check 60) the Monthly cards.
# Live mode: if STRIPE_READ_KEY (a restricted READ-ONLY key) is set, the snapshot is re-read from the Stripe API (GET only).
import sys, os, re, json, urllib.request, base64
sys.path.insert(0, os.path.dirname(__file__)); from _lib import *
snap=json.load(open(os.path.join(ROOT,'tools/verify-fixtures/stripe-payment-links.json')))
key=os.environ.get('STRIPE_READ_KEY') or os.environ.get('STRIPE_API_KEY')
def sget(path):
    req=urllib.request.Request('https://api.stripe.com/v1/'+path,headers={'Authorization':'Basic '+base64.b64encode((key+':').encode()).decode()})
    return json.load(urllib.request.urlopen(req,timeout=20))
if key:
    links=[]
    for l in sget('payment_links?active=true&limit=100')['data']:
        li=sget(f"payment_links/{l['id']}/line_items")['data'][0]
        links.append(dict(url=l['url'],unit_amount=li['price']['unit_amount'],price=li['price']['id']))
    rec=[dict(price=p['id'],unit_amount=p['unit_amount'],interval=p['recurring']['interval'],nickname=p.get('nickname'),lookup_key=p.get('lookup_key')) for p in sget('prices?type=recurring&active=true&limit=100')['data']]
    print('INFO live Stripe readback'); snap={'links':links,'recurring_prices':rec}
else: print(f"INFO using snapshot {snap.get('snapshot_at')}")
byurl={l['url']:l['unit_amount'] for l in snap['links']}
S=site_config(); pk=S.get('packages',{}); pl=S.get('paymentLinks',{}); SL=sale_links(S)
for u in SL:
    if u in byurl: print(f"INFO sale link {u} = Stripe ${byurl[u]/100:g}")
    else: print(f"INFO sale link {u} allowed by config (not in snapshot; refresh snapshot to verify amount)")
for k,url in pl.items():
    want=pk.get(k,{}).get('price')
    if url not in byurl: fail(f"paymentLinks.{k} {url} not an active Stripe payment link")
    elif want is None or round(want*100)!=byurl[url]: fail(f"{k}: site ${want} != Stripe ${byurl[url]/100:g} ({url})")
    else: ok(f"{k}: ${want} == Stripe {url}")
for p in PAGES+['main.js','deals.js','pricing-tabs.js','my.js']:
    try: t=get(p)
    except Exception: continue
    for u in set(re.findall(r'https://buy\.stripe\.com/[A-Za-z0-9_]+',t)):
        if u not in byurl and u not in SL: fail(f"{p}: unknown Stripe link {u}")
mp=S.get('MEMBERSHIP_PRICES')
if not mp: fail("window.SITE.MEMBERSHIP_PRICES missing in config.js (monthly source of truth)")
else:
    vals=sorted(round(float(v.get('price',v.get('amount')) if isinstance(v,dict) else v)*100) for v in mp.values())
    rec=sorted(r['unit_amount'] for r in snap.get('recurring_prices',[]))
    if vals!=rec: fail(f"MEMBERSHIP_PRICES {[v/100 for v in vals]} != Stripe recurring prices {[r/100 for r in rec]}")
    else: ok(f"MEMBERSHIP_PRICES match Stripe recurring {[v/100 for v in vals]}")
done('stripe')
