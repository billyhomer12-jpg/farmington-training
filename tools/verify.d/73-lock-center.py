#!/usr/bin/env python3
# REGRESSION GUARD: back-office lock card and PIN code entry centered (left margin == right margin within 1px) at 375/390/430 WebKit + 1280 Chromium.
import sys, os, asyncio, subprocess, socket, time
sys.path.insert(0, os.path.dirname(__file__)); from _lib import *
from playwright.async_api import async_playwright
JS="""()=>{const vw=document.documentElement.clientWidth;const o={};const m=(k,e)=>{if(!e)return;const r=e.getBoundingClientRect();o[k]=[r.left,vw-r.right]};
m('lock card',document.getElementById('login'));const d=document.querySelectorAll('#login [aria-label^="PIN digit"]');
if(d.length){const a=d[0].getBoundingClientRect(),b=d[d.length-1].getBoundingClientRect(),c=document.getElementById('login').getBoundingClientRect();o['code entry (in card)']=[a.left-c.left,c.right-b.right]}else m('code input',document.getElementById('pin'));return o}"""
def serve():
    s=socket.socket();s.bind(('127.0.0.1',0));port=s.getsockname()[1];s.close()
    pr=subprocess.Popen([sys.executable,'-m','http.server',str(port)],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1);return pr,f'http://127.0.0.1:{port}'
async def main():
    srv,base=(None,BASE) if os.environ.get('VERIFY_LOCAL') else serve()
    try:
      async with async_playwright() as pw:
        for w in (375,390,430,1280):
          br=await (pw.chromium if w>1000 else pw.webkit).launch()
          ctx=await br.new_context(**({'viewport':{'width':w,'height':800}} if w>1000 else {'viewport':{'width':w,'height':844},'is_mobile':True,'has_touch':True}))
          p=await ctx.new_page();await p.goto(base+'/admin/');await p.wait_for_timeout(600)
          r=await p.evaluate(JS)
          if 'lock card' not in r: fail(f'{w}: lock card not found')
          for k,(l,rt) in r.items():
            if abs(l-rt)>1: fail(f'{w} {k}: left {l:.0f} != right {rt:.0f}')
          await br.close()
    finally:
      if srv: srv.terminate()
asyncio.run(main())
if not fails: ok('lock card + code entry centered at 375/390/430/1280')
done('73-lock-center')
