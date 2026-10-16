// DEALS-SLOT: one reusable deal component (banner, '+1 bonus session' card badges, booking summary line, confirmation line, FAQ).
// Off state = no DOM output at all. Config: window.SITE.deals + LAUNCH_AT in config.js.
(()=>{const S=window.SITE||{},q=new URLSearchParams(location.search),pv=q.get('deal_preview')||(q.get('preview')==='deal'?'grand-opening-2026':null),nw=q.get('deal_now');
const esc=v=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
// Fake clock: a bare date means noon Denver time that day.
const now=!nw&&q.get('preview')==='deal'&&S.LAUNCH_AT&&new Date()<new Date(S.LAUNCH_AT)?new Date(new Date(S.LAUNCH_AT).getTime()+1e3):nw?new Date(/^\d{4}-\d{2}-\d{2}$/.test(nw)?nw+'T12:00:00-07:00':nw):new Date();
const list=(S.deals||[]).filter(d=>d&&d.id);
const live=d=>['approved','live'].includes(d.status)&&d.start_at&&d.end_at&&new Date(d.start_at)<=now&&now<new Date(d.end_at);
const d0=pv?list.find(x=>x.id===pv):list.find(live);
const launched=!!(d0&&d0.launch_at&&now>=new Date(d0.launch_at));let d=d0&&launched&&d0.launch_copy?{...d0,...d0.launch_copy}:d0;if(d&&pv&&!d.end_at){const L=S.LAUNCH_AT||new Date().toISOString();d={...d,start_at:L,end_at:new Date(new Date(L).getTime()+72*3600e3).toISOString()}}
const sale=!!(d&&d.offer_type==='percent_off');
const test=!!(pv||nw);
if(test){const m=document.createElement('meta');m.name='robots';m.content='noindex';document.head.appendChild(m)}
window.DEALS={active:d||null,sale,eligible:k=>!!(d&&k&&(sale||k!=='single')&&(d.eligible_packages||[]).includes(k)),
 line:k=>window.DEALS.eligible(k)?`<div class="deal-line"><b>${esc(d.headline)}:</b> ${esc(d.summary_line||d.offer_detail)}${d.fine_print?`<small>${esc(d.fine_print)}</small>`:''}</div>`:'',
 confirm:b=>b&&b.line?`<div class="deal-line"><b>${esc(b.headline||'Bonus')}:</b> ${esc(b.line)}.</div>`:''};
if(!d){if(test)document.readyState==='loading'?document.addEventListener('DOMContentLoaded',tag):tag();return}
const money=n=>'$'+(Math.round(n*100)%100?n.toFixed(2):Math.round(n));
if(sale){const P=S.packages||{},SL=S.saleLinks||{};for(const k in P)if(P[k].sale&&/^https:\/\//.test(SL[k]||'')){P[k].regular=P[k].price;P[k].price=P[k].sale}}
const css=document.createElement('style');css.textContent=`.deal-res body{padding-top:40px}.deal-bar{position:absolute;top:0;left:0;right:0;z-index:31;height:40px;display:flex;align-items:center;justify-content:center;gap:12px;padding:0 48px 0 16px;background:#000;color:#fff;font:500 .875rem/1.2 var(--font)}
.deal-bar .short{display:none}.deal-bar .t{text-align:center;line-height:1.25;overflow-wrap:break-word;min-width:0}.deal-bar a{color:var(--ac);text-decoration:underline;text-underline-offset:2px;white-space:nowrap}
.deal-bar .x{position:absolute;right:0;top:0;width:44px;height:40px;border:0;background:none;color:#a1a1a6;font-size:20px;cursor:pointer}.deal-bar .x:focus-visible{outline:2px solid var(--ac);outline-offset:-4px}
.deal-badge{display:inline-flex;align-items:center;align-self:center;height:24px;padding:0 10px;border-radius:980px;background:var(--ac-tint);color:var(--ac-deep);font:600 .75rem/1 var(--font);margin:0 0 10px}
.deal-pills{display:flex;gap:6px;align-items:center;justify-content:center;flex-wrap:wrap}.deal-pills>*{margin-bottom:10px}
.deal-line{margin:12px 0 0;padding:12px 14px;border-radius:12px;background:var(--ac-tint2);font-size:.9375rem;line-height:1.4}.deal-line b{color:var(--ac-deep)}.deal-line small{display:block;font-size:.8125rem;color:#6e6e73;margin-top:4px}
.was{color:#86868b;font-weight:500;font-size:.7em;text-decoration:line-through}.now{color:inherit}.price .first{display:block;font-size:.8125rem;color:#6e6e73;font-weight:500}
.vh{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}.deal-cd{font-variant-numeric:tabular-nums}.cdbox{display:flex;gap:8px;justify-content:center;margin:16px auto 0;font:600 .8125rem/1.2 var(--font);color:inherit}.cdbox .u{display:flex;flex-direction:column;align-items:center;min-width:56px;padding:8px 6px;border-radius:12px;background:rgba(52,199,89,.14)}.cdbox .u b{font-size:1.5rem;font-variant-numeric:tabular-nums;color:#34C759}.cdbox .u i{font-style:normal;font-size:.6875rem;opacity:.8;margin-top:2px}.cdlbl{text-align:center;font:600 .875rem/1.3 var(--font);margin:20px 0 0}
.deal-pv{display:inline-block;background:var(--ac2);color:#fff;font:700 .625rem/1 var(--font);letter-spacing:.06em;padding:3px 6px;border-radius:4px;margin-right:8px;vertical-align:middle;text-transform:uppercase}
@media(max-width:760px){.deal-res body{padding-top:64px}.deal-bar{height:64px;font-size:.75rem;gap:8px}.deal-bar .short{display:inline}.deal-bar .x{height:64px}.deal-bar .long{display:none}}`;document.head.appendChild(css);
const pg=(location.pathname.split('/').pop()||'index.html').replace(/\.html$/,'')||'index',sf=d.surfaces||[];
const showBar=sf.includes('home_banner')&&true&&(pv||!(()=>{try{return localStorage.getItem('deal-dismissed:'+d.id)}catch{}})());if(showBar)document.documentElement.classList.add('deal-res');
function tag(){if(document.querySelector('.deal-pv'))return;const t=document.createElement('span');t.className='deal-pv';t.textContent='Preview';
 const b=document.querySelector('.deal-bar .t');if(b)b.prepend(t);else{t.style.cssText='position:fixed;left:8px;bottom:8px;z-index:40';document.body.appendChild(t)}}
function run(){
 if(sf.includes('home_banner')&&true&&(pv||!localStorage.getItem('deal-dismissed:'+d.id))&&!document.querySelector('.deal-bar')){
  const bar=document.createElement('div');bar.className='deal-bar';bar.setAttribute('role','region');bar.setAttribute('aria-label','Current offer');
  const left=new Date(d.end_at)-now,cdOn=d.countdown_hours&&left>0&&(left<=d.countdown_hours*3600e3||new Date(d.start_at)<=now),cd='';
  bar.innerHTML=`<span class="t">${d.banner_text?esc(d.banner_text):`${esc(d.headline)}<span class="long">: ${esc(d.banner_detail||d.offer_detail)}</span>${d.banner_short?`<span class="short">: ${esc(d.banner_short)}</span>`:''}`}${cdOn?'<span class="deal-cd"> · Ends in <span data-cd></span></span>':''}</span>${pg==='pricing'?'':`<a href="${esc(d.cta_url||'pricing.html')}">${esc(d.cta_label||'See packages')}</a>`}<button type="button" class="x" aria-label="Dismiss offer">×</button>`;
  bar.querySelector('.x').onclick=()=>{try{localStorage.setItem('deal-dismissed:'+d.id,'1')}catch{}bar.remove();document.documentElement.classList.remove('deal-res')};document.body.prepend(bar)}
 if(sf.includes('pricing_badge'))document.querySelectorAll('article.price[data-package]:not([data-tier])').forEach(c=>{if(c.closest('#memberships')||c.querySelector('.deal-badge'))return;
  // Explicit data-package only (never heading text). "group" = the homepage "Book my own group" card (groups of 2-4).
  const k=c.dataset.package,el=d.eligible_packages||[];if(!(k==='group'?el.some(x=>/^group\d$/.test(x)):window.DEALS.eligible(k)))return;
  const s=document.createElement('span');s.className='deal-badge';s.textContent=d.offer_detail||'+1 bonus session';
  const pop=c.querySelector('.poplabel');if(pop){const w=document.createElement('div');w.className='deal-pills';pop.before(w);w.append(pop,s)}else c.prepend(s)});
 if(d.faq_q&&pg==='index'){const f=document.querySelector('.faq');if(f&&!f.querySelector('[data-deal]')){const x=document.createElement('details');x.dataset.deal=d.id;x.innerHTML=`<summary>${esc(d.faq_q)}</summary><p>${esc(d.fine_print)}</p>`;f.prepend(x)}}
 if(sale){const P=S.packages||{},was=(r,s)=>`<s class="was" aria-hidden="true">${money(r)}</s> <b class="now" aria-hidden="true">${money(s)}</b><span class="vh">Was ${money(r)}, now ${money(s)}</span>`;
  document.querySelectorAll('article.price[data-package]').forEach(c=>{const k=c.dataset.package,a=c.querySelector('.amt');if(!a||c.dataset.sale)return;c.dataset.sale='1';
   if(k==='group'){const sp=a.querySelectorAll('[data-size]');if(sp.length){sp.forEach(x=>{const p=P['group'+x.dataset.size];if(p)x.innerHTML=was(p.regular||p.price,p.sale)});
     const gp=c.querySelector('.gpp');if(gp){const m={};[2,3,4].forEach(n=>{const p=P['group'+n];if(p)m[n]=money(p.sale/n)+' per player'});gp.querySelectorAll('[data-size]').forEach(x=>{if(m[x.dataset.size])x.textContent=m[x.dataset.size]});if(gp._t){Object.assign(gp._t,m);const on=c.querySelector('input[name=gsize]:checked');if(on&&m[on.value])gp.textContent=m[on.value]}}}
     else if(P.group2&&P.group4){const r2=P.group2.regular||P.group2.price,r4=P.group4.regular||P.group4.price,s2=P.group2.sale,s4=P.group4.sale;a.innerHTML=`<s class="was" aria-hidden="true">${money(r2)}–${money(r4)}</s> <b class="now" aria-hidden="true">${money(s2)}<small>–${money(s4)}</small></b><span class="vh">Was ${money(r2)} to ${money(r4)}, now ${money(s2)} to ${money(s4)}</span>`};return}
   const p=P[k];if(p&&p.sale)a.innerHTML=was(p.regular||p.price,p.sale)});
  if((d.membership_fine_print||d.fine_print)&&pg==='pricing'&&!document.querySelector('.deal-fp')){const m=document.querySelector('#memberships>.wrap>p.fine');if(m){const x=document.createElement('p');x.className='fine deal-fp';x.textContent=d.membership_fine_print||(d.headline+' sale: '+d.fine_print);m.before(x)}}
  {const MP=S.MEMBERSHIP_PRICES||{},map={};for(const k in P)if(P[k].sale)map[P[k].regular||P[k].price]=P[k].sale;for(const k in MP)if(MP[k].sale)map[MP[k].price]=MP[k].sale;
   const re=new RegExp('\\$('+Object.keys(map).join('|')+')(?!\\d|\\.\\d)','g'),skip='.amt,.gpp,.was,.now,.vh,script,style,option,.deal-bar,#booking-root,.cdbox,.deal-line,.deal-fp,[data-nosale]';
   const tw=document.createTreeWalker(document.querySelector('main')||document.body,NodeFilter.SHOW_TEXT),ns=[];while(tw.nextNode()){const n=tw.currentNode;if(re.test(n.nodeValue)&&!n.parentElement.closest(skip))ns.push(n);re.lastIndex=0}
   ns.forEach(n=>{const s=document.createElement('span');s.innerHTML=esc(n.nodeValue).replace(re,(m,r)=>was(+r,map[r]));n.replaceWith(...s.childNodes)})}
  window.DEALS.renderMonthly&&window.DEALS.renderMonthly()}
 if(d.countdown_hours){const end=new Date(d.end_at).getTime(),t0=Date.now(),off=now.getTime()-t0,lim=d.countdown_hours*3600e3;
  if(sale&&end-now>0&&(end-now<=lim||new Date(d.start_at)<=now))[pg==='index'?document.querySelector('.hero .wrap,.hero'):null,pg==='pricing'?document.querySelector('.ptab-sec .wrap'):null].forEach(h=>{if(!h||h.querySelector('.cdbox'))return;const w=document.createElement('div');w.innerHTML='<p class="cdlbl">Grand Opening sale ends in</p><div class="cdbox" role="timer" aria-label="Time left in the sale" data-cdbox><span class="u"><b data-u="d">0</b><i>days</i></span><span class="u"><b data-u="h">00</b><i>hrs</i></span><span class="u"><b data-u="m">00</b><i>min</i></span><span class="u"><b data-u="s">00</b><i>sec</i></span></div>';if(pg==='pricing')h.prepend(...w.childNodes);else h.append(...w.childNodes)});
  const z=n=>String(n).padStart(2,'0'),tick=()=>{const r=end-(Date.now()+off);if(r<=0){if(!test)location.reload();clearInterval(iv);return}const D=Math.floor(r/864e5),H=Math.floor(r/36e5)%24,M=Math.floor(r/6e4)%60,Sx=Math.floor(r/1e3)%60;
   document.querySelectorAll('[data-cd]').forEach(e=>e.textContent=`${D}d ${z(H)}h ${z(M)}m ${z(Sx)}s`);document.querySelectorAll('[data-cdbox]').forEach(b=>{b.querySelector('[data-u=d]').textContent=D;b.querySelector('[data-u=h]').textContent=z(H);b.querySelector('[data-u=m]').textContent=z(M);b.querySelector('[data-u=s]').textContent=z(Sx)})};const iv=setInterval(tick,1000);tick()}
  if(sale){const P=S.packages||{},mo=o=>{for(const k in P){const p=P[k];if(!p.regular)continue;const r='$'+p.regular;o.querySelectorAll&&o.querySelectorAll('option[value="'+k+'"]'+(/^group(\d)$/.test(k)?',option[value="'+k.slice(5)+'"]':'')+(k==='group2'?',option[value="group"]':'')).forEach(x=>{if(x.textContent.includes(r)&&!x.textContent.includes('was'))x.textContent=x.textContent.replace(r,'$'+p.price+' (was '+r+')')})}};mo(document);new MutationObserver(()=>mo(document)).observe(document.body,{childList:true,subtree:true})}
 if(test)tag()}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',run):run()})();
