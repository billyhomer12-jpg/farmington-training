#!/usr/bin/env python3
# Rendered checks (Playwright Chromium) on all public pages at 320/375/390/440/768/1024/1280:
#  - visible text truncated by text-overflow:ellipsis / line-clamp, or a literal '...' / '…' in visible copy
#  - CLS > 0.1 (layout-shift entries without recent input, 3s after load)
#  - pricing #groups: .gsize 2/3/4 segments unequal (>1px) or .gind indicator width != segment width
#  - banned content (visible text + link hrefs): weightlifting/weight training, social links, 'Text us to join'
#  - weight-room note outside locations.html / the index FAQ (.faq)
#  - deals: 72h/'Ends in'/countdown copy before now>=LAUNCH_AT or outside the deal window; banner shown for a deal with null start
#  - Monthly cards ($/mo) == window.SITE.MEMBERSHIP_PRICES (when present)
# Failure screenshots go to $VERIFY_OUT/shots. VERIFY_WIDTHS / VERIFY_PAGES override the matrix.
import sys, os, re, asyncio, json, urllib.parse
sys.path.insert(0, os.path.dirname(__file__)); from _lib import *
from playwright.async_api import async_playwright
W=[int(x) for x in os.environ.get('VERIFY_WIDTHS','320,375,390,440,768,1024,1280').split(',')]
P=os.environ.get('VERIFY_PAGES',','.join(PAGES)).split(',')
SHOTS=os.path.join(OUT,'shots'); os.makedirs(SHOTS,exist_ok=True)
BANNED=[(r'\bweight\s*-?\s*lifting\b|\blifting weights\b|\bweight training\b|\bbarbell|\bsquat rack|\bpowerlifting|\bolympic lift','weightlifting content'),
        (r'text\s+us\s+to\s+join',"'Text us to join'")]
SOCIAL=re.compile(r'(tiktok\.com|instagram\.com|facebook\.com|fb\.com|//(www\.)?x\.com|twitter\.com|youtube\.com|youtu\.be)',re.I)
INIT="""window.__cls=0;new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.__cls+=e.value}).observe({type:'layout-shift',buffered:true});"""
PROBE=r"""() => {
 const vis=e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return s.visibility!=='hidden'&&s.display!=='none'&&r.width>0&&r.height>0&&!e.closest('[hidden],[aria-hidden=true],details:not([open])>:not(summary)')};
 const sel=e=>e.tagName.toLowerCase()+(e.id?'#'+e.id:'')+(e.className&&typeof e.className==='string'?'.'+e.className.trim().split(/\s+/).join('.'):'');
 const trunc=[],dots=[],wr=[];
 for(const e of document.body.querySelectorAll('*')){ if(!vis(e))continue; const s=getComputedStyle(e);
   if(e.textContent.trim()&&((s.textOverflow==='ellipsis'&&e.scrollWidth>e.clientWidth+1)||(s.webkitLineClamp&&s.webkitLineClamp!=='none'&&e.scrollHeight>e.clientHeight+1))) trunc.push(sel(e)+': '+e.textContent.trim().slice(0,60)); }
 const tw=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;
 while(n=tw.nextNode()){const p=n.parentElement;if(!p||['SCRIPT','STYLE','NOSCRIPT'].includes(p.tagName)||!vis(p))continue;const t=n.textContent;
   if(/\.\.\.|…/.test(t))dots.push(sel(p)+': '+t.trim().slice(0,80));
   if(/weight\s*room/i.test(t))wr.push({faq:!!p.closest('.faq'),s:sel(p)});}
 const inputs=[...document.querySelectorAll('input,textarea')].filter(vis).map(i=>i.placeholder||'').filter(x=>/\.\.\.|…/.test(x));
 const links=[...document.querySelectorAll('a[href]')].map(a=>a.href);
 let g=null;const gs=document.querySelector('.gsize');
 if(gs&&vis(gs)){const ls=[...gs.querySelectorAll('label')].map(l=>l.getBoundingClientRect().width);const ind=gs.querySelector('.gind');g={ls,ind:ind&&vis(ind)?ind.getBoundingClientRect().width:null};}
 const S=window.SITE||{},D=window.DEALS||{},bn=document.querySelector('.deal-banner,[class*=deal-bar],#deal-banner,.dealbar');
 const num=t=>{const m=(t||'').replace(/,/g,'').match(/\$\s?(\d+(?:\.\d+)?)/);return m?parseFloat(m[1]):null};
 const months=[...new Set(document.querySelectorAll('#panel-monthly .amt, #memberships .amt'))].map(a=>{const c=a.cloneNode(true);
   c.querySelectorAll('.sr-only,.visually-hidden,.per,.first,[aria-hidden=true]').forEach(x=>x.remove());
   const w=c.querySelector('s,del,.was,.regular'),nw=c.querySelector('.now,.sale,ins');
   const was=w?num(w.textContent):null; if(w)w.remove();
   const now=nw?num(nw.textContent):num(c.textContent);
   return was!=null?{reg:was,sale:now}:{reg:now,sale:null};});
 return {trunc,dots:dots.concat(inputs.map(x=>'placeholder: '+x)),wr,links,g,text:document.body.innerText,cls:window.__cls,
   launch:S.LAUNCH_AT||null,mp:S.MEMBERSHIP_PRICES||null,active:D.active?{id:D.active.id,start:D.active.start_at,end:D.active.end_at,vadd:D.active.offer_type==='value_add'}:null,
   banner:bn&&vis(bn)?bn.innerText:null,months};
}"""
STRUCK=r"""() => {
 const vis=e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return s.visibility!=='hidden'&&s.display!=='none'&&r.width>0&&r.height>0&&!e.closest('[hidden],[aria-hidden=true],details:not([open])>:not(summary),.deal-banner')};
 const struck=e=>{for(let x=e;x&&x!==document.body;x=x.parentElement){if(/line-through/.test(getComputedStyle(x).textDecorationLine)||['DEL','S'].includes(x.tagName))return true}return false};
 const hasStruck=e=>[...e.querySelectorAll('*')].some(x=>vis(x)&&struck(x)&&/\$\s?\d/.test(x.textContent));
 const out=[];const tw=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;
 while(n=tw.nextNode()){const p=n.parentElement,t=n.textContent.trim();if(!p||!vis(p)||['SCRIPT','STYLE'].includes(p.tagName))continue;
  if(!/^\$\s?\d[\d,]*(\.\d\d)?$/.test(t)||struck(p))continue;
  let c=p,okk=false;for(let i=0;i<3&&c;i++,c=c.parentElement){if(hasStruck(c)){okk=true;break}}
  if(!okk)out.push(t+' in '+p.tagName.toLowerCase()+(p.className?'.'+String(p.className).split(' ')[0]:''));}
 return out;}"""
async def run_one(br,page,w,sem):
    async with sem:
        ctx=await br.new_context(viewport={'width':w,'height':844 if w<761 else 900},device_scale_factor=1); await ctx.add_init_script(INIT)
        pg=await ctx.new_page(); url=f"{BASE}/{page}?vfy=1"+('#groups' if page=='pricing.html' else '')
        tag=f"{page}@{w}"; bad=[]
        try:
            r=await pg.goto(url,wait_until='load',timeout=30000)
            if not r or r.status!=200: bad.append(f"HTTP {r.status if r else '?'}")
            await pg.wait_for_timeout(3000); d=await pg.evaluate(PROBE)
            for t in d['trunc'][:3]: bad.append(f"ellipsis truncation {t}")
            for t in d['dots'][:3]: bad.append(f"literal ellipsis in copy {t}")
            if d['cls']>0.1: bad.append(f"CLS {d['cls']:.3f} > 0.1")
            if page=='pricing.html':
                g=d['g']
                if not g: bad.append(".gsize not visible on #groups")
                else:
                    if max(g['ls'])-min(g['ls'])>1: bad.append(f".gsize segments unequal {[round(x,1) for x in g['ls']]}")
                    if g['ind'] is not None and abs(g['ind']-g['ls'][0])>1: bad.append(f".gind {g['ind']:.1f}px != segment {g['ls'][0]:.1f}px")
                if d['mp'] and w==390:
                    want=sorted(round(float(v.get('price',v.get('amount')) if isinstance(v,dict) else v)) for v in d['mp'].values())
                    # regular price from <s>/<del>/.was (or the plain amount), sale from .now; sr-only Was/now text ignored
                    got=sorted(round(m['reg']) for m in d['months'] if m['reg'] is not None)
                    if want!=got: bad.append(f"Monthly cards regular {got} != MEMBERSHIP_PRICES {want}")
                    if d['active'] and not d['active'].get('vadd'):
                        wsale=sorted(round(float(v['sale'])) for v in d['mp'].values() if isinstance(v,dict) and v.get('sale') is not None)
                        gsale=sorted(round(m['sale']) for m in d['months'] if m['sale'] is not None)
                        if wsale and wsale!=gsale: bad.append(f"Monthly cards sale {gsale} != MEMBERSHIP_PRICES sale {wsale}")
            for rx,why in BANNED:
                m=re.search(rx,d['text'],re.I)
                if m: bad.append(f"banned {why}: '{m.group(0)}'")
            for l in d['links']:
                if SOCIAL.search(l): bad.append(f"social link {l}"); break
            for x in d['wr']:
                if not (page=='locations.html' or (page=='index.html' and x['faq'])): bad.append(f"weight-room note outside Locations/FAQ at {x['s']}")
            now=await pg.evaluate("Date.now()")/1000
            from datetime import datetime
            L=d['launch']; Lt=datetime.fromisoformat(L).timestamp() if L else None
            if re.search(r'72\s*hours|\bEnds in\b|countdown',d['text'],re.I) and (Lt is None or now<Lt): bad.append("72h/'Ends in' copy before LAUNCH_AT")
            if re.search(r'\bEnds in\b',d['text']):
                a=d['active']; inwin=a and a['start'] and a['end'] and datetime.fromisoformat(a['start'].replace('Z','+00:00')).timestamp()<=now<datetime.fromisoformat(a['end'].replace('Z','+00:00')).timestamp()
                if not inwin: bad.append("countdown shown outside the deal window")
            if re.search(r'founding family|free 5th session',d['text'],re.I) and not (d['active'] and d['active'].get('vadd')): bad.append("'Founding Family'/'free 5th session' copy shown")
            if re.search(r'\b\d{1,2}\s*%\s*off\b',d['text'],re.I) and Lt and now<Lt: bad.append("sale (% off) shown before LAUNCH_AT on a normal visit")
            if d['banner'] and d['active'] and not d['active']['start']: bad.append("deal banner shown for deal with null start_at")
        except Exception as e: bad.append(f"error {str(e)[:120]}")
        if bad:
            shot=os.path.join(SHOTS,f"{page.replace('.html','')}-{w}.png")
            try: await pg.screenshot(path=shot,full_page=True)
            except Exception: shot='(no shot)'
            for b in bad: fail(f"{tag}: {b}  [{shot}]")
        await ctx.close(); return not bad
async def main():
    async with async_playwright() as p:
        br=await p.chromium.launch(args=['--disable-dev-shm-usage','--disable-gpu']); sem=asyncio.Semaphore(int(os.environ.get('VERIFY_PAR','4')))
        res=await asyncio.gather(*[run_one(br,pg,w,sem) for pg in P for w in W])
        ok(f"{sum(res)}/{len(res)} page x width combos clean")
        # Sale timing via ?deal_now: no sale banner / % off / struck prices 1 min before start or 1 min after end.
        from datetime import datetime, timedelta
        S=site_config(); ctx=await br.new_context(viewport={'width':390,'height':844})
        for dl in [x for x in S.get('deals',[]) if is_discount(x) and x.get('start_at') and x.get('end_at')]:
            a=datetime.fromisoformat(dl['start_at'].replace('Z','+00:00')); b=datetime.fromisoformat(dl['end_at'].replace('Z','+00:00'))
            for when,tag in ((a-timedelta(minutes=1),'before start'),(b+timedelta(minutes=1),'after end')):
                for page in ('index.html','pricing.html'):
                    pg=await ctx.new_page(); await pg.goto(f"{BASE}/{page}?deal_now={urllib.parse.quote(when.isoformat())}",wait_until='load'); await pg.wait_for_timeout(1200)
                    r=await pg.evaluate("()=>({t:document.body.innerText,del:[...document.querySelectorAll('del,s,.was,.sale')].filter(e=>e.offsetWidth).length,a:window.DEALS&&window.DEALS.active&&window.DEALS.active.id})")
                    if r['a']==dl['id'] or re.search(r'\b\d{1,2}\s*%\s*off\b',r['t'],re.I) or r['del']:
                        shot=os.path.join(SHOTS,f"sale-{tag.replace(' ','-')}-{page[:-5]}.png"); await pg.screenshot(path=shot,full_page=True)
                        fail(f"{page} deal_now={when.isoformat()} ({tag}): sale state shown for {dl['id']} [{shot}]")
                    else: ok(f"{page} {tag} of {dl['id']}: no sale shown")
                    await pg.close()
        # During the window (VERIFY_SALE_NOW, default 2026-10-17T12:00-06:00): every visible price element has a struck regular price beside it.
        SN=os.environ.get('VERIFY_SALE_NOW','2026-10-17T12:00:00-06:00')
        if any(is_discount(x) for x in S.get('deals',[])):
            for page in P:
                pg=await ctx.new_page(); await pg.goto(f"{BASE}/{page}?deal_now={urllib.parse.quote(SN)}"+('#groups' if page=='pricing.html' else ''),wait_until='load'); await pg.wait_for_timeout(1500)
                miss=await pg.evaluate(STRUCK)
                if miss:
                    shot=os.path.join(SHOTS,f"struck-{page[:-5]}.png"); await pg.screenshot(path=shot,full_page=True)
                    for m in miss[:5]: fail(f"{page} deal_now={SN}: price without struck regular price: {m} [{shot}]")
                else: ok(f"{page} sale window: every visible price has a struck regular price")
                await pg.close()
        await ctx.close(); await br.close()
# Stability: the browser can die mid-run (seen: TargetClosedError on Browser.new_context after 84 parallel
# full-page renders/screenshots at VERIFY_PAR=8 under memory pressure). Retry the whole step once in a fresh
# browser; if it still crashes, report one clear FAIL line instead of a stack trace.
for attempt in (1,2):
    try: asyncio.run(main()); break
    except Exception as e:
        msg=f"{type(e).__name__}: {str(e).splitlines()[0][:160] if str(e) else ''}"
        if attempt==1: print(f"WARN render step crashed ({msg}); retrying once in a fresh browser"); fails.clear()
        else: fail(f"render step crashed twice (browser error, not a site finding): {msg}")
done('render')
