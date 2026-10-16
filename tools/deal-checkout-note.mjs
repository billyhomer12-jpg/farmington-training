// DEAL-5 / LAUNCH-4: window-only checkout note on the 5 eligible package Payment Links (never the $75 single).
// Changes ONLY custom_text.submit.message on each link. No price, product, coupon, or any other field.
//
//   node tools/deal-checkout-note.mjs <holiday-4pack-2026|grand-opening-2026> <apply|remove> [--live]
//
// Without --live: DRY RUN (reads links if a key is available, prints the before/after plan, writes nothing to Stripe).
// With --live: requires a LIVE secret key for acct_1UR0vSRpcc5zZV0D in $STRIPE_LIVE_KEY or /workspace/.secrets/stripe_live_key
// (a restricted key with Payment Links write is enough). Refuses any other account or a test key.
// Before/after of every link is logged to /workspace/web-team/evidence/DEALS-SLOT/checkout-note-*.json.
// remove restores the exact message each link had before apply (saved in checkout-note-state-<deal>.json); default empty.
// Idempotent: apply skips links that already show the note; remove skips links that don't.
import fs from 'node:fs';
const ACCT='acct_1UR0vSRpcc5zZV0D';
const NOTE={'holiday-4pack-2026':'Holiday bonus: free 5th session, redeem by 3/31/27','grand-opening-2026':'Founding Family bonus: free 5th session, use within 90 days'};
const window={};eval(fs.readFileSync(new URL('../config.js',import.meta.url),'utf8'));
const [id,mode]=process.argv.slice(2),live=process.argv.includes('--live');
const deal=(window.SITE.deals||[]).find(x=>x.id===id);
if(!deal||!NOTE[id]||!['apply','remove'].includes(mode)){console.error('usage: node tools/deal-checkout-note.mjs <holiday-4pack-2026|grand-opening-2026> <apply|remove> [--live]');process.exit(2)}
const pkgs=deal.eligible_packages.filter(k=>k!=='single');
const urls=Object.fromEntries(pkgs.map(k=>[k,window.SITE.paymentLinks[k]]));
if(Object.values(urls).includes(window.SITE.paymentLinks.single))throw new Error('single link in eligible set: refusing');
const EV='/workspace/web-team/evidence/DEALS-SLOT/';fs.mkdirSync(EV,{recursive:true});
const STATE=EV+`checkout-note-state-${id}.json`;
const keyFile='/workspace/.secrets/stripe_live_key';
const key=process.env.STRIPE_LIVE_KEY||(fs.existsSync(keyFile)?fs.readFileSync(keyFile,'utf8').trim():'');
const api=async(path,body)=>{const r=await fetch('https://api.stripe.com/v1/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+key,'Content-Type':'application/x-www-form-urlencoded','Stripe-Version':'2024-06-20'},body:body?new URLSearchParams(body):undefined});const j=await r.json();if(!r.ok)throw new Error(path+': '+(j.error&&j.error.message||r.status));return j};
const log={at:new Date().toISOString(),deal:id,mode,live,account:null,note:NOTE[id],links:[]};
const out=()=>{const f=EV+`checkout-note-${id}-${mode}-${live?'live':'dry'}-${Date.now()}.json`;fs.writeFileSync(f,JSON.stringify(log,null,2));console.log(JSON.stringify(log,null,2));console.log('log:',f)};
if(!key){if(live){console.error('No live key: set STRIPE_LIVE_KEY or '+keyFile);process.exit(3)}
  log.links=pkgs.map(k=>({pkg:k,url:urls[k],planned:mode==='apply'?NOTE[id]:'(restore saved / empty)'}));log.note_dry='no key: plan only, Stripe not contacted';out();process.exit(0)}
if(live&&!key.startsWith('sk_live_')&&!key.startsWith('rk_live_')){console.error('Refusing: --live needs a live key');process.exit(3)}
const acct=await api('account');log.account=acct.id;
if(live&&acct.id!==ACCT){console.error('Refusing: key is for '+acct.id+', expected '+ACCT);process.exit(3)}
// Resolve plink ids by URL (active links only).
const all=[];let sa=null;for(;;){const p=await api('payment_links?limit=100&active=true'+(sa?'&starting_after='+sa:''));all.push(...p.data);if(!p.has_more)break;sa=p.data[p.data.length-1].id}
const state=fs.existsSync(STATE)?JSON.parse(fs.readFileSync(STATE,'utf8')):{};
let fail=0;
for(const k of pkgs){const pl=all.find(x=>x.url===urls[k]);if(!pl){log.links.push({pkg:k,url:urls[k],error:'link not found on account'});fail++;continue}
  const before=(pl.custom_text&&pl.custom_text.submit&&pl.custom_text.submit.message)||'';
  let target;if(mode==='apply'){if(before===NOTE[id]){log.links.push({pkg:k,id:pl.id,before,after:before,skipped:'already applied'});continue}state[pl.id]=before;target=NOTE[id]}
  else{if(before!==NOTE[id]){log.links.push({pkg:k,id:pl.id,before,after:before,skipped:'note not present'});continue}target=state[pl.id]||''}
  if(!live){log.links.push({pkg:k,id:pl.id,before,planned_after:target});continue}
  // Only the submit message. Empty string clears custom_text.submit; other custom_text parts are re-sent unchanged.
  const body={};const ct=pl.custom_text||{};
  for(const part of ['shipping_address','after_submit','terms_of_service_acceptance'])if(ct[part]&&ct[part].message)body[`custom_text[${part}][message]`]=ct[part].message;
  if(target)body['custom_text[submit][message]']=target;else body['custom_text[submit]']='';
  try{const u=await api('payment_links/'+pl.id,body);log.links.push({pkg:k,id:pl.id,before,after:(u.custom_text&&u.custom_text.submit&&u.custom_text.submit.message)||''})}catch(e){log.links.push({pkg:k,id:pl.id,before,error:String(e.message)});fail++}}
if(live&&mode==='apply')fs.writeFileSync(STATE,JSON.stringify(state,null,2));
out();process.exit(fail?1:0);
