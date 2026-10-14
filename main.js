const S=window.SITE,$$=s=>document.querySelectorAll(s);
$$('[data-brand]').forEach(e=>e.textContent=S.brand);document.title=S.brand;
$$('[data-tagline]').forEach(e=>e.textContent=S.tagline);$$('[data-location]').forEach(e=>e.textContent=S.location);
$$('[data-phone]').forEach(e=>{e.textContent=S.phone;e.href='tel:'+S.phone.replace(/\D/g,'')});
$$('[data-email]').forEach(e=>{e.textContent=S.email;e.href='mailto:'+S.email});
[['ig','instagram'],['fb','facebook'],['tt','tiktok']].forEach(([a,b])=>$$('[data-'+a+']').forEach(e=>e.href=S[b]));
const m=document.querySelector('.menu'),n=document.getElementById('links');
m.onclick=()=>{const o=n.classList.toggle('open');m.setAttribute('aria-expanded',o)};n.onclick=e=>{if(e.target.tagName==='A'){n.classList.remove('open');m.setAttribute('aria-expanded',false)}};
const f=document.getElementById('form'),st=document.getElementById('status');
f.onsubmit=async e=>{e.preventDefault();if(!f.checkValidity()){f.reportValidity();return}
const d=Object.fromEntries(new FormData(f));
if(S.formMode==='formspree'){try{const r=await fetch(S.formspreeEndpoint,{method:'POST',headers:{Accept:'application/json'},body:new FormData(f)});st.textContent=r.ok?'Thanks! We\'ll be in touch soon.':'Something went wrong, please call or email us.';if(r.ok)f.reset()}catch{st.textContent='Network error, please call or email us.'}return}
if(S.formMode==='supabase'){try{const r=await fetch(S.supabaseUrl+'/rest/v1/training_signups',{method:'POST',headers:{apikey:S.supabaseKey,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({parent:d.parent,athlete:d.athlete,age:d.age?+d.age:null,program:d.program,phone:d.phone||null,email:d.email,message:d.message||null})});if(r.ok){st.textContent='Thanks! We\'ll be in touch soon.';f.reset();return}}catch{}}
const body=Object.entries(d).map(([k,v])=>k+': '+v).join('\n');
location.href='mailto:'+S.email+'?subject='+encodeURIComponent('Free evaluation: '+d.athlete)+'&body='+encodeURIComponent(body);
st.textContent='Opening your email app to send the request…'};
