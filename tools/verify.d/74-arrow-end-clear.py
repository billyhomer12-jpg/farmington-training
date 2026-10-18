#!/usr/bin/env python3
# REGRESSION GUARD (ARROWS238): scrolled to END of every public page + back-office tab, the fixed scroll arrows cover no content
# (320/375/390/430/768/1280, WebKit); and no horizontal overflow at 320 (page or any element wider than the viewport).
import sys, os, asyncio
sys.path.insert(0, os.path.dirname(__file__)); from _lib import *
src=open(os.path.join(os.path.dirname(__file__),'71-visual-items.py')).read()
exec(src[:src.index('def serve')]); exec(src[src.index('def serve'):src.index('async def main')])
from playwright.async_api import async_playwright
PUB=PAGES+['member.html','member-signup.html','admin/setup.html']
COVER="""()=>{window.scrollTo(0,document.documentElement.scrollHeight);return new Promise(res=>setTimeout(()=>{
const A=[...document.querySelectorAll('.scrollhint')].filter(a=>getComputedStyle(a).display!='none').map(a=>a.getBoundingClientRect()).filter(r=>r.width>0);
const hit=[];const all=document.querySelectorAll('body *');
for(const e of all){if(e.closest('.scrollhint')||e.closest('[hidden]'))continue;const s=getComputedStyle(e);if(s.visibility=='hidden'||s.position=='fixed'||e.closest('.qbook'))continue;
 let leaf=false;for(const n of e.childNodes){if(n.nodeType==3&&n.textContent.trim()){leaf=true;break}}
 if(!leaf&&!/^(INPUT|SELECT|TEXTAREA|BUTTON|IMG|svg|CANVAS)$/.test(e.tagName))continue;
 const r=e.getBoundingClientRect();if(!r.width||!r.height)continue;
 for(const a of A){if(r.left<a.right-1&&r.right>a.left+1&&r.top<a.bottom-1&&r.bottom>a.top+1){hit.push((e.textContent||e.tagName).trim().slice(0,12)||e.tagName);break}}}
res({n:A.length,hit:[...new Set(hit)].slice(0,4)})},350))}"""
OVF="""()=>{const vw=document.documentElement.clientWidth;const o=[];if(document.documentElement.scrollWidth>vw+0.5)o.push('page '+(document.documentElement.scrollWidth-vw)+'px');
for(const e of document.querySelectorAll('body *')){if(e.closest('.scrollhint'))continue;let p=e.parentElement,clip=false;while(p&&p!==document.body){const ox=getComputedStyle(p).overflowX;if(ox!='visible'){clip=true;break}p=p.parentElement}if(clip)continue;
const r=e.getBoundingClientRect();if(r.width&&r.right>vw+0.5)o.push((e.id?'#'+e.id:e.tagName)+' '+Math.round(r.right-vw)+'px')}return [...new Set(o)].slice(0,4)}"""
async def login(p,base):
    await p.goto(f'{base}/admin/');await p.wait_for_timeout(800)
    await p.evaluate("()=>{em.value='qa@example.com';pin.value='0000';document.getElementById('login').requestSubmit()}");await p.wait_for_timeout(1500)
    return await p.evaluate("document.body.classList.contains('authed')")
async def main():
    srv,base=(None,BASE) if os.environ.get('VERIFY_LOCAL') else serve()
    shots=os.environ.get('ARROWS_SHOTS')
    try:
      async with async_playwright() as pw:
        br=await pw.webkit.launch()
        for w in (320,375,390,430,768,1280):
          ctx=await br.new_context(**({'viewport':{'width':w,'height':844},'is_mobile':True,'has_touch':True} if w<1000 else {'viewport':{'width':w,'height':800}}))
          await ctx.route('**/*',route); p=await ctx.new_page()
          for pg in PUB:
            await p.goto(f'{base}/{pg}');await p.wait_for_timeout(900)
            if w==320:
              o=await p.evaluate(OVF)
              if o: fail(f'320 {pg}: overflow {o}')
            r=await p.evaluate(COVER)
            if r['hit']: fail(f'{w} {pg} end: arrows cover {r["hit"]}')
            if shots and pg in ('index.html','availability.html','reviews.html'): await p.screenshot(path=f'{shots}/{w}-pub-{pg.replace("/","_")}-end.png')
          if not await login(p,base): fail(f'{w}: admin login (mock) failed'); continue
          for tab in await p.evaluate("[...document.querySelectorAll('[data-tab]')].map(b=>b.dataset.tab)"):
            try: await p.click(f'[data-tab="{tab}"]',timeout=3000)
            except Exception: continue
            await p.wait_for_timeout(500)
            if w==320:
              o=await p.evaluate(OVF)
              if o: fail(f'320 bo {tab}: overflow {o}')
            r=await p.evaluate(COVER)
            if r['hit']: fail(f'{w} bo {tab} end: arrows cover {r["hit"]}')
            if shots: await p.screenshot(path=f'{shots}/{w}-bo-{tab}-end.png')
          await ctx.close()
        await br.close()
    finally:
      if srv: srv.terminate()
asyncio.run(main())
if not fails: ok('arrows clear content at page end on all pages/tabs 320-1280; no overflow at 320')
done('74-arrow-end-clear')
