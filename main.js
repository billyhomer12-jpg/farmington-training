const S=window.SITE,$$=s=>document.querySelectorAll(s);
$$('[data-brand]').forEach(e=>e.textContent=S.brand);document.title=S.brand;
$$('[data-tagline]').forEach(e=>e.textContent=S.tagline);$$('[data-location]').forEach(e=>e.textContent=S.location);
$$('[data-phone]').forEach(e=>{e.textContent=S.phone;e.href='tel:'+S.phone.replace(/\D/g,'')});
$$('[data-email]').forEach(e=>{e.textContent=S.email;e.href='mailto:'+S.email});
[['ig','instagram'],['tt','tiktok']].forEach(([a,b])=>$$('[data-'+a+']').forEach(e=>e.href=S[b]));
const m=document.querySelector('.menu'),n=document.getElementById('links');
m.onclick=()=>{const o=n.classList.toggle('open');m.setAttribute('aria-expanded',o)};n.onclick=e=>{if(e.target.tagName==='A'){n.classList.remove('open');m.setAttribute('aria-expanded',false)}};
// Scroll fade-ins (respects reduced motion)
(()=>{const els=document.querySelectorAll('main h2,main .sub,.tiles .card,.coach,.pills,#contact form,.aday,main article,main .tile,main .links');if(matchMedia('(prefers-reduced-motion: reduce)').matches||!('IntersectionObserver' in window))return;
els.forEach(e=>e.classList.add('reveal'));const io=new IntersectionObserver(es=>es.forEach(x=>{if(x.isIntersecting){x.target.classList.add('in');io.unobserve(x.target)}}),{rootMargin:'0px 0px -8% 0px'});els.forEach(e=>io.observe(e));
window.revealNew=n=>n.querySelectorAll('.aday').forEach(e=>{e.classList.add('reveal');io.observe(e)})})();
if(document.getElementById('form')){
const f=document.getElementById('form'),st=document.getElementById('status'),steps=[...f.querySelectorAll('.step')],dots=[...document.querySelectorAll('.stepper li')];
let cur=0,closures=[],busy={},picked=new Set(),day=null,loadedFor=null;
const tz='America/Denver',fd=(d,o)=>new Date(d).toLocaleString('en-US',{timeZone:tz,...o});
const esc=v=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
// Denver wall-clock (YYYY-MM-DD, hour) -> UTC ISO
const at=(ds,h)=>{const g=new Date(ds+'T'+String(h).padStart(2,'0')+':00:00Z');const off=new Date(g.toLocaleString('en-US',{timeZone:tz}))-new Date(g.toLocaleString('en-US',{timeZone:'UTC'}));return new Date(g-off).toISOString()};
const HOURS=[...Array(15)].map((_,i)=>5+i),NEED=4,TWO=2*36e5,DAYS=[...Array(30)].map((_,i)=>{const d=new Date(Date.now()+864e5*i);return d.toLocaleDateString('en-CA',{timeZone:tz})});
function go(i){cur=i;steps.forEach((s,j)=>s.hidden=j!==i);dots.forEach((d,j)=>d.classList.toggle('on',j<=i));st.textContent='';if(i===1)loadBusy();if(i===2)review()}
function valid(i){const bad=[...steps[i].querySelectorAll('input,select')].find(e=>!e.checkValidity());if(bad){bad.reportValidity();return false}
if(i===1&&!wt()){st.textContent='Pick a workout type.';return false}
if(i===1&&picked.size!==NEED){st.textContent='Pick exactly 4 session times (one package = four 2-hour sessions). You have '+picked.size+'.';return false}return true}
f.addEventListener('click',e=>{if(e.target.matches('[data-next]')&&valid(cur))go(cur+1);if(e.target.matches('[data-back]'))go(cur-1)});
const rpc=(fn,body)=>fetch(S.supabaseUrl+'/rest/v1/rpc/'+fn,{method:'POST',headers:{apikey:S.supabaseKey,'Content-Type':'application/json'},body:JSON.stringify(body||{})});
const wt=()=>(f.querySelector('[name=workout_type]:checked')||{}).value;
// Mirrors server rules (training.hour_allowed). Gym = HHPC hours; Outdoor/Weight room = 6 AM-8 PM starts daily.
// 2-hour sessions must end by close: Gym Mon-Thu starts 5 AM-7 PM, Fri 5 AM-6 PM, Sat 7 AM-3 PM; Outdoor/Weight room 6 AM-7 PM.
function allowed(k,h,t){const dow=new Date(k+'T12:00:00Z').getUTCDay();if(t==='Gym'){const ok=dow>=1&&dow<=4?h>=5&&h<=19:dow===5?h>=5&&h<=18:dow===6?h>=7&&h<=15:false;return ok&&!closedAt(at(k,h))}return h>=6&&h<=19}
const closedAt=t=>closures.some(c=>new Date(c.starts_at)<new Date(new Date(t).getTime()+TWO)&&new Date(c.ends_at)>new Date(t));
const pkgKey=()=>f.ptype.value==='1on1'?'1on1':'group'+f.players.value,pkg=()=>(S.packages||{})[pkgKey()]||{};
const range=t=>{const a=fd(t,{hour:'numeric'}),b=fd(new Date(new Date(t).getTime()+TWO),{hour:'numeric'});return (a.slice(-2)===b.slice(-2)?a.slice(0,-3):a)+'–'+b};
const clash=t=>[...picked].some(x=>x!==t&&Math.abs(new Date(x)-new Date(t))<TWO);
function pkgUI(){const g=f.ptype.value!=='1on1';document.getElementById('plabel').hidden=!g;const p=pkg();document.getElementById('pkgline').textContent=`${p.label}: $${p.price} total · 4 sessions · 2 hrs each. Every package is four 2-hour sessions.`}
f.ptype.onchange=pkgUI;f.players.onchange=pkgUI;pkgUI();
async function loadBusy(){const p=f.program.value,w=wt()||'Outdoor',key=p+'|'+w;if(loadedFor===key)return draw();loadedFor=key;busy={};draw();
const from=new Date().toISOString(),to=new Date(Date.now()+31*864e5).toISOString();
try{const c=await fetch(S.supabaseUrl+'/rest/v1/training_gym_closures?select=starts_at,ends_at,reason&ends_at=gt.'+from,{headers:{apikey:S.supabaseKey}});closures=c.ok?await c.json():[]}catch{closures=[]}
try{let r=await rpc('training_availability',{p_program:p,p_from:from,p_to:to,p_workout_type:w});if(r.status===404)r=await rpc('training_availability',{p_program:p,p_from:from,p_to:to});if(r.ok)(await r.json()).forEach(x=>busy[new Date(x.starts_at).toISOString()]=x.seats_left)}catch{}draw()}
f.addEventListener('change',e=>{if(e.target.name==='workout_type'){picked.clear();loadBusy()}});
document.getElementById('prog').onchange=()=>{picked.clear();loadBusy()};
function draw(){const D=document.getElementById('days'),T=document.getElementById('times');day=day||DAYS[0];
D.innerHTML=DAYS.map(k=>{const d=new Date(k+'T12:00:00Z'),n=[...picked].filter(t=>new Date(t).toLocaleDateString('en-CA',{timeZone:tz})===k).length;return `<button type="button" class="day${k===day?' on':''}" data-day="${k}"><small>${d.toLocaleDateString('en-US',{weekday:'short',timeZone:'UTC'})}</small><b>${d.getUTCDate()}</b><small>${d.toLocaleDateString('en-US',{month:'short',timeZone:'UTC'})}</small>${n?'<i>'+n+'</i>':''}</button>`}).join('');
const w=wt();const dc=closures.filter(c=>new Date(c.starts_at)<new Date(at(day,21))&&new Date(c.ends_at)>new Date(at(day,5))),sun=new Date(day+'T12:00:00Z').getUTCDay()===0;
document.getElementById('daynote').textContent=!w?'Pick a workout type to see available times.':(dc.length||sun)?(w==='Gym'?'Gym closed'+(dc.length&&!sun?' part or all of this day ('+(dc[0].reason||'closure')+')':' Sundays')+'. Outdoor and weight room sessions are still available.':'Gym closed this day; outdoor and weight room sessions are still available.'):'';
T.innerHTML=!w?'':HOURS.filter(h=>w==='Gym'||h>=6).map(h=>{const t=at(day,h),past=new Date(t)<Date.now()+36e5,s=busy[t],on=picked.has(t),full=!on&&(past||s===0||!allowed(day,h,w)||clash(t)||picked.size>=NEED);return `<label class="hr${full?' off':''}"><input type="checkbox" value="${t}"${on?' checked':''}${full?' disabled':''}><span>${range(t)}</span>${s>0?'<small>'+s+' left</small>':''}</label>`}).join('');upd()}
document.getElementById('days').onclick=e=>{const b=e.target.closest('[data-day]');if(b){day=b.dataset.day;draw()}};
document.getElementById('times').onchange=e=>{const t=e.target.value;e.target.checked?picked.add(t):picked.delete(t);draw()};
function upd(){document.getElementById('picked').textContent=picked.size+' of 4 sessions picked · each session is 2 hours'+(picked.size===NEED?' · ready for review':'. Pick '+(NEED-picked.size)+' more (any days).')}
function review(){const d=Object.fromEntries(new FormData(f));document.getElementById('review').innerHTML=`<b>${esc(d.athlete)}</b> (age ${esc(d.age)}) · ${esc(progLabel(d.program))} · ${esc(d.workout_type)} workout<br><b>${esc(pkg().label)} package: $${pkg().price} total for 4 sessions · 2 hrs each</b><br>Parent: ${esc(d.parent)} · ${esc(d.email)} ${esc(d.phone)}<ul>${[...picked].sort().map((t,i)=>'<li>Session '+(i+1)+': '+fd(t,{weekday:'short',month:'short',day:'numeric'})+', '+range(t)+' (2 hrs)</li>').join('')}</ul><small>One package = four 2-hour sessions. Requested times; a coach will confirm or suggest another time.</small>`}
f.onsubmit=async e=>{e.preventDefault();if(!valid(cur))return;const d=Object.fromEntries(new FormData(f));st.textContent='Booking…';
let ref=null;try{const args={p_parent:d.parent,p_athlete:d.athlete,p_age:+d.age,p_program:d.program,p_phone:d.phone,p_email:d.email,p_message:d.message,p_starts:[...picked]};const k=pkgKey();let r=await rpc('training_book',{...args,p_workout_type:d.workout_type,p_package:k,p_players:(S.packages[k]||{}).players});if(r.status===404)r=await rpc('training_book',{...args,p_format:k==='1on1'?'1-on-1':'Small group',p_workout_type:d.workout_type});
if(r.ok)ref=await r.json();else{const j=await r.json().catch(()=>({}));st.textContent=(j.message||'Booking failed')+'. Please try again or contact us.';loadedFor=null;return}}catch{st.textContent='Network error, please call or email us.';return}
const link=(S.paymentLinks||{})[pkgKey()],P=document.getElementById('pay');go(3);
P.innerHTML=link?`<h3>You're booked!</h3><p>${esc(pkg().label)} package: $${pkg().price} for 4 sessions · 2 hrs each. Finish by paying securely with Stripe.</p><a class="btn" href="${link}?client_reference_id=${encodeURIComponent(ref)}&prefilled_email=${encodeURIComponent(d.email)}">Pay now</a>`
:`<h3>You're booked!</h3><p>${esc(pkg().label)} package: $${pkg().price} for 4 sessions · 2 hrs each.</p><p>Payment coming soon, we'll confirm with you. Your booking is saved as pending.</p><small>Ref: ${esc(ref)}</small>`};

// Preselect from availability page: ?program=..&type=..&t=ISO#contact
(()=>{const q=new URLSearchParams(location.search),p=q.get('program'),w=q.get('type'),t=q.get('t');if(!p&&!w&&!t)return;
if(p&&[...f.program.options].some(o=>o.value===p))f.program.value=p;
const r=w&&f.querySelector('[name=workout_type][value="'+w.replace(/"/g,'')+'"]');if(r)r.checked=true;
if(t&&!isNaN(Date.parse(t))){const iso=new Date(t).toISOString();picked.add(iso);day=new Date(iso).toLocaleDateString('en-CA',{timeZone:tz})}
const n=document.getElementById('picked');st.textContent=t?'Selected '+fd(t,{weekday:'short',month:'short',day:'numeric',hour:'numeric'})+' · '+(w||'')+' · '+(p?progLabel(p):'')+'. Fill in your info, then continue.':''})();

}
