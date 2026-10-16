// PRICING-TABS: ARIA tabs (1-on-1 / Groups / Monthly) + group size selector. Panels stay in the DOM.
(()=>{const run=()=>{const seg=document.querySelector('.ptab-sec .seg');if(!seg)return;document.documentElement.classList.add('js-ptabs','ptabs-ready');
const tabs=[...seg.querySelectorAll('[role=tab]')],panels=tabs.map(t=>document.getElementById(t.getAttribute('aria-controls'))),ids=['private','groups','monthly'];
const sel=(i,focus,anim=true,hash=true)=>{tabs.forEach((t,j)=>{t.setAttribute('aria-selected',j===i);t.tabIndex=j===i?0:-1;panels[j].hidden=j!==i;panels[j].classList.toggle('in',j===i&&anim);
 t.querySelector('.dot')?.remove();t.removeAttribute('aria-label');if(j!==i&&panels[j].querySelector('.deal-badge')){const d=document.createElement('span');d.className='dot';d.setAttribute('aria-hidden','true');t.append(d);t.setAttribute('aria-label',t.textContent+', offer applies')}});
 seg.style.setProperty('--i',i);if(focus)tabs[i].focus();if(hash)try{history.replaceState(null,'',location.pathname+location.search+'#'+ids[i])}catch{}};
tabs.forEach((t,i)=>{t.onclick=()=>sel(i);t.onkeydown=e=>{const n=tabs.length,k={ArrowRight:i+1,ArrowLeft:i-1,Home:0,End:n-1}[e.key];if(k!==undefined){e.preventDefault();sel((k+n)%n,true)}}});
document.querySelector('.solo-hint')?.addEventListener('click',e=>{e.preventDefault();sel(1,true)});
const fromHash=()=>{const h=location.hash.slice(1);return h==='memberships'?2:Math.max(0,ids.indexOf(h))};
sel(fromHash(),false,false,false);addEventListener('hashchange',()=>sel(fromHash(),false));
const g=document.querySelector('.gcard');if(g){const set=v=>g.querySelectorAll('[data-size]').forEach(x=>x.classList.toggle('on',x.dataset.size===v));
 g.querySelectorAll('.gsize input').forEach(r=>r.onchange=()=>set(r.value));set(g.querySelector('.gsize input:checked')?.value||'2')}
const mf=document.querySelector('#memberships>.wrap>p.fine');if(mf&&!mf.closest('details')){const d=document.createElement('details');d.className='pdet mdet';d.innerHTML='<summary>Membership details</summary>';mf.before(d);d.append(mf)}
setTimeout(()=>sel(tabs.findIndex(t=>t.getAttribute('aria-selected')==='true'),false,false,false),0)};// refresh offer dots after deals.js
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',run):run()})();
