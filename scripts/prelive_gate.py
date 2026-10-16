#!/usr/bin/env python3
"""Pre-live gate (TEST mode only). Exit 0 only if every check passes. Never prints secrets."""
import json,time,requests,sys,os,re
K=open(os.environ.get('STRIPE_TEST_KEY_FILE','/workspace/.secrets/stripe_test_secret_key')).read().strip()
if not K.startswith(('sk_test_','rk_test_')): sys.exit('gate: test key is not a test-mode key')
T=open('/workspace/.sbtoken').read().strip(); REF='jrcozcrfbjcsuqkmoaki'
IDS=json.load(open(os.environ.get('MEM_IDS','/workspace/mem-test/ids.json')))
FN='https://%s.supabase.co/functions/v1/membership-webhook-test'%REF
def call(m,p,d=None):
    j=requests.request(m,'https://api.stripe.com/v1/'+p,auth=(K,''),data=None if m=='GET' else d,params=d if m=='GET' else None).json()
    if 'error' in j: raise RuntimeError(p+': '+j['error'].get('message',''))
    assert j.get('livemode') in (False,None),'LIVEMODE OBJECT'
    return j
def sql(q): return requests.post(f'https://api.supabase.com/v1/projects/{REF}/database/query',headers={'Authorization':'Bearer '+T},json={'query':q}).json()
R=[]
def chk(name,ok,detail=''):
    R.append(ok); print(('PASS' if ok else 'FAIL'),name,detail,flush=True)
def adv(clk,t):
    call('POST',f'test_helpers/test_clocks/{clk}/advance',{'frozen_time':int(t)})
    for _ in range(100):
        if call('GET',f'test_helpers/test_clocks/{clk}')['status']=='ready': break
        time.sleep(3)
    time.sleep(15)
def wait_row(S,n=10):
    for _ in range(n):
        r=sql(f"select id from memberships where stripe_subscription_id='{S}'")
        if isinstance(r,list) and r: return r[0]['id']
        time.sleep(3)
# 1 webhook signature / duplicate / mode (HTTP + deployed-code + DB constraint)
r=requests.post(FN,data=json.dumps({'id':'evt_gate_bad','livemode':False,'type':'ping'}),headers={'stripe-signature':'t=1,v1=deadbeef','content-type':'application/json'})
chk('webhook bad signature -> 400',r.status_code==400,'got %d'%r.status_code)
r=requests.post(FN,data='{}',headers={'content-type':'application/json'})
chk('webhook missing signature -> 400',r.status_code==400,'got %d'%r.status_code)
src=open(os.path.join(os.path.dirname(__file__),'..','supabase/functions/membership-webhook-test/index.ts')).read()
chk('wrong-mode events ignored (guard before any write)', src.find('ev.livemode !== KEY_LIVE')!=-1 and src.find('ev.livemode !== KEY_LIVE')<src.find('stripe_events_processed'))
u=sql("select count(*) n from pg_indexes where tablename='stripe_events_processed' and indexdef ilike '%unique%' and indexdef ilike '%event_id%'")
chk('duplicate events skipped (unique event_id + insert-first guard)', isinstance(u,list) and int(u[0]['n'])>=1 and 'if (dup) return' in src, str(u))
# 1b test monthly prices == config.js (single source)
import subprocess
pr=subprocess.run(['node',os.path.join(os.path.dirname(os.path.abspath(__file__)),'config_plans.mjs')],capture_output=True,text=True)
if pr.returncode: chk('config.js monthly plans present',False,pr.stderr.strip())
else:
    for t,v in json.loads(pr.stdout).items():
        p=call('GET','prices/'+IDS[t]['price']); chk(f'test price {t} == config ${v["price"]}/mo',p['unit_amount']==round(v['price']*100) and p['recurring']['interval']=='month',f"${p['unit_amount']/100}")
# MEMBQA-B: open-group signup picks count against allowance (race-safe recount) + server refuses over-allowance
cu=call('POST','customers',{'email':'gate-og@example.com','payment_method':'pm_card_visa','invoice_settings[default_payment_method]':'pm_card_visa'})
sub=call('POST','subscriptions',{'customer':cu['id'],'items[0][price]':IDS['open_group_monthly']['price'],'metadata[tier]':'open_group_monthly','metadata[athlete]':'Gate OG'}); S=sub['id']
mid=wait_row(S); time.sleep(8)
sql(f"insert into membership_sessions(membership_id,starts_at,period_start) select '{mid}', now()+(g||' days')::interval, null from generate_series(2,5) g")
sql(f"select membership_recount('{mid}')")
a=sql(f"select sessions_used u, greatest(0,sessions_granted-sessions_used) pr from memberships where id='{mid}'")[0]
chk('open-group signup picks counted: 4 used, 0 plan remaining',a['u']==4 and a['pr']==0,str(a))
sql(f"update memberships set token_hash=training.token_hash('gate'||repeat('x',40)) where id='{mid}'")
e=sql(f"select membership_pick('gate'||repeat('x',40), now()+interval '9 days') r")
chk('server refuses 5th open-group pick',isinstance(e,list) and 'error' in str(e[0]['r']),str(e)[:120])
call('DELETE','subscriptions/'+S)
# MEMBQA-A: switch button swap works on current origin/main (span/any [data-tier])
import tempfile,shutil
d=tempfile.mkdtemp(); subprocess.run(['git','show','origin/main:pricing.html'],stdout=open(d+'/pricing.html','w'),check=True)
for f in ['config.js','member-signup.html','member.html']: shutil.copy(f,d)
r2=subprocess.run(['python3',os.path.abspath(os.path.join(os.path.dirname(__file__),'live_frontend_swap.py'))],cwd=d,capture_output=True,text=True)
ph=open(d+'/pricing.html').read(); shutil.rmtree(d)
chk('live swap turns all 3 monthly [data-tier] buttons into Start membership links',r2.returncode==0 and ph.count('>Start membership</a>')==3 and 'soonbtn' not in ph,(r2.stderr or '').strip()[-120:])
pv=open('pricing.html').read()
chk('preview binding targets any [data-tier]','querySelectorAll("[data-tier]")' in pv and 'e.replaceWith(a)' in pv)
# 2 test-clock renewal, rollover cap 2, reschedule reset, cancel at period end
clk=call('POST','test_helpers/test_clocks',{'frozen_time':int(time.time()),'name':'PRELIVE-GATE renewal'})['id']
try:
    cu=call('POST','customers',{'email':'gate-renew@example.com','test_clock':clk,'payment_method':'pm_card_visa','invoice_settings[default_payment_method]':'pm_card_visa'})
    sub=call('POST','subscriptions',{'customer':cu['id'],'items[0][price]':IDS['1on1_monthly']['price'],'metadata[tier]':'1on1_monthly','metadata[athlete]':'Gate Athlete'}); S=sub['id']
    mid=wait_row(S)
    q=lambda: sql(f"select sessions_granted g,sessions_used u,rollover r,reschedules_used rs,payment_failed pf,status,cancel_at_period_end c,is_test from memberships where stripe_subscription_id='{S}'")[0]
    a=q(); chk('signup row created (test, 4 granted)',bool(mid) and a['g']==4 and a['is_test'] in (True,'true'),str(a))
    sql(f"update memberships set sessions_used=1, reschedules_used=1 where id='{mid}'")  # 3 left
    adv(clk,sub['items']['data'][0]['current_period_end']+3600)
    b=q(); chk('renewal: rollover capped at 2, granted 4, used 0',b['r']==2 and b['g']==4 and b['u']==0,str(b))
    chk('renewal: reschedule count reset',b['rs']==0,str(b))
    call('POST',f'subscriptions/{S}',{'cancel_at_period_end':'true'}); time.sleep(12)
    c=q(); chk('cancel at period end: still active, flagged canceling',c['c'] in (True,'true') and c['status']=='active',str(c))
    pc=call('GET','billing_portal/configurations/'+IDS['portal_config'])
    cm=pc['features']['subscription_cancel']
    chk('portal config: cancel enabled at period end',cm['enabled'] and cm['mode']=='at_period_end',cm['mode'])
finally:
    try: call('DELETE','test_helpers/test_clocks/'+clk)
    except Exception as e: print('note: clock cleanup',e)
# 3 reschedule limit
rl=sql("select pg_get_functiondef(p.oid) d from pg_proc p where proname ilike '%reschedul%' limit 3")
chk('reschedule limit enforced in DB function',isinstance(rl,list) and any('reschedules_used' in x['d'] for x in rl),'%d fn'%(len(rl) if isinstance(rl,list) else -1))
# 4 failed payment then recovery
clk=call('POST','test_helpers/test_clocks',{'frozen_time':int(time.time()),'name':'PRELIVE-GATE failed payment'})['id']
try:
    cu=call('POST','customers',{'email':'gate-fail@example.com','test_clock':clk,'payment_method':'pm_card_visa','invoice_settings[default_payment_method]':'pm_card_visa'})
    sub=call('POST','subscriptions',{'customer':cu['id'],'items[0][price]':IDS['open_group_monthly']['price'],'metadata[tier]':'open_group_monthly','metadata[athlete]':'Gate Athlete 2'}); S=sub['id']
    mid=wait_row(S)
    q=lambda: sql(f"select sessions_granted g,sessions_used u,rollover r,reschedules_used rs,payment_failed pf,status from memberships where stripe_subscription_id='{S}'")[0]
    sql(f"update memberships set reschedules_used=1, sessions_used=4 where id='{mid}'")
    pm=call('POST','payment_methods',{'type':'card','card[token]':'tok_chargeCustomerFail'}); call('POST',f"payment_methods/{pm['id']}/attach",{'customer':cu['id']}); call('POST',f"customers/{cu['id']}",{'invoice_settings[default_payment_method]':pm['id']})
    adv(clk,sub['items']['data'][0]['current_period_end']+3600)
    a=q(); chk('failed payment: past_due + flagged',a['status']=='past_due' and a['pf'] in (True,'true'),str(a))
    pm2=call('POST','payment_methods',{'type':'card','card[token]':'tok_visa'}); call('POST',f"payment_methods/{pm2['id']}/attach",{'customer':cu['id']}); call('POST',f"customers/{cu['id']}",{'invoice_settings[default_payment_method]':pm2['id']})
    inv=call('GET','invoices',{'subscription':S,'status':'open','limit':1})['data']
    if inv: call('POST',f"invoices/{inv[0]['id']}/pay",{'payment_method':pm2['id']}); time.sleep(15)
    b=q(); chk('recovery: active, flag cleared, sessions granted, reschedules reset',b['status']=='active' and b['pf'] in (False,'false') and b['u']==0 and b['rs']==0,str(b))
finally:
    try: call('DELETE','test_helpers/test_clocks/'+clk)
    except Exception as e: print('note: clock cleanup',e)
cr=subprocess.run(['python3',os.path.join(os.path.dirname(os.path.abspath(__file__)),'coupon_check.py')],capture_output=True,text=True)
print(cr.stdout.strip()); chk('coupon GRANDOPEN20: window-gated checkout, $192 first invoice, $240 renewal',cr.returncode==0)
print('GATE RESULT:', 'PASS' if all(R) else 'FAIL', f'{sum(R)}/{len(R)}')
sys.exit(0 if all(R) else 1)
