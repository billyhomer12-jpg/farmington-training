#!/usr/bin/env python3
"""READ-ONLY check of the live memberships key: account, mode, and write scopes (probed with invalid/no-op requests). Never prints the key."""
import os,sys,requests
F=os.environ.get('STRIPE_LIVE_KEY_FILE','/workspace/.secrets/stripe_live_memberships_key'); K=open(F).read().strip()
print('key type:', K[:8].rstrip('_') if K.startswith(('sk_live_','rk_live_')) else 'NOT A LIVE KEY'); 
def r(m,p,d=None): x=requests.request(m,'https://api.stripe.com/v1/'+p,auth=(K,''),data=d); return x.status_code,x.json()
c,j=r('GET','account'); print('account:', j.get('id') if c==200 else f'{c} {j.get("error",{}).get("message","")[:120]}')
ok=c==200 and j.get('id')=='acct_1UR0vSRpcc5zZV0D'
# write-scope probes: POST with a missing/invalid required param -> 400 means scope OK, 403 means missing permission. Nothing is created.
for name,p,d in [('products write','products',{}),('prices write','prices',{}),('portal config write','billing_portal/configurations',{}),('webhook endpoints write','webhook_endpoints',{}),('subscriptions read','subscriptions?limit=1',None),('customers read','customers?limit=1',None),('checkout sessions write','checkout/sessions',{})]:
    c,j=r('POST' if d is not None else 'GET',p,d); good=c in (200,400); ok&=good
    print(f'{"PASS" if good else "FAIL"} {name}: {c} {"" if good else j.get("error",{}).get("message","")[:100]}')
print('LIVE KEY CHECK:', 'PASS' if ok else 'FAIL'); sys.exit(0 if ok else 1)
