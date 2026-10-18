#!/usr/bin/env python3
# Input fit gate: with date/time fields FILLED, every input/select/textarea right edge <= its card's right edge
# and <= viewport, in WebKit at 375/390/430 and Chromium at 1280. Back office (Block time + Gym closures, unlocked with a
# local RPC mock: no PIN, no writes) and the booking form. Also asserts date/time inputs are not native-appearance
# (iOS Safari gives native date/time an intrinsic min width that real iPhones show past the card).
import sys, os, asyncio, json, subprocess, socket, time, datetime
sys.path.insert(0, os.path.dirname(__file__)); from _lib import *
from playwright.async_api import async_playwright
T=datetime.datetime.now().replace(hour=17,minute=0,second=0,microsecond=0).astimezone().isoformat()
MOCK={'coach_data':{'name':'TEST','signups':[],'requests':[],'blocks':[],'closures':[]},'coach_waivers':{'waivers':[],'needed':{},'athletes':{}}}
PROBE=r"""(sel)=>{const E=[];const vw=document.documentElement.clientWidth;
 for(const i of document.querySelectorAll(sel)){if(!i.offsetParent)continue;if(i.type==='date')i.value='2026-10-28';if(i.type==='time')i.value='12:30'}
 for(const i of document.querySelectorAll(sel)){if(!i.offsetParent||/checkbox|radio|hidden/.test(i.type))continue;const r=i.getBoundingClientRect();const c=(i.closest('.card,form,fieldset')||document.body).getBoundingClientRect();
  if(r.right>c.right+0.5||r.right>vw+0.5)E.push('#'+(i.id||i.name)+' right '+Math.round(r.right)+' > card '+Math.round(Math.min(c.right,vw)));
  if(/date|time/.test(i.type)&&getComputedStyle(i).webkitAppearance!=='none'&&getComputedStyle(i).appearance!=='none')E.push('#'+(i.id||i.name)+' native date/time appearance')}
 return E}"""
def serve():
    s=socket.socket();s.bind(('127.0.0.1',0));port=s.getsockname()[1];s.close()
    pr=subprocess.Popen([sys.executable,'-m','http.server',str(port)],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1);return pr,f'http://127.0.0.1:{port}'
async def route(r):
    for k,v in MOCK.items():
        if k in r.request.url: return await r.fulfill(status=200,content_type='application/json',body=json.dumps(v))
    if r.request.method in ('GET','HEAD','OPTIONS'): return await r.continue_()
    return await r.fulfill(status=200,content_type='application/json',body='{}')
async def main():
    srv,base=(None,BASE) if os.environ.get('VERIFY_LOCAL') else serve()
    try:
      async with async_playwright() as pw:
        wk=await pw.webkit.launch();ch=await pw.chromium.launch()
        for w in (375,390,430,1280):
          br=ch if w>1000 else wk
          ctx=await br.new_context(**({'viewport':{'width':w,'height':800}} if w>1000 else {'viewport':{'width':w,'height':844},'is_mobile':True,'has_touch':True}))
          await ctx.route('**/*',route);p=await ctx.new_page()
          await p.goto(base+'/book.html?package=group2');await p.wait_for_timeout(900)
          for e in await p.evaluate(PROBE,'#booking-root input,#booking-root select,#booking-root textarea'): fail(f'{w} book: {e}')
          await p.goto(base+'/admin/');await p.wait_for_timeout(500)
          await p.evaluate("()=>{em.value='qa@example.com';pin.value='0000';document.getElementById('login').requestSubmit()}");await p.wait_for_timeout(1200)
          if await p.evaluate("document.body.classList.contains('authed')"):
            await p.click('[data-tab="t-block"]');await p.wait_for_timeout(300)
            for e in await p.evaluate(PROBE,'#t-block input,#t-block select'): fail(f'{w} admin block time: {e}')
          else: fail(f'{w} admin: mock unlock failed')
          await ctx.close()
        await wk.close();await ch.close()
    finally:
      if srv: srv.terminate()
asyncio.run(main())
if not fails: ok('inputs fit their cards (filled date/time) at 375/390/430/1280')
done('72-input-fit')
