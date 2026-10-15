// Parent dashboard: my.html?token=...  (the private token in the email link is the access; no sign-in)
(()=>{const S=window.SITE,tz='America/Denver',$=id=>document.getElementById(id),R=$('my-root');
const tok=new URLSearchParams(location.search).get('token')||'';
const esc=v=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fd=(d,o)=>new Date(d).toLocaleString('en-US',{timeZone:tz,...o});
const range=(t,m=120)=>{const a=fd(t,{hour:'numeric'}),b=fd(new Date(new Date(t).getTime()+m*6e4),{hour:'numeric'});return (a.slice(-2)===b.slice(-2)?a.slice(0,-3):a)+'–'+b};
const kd=d=>new Date(d).toLocaleDateString('en-CA',{timeZone:tz}),CUT=24*36e5,TWO=2*36e5;
const rpc=(fn,b)=>fetch(S.supabaseUrl+'/rest/v1/rpc/'+fn,{method:'POST',headers:{apikey:S.supabaseKey,'Content-Type':'application/json'},body:JSON.stringify(b)}).then(async r=>({ok:r.ok,status:r.status,j:await r.json().catch(()=>null)}));
const PKG={'1on1':'1-on-1','group2':'Small group · 2 players','group3':'Small group · 3 players','group4':'Small group · 4 players'};
let V=null,open=null,slots=[],selDay=null,selT=null;
const fail=m=>{R.innerHTML=`<div class="card tile mytile center"><h3>${esc(m)}</h3><p class="mut">Use the link from your confirmation email. Questions? Call or text <a href="tel:${esc(S.phoneTel||S.phone)}">${esc(S.phone)}</a> or email <a href="mailto:${esc(S.email)}">${esc(S.email)}</a>.</p></div>`};
async function load(){if(tok.length<32)return fail('This link isn’t valid.');const r=await rpc('parent_view',{p_token:tok});
if(r.status===404)return fail('Your dashboard is almost ready.');if(!r.ok||!r.j||r.j.error)return fail('This link isn’t valid.');V=r.j;draw()}
function draw(){const s=V.signup,names=[s.athlete,...(s.additional_players||[]).map(p=>p.athlete)].filter(Boolean),paid=s.payment_status==='paid';
document.getElementById('hi').textContent='Hi '+(s.parent||'').split(' ')[0]+'.';
R.innerHTML=`<div class="card tile mytile"><p class="kicker gold">Your package</p><h3>${esc(names.join(', '))}</h3>
<div class="kv"><span>Package</span><b>${esc(PKG[s.package]||s.package)} · 4 sessions · 2 hrs each</b></div>
<div class="kv"><span>Payment</span><b><i class="pillst ${paid?'ok':'pend'}">${paid?'Paid':'Pending'}</i>${s.amount_paid_cents!=null?' $'+(s.amount_paid_cents/100):''}</b></div>
<div class="kv"><span>Programs</span><b>${esc((s.programs||[]).map(progLabel).join(' + '))}</b></div>
<div class="kv"><span>Workout types</span><b>${esc((s.workout_types||[...new Set(V.sessions.map(x=>x.workout_type))]).join(', '))}</b></div></div>
<div class="card tile mytile"><p class="kicker gold">Your sessions</p><h3>4 sessions · Denver time</h3><div class="slist">${V.sessions.map(sessRow).join('')}</div>
<p class="mut small">You can move a session up to 24 hours before it starts. Moved sessions show as pending until a coach confirms.</p></div>
<div class="card tile mytile"><p class="kicker gold">Where</p><h3>${esc(S.locationName||'San Juan College Health & Human Performance Center')}</h3><p class="mut">4601 College Blvd, Farmington, NM 87402, United States</p>
<div class="cta2 left"><a class="btn sm" href="${esc(S.appleMaps)}" target="_blank" rel="noopener">Open in Maps</a><a class="btn sm ghost" href="https://www.google.com/maps/search/?api=1&query=36.770237,-108.173952" target="_blank" rel="noopener">Google Maps</a></div></div>
<div class="card tile mytile center"><h3>Questions?</h3><p class="mut">Call or text <a href="tel:${esc(S.phoneTel||S.phone)}">${esc(S.phone)}</a> · <a href="mailto:${esc(S.email)}">${esc(S.email)}</a></p></div>`}
function sessRow(r){const late=new Date(r.starts_at)-Date.now()<CUT,past=new Date(r.starts_at)<Date.now(),ok=r.status==='confirmed';
return `<div class="srow${open===r.id?' open':''}" data-id="${r.id}"><div class="sinfo"><b>${fd(r.starts_at,{weekday:'short',month:'short',day:'numeric'})}</b><span>${range(r.starts_at,r.duration_min)} · ${esc(r.workout_type)}</span>
<i class="pillst ${ok?'ok':'pend'}">${past?'Done':ok?'Confirmed':'Pending'}</i>${r.moved_from?`<small>Moved from ${fd(r.moved_from,{month:'short',day:'numeric'})}, ${range(r.moved_from,r.duration_min)}</small>`:''}</div>
${past?'':late?'<small class="mut">Within 24 hrs: call or text to change</small>':`<button class="btn sm ${open===r.id?'':'ghost'}" type="button" data-move="${r.id}">${open===r.id?'Close':'Reschedule'}</button>`}
${open===r.id?`<div class="mover" id="mover"><p class="note">Loading open ${esc(r.workout_type)} times…</p></div>`:''}</div>`}
R.addEventListener('click',async e=>{const m=e.target.closest('[data-move]');if(m){const id=+m.dataset.move;open=open===id?null:id;selDay=selT=null;draw();if(open)loadSlots();return}
const d=e.target.closest('[data-d]');if(d){selDay=d.dataset.d;selT=null;drawMover();return}
const t=e.target.closest('[data-t]');if(t){selT=t.dataset.t;drawMover();return}
if(e.target.id==='mv-ok')doMove()});
async function loadSlots(){const r=V.sessions.find(x=>x.id===open),from=new Date(Date.now()+CUT).toISOString(),to=new Date(Date.now()+31*864e5).toISOString();
const a=await rpc('training_availability',{p_program:r.program,p_from:from,p_to:to,p_workout_type:r.workout_type});
const others=V.sessions.filter(x=>x.id!==r.id&&['requested','confirmed'].includes(x.status));
slots=(a.ok&&Array.isArray(a.j)?a.j:[]).filter(x=>x.seats_left>0).map(x=>new Date(x.starts_at).toISOString()).filter(t=>new Date(t)-Date.now()>=CUT&&t!==new Date(r.starts_at).toISOString()&&!others.some(o=>Math.abs(new Date(o.starts_at)-new Date(t))<TWO));
selDay=slots[0]?kd(slots[0]):null;drawMover()}
function drawMover(){const M=$('mover');if(!M)return;const r=V.sessions.find(x=>x.id===open);if(!slots.length){M.innerHTML='<p class="note">No open '+esc(r.workout_type)+' times in the next 30 days. Call or text us and we’ll find one.</p>';return}
const days=[...new Set(slots.map(kd))];
M.innerHTML=`<p class="note">Pick a new ${esc(r.workout_type)} time (2 hrs, Denver time).</p><div class="days">${days.map(k=>{const d=new Date(k+'T12:00:00Z');return `<button type="button" class="day${k===selDay?' on':''}" data-d="${k}"><small>${d.toLocaleDateString('en-US',{weekday:'short',timeZone:'UTC'})}</small><b>${d.getUTCDate()}</b><small>${d.toLocaleDateString('en-US',{month:'short',timeZone:'UTC'})}</small></button>`}).join('')}</div>
<div class="hours">${slots.filter(t=>kd(t)===selDay).map(t=>`<button type="button" class="hr hb${t===selT?' on':''}" data-t="${t}"><span>${range(t)}</span></button>`).join('')}</div>
<div class="cta2 left"><button class="btn" type="button" id="mv-ok"${selT?'':' disabled'}>${selT?'Move to '+fd(selT,{weekday:'short',month:'short',day:'numeric'})+', '+range(selT):'Pick a time'}</button></div><p class="note" id="mv-msg" role="status"></p>`}
async function doMove(){if(!selT)return;const b=$('mv-ok');b.disabled=true;b.textContent='Moving…';
const r=await rpc('parent_move',{p_token:tok,p_session:open,p_start:selT});
if(!r.ok||!r.j||r.j.error){$('mv-msg').textContent=(r.j&&(r.j.error||r.j.message))||'Couldn’t move it. Please try again or call us.';b.disabled=false;b.textContent='Try again';return}
fetch(S.supabaseUrl+'/functions/v1/notify',{method:'POST',headers:{'Content-Type':'application/json',apikey:S.supabaseKey,Authorization:'Bearer '+S.supabaseKey},body:JSON.stringify({token:tok})}).catch(()=>{});
const id=open;open=null;await load();const row=R.querySelector(`[data-id="${id}"]`);if(row){row.classList.add('moved');const n=document.createElement('p');n.className='note okmsg';n.textContent='Moved. We emailed you a confirmation; a coach will confirm the new time.';row.appendChild(n)}}
load()})();
