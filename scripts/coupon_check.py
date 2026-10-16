#!/usr/bin/env python3
"""TEST mode: checkout session gets GRANDOPEN20 inside window (or not outside); first invoice 20% off, renewal full price."""
import json,time,requests,sys,os
K=open('/workspace/.secrets/stripe_test_secret_key').read().strip(); assert K.startswith(('sk_test_','rk_test_'))
IDS=json.load(open('/workspace/mem-test/ids.json')); EXPECT=os.environ.get('EXPECT_DISCOUNT','auto')
def call(m,p,d=None):
    j=requests.request(m,'https://api.stripe.com/v1/'+p,auth=(K,''),data=None if m=='GET' else d,params=d if m=='GET' else None).json()
    if 'error' in j: raise RuntimeError(p+': '+j['error'].get('message','')); 
    assert j.get('livemode') in (False,None); return j
R=[]; chk=lambda n,ok,d='': (R.append(ok),print('PASS' if ok else 'FAIL',n,d,flush=True))
starts=json.load(open(os.environ.get('STARTS','/tmp/starts.json')))
r=requests.post('https://jrcozcrfbjcsuqkmoaki.supabase.co/functions/v1/membership-checkout-test',json={'tier':'1on1_monthly','email':'gate-coupon@example.com','athlete':'Gate Coupon','parent':'Gate Parent','starts':starts,'origin':'https://fourcornershoopsandperformance.com'}).json()
url=r.get('url',''); sid=url.split('/pay/')[-1].split('#')[0] if '/pay/' in url else None
s=call('GET','checkout/sessions/'+sid) if sid else {}
inwin=time.time()>=time.mktime(time.strptime('2026-10-16 17:40','%Y-%m-%d %H:%M')) and time.time()<time.mktime(time.strptime('2026-10-19 18:15','%Y-%m-%d %H:%M'))
want=(EXPECT=='yes') or (EXPECT=='auto' and inwin)
chk(f'checkout session {"has" if want else "has no"} GRANDOPEN20 ($%s due)'%('192' if want else '240'), s.get('amount_total')==(19200 if want else 24000), f"amount_total={s.get('amount_total')} err={r.get('error')}")
clk=call('POST','test_helpers/test_clocks',{'frozen_time':int(time.time()),'name':'GATE coupon'})['id']
try:
    cu=call('POST','customers',{'email':'gate-coupon@example.com','test_clock':clk,'payment_method':'pm_card_visa','invoice_settings[default_payment_method]':'pm_card_visa'})
    sub=call('POST','subscriptions',{'customer':cu['id'],'items[0][price]':IDS['1on1_monthly']['price'],'discounts[0][coupon]':'GRANDOPEN20','metadata[tier]':'1on1_monthly','metadata[athlete]':'Gate Coupon'})
    i1=call('GET','invoices/'+sub['latest_invoice']); chk('first invoice $192 (20% off once)',i1['amount_paid']==19200,f"${i1['amount_paid']/100}")
    call('POST',f'test_helpers/test_clocks/{clk}/advance',{'frozen_time':sub['items']['data'][0]['current_period_end']+3600})
    for _ in range(60):
        if call('GET',f'test_helpers/test_clocks/{clk}')['status']=='ready': break
        time.sleep(3)
    inv=[x for x in call('GET','invoices',{'subscription':sub['id'],'limit':5})['data'] if x['id']!=i1['id']]
    chk('renewal invoice full $240',bool(inv) and inv[0]['amount_due']==24000,f"${inv[0]['amount_due']/100}" if inv else 'none')
finally: call('DELETE','test_helpers/test_clocks/'+clk)
sys.exit(0 if all(R) else 1)
