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
sessionStorage.setItem('coach',JSON.stringify(cred));D=j;$('who').textContent='Coach '+j.name;show(true);msg('');drawCal();drawList();drawBlocks();return true}
document.querySelector('.tabs').onclick=e=>{const t=e.target.dataset.tab;if(!t)return;document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('hide',x.id!==t));document.querySelectorAll('.tabs .btn').forEach(b=>b.classList.toggle('ghost',b.dataset.tab!==t))};
const who=id=>D.signups.find(s=>s.id===id)||{};
// Calendar
let sel=new Date().toLocaleDateString('en-CA');const mob=matchMedia('(max-width:759px)');mob.onchange=()=>drawCal();
const reqsOn=k=>D.requests.filter(r=>K(r.starts_at)===k&&r.status!=='cancelled'&&r.status!=='declined').sort((a,b)=>a.starts_at<b.starts_at?-1:1);
const blksOn=k=>D.blocks.filter(b=>K(b.starts_at)===k);
const chip=(t,c)=>`<span class="chip ${c||''}">${esc(t)}</span>`;
function row(r){const s=who(r.signup_id);return `<button class="ag ${r.status}" data-req="${r.id}"><b class="t">${F(r.starts_at,{hour:'numeric',minute:'2-digit'})}</b><span class="m"><b>${esc(s.athlete||'?')}</b><span>${esc(r.program)}</span><span>${chip(r.status,r.status)}${chip(s.payment_status||'',s.payment_status)}</span></span></button>`}
const blk=b=>`<div class="ag blk"><b class="t">⛔</b><span class="m"><b>${F(b.starts_at,{hour:'numeric'})}–${F(b.ends_at,{hour:'numeric'})} blocked</b><span>${esc(b.note||'')}</span></span></div>`;
function dayList(k,title){const r=reqsOn(k),b=blksOn(k);return `<h3 class="agh">${title||new Date(k+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'})}</h3>`+(r.length||b.length?r.map(row).join('')+b.map(blk).join(''):'<p class="note">No sessions.</p>')}
function drawCal(){const C=$('cal'),A=$('agenda'),m=mob.matches;let start,n;
if(week){start=new Date(view);start.setDate(start.getDate()-start.getDay());n=7;$('cal-title').textContent='Week of '+start.toLocaleDateString('en-US',{month:'short',day:'numeric'})}
else{const f=new Date(view.getFullYear(),view.getMonth(),1);start=new Date(f);start.setDate(1-f.getDay());n=42;$('cal-title').textContent=f.toLocaleDateString('en-US',{month:'long',year:'numeric'})}
const days=[...Array(n)].map((_,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);return d});
if(week&&m){C.className='cal hide';A.innerHTML=days.map(d=>dayList(d.toLocaleDateString('en-CA'))).join('');return}
C.className='cal'+(week?' week':'')+(m?' mini':'');
let h=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<div class="h">${m?d[0]:d}</div>`).join('');
for(const d of days){const k=d.toLocaleDateString('en-CA'),r=reqsOn(k),b=blksOn(k),o=!week&&d.getMonth()!==view.getMonth()?' o':'',today=k===new Date().toLocaleDateString('en-CA')?' today':'';
if(m)h+=`<button class="c${o}${today}${k===sel?' sel':''}" data-day="${k}"><b>${d.getDate()}</b>${r.length?`<i>${r.length}</i>`:''}${b.length?'<s></s>':''}</button>`;
else h+=`<div class="c${o}${today}"><b>${d.getDate()}</b>${r.map(x=>{const s=who(x.signup_id);return `<button class="ev ${x.status}" data-req="${x.id}" title="${esc(F(x.starts_at,{hour:'numeric'})+' '+(s.athlete||'')+' · '+x.program+' · '+x.status+' · '+(s.payment_status||''))}"><b>${F(x.starts_at,{hour:'numeric'})}</b> ${esc(s.athlete||'?')}<small>${esc(x.program)} · ${esc(s.payment_status||'')}</small></button>`}).join('')}${b.map(x=>`<span class="ev blk" title="${esc(x.note||'')}">⛔ ${F(x.starts_at,{hour:'numeric'})}–${F(x.ends_at,{hour:'numeric'})} ${esc(x.note||'Blocked')}</span>`).join('')}</div>`}
C.innerHTML=h;A.innerHTML=m?dayList(sel):''}
$('cal').addEventListener('click',e=>{const d=e.target.closest('[data-day]');if(d){sel=d.dataset.day;drawCal()}});
$('prev').onclick=()=>{week?view.setDate(view.getDate()-7):view.setMonth(view.getMonth()-1);drawCal()};$('next').onclick=()=>{week?view.setDate(view.getDate()+7):view.setMonth(view.getMonth()+1);drawCal()};
$('mode').onclick=()=>{week=!week;$('mode').textContent=week?'Month view':'Week view';drawCal()};
$('t-cal').onclick=e=>{const b=e.target.closest('[data-req]');if(!b)return;const r=D.requests.find(x=>x.id==b.dataset.req),s=who(r.signup_id);
$('rq-info').innerHTML=`<b>${esc(s.athlete)}</b> (age ${esc(s.age)}) · ${esc(r.program)}<br>${F(r.starts_at,{weekday:'long',month:'short',day:'numeric',hour:'numeric'})} · <i>${r.status}</i><br>Parent ${esc(s.parent)} · <a href="tel:${esc(s.phone)}">${esc(s.phone||'')}</a> · <a href="mailto:${esc(s.email)}">${esc(s.email)}</a><br>Payment: ${esc(s.payment_status)}`;
$('rq-date').value=K(r.starts_at);$('rq-time').value=F(r.starts_at,{hour:'2-digit',minute:'2-digit',hourCycle:'h23'});$('rq').dataset.id=r.id;$('rq').showModal()};
async function req(p){const j=await rpc('coach_update_request',{...auth(),p_id:+$('rq').dataset.id,...p});if(j.error)return msg(j.error);$('rq').close();load()}
$('rq-ok').onclick=()=>req({p_status:'confirmed',p_start:null});$('rq-no').onclick=()=>req({p_status:'declined',p_start:null});
$('rq-move').onclick=()=>req({p_status:'confirmed',p_start:at($('rq-date').value,$('rq-time').value)});$('rq-x').onclick=()=>$('rq').close();
// Sign-ups list
const cols=[['created_at','Date'],['parent','Parent'],['athlete','Athlete'],['age','Age'],['program','Program'],['phone','Phone'],['email','Email'],['message','Message'],['status','Status'],['payment_status','Paid']];
document.querySelector('#list thead tr').innerHTML=cols.map(([k,l])=>`<th data-k="${k}">${l}</th>`).join('')+'<th></th>';
document.querySelector('#list thead').onclick=e=>{const k=e.target.dataset.k;if(!k)return;asc=sk===k?!asc:true;sk=k;drawList()};
function drawList(){const rows=[...D.signups].sort((a,b)=>{const x=a[sk]??'',y=b[sk]??'';return(x>y?1:x<y?-1:0)*(asc?1:-1)});
document.querySelector('#list tbody').innerHTML=rows.length?rows.map(r=>'<tr>'+cols.map(([k])=>k==='status'||k==='payment_status'?`<td><select class="s" data-f="${k}" data-id="${r.id}">${(k==='status'?['new','contacted','booked']:['pending','paid','refunded','waived']).map(o=>`<option${o===r[k]?' selected':''}>${o}</option>`).join('')}</select></td>`:`<td>${esc(k==='created_at'?F(r[k],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):r[k])}</td>`).join('')+`<td><button class="btn sm ghost" data-del="${r.id}">Delete</button></td></tr>`).join(''):'<tr><td colspan="11">No sign-ups yet.</td></tr>'}
document.querySelector('#list tbody').onchange=async e=>{const id=+e.target.dataset.id,k=e.target.dataset.f;const j=await rpc('coach_update_signup',{...auth(),p_id:id,p_status:k==='status'?e.target.value:null,p_payment:k==='payment_status'?e.target.value:null});if(j.error)return msg(j.error);who(id)[k]=e.target.value;drawCal();msg('Saved.')};
document.querySelector('#list tbody').onclick=async e=>{const id=e.target.dataset.del;if(!id||!confirm('Delete this sign-up and its sessions?'))return;const j=await rpc('coach_delete_signup',{...auth(),p_id:+id});if(j.error)return msg(j.error);load()};
$('csv').onclick=()=>{const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';const sess=id=>D.requests.filter(r=>r.signup_id===id).map(r=>F(r.starts_at,{month:'short',day:'numeric',hour:'numeric'})+' ('+r.status+')').join('; ');
const csv=[[...cols.map(c=>c[1]),'Sessions'].map(q).join(','),...D.signups.map(r=>[...cols.map(([k])=>r[k]),sess(r.id)].map(q).join(','))].join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='signups-'+new Date().toISOString().slice(0,10)+'.csv';a.click()};
// Blockouts
function drawBlocks(){document.querySelector('#blocks tbody').innerHTML=D.blocks.filter(b=>new Date(b.ends_at)>Date.now()).map(b=>`<tr><td>${F(b.starts_at,{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})} – ${F(b.ends_at,{hour:'numeric',minute:'2-digit'})}</td><td>${esc(b.note)}</td><td><button class="btn sm ghost" data-del="${b.id}">Remove</button></td></tr>`).join('')||'<tr><td colspan="3">No blocked times. Parents can request any day 6 AM–8 PM start.</td></tr>'}
$('blocks').onclick=async e=>{const id=e.target.dataset.del;if(!id)return;const j=await rpc('coach_delete_block',{...auth(),p_id:+id});if(j.error)return msg(j.error);load()};
$('addblock').onsubmit=async e=>{e.preventDefault();const d=$('bd').value,j=await rpc('coach_add_block',{...auth(),p_start:at(d,$('bs').value),p_end:at(d,$('be').value),p_note:$('bn').value});if(j.error)return msg(j.error);msg('Time blocked.');e.target.reset();load()};
if(cred)load();
