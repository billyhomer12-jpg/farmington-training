#!/usr/bin/env python3
# Visual layout gate (Playwright): WebKit 375/390/430 (iPhone), Chromium 1280, against a LOCAL server of the working tree.
# Pages: all public pages + admin/ + admin/setup.html. Screenshots -> /workspace/web-team/evidence-private/visual/<ts>/ (never the repo).
# FAIL when:
#  bleed   - a full-bleed band (main>section with own background, .deal-bar, .hero, .ahero, .offer-tile) has rect left>0 or right<vw
#  hscroll - documentElement.scrollWidth > clientWidth
#  overlap - arrows (.scrollhint) or Book bar (.qbook) rects intersect a visible text line at page bottom (content that can never be scrolled clear)
#            (at load/mid, content still scrolls beneath fixed controls; reported as WARN only)
#  clear   - at page bottom, last text of main sits under the Book bar
#  color   - arrow/button computed bg/text/border colors outside the brand palette
#            (#34C759, #1E7B34, #000, #fff, transparent, plus the arrow colors read from the page as baseline at startup)
# Env: VISUAL_WIDTHS, VISUAL_PAGES, VISUAL_SOFT=1 (report but do not fail).
import sys, os, asyncio, datetime, subprocess, socket, time
sys.path.insert(0, os.path.dirname(__file__)); from _lib import *
from playwright.async_api import async_playwright
PUB=['index.html','availability.html','book.html','coaches.html','locations.html','member-signup.html','member.html','membership-terms.html','my.html','pricing.html','privacy.html','reschedule.html','reviews.html','waiver.html']
P=os.environ.get('VISUAL_PAGES',','.join(PUB+['admin/','admin/setup.html'])).split(',')
W=[int(x) for x in os.environ.get('VISUAL_WIDTHS','375,390,430,1280').split(',')]
TS=datetime.datetime.now().strftime('%Y%m%d-%H%M%S'); EV=f'/workspace/web-team/evidence-private/visual/{TS}'; os.makedirs(EV,exist_ok=True)
BRAND={'rgb(52, 199, 89)','rgb(30, 123, 52)','rgb(0, 0, 0)','rgb(255, 255, 255)'}
PROBE=r"""(mode)=>{const vw=document.documentElement.clientWidth,R=[];
 const vis=e=>{const s=getComputedStyle(e);return e.offsetParent!==null||s.position==='fixed'};
 const lines=[];const tw=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;
 while(n=tw.nextNode()){if(!n.textContent.trim())continue;const el=n.parentElement;if(!el||el.closest('.scrollhint,.qbook,script,style,noscript'))continue;const cs=getComputedStyle(el);if(cs.visibility==='hidden'||+cs.opacity===0||!vis(el))continue;
  const rg=document.createRange();rg.selectNodeContents(n);for(const t of rg.getClientRects()){if(t.width<=1||t.height<=1||t.bottom<0||t.top>innerHeight)continue;lines.push({t,s:n.textContent.trim().slice(0,24)})}}
 const ctl=[...document.querySelectorAll('.scrollhint,.qbook')].filter(vis).map(e=>({r:e.getBoundingClientRect(),c:e.classList.contains('qbook')?'bar':'arrow'}));
 const hits=[];for(const {t,s} of lines)for(const {r,c} of ctl)if(t.left<r.right&&t.right>r.left&&t.top<r.bottom&&t.bottom>r.top)hits.push(c+':"'+s+'"');
 const bleed=[...document.querySelectorAll('main>section,.deal-bar,.hero,.ahero,.offer-tile')].filter(e=>e.offsetParent!==null).filter(e=>{const s=getComputedStyle(e);return s.backgroundImage!=='none'||!/rgba\(0, 0, 0, 0\)|transparent/.test(s.backgroundColor)}).filter(e=>{const r=e.getBoundingClientRect();return r.height>0&&(r.left>0.5||r.right<vw-0.5)}).map(e=>e.tagName.toLowerCase()+'.'+String(e.className).split(' ')[0]);
 let clear=null;const q=document.querySelector('.qbook'),m=document.querySelector('main');
 if(mode==='bottom'&&q&&m&&getComputedStyle(q).position==='fixed'){const lb=lines.filter(x=>m.contains(document.elementFromPoint(1,1))||true).map(x=>x.t.bottom);const mt=[...m.querySelectorAll('*')].filter(e=>e.offsetParent&&!e.children.length&&e.textContent.trim()).map(e=>e.getBoundingClientRect().bottom);if(mt.length)clear=+(q.getBoundingClientRect().top-Math.max(...mt)).toFixed(1)}
 const col=[];for(const e of document.querySelectorAll('.scrollhint,.btn,.qbook a,button.btn')){if(!vis(e))continue;const s=getComputedStyle(e);col.push([e.className.toString().slice(0,30),s.backgroundColor,s.color,s.borderTopColor])}
 return {hs:document.documentElement.scrollWidth>document.documentElement.clientWidth,hits:[...new Set(hits)],bleed:[...new Set(bleed)],clear,col}}"""
def norm(c):
    c=c.strip()
    if c.startswith('rgba(') and c.endswith(', 0)'): return 'transparent'
    return c
def serve():
    s=socket.socket();s.bind(('127.0.0.1',0));port=s.getsockname()[1];s.close()
    pr=subprocess.Popen([sys.executable,'-m','http.server',str(port)],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1);return pr,f'http://127.0.0.1:{port}'
async def main():
    srv,base=(None,BASE) if os.environ.get('VERIFY_LOCAL') else serve()
    res={k:[] for k in ('bleed','hscroll','overlap','clear','color')};warn=[]
    try:
      async with async_playwright() as pw:
        wk=await pw.webkit.launch(); ch=await pw.chromium.launch()
        allowed=set(BRAND)|{'transparent'}
        # baseline arrow colors from the current page
        c=await ch.new_context(viewport={'width':1280,'height':800});pg=await c.new_page();await pg.goto(base+'/index.html');await pg.wait_for_timeout(600)
        for v in await pg.evaluate("()=>{const e=document.querySelector('.scrollhint');if(!e)return[];const s=getComputedStyle(e);return [s.backgroundColor,s.color,s.borderTopColor]}"): allowed.add(norm(v))
        await c.close(); print('arrow baseline:',sorted(allowed))
        for w in W:
          br=ch if w>=1000 else wk
          ctx=await br.new_context(**({'viewport':{'width':w,'height':800}} if w>=1000 else {'viewport':{'width':w,'height':844},'is_mobile':True,'has_touch':True,'device_scale_factor':2}))
          for p in P:
            page=await ctx.new_page();tag=f'{w} {p}'
            try:
              await page.goto(f'{base}/{p}',wait_until='load');await page.wait_for_timeout(700)
              await page.screenshot(path=f"{EV}/{w}-{p.replace('/','_') or 'admin'}.png",full_page=True)
              H=await page.evaluate('document.documentElement.scrollHeight')
              for mode,y in (('load',0),('mid',H/2),('bottom',10**7)):
                await page.evaluate(f'scrollTo(0,{y})');await page.wait_for_timeout(400 if mode=='bottom' else 200)
                if mode=='bottom': await page.evaluate('scrollTo(0,10**7)');await page.wait_for_timeout(200)
                r=await page.evaluate(PROBE,mode)
                if r['hs']: res['hscroll'].append(f'{tag} {mode}')
                if r['bleed'] and mode=='load': res['bleed'].append(f"{tag}: {', '.join(r['bleed'])}")
                if r['hits']: (res['overlap'] if mode=='bottom' else warn).append(f"{tag} {mode}: {' | '.join(r['hits'][:4])}")
                if r['clear'] is not None and r['clear']<0: res['clear'].append(f"{tag}: last content {r['clear']}px under bar")
                if mode=='load':
                  for cls,*cs in r['col']:
                    bad=[x for x in cs if norm(x) not in allowed]
                    if bad: res['color'].append(f"{tag} .{cls}: {', '.join(sorted(set(bad)))}")
            except Exception as e: res['hscroll'].append(f'{tag} ERROR {str(e)[:120]}')
            await page.close()
          await ctx.close()
        await wk.close();await ch.close()
    finally:
      if srv: srv.terminate()
    for k,v in res.items():
      if v:
        uniq=list(dict.fromkeys(v))
        fail(f'visual/{k}: {len(uniq)} issue(s)'); [print('   ',x) for x in uniq[:25]]
      else: ok(f'visual/{k}')
    for x in list(dict.fromkeys(warn))[:15]: print('WARN load/mid overlap (scrolls clear)', x)
    print('screenshots:',EV)
asyncio.run(main())
if os.environ.get('VISUAL_SOFT') and fails: print('VISUAL_SOFT=1: not failing'); fails.clear()
done('70-visual')
