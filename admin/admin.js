const S=window.SITE,$=i=>document.getElementById(i),msg=t=>$('msg').textContent=t||'',TZ='America/Denver';
const esc=v=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const rpc=async(fn,b)=>{const r=await fetch(S.supabaseUrl+'/rest/v1/rpc/'+fn,{method:'POST',headers:{apikey:S.supabaseKey,'Content-Type':'application/json'},body:JSON.stringify(b)});const j=await r.json().catch(()=>({}));if(!r.ok)return{error:j.message||'Request failed'};return j};
const F=(d,o)=>new Date(d).toLocaleString('en-US',{timeZone:TZ,...o}),K=d=>new Date(d).toLocaleDateString('en-CA',{timeZone:TZ});
const at=(ds,tm)=>{const g=new Date(ds+'T'+tm+':00Z');const off=new Date(g.toLocaleString('en-US',{timeZone:TZ}))-new Date(g.toLocaleString('en-US',{timeZone:'UTC'}));return new Date(g-off).toISOString()};
let cred=JSON.parse(sessionStorage.getItem('coach')||'null'),D={signups:[],requests:[],blocks:[]},view=new Date(),week=false,sk='created_at',asc=false;
const auth=()=>({p_email:cred.email,p_pin:cred.pin});
$('em').value=localStorage.getItem('coachEmail')||'';
$('login').onsubmit=async e=>{e.preventDefault();cred={email:$('em').value.trim().toLowerCase(),pin:$('pin').value};localStorage.setItem('coachEmail',cred.email);if(!await load())cred=null};
$('out').onclick=()=>{sessionStorage.removeItem('coach');cred=null;$('pin').value='';show(false)};
function show(on){$('login').classList.toggle('hide',on);$('app').classList.toggle('hide',!on)}
async function load(){msg('Loading…');const from=new Date(Date.now()-120*864e5).toISOString(),to=new Date(Date.now()+180*864e5).toISOString();
const j=await rpc('coach_data',{...auth(),p_from:from,p_to:to});if(j.error){msg(j.error);sessionStorage.removeItem('coach');show(false);return false}
sessionStorage.setItem('coach',JSON.stringify(cred));D=j;D.signups.forEach(x=>x.program=progLabel(x.program));D.requests.forEach(x=>x.program=progLabel(x.program));D.closures=D.closures||[];D.signups.forEach(x=>{const P=(S.packages||{})[x.package];x.package_txt=P?P.label+' · 4 sessions × 2 hrs':'';x.price_txt=x.price_cents!=null?'$'+(x.price_cents/100)+' (4 × 2 hrs)':''});D.signups.forEach(x=>{const r=D.requests.find(q=>q.signup_id===x.id);x.workout_type=r&&r.workout_type||''});$('who').textContent='Coach '+j.name;show(true);msg('');drawCal();drawList();drawBlocks();drawClosures();return true}
document.querySelector('.tabs').onclick=e=>{const t=e.target.dataset.tab;if(!t)return;document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('hide',x.id!==t));document.querySelectorAll('.tabs .btn').forEach(b=>b.classList.toggle('ghost',b.dataset.tab!==t))};
const who=id=>D.signups.find(s=>s.id===id)||{};
// Calendar
let mode='month',sel=new Date().toLocaleDateString('en-CA');
const TYPES={'Basketball Training':['BB','bb'],'Conditioning':['COND','ap'],'Weightlifting':['WL','st']};
const ty=r=>TYPES[r.program]||[String(r.program||'?').slice(0,2).toUpperCase(),'xx'];
const grp=r=>/group|clinic|team/i.test(r.format||'');
const first=id=>String(who(id).athlete||'?').replace(/^DEMO\s+/i,'').split(/\s+/)[0];
const reqsOn=k=>D.requests.filter(r=>K(r.starts_at)===k&&r.status!=='cancelled'&&r.status!=='declined').sort((a,b)=>a.starts_at<b.starts_at?-1:1);
const blksOn=k=>D.blocks.filter(b=>K(b.starts_at)===k);
const WT={'Gym':'🏀','Outdoor':'🌤','Weight room':'🏋'},wti=r=>r.workout_type?' '+(WT[r.workout_type]||''):'';
const pill=r=>`<button class="pl t-${ty(r)[1]}${grp(r)?' grp':''}${r.status==='requested'?' rq':''}" data-req="${r.id}">${esc(first(r.signup_id))} · ${ty(r)[0]}${r.format?(grp(r)?' Grp':' 1:1'):''}${wti(r)}</button>`;
const kd=d=>d.toLocaleDateString('en-CA'),kdate=k=>new Date(k+'T12:00:00');
function drawCal(){const C=$('cal'),A=$('agenda');document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('ghost',b.dataset.mode!==mode));A.innerHTML='';
if(mode==='day'){const d=kdate(sel);$('cal-title').textContent=d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});C.className='cal hide';
const r=reqsOn(sel),H=52;let h='<div class="tl">';for(let i=5;i<=21;i++)h+=`<div class="hl" style="top:${(i-5)*H}px"><span>${i%12||12} ${i<12?'AM':'PM'}</span></div>`;
blksOn(sel).forEach(b=>{const s=+F(b.starts_at,{hour:'numeric',hourCycle:'h23'}),e=+F(b.ends_at,{hour:'numeric',hourCycle:'h23'})||24;h+=`<div class="tb" style="top:${(Math.max(s,5)-5)*H}px;height:${(Math.min(e,21)-Math.max(s,5))*H}px">Blocked ${esc(b.note||'')}</div>`});
const by={};r.forEach(x=>(by[x.starts_at]=by[x.starts_at]||[]).push(x));
Object.values(by).forEach(g=>g.forEach((x,i)=>{const hr=+F(x.starts_at,{hour:'numeric',hourCycle:'h23'}),s=who(x.signup_id);
h+=`<button class="te t-${ty(x)[1]}${grp(x)?' grp':''}${x.status==='requested'?' rq':''}" data-req="${x.id}" style="top:${(hr-5)*H+1}px;height:${H*(x.duration_min||60)/60-2}px;left:calc(56px + (100% - 56px) * ${i}/${g.length});width:calc((100% - 56px) / ${g.length} - 3px)"><b>${esc(first(x.signup_id))}</b> ${esc(ty(x)[0])}${x.format?' · '+esc(x.format):''}${x.workout_type?' · '+esc(x.workout_type):''}<small>${F(x.starts_at,{hour:'numeric'})}–${F(new Date(new Date(x.starts_at).getTime()+(x.duration_min||60)*6e4),{hour:'numeric'})} · ${esc(x.status)} · ${esc(s.payment_status||'')}</small></button>`}));
A.innerHTML=h+`<div style="height:${16*H+20}px"></div></div>`+(r.length?'':'<p class="note">No sessions this day.</p>');return}
if(mode==='week'){const st=new Date(view);st.setDate(st.getDate()-st.getDay());$('cal-title').textContent='Week of '+st.toLocaleDateString('en-US',{month:'short',day:'numeric'});C.className='cal hide';
A.innerHTML=[...Array(7)].map((_,i)=>{const d=new Date(st);d.setDate(st.getDate()+i);const k=kd(d),r=reqsOn(k),b=blksOn(k);
return `<div class="wd"><button class="wdh" data-day="${k}">${d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}</button><div class="pls">${r.map(pill).join('')}${b.length?'<span class="pl blk">Blocked</span>':''}${r.length||b.length?'':'<span class="note">—</span>'}</div></div>`}).join('');return}
const f=new Date(view.getFullYear(),view.getMonth(),1),st=new Date(f);st.setDate(1-f.getDay());$('cal-title').textContent=f.toLocaleDateString('en-US',{month:'long',year:'numeric'});C.className='cal';
let h=['S','M','T','W','T','F','S'].map(d=>`<div class="h">${d}</div>`).join('');const today=kd(new Date());
for(let i=0;i<42;i++){const d=new Date(st);d.setDate(st.getDate()+i);const k=kd(d),r=reqsOn(k),b=blksOn(k);
h+=`<div class="c${d.getMonth()!==view.getMonth()?' o':''}${k===today?' today':''}"><button class="dn" data-day="${k}">${d.getDate()}</button>${b.length?'<span class="bd" title="Blocked time"></span>':''}${r.slice(0,4).map(pill).join('')}${r.length>4?`<button class="more" data-day="${k}">+${r.length-4}</button>`:''}</div>`}
C.innerHTML=h}
$('t-cal').addEventListener('click',e=>{const d=e.target.closest('[data-day]');if(d){sel=d.dataset.day;mode='day';drawCal();return}const m=e.target.closest('[data-mode]');if(m){mode=m.dataset.mode;if(mode==='day'&&!sel)sel=kd(new Date());drawCal()}});
const step=n=>{if(mode==='day'){const d=kdate(sel);d.setDate(d.getDate()+n);sel=kd(d);view=new Date(d)}else if(mode==='week')view.setDate(view.getDate()+7*n);else view.setMonth(view.getMonth()+n);drawCal()};
$('prev').onclick=()=>step(-1);$('next').onclick=()=>step(1);
$('t-cal').onclick=e=>{const b=e.target.closest('[data-req]');if(!b||e.target.closest('[data-day],[data-mode]'))return;const r=D.requests.find(x=>x.id==b.dataset.req),s=who(r.signup_id);
$('rq-info').innerHTML=`<b>${esc(s.athlete)}</b> (age ${esc(s.age)}) · ${esc(r.program)}<br>${F(r.starts_at,{weekday:'long',month:'short',day:'numeric',hour:'numeric'})} · <i>${r.status}</i><br>Parent ${esc(s.parent)} · <a href="tel:${esc(s.phone)}">${esc(s.phone||'')}</a> · <a href="mailto:${esc(s.email)}">${esc(s.email)}</a><br>Payment: ${esc(s.payment_status)}`;
$('rq-date').value=K(r.starts_at);$('rq-time').value=F(r.starts_at,{hour:'2-digit',minute:'2-digit',hourCycle:'h23'});$('rq').dataset.id=r.id;$('rq').showModal()};
async function req(p){const j=await rpc('coach_update_request',{...auth(),p_id:+$('rq').dataset.id,...p});if(j.error)return msg(j.error);$('rq').close();load()}
$('rq-ok').onclick=()=>req({p_status:'confirmed',p_start:null});$('rq-no').onclick=()=>req({p_status:'declined',p_start:null});
$('rq-move').onclick=()=>req({p_status:'confirmed',p_start:at($('rq-date').value,$('rq-time').value)});$('rq-x').onclick=()=>$('rq').close();
// Sign-ups list
const cols=[['created_at','Date'],['parent','Parent'],['athlete','Athlete'],['age','Age'],['program','Program'],['workout_type','Workout'],['package_txt','Package'],['price_txt','Price'],['phone','Phone'],['email','Email'],['message','Message'],['status','Status'],['payment_status','Paid']];
document.querySelector('#list thead tr').innerHTML=cols.map(([k,l])=>`<th data-k="${k}">${l}</th>`).join('')+'<th></th>';
document.querySelector('#list thead').onclick=e=>{const k=e.target.dataset.k;if(!k)return;asc=sk===k?!asc:true;sk=k;drawList()};
function drawList(){const rows=[...D.signups].sort((a,b)=>{const x=a[sk]??'',y=b[sk]??'';return(x>y?1:x<y?-1:0)*(asc?1:-1)});
document.querySelector('#list tbody').innerHTML=rows.length?rows.map(r=>'<tr>'+cols.map(([k])=>k==='status'||k==='payment_status'?`<td><select class="s" data-f="${k}" data-id="${r.id}">${(k==='status'?['new','contacted','booked']:['pending','paid','refunded','waived']).map(o=>`<option${o===r[k]?' selected':''}>${o}</option>`).join('')}</select></td>`:`<td>${esc(k==='created_at'?F(r[k],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):r[k])}</td>`).join('')+`<td><button class="btn sm ghost" data-del="${r.id}">Delete</button></td></tr>`).join(''):'<tr><td colspan="13">No sign-ups yet.</td></tr>'}
document.querySelector('#list tbody').onchange=async e=>{const id=+e.target.dataset.id,k=e.target.dataset.f;const j=await rpc('coach_update_signup',{...auth(),p_id:id,p_status:k==='status'?e.target.value:null,p_payment:k==='payment_status'?e.target.value:null});if(j.error)return msg(j.error);who(id)[k]=e.target.value;drawCal();msg('Saved.')};
document.querySelector('#list tbody').onclick=async e=>{const id=e.target.dataset.del;if(!id||!confirm('Delete this sign-up and its sessions?'))return;const j=await rpc('coach_delete_signup',{...auth(),p_id:+id});if(j.error)return msg(j.error);load()};
$('csv').onclick=()=>{const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';const sess=id=>D.requests.filter(r=>r.signup_id===id).map(r=>F(r.starts_at,{month:'short',day:'numeric',hour:'numeric'})+' ('+r.status+')').join('; ');
const csv=[[...cols.map(c=>c[1]),'Sessions'].map(q).join(','),...D.signups.map(r=>[...cols.map(([k])=>r[k]),sess(r.id)].map(q).join(','))].join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='signups-'+new Date().toISOString().slice(0,10)+'.csv';a.click()};
// Blockouts
function drawBlocks(){document.querySelector('#blocks tbody').innerHTML=D.blocks.filter(b=>new Date(b.ends_at)>Date.now()).map(b=>`<tr><td>${F(b.starts_at,{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})} – ${F(b.ends_at,{hour:'numeric',minute:'2-digit'})}</td><td>${esc(b.note)}</td><td><button class="btn sm ghost" data-del="${b.id}">Remove</button></td></tr>`).join('')||'<tr><td colspan="3">No blocked times. Parents can request any day 6 AM–8 PM start.</td></tr>'}
$('blocks').onclick=async e=>{const id=e.target.dataset.del;if(!id)return;const j=await rpc('coach_delete_block',{...auth(),p_id:+id});if(j.error)return msg(j.error);load()};
$('addblock').onsubmit=async e=>{e.preventDefault();const d=$('bd').value,j=await rpc('coach_add_block',{...auth(),p_start:at(d,$('bs').value),p_end:at(d,$('be').value),p_note:$('bn').value});if(j.error)return msg(j.error);msg('Time blocked.');e.target.reset();load()};
if(cred)load();
function drawClosures(){document.querySelector('#closures tbody').innerHTML=D.closures.filter(b=>new Date(b.ends_at)>Date.now()).map(b=>`<tr><td>${F(b.starts_at,{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})} – ${F(b.ends_at,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</td><td>${esc(b.reason)}</td><td><button class="btn sm ghost" data-delc="${b.id}">Remove</button></td></tr>`).join('')||'<tr><td colspan="3">No upcoming gym closures.</td></tr>'}
$('closures').onclick=async e=>{const id=e.target.dataset.delc;if(!id)return;const j=await rpc('coach_delete_closure',{...auth(),p_id:+id});if(j.error)return msg(j.error);load()};
$('addclosure').onsubmit=async e=>{e.preventDefault();const j=await rpc('coach_add_closure',{...auth(),p_start:at($('cd1').value,$('ct1').value||'00:00'),p_end:at($('cd2').value||$('cd1').value,$('ct2').value||'23:59'),p_reason:$('cr').value});if(j.error)return msg(j.error);msg('Gym closure added.');e.target.reset();load()};
