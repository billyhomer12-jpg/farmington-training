(()=>{const S=window.SITE||{};const $=s=>document.querySelector(s);
const rpc=(fn,b)=>fetch(S.supabaseUrl+'/rest/v1/rpc/'+fn,{method:'POST',headers:{apikey:S.supabaseKey,'Content-Type':'application/json'},body:JSON.stringify(b)}).then(r=>r.json());
const TZ='America/Denver',NAMES={'1on1_monthly':['1-on-1 Monthly','$240/mo · 4 sessions/mo'],'1on1_monthly_plus':['1-on-1 Monthly Plus','$460/mo · 8 sessions/mo (pick 4 now, 4 more before week 3)'],'open_group_monthly':['Open Group Monthly','$120/mo · 4 sessions/mo']};
const fmt=t=>new Date(t).toLocaleString('en-US',{timeZone:TZ,weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
const day=t=>new Date(t).toLocaleDateString('en-US',{timeZone:TZ,weekday:'long',month:'short',day:'numeric'});
async function slots(program,el,max,onPick,taken=[],type='Gym'){const from=new Date(Date.now()+864e5),to=new Date(Date.now()+28*864e5);
 const r=await rpc('membership_slots',{p_program:program,p_type:type});
 const ok=(Array.isArray(r)?r:[]).map(t=>({starts_at:t})).filter(x=>!taken.includes(+new Date(x.starts_at)));
 const g={};ok.forEach(x=>(g[day(x.starts_at)]=g[day(x.starts_at)]||[]).push(x.starts_at));
 el.innerHTML=Object.keys(g).length?'':'<p class="mut">No open times in the next 4 weeks. Text (505) 469-3851.</p>';
 for(const d in g){const w=document.createElement('div');w.className='mday';w.innerHTML='<p class="mdl">'+d+'</p>';
  g[d].forEach(t=>{const b=document.createElement('button');b.type='button';b.className='chip';b.textContent=new Date(t).toLocaleTimeString('en-US',{timeZone:TZ,hour:'numeric'});b.dataset.t=t;b.onclick=()=>onPick(t,b);w.appendChild(b)});el.appendChild(w)}}
const q=new URLSearchParams(location.search);
if($('#msign')){const tier=q.get('tier');const n=NAMES[tier];if(!n){$('#merr').textContent='Pick a plan on the Pricing page.';return}
 $('#mtitle').textContent=n[0];{const S0=window.DEALS&&window.DEALS.sale&&window.mpHTML,mp=$('#mplan');mp.dataset.nosale='1';mp.innerHTML=(S0?window.mpHTML(tier)+' · ':'')+(S0?n[1].replace(/^\$\d+\/mo · /,''):n[1]).replace(/&/g,'&amp;').replace(/</g,'&lt;')}const picks=new Set();const OG=tier==='open_group_monthly';if(OG){$('[name=program]').closest('label').hidden=true;$('#mhint').textContent='Open group times in the next 4 weeks. Pick 4 (one group, or mix groups). Each session is 2 hours.'}
 const PL=tier==='1on1_monthly_plus';if(PL){const h=$('#mcount').parentNode;h.firstChild.textContent='Pick your first 4 of 8 sessions ';const n=document.createElement('p');n.className='mut';n.id='mplus';n.textContent='You\'ll pick your other 4 sessions before week 3 of each billing month.';h.after(n)}
 const upd=()=>{$('#mcount').textContent='('+picks.size+' of 4)';$('#mgo').disabled=picks.size!==4};
 const load=()=>{picks.clear();upd();slots(OG?'Basketball Skills':$('[name=program]').value,$('#mdays'),4,(t,b)=>{if(picks.has(t)){picks.delete(t);b.classList.remove('on')}else if(picks.size<4){picks.add(t);b.classList.add('on')}upd()},[],OG?'OpenGroup':'Gym')};
 $('[name=program]').onchange=load;load();
 $('#msign').onsubmit=async e=>{e.preventDefault();$('#merr').textContent='';$('#mgo').disabled=true;const f=new FormData(e.target);
  const r=await fetch(S.supabaseUrl+'/functions/v1/'+(S.membershipCheckoutFn||'membership-checkout-test'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tier,parent:f.get('parent'),athlete:f.get('athlete'),email:f.get('email'),phone:f.get('phone'),program:f.get('program'),starts:[...picks],origin:location.origin})}).then(r=>r.json()).catch(()=>({error:'Network error. Please try again.'}));
  if(r.url)location.href=r.url;else{$('#merr').textContent=r.error;$('#mgo').disabled=false;load()}}}
if($('#mbox')){const tok=q.get('m');let V;
 const show=async()=>{V=await rpc('membership_view',{p_token:tok});if(V.error){$('#mbox').innerHTML='<p>'+V.error+'</p>';return}const n=NAMES[V.tier]||[V.tier];
  const st=V.canceling?'Canceling, active until '+new Date(V.period_end).toLocaleDateString('en-US',{timeZone:TZ,month:'short',day:'numeric',year:'numeric'}):(V.status==='active'?'Active':V.status);
  $('#mbox').innerHTML=(q.get('welcome')?'<p class="ok">Welcome! Your membership is set up.</p>':'')+'<h2>'+V.athlete+' · '+n[0]+'</h2><p><b>'+st+'</b>'+(V.period_end&&!V.canceling?' · renews '+new Date(V.period_end).toLocaleDateString('en-US',{timeZone:TZ,month:'short',day:'numeric'}):'')+'</p>'+
  '<p>Sessions left to pick: <b>'+V.sessions_left+'</b> (includes '+V.rollover+' rolled over) · Reschedules left this month: <b>'+V.reschedules_left+'</b></p>'+
  (V.picks_due&&V.sessions_left>0?'<p class="warn">Pick your remaining sessions before '+new Date(V.picks_due).toLocaleDateString('en-US',{timeZone:TZ,month:'short',day:'numeric'})+' (start of week 3).</p>':'')+
  '<h3>Upcoming sessions</h3><ul class="mlist">'+V.sessions.map(s=>'<li>'+fmt(s.starts_at)+' <button class="btn sm ghost" data-r="'+s.id+'">Reschedule</button></li>').join('')+'</ul>'+
  (V.sessions_left>0?'<button class="btn sm" id="mpk">Pick a session</button> ':'')+'<p class="fine">1 reschedule per billing month, at least 24 hours before the session; it resets when your membership renews. </p><button class="btn sm ghost" id="mportal">Manage / Cancel membership</button><p class="fine"> Month to month. Cancel anytime, keep access through the end of your month.</p>';
  document.querySelectorAll('[data-r]').forEach(b=>b.onclick=()=>pick(+b.dataset.r));if($('#mpk'))$('#mpk').onclick=()=>pick(null);
  $('#mportal').onclick=async()=>{const r=await fetch(S.supabaseUrl+'/functions/v1/'+(S.membershipCheckoutFn||'membership-checkout-test'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({portal_token:tok,origin:location.origin})}).then(r=>r.json());if(r.url)location.href=r.url;else $('#merr').textContent=r.error}};
 const pick=id=>{$('#mpick').hidden=false;$('#mpickh').textContent=id?'Pick a new time':'Pick a session';$('#merr').textContent='';
  slots(V.program||'Basketball Skills',$('#mdays'),1,async t=>{const r=id?await rpc('membership_reschedule',{p_token:tok,p_session:id,p_start:t}):await rpc('membership_pick',{p_token:tok,p_start:t});
   if(r.error)$('#merr').textContent=r.error;else{$('#mpick').hidden=true;show()}},V.sessions.map(s=>+new Date(s.starts_at)),V.workout_type||'Gym')};
 show()}})();
