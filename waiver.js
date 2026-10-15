// Online waiver signing panel (book.html before payment, book.html?sign=<link token>, my.html).
// WaiverPanel(el, cred, onDone): cred = {ref} | {token} | {wtoken}. onDone() runs once every athlete is signed.
(()=>{const S=window.SITE,FN=S.supabaseUrl+'/functions/v1/waiver-sign';
const esc=v=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const call=async b=>{try{const r=await fetch(FN,{method:'POST',headers:{'Content-Type':'application/json',apikey:S.supabaseKey},body:JSON.stringify(b)});const j=await r.json().catch(()=>({}));return r.ok?j:{error:j.error||'Something went wrong. Please try again.'}}catch{return{error:'Network error. Please try again.'}}};
const body=t=>t.split(/\n\n+/).map(b=>b.startsWith('# ')?`<h3>${esc(b.slice(2))}</h3>`:b.startsWith('## ')?`<h4>${esc(b.slice(3))}</h4>`:`<p>${esc(b)}</p>`).join('');
window.WaiverPanel=async(el,cred,onDone)=>{el.innerHTML='<div class="card"><p class="mut">Loading the waiver…</p></div>';
const ctx=await call({action:'context',...cred});if(ctx.error){el.innerHTML=`<div class="card"><h3>Waiver</h3><p>${esc(ctx.error)}</p></div>`;return}
const todo=ctx.athletes.filter(a=>!ctx.signed.includes(a.index));if(!todo.length){onDone&&onDone();return}
const a=todo[0],n=ctx.athletes.length,k=n-todo.length+1;
el.innerHTML=`<div class="card wsign"><h3>Sign the waiver${n>1?` · player ${k} of ${n}`:''}</h3>
<p>A parent or legal guardian of <b>${esc(a.athlete)}</b> signs before payment.${n>1?' Each athlete needs their own waiver; another player\'s parent can sign on this device.':''} <a href="waiver.pdf" download>Paper copy (PDF)</a></p>
<div class="wtext" tabindex="0" role="region" aria-label="Waiver text">${body(ctx.version.body)}<p class="mut"><small>Version ${esc(ctx.version.version)}</small></p></div>
<div class="wform"><div class="grid2">
<label>Athlete first &amp; last name<input name="athlete_name" required value="${esc(a.athlete)}" autocomplete="off"></label>
<label>Athlete date of birth<input name="athlete_dob" type="date" required></label>
<label>Emergency contact name<input name="emergency_name" required autocomplete="off"></label>
<label>Emergency phone<input name="emergency_phone" type="tel" required inputmode="tel" autocomplete="off"></label></div>
<label>Allergies, conditions &amp; medications <small class="mut">(optional)</small><textarea name="medical_notes" rows="2" maxlength="2000"></textarea></label>
<label class="chk"><input type="checkbox" name="photo_opt_in"> Photo/video opt-in: you may use photos and video of the athlete on your website and social media.</label>
<div class="grid2"><label>Your first &amp; last name (parent/guardian)<input name="signer_name" required autocomplete="name" value="${k===1&&ctx.parent?esc(ctx.parent):''}"></label>
<label>Relationship to athlete<select name="signer_relationship" required><option value="">Choose…</option><option>Parent</option><option>Legal guardian</option></select></label></div>
<label class="chk"><input type="checkbox" name="consent" required> I am the athlete's parent or legal guardian, 18 or older. I have read this waiver, agree to it, and sign it electronically. My electronic signature is the same as a handwritten one.</label>
<div class="sigwrap"><span>Sign here with your finger or mouse</span><canvas class="sig" aria-label="Signature pad" role="img"></canvas><button type="button" class="btn sm ghost sigclear">Clear</button></div>
<p class="wst" role="status" aria-live="polite"></p><button class="btn wsubmit" type="button">Sign waiver${todo.length>1?' & continue':''}</button></div></div>`;
const F=el.querySelector('.wform'),C=el.querySelector('canvas'),x=C.getContext('2d'),W=el.querySelector('.wst');let ink=0,down=false,last=null;
const size=()=>{const r=C.getBoundingClientRect(),d=window.devicePixelRatio||1;C.width=Math.round(r.width*d);C.height=Math.round(r.height*d);x.setTransform(d,0,0,d,0,0);x.lineWidth=2.4;x.lineCap='round';x.lineJoin='round';x.strokeStyle='#1d1d1f';ink=0};size();
let rw=C.getBoundingClientRect().width;addEventListener('resize',()=>{const w=C.getBoundingClientRect().width;if(Math.abs(w-rw)>2&&!ink){rw=w;size()}});
const pt=e=>{const r=C.getBoundingClientRect();return[e.clientX-r.left,e.clientY-r.top]};
C.addEventListener('pointerdown',e=>{e.preventDefault();C.setPointerCapture(e.pointerId);down=true;last=pt(e);x.beginPath();x.arc(last[0],last[1],1.1,0,7);x.fillStyle='#1d1d1f';x.fill();ink++});
C.addEventListener('pointermove',e=>{if(!down)return;e.preventDefault();const p=pt(e);x.beginPath();x.moveTo(...last);x.lineTo(...p);x.stroke();ink+=Math.hypot(p[0]-last[0],p[1]-last[1]);last=p});
['pointerup','pointercancel','pointerleave'].forEach(t=>C.addEventListener(t,()=>down=false));
el.querySelector('.sigclear').onclick=()=>{x.clearRect(0,0,C.width,C.height);ink=0};
const q=n=>F.querySelector(`[name=${n}]`);F.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.tagName!=='TEXTAREA'){e.preventDefault()}});
F.querySelector('.wsubmit').onclick=async()=>{const d={};F.querySelectorAll('input[name]:not([type=checkbox]),select[name],textarea[name]').forEach(i=>d[i.name]=i.value);const miss=[];
if(!/\S+\s+\S+/.test(d.athlete_name||''))miss.push('athlete name');if(!d.athlete_dob)miss.push('date of birth');if(!/\S+\s+\S+/.test(d.emergency_name||''))miss.push('emergency contact');
if((d.emergency_phone||'').replace(/\D/g,'').length<10)miss.push('emergency phone');if(!/\S+\s+\S+/.test(d.signer_name||''))miss.push('your full name');if(!d.signer_relationship)miss.push('relationship');
if(!q('consent').checked)miss.push('consent checkbox');if(ink<40)miss.push('signature');if(miss.length){W.textContent='Please complete: '+miss.join(', ')+'.';return}
const b=F.querySelector('.wsubmit');b.disabled=true;W.textContent='Saving your signed waiver…';
const j=await call({action:'sign',...cred,athlete_index:a.index,...d,photo_opt_in:q('photo_opt_in').checked,consent:true,version:ctx.version.version,version_sha256:ctx.version.sha256,signature:C.toDataURL('image/png'),ink:Math.round(ink)});
if(j.error){W.textContent=j.error;b.disabled=false;return}
W.textContent='Signed. A copy is on its way to your email.';setTimeout(()=>window.WaiverPanel(el,cred,onDone),600)};};})();
