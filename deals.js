// DEALS-SLOT: one reusable deal component (banner, '+1 bonus session' card badges, booking summary line, confirmation line, FAQ).
// Off state = no DOM output at all. Config: window.SITE.deals + LAUNCH_AT in config.js.
(()=>{const S=window.SITE||{},q=new URLSearchParams(location.search),pv=q.get('deal_preview'),nw=q.get('deal_now');
const esc=v=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
// Fake clock: a bare date means noon Denver time that day.
const now=nw?new Date(/^\d{4}-\d{2}-\d{2}$/.test(nw)?nw+'T12:00:00-07:00':nw):new Date();
const list=(S.deals||[]).filter(d=>d&&d.id);
const live=d=>['approved','live'].includes(d.status)&&d.start_at&&d.end_at&&new Date(d.start_at)<=now&&now<new Date(d.end_at);
const d=pv?list.find(x=>x.id===pv):list.find(live);
const test=!!(pv||nw);
if(test){const m=document.createElement('meta');m.name='robots';m.content='noindex';document.head.appendChild(m)}
window.DEALS={active:d||null,eligible:k=>!!(d&&k&&k!=='single'&&(d.eligible_packages||[]).includes(k)),
 line:k=>window.DEALS.eligible(k)?`<div class="deal-line"><b>${esc(d.headline)}:</b> ${esc(d.summary_line||d.offer_detail)}<small>${esc(d.fine_print)}</small></div>`:'',
 confirm:b=>b&&b.line?`<div class="deal-line"><b>${esc(b.headline||'Bonus')}:</b> ${esc(b.line)}.</div>`:''};
if(!d){if(test)tag(null);return}
const css=document.createElement('style');css.textContent=`.deal-bar{position:relative;z-index:31;height:40px;display:flex;align-items:center;justify-content:center;gap:12px;padding:0 48px 0 16px;background:#000;color:#fff;font:500 .875rem/1.2 var(--font)}
.deal-bar .t{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.deal-bar a{color:var(--ac);text-decoration:underline;text-underline-offset:2px;white-space:nowrap}
.deal-bar .x{position:absolute;right:0;top:0;width:44px;height:40px;border:0;background:none;color:#a1a1a6;font-size:20px;cursor:pointer}.deal-bar .x:focus-visible{outline:2px solid var(--ac);outline-offset:-4px}
.deal-badge{display:inline-flex;align-items:center;align-self:center;height:24px;padding:0 10px;border-radius:980px;background:var(--ac-tint);color:var(--ac-deep);font:600 .75rem/1 var(--font);margin:0 0 10px}
.deal-pills{display:flex;gap:6px;align-items:center;justify-content:center;flex-wrap:wrap}.deal-pills>*{margin-bottom:10px}
.deal-line{margin:12px 0 0;padding:12px 14px;border-radius:12px;background:var(--ac-tint2);font-size:.9375rem;line-height:1.4}.deal-line b{color:var(--ac-deep)}.deal-line small{display:block;font-size:.8125rem;color:#6e6e73;margin-top:4px}
.deal-pv{display:inline-block;background:var(--ac2);color:#fff;font:700 .625rem/1 var(--font);letter-spacing:.06em;padding:3px 6px;border-radius:4px;margin-right:8px;vertical-align:middle;text-transform:uppercase}
@media(max-width:760px){.deal-bar{font-size:.8125rem;gap:8px}.deal-bar .long{display:none}}`;document.head.appendChild(css);
const pg=(location.pathname.split('/').pop()||'index.html').replace(/\.html$/,'')||'index',sf=d.surfaces||[];
function tag(){if(document.querySelector('.deal-pv'))return;const t=document.createElement('span');t.className='deal-pv';t.textContent='Preview';
 const b=document.querySelector('.deal-bar .t');if(b)b.prepend(t);else{t.style.cssText='position:fixed;left:8px;bottom:8px;z-index:40';document.body.appendChild(t)}}
function run(){
 if(sf.includes('home_banner')&&['index','pricing','book'].includes(pg)&&(pv||!localStorage.getItem('deal-dismissed:'+d.id))&&!document.querySelector('.deal-bar')){
  const bar=document.createElement('div');bar.className='deal-bar';bar.setAttribute('role','region');bar.setAttribute('aria-label','Current offer');
  bar.innerHTML=`<span class="t">${esc(d.headline)}<span class="long">: ${esc(d.banner_detail||d.offer_detail)}</span></span>${pg==='pricing'?'':`<a href="${esc(d.cta_url||'pricing.html')}">${esc(d.cta_label||'See packages')}</a>`}<button type="button" class="x" aria-label="Dismiss offer">×</button>`;
  bar.querySelector('.x').onclick=()=>{try{localStorage.setItem('deal-dismissed:'+d.id,'1')}catch{}bar.remove()};document.body.prepend(bar)}
 if(sf.includes('pricing_badge'))document.querySelectorAll('article.price[data-package]:not([data-tier])').forEach(c=>{if(c.closest('#memberships')||c.querySelector('.deal-badge'))return;
  // Explicit data-package only (never heading text). "group" = the homepage "Book my own group" card (groups of 2-4).
  const k=c.dataset.package,el=d.eligible_packages||[];if(!(k==='group'?el.some(x=>/^group\d$/.test(x)):window.DEALS.eligible(k)))return;
  const s=document.createElement('span');s.className='deal-badge';s.textContent=d.offer_detail||'+1 bonus session';
  const pop=c.querySelector('.poplabel');if(pop){const w=document.createElement('div');w.className='deal-pills';pop.before(w);w.append(pop,s)}else c.prepend(s)});
 if(d.faq_q&&pg==='index'){const f=document.querySelector('.faq');if(f&&!f.querySelector('[data-deal]')){const x=document.createElement('details');x.dataset.deal=d.id;x.innerHTML=`<summary>${esc(d.faq_q)}</summary><p>${esc(d.fine_print)}</p>`;f.prepend(x)}}
 if(test)tag()}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',run):run()})();
