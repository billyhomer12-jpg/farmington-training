import json,os
ids=json.load(open('live_ids.json')); key=open(os.environ['STRIPE_LIVE_KEY_FILE']).read().strip()
assert key.startswith(('sk_live_','rk_live_'))
print('MEMBERSHIP_LIVE_STRIPE_KEY='+key)
print('MEMBERSHIP_LIVE_WEBHOOK_SECRET='+open('live_whsec').read().strip())
print('MEMBERSHIP_LIVE_PRICES='+json.dumps(ids['prices'],separators=(',',':')))
print('MEMBERSHIP_LIVE_PORTAL_CONFIG='+ids['portal_config'])
