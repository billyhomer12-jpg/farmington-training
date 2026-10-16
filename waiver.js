// Online waiver signing panel (book.html before payment, book.html?sign=<link token>, my.html).
// WaiverPanel(el, cred, onDone, opt): cred = {ref} | {token} | {wtoken}. opt.only = sign just that athlete index
// (book.html group flow: athlete 1 only). onDone() runs once the athletes in scope are signed.
// WaiverShare(el, cred): 'Send waiver link' buttons for unsigned group players (cred = {ref} | {token}).
(()=>{const S=window.SITE,FN=S.supabaseUrl+'/functions/v1/waiver-sign';
const esc=v=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
// 20 s timeout on every call; network/timeout errors come back as {error} so callers always leave the busy state.
const call1=async b=>{const ac=new AbortController(),tm=setTimeout(()=>ac.abort(),20000);try{const r=await fetch(FN,{method:'POST',headers:{'Content-Type':'application/json',apikey:S.supabaseKey},body:JSON.stringify(b),signal:ac.signal});const j=await r.json().catch(()=>({}));return r.ok?j:{error:j.error||'Something went wrong saving the waiver. Please tap Retry.',_net:[502,503,504].includes(r.status)}}catch(e){return{error:e&&e.name==='AbortError'?'This is taking too long (connection timed out). Check your signal and tap Retry. Your answers are still filled in.':'Network error. Check your connection and tap the button to try again. Your answers are still filled in.',_net:!(e&&e.name==='AbortError')}}finally{clearTimeout(tm)}};
// Auto-retry once, silently, on a dropped connection or a 502/503/504 (e.g. during a function deploy) before showing the error.
const call=async b=>{let j=await call1(b);if(j&&j._net){await new Promise(r=>setTimeout(r,1500));j=await call1(b)}if(j)delete j._net;return j};
const body=t=>t.split(/\n\n+/).map(b=>b.startsWith('# ')?`<h3>${esc(b.slice(2))}</h3>`:b.startsWith('## ')?`<h4>${esc(b.slice(3))}</h4>`:`<p>${esc(b)}</p>`).join('');
window.WaiverPanel=async(el,cred,onDone,opt={})=>{el.innerHTML='<div class="card"><p class="mut">Loading the waiver…</p></div>';
const ctx=await call({action:'context',...cred});if(ctx.error){el.innerHTML=`<div class="card"><h3>Waiver</h3><p>${esc(ctx.error)}</p><button type="button" class="btn wretry">Retry</button></div>`;el.querySelector('.wretry').onclick=()=>window.WaiverPanel(el,cred,onDone,opt);return}
const only=opt.only!=null?opt.only:ctx.only,todo=ctx.athletes.filter(a=>!ctx.signed.includes(a.index)&&(only==null||a.index===only));if(!todo.length){if(onDone)onDone();else if(ctx.only!=null)el.innerHTML='<div class="card"><h3>Already signed</h3><p>This athlete\'s waiver is signed and on file. Thanks!</p></div>';return}
const a=todo[0],n=only!=null?(ctx.total||ctx.athletes.length):ctx.athletes.length,k=n-todo.length+1,solo=only!=null&&(ctx.only!=null||n>1);
el.innerHTML=`<div class="card wsign"><h3>${solo?`Waiver for ${esc(a.athlete)}`:`Sign the waiver${n>1?` · player ${k} of ${n}`:''}`}</h3>
<p>${solo&&a.index>0?`A parent or legal guardian of <b>${esc(a.athlete)}</b> signs before ${esc(a.athlete.split(' ')[0])} trains. It takes about 2 minutes.`:solo&&n>1&&cred.ref?`Sign for <b>${esc(a.athlete)}</b> now to unlock payment. Next you'll get a link to send each other player's parent so they can sign on their own phone.`:`A parent or legal guardian of <b>${esc(a.athlete)}</b> signs${cred.ref?' before payment':''}.${n>1&&!solo?' Each athlete needs their own waiver; another player\'s parent can sign on this device.':''}`} <a href="waiver.pdf" download>Paper copy (PDF)</a></p>
<div class="wtext" tabindex="0" role="region" aria-label="Waiver text">${body(ctx.version.body)}<p class="mut"><small>Version ${esc(ctx.version.version)}</small></p></div>
<div class="wform"><div class="grid2">
<label>Athlete first &amp; last name<input name="athlete_name" required value="${esc(a.athlete)}" autocomplete="off"></label>
<label>Athlete date of birth<input name="athlete_dob" type="date" required></label>
<label>Emergency contact name<input name="emergency_name" required autocomplete="off"></label>
<label>Emergency phone<input name="emergency_phone" type="tel" required inputmode="tel" autocomplete="off"></label></div>
<label>Allergies, conditions &amp; medications <small class="mut">(optional)</small><textarea name="medical_notes" rows="2" maxlength="2000"></textarea></label>
<label class="chk"><input type="checkbox" name="photo_opt_in"> Photo/video opt-in: you may use photos and video of the athlete on your website and social media.</label>
<div class="grid2"><label>Your first &amp; last name (parent/guardian)<input name="signer_name" required autocomplete="name" value="${a.index===0&&ctx.parent?esc(ctx.parent):''}"></label>
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
const q=n=>F.querySelector(`[name=${n}]`),SK='fc_w_'+(cred.ref||cred.token||cred.wtoken||'')+'_'+a.index;
try{const sv=JSON.parse(sessionStorage.getItem(SK)||'{}');Object.entries(sv).forEach(([k,v])=>{const i=q(k);if(i)i.type==='checkbox'?i.checked=!!v:i.value=v})}catch{}
F.addEventListener('input',()=>{const o={};F.querySelectorAll('[name]').forEach(i=>o[i.name]=i.type==='checkbox'?i.checked:i.value);try{sessionStorage.setItem(SK,JSON.stringify(o))}catch{}});F.addEventListener('change',()=>F.dispatchEvent(new Event('input')));F.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.tagName!=='TEXTAREA'){e.preventDefault()}});
F.querySelector('.wsubmit').onclick=async()=>{const b=F.querySelector('.wsubmit');if(b.disabled)return;
F.querySelectorAll('.werr').forEach(e=>{e.classList.remove('werr');e.removeAttribute('aria-invalid')});
const d={};F.querySelectorAll('input[name]:not([type=checkbox]),select[name],textarea[name]').forEach(i=>d[i.name]=i.value.trim());const miss=[];
const need=(ok,name,label)=>{if(!ok)miss.push([name,label])};
need(/\S+\s+\S+/.test(d.athlete_name||''),'athlete_name','athlete first & last name');need(!!d.athlete_dob,'athlete_dob','date of birth');
need(/\S+\s+\S+/.test(d.emergency_name||''),'emergency_name','emergency contact first & last name');need((d.emergency_phone||'').replace(/\D/g,'').length>=10,'emergency_phone','emergency phone (10 digits)');
need(/\S+\s+\S+/.test(d.signer_name||''),'signer_name','your first & last name');need(!!d.signer_relationship,'signer_relationship','relationship');
need(q('consent').checked,'consent','consent checkbox');need(ink>=40,'sig','signature');
if(miss.length){b.disabled=false;b.classList.remove('busy');W.textContent='Please complete: '+miss.map(m=>m[1]).join(', ')+'.';
  miss.forEach(([n])=>{const e=n==='sig'?el.querySelector('.sigwrap'):q(n);if(e){(n==='consent'?e.closest('label'):e).classList.add('werr');if(n!=='sig')e.setAttribute('aria-invalid','true')}});
  const f=miss[0][0],t=f==='sig'?el.querySelector('.sigwrap'):q(f);if(t){t.scrollIntoView({block:'center',behavior:'smooth'});if(f!=='sig')setTimeout(()=>{try{t.focus({preventScroll:true})}catch{t.focus()}},300)}return}
let sig='';try{sig=C.toDataURL('image/png')}catch{W.textContent='We couldn\'t read your signature. Please clear it, sign again, and tap the button.';return}
b.disabled=true;b.classList.add('busy');const lbl=b.textContent;b.textContent='Saving…';W.textContent='Saving your signed waiver…';let ok=false;
try{const j=await call({action:'sign',...cred,athlete_index:a.index,...d,photo_opt_in:q('photo_opt_in').checked,consent:true,version:ctx.version.version,version_sha256:ctx.version.sha256,signature:sig,ink:Math.round(ink)});
  if(j.error){W.innerHTML=esc(j.error)+' <button type="button" class="btn sm wretry">Retry</button>';W.querySelector('.wretry').onclick=()=>F.querySelector('.wsubmit').click();return}ok=true;try{sessionStorage.removeItem(SK)}catch{}W.textContent='Signed. A copy is on its way to your email.';setTimeout(()=>window.WaiverPanel(el,cred,onDone,opt),600)}
catch(e){W.innerHTML='We couldn\'t save the waiver (connection problem). Your answers are kept. <button type="button" class="btn sm wretry">Retry</button>';W.querySelector('.wretry').onclick=()=>F.querySelector('.wsubmit').click()}
finally{if(!ok){b.disabled=false;b.classList.remove('busy');b.textContent=lbl}}};};
window.WaiverShare=async(el,cred)=>{const j=await call({action:'links',...cred});if(j.error||!j.links||!j.links.length){if(j.links&&!j.links.length){el.innerHTML='';return}el.innerHTML=`<p class="mut small">We couldn\u2019t load the other players\u2019 waiver links${j.error&&!/tap Retry/i.test(j.error)?' ('+esc(j.error)+')':''}. <button type="button" class="btn sm wretry">Retry</button></p>`;el.querySelector('.wretry').onclick=()=>{el.innerHTML='<p class="mut small">Loading…</p>';window.WaiverShare(el,cred)};return}
const mob=navigator.share&&matchMedia('(pointer:coarse)').matches,msg=l=>`Hi${l.parent?' '+l.parent.split(' ')[0]:''}, please sign ${l.athlete}'s waiver for Four Corners Hoops & Performance (about 2 minutes): ${l.url}`;
el.innerHTML=`<div class="wshare"><h4>Other players' waivers</h4><p class="mut small">Each player's parent signs on their own phone. Players without a signed waiver aren't cleared for the court. Links work for 30 days.</p>${j.links.map((l,i)=>`<div class="wsrow" data-i="${i}"><span><b>${esc(l.athlete)}</b>${l.parent?`<small>Parent: ${esc(l.parent)}</small>`:''}<i class="badge no">Unsigned</i></span><div class="wsbtn"><button type="button" class="btn sm" data-a="send">Send waiver link</button><button type="button" class="btn sm ghost" data-a="copy">Copy link</button><a class="btn sm ghost" href="sms:?body=${encodeURIComponent(msg(l))}">Text</a><a class="btn sm ghost" href="mailto:?subject=${encodeURIComponent('Please sign '+l.athlete+'\'s waiver')}&body=${encodeURIComponent(msg(l))}">Email</a></div></div>`).join('')}<p class="wst small" role="status" aria-live="polite"></p></div>`;
const W=el.querySelector('.wst'),copy=async l=>{try{await navigator.clipboard.writeText(l.url);W.textContent='Link for '+l.athlete+' copied.'}catch{prompt('Copy this link:',l.url)}};
el.querySelectorAll('.wsrow').forEach(r=>{const l=j.links[+r.dataset.i];r.querySelector('[data-a=copy]').onclick=()=>copy(l);r.querySelector('[data-a=send]').onclick=async()=>{if(navigator.share){try{await navigator.share({title:'Waiver for '+l.athlete,text:msg(l).replace(' '+l.url,''),url:l.url});W.textContent='Link for '+l.athlete+' shared.';return}catch(e){if(e&&e.name==='AbortError')return}}copy(l)};if(!mob)r.querySelector('[data-a=send]').textContent='Send waiver link'})};})();
