#!/usr/bin/env node
// READ-ONLY: live Stripe payment links + Supabase deal + served config.js vs config.js on origin/main. Never prints secrets.
import fs from 'fs'; import {execSync} from 'child_process'; import vm from 'vm';
const NOTE='Founding Family bonus: free 5th session, use within 90 days';
const EXP_START=process.env.EXP_START||'2026-10-16T17:50:00-06:00', EXP_END=process.env.EXP_END||'2026-11-15T17:50:00-07:00';
const K=fs.readFileSync('/workspace/.secrets/stripe_live_key','utf8').trim(), T=fs.readFileSync('/workspace/.sbtoken','utf8').trim();
const mainSrc=execSync('git show origin/main:config.js',{cwd:new URL('..',import.meta.url).pathname}).toString();
const load=s=>{const c={window:{},Date,Math,console};vm.runInNewContext(s,c);return c.window.SITE;};
const S=load(mainSrc); const rows=[]; const row=(item,expect,actual)=>rows.push({item,expect:String(expect),actual:String(actual),ok:String(expect)===String(actual)});
const st=async p=>(await fetch('https://api.stripe.com/v1/'+p,{headers:{Authorization:'Bearer '+K}})).json();
const links=(await st('payment_links?limit=100&active=true')).data||[];
for(const [pk,url] of Object.entries(S.paymentLinks)){
  const L=links.find(l=>l.url===url); if(!L){row(pk+' link',url,'NOT FOUND');continue;}
  const li=(await st(`payment_links/${L.id}/line_items`)).data?.[0]; const amt=li?(li.amount_total/100):'?';
  row(pk+' price $',S.packages[pk].price,amt);
  const note=L.custom_text?.submit?.message||L.custom_text?.after_submit?.message||'';
  row(pk+' regular link checkout note (Founding removed)','',note);
}
// Monthly plans (config.js single source) vs live + test Stripe recurring prices
const MP=S.MEMBERSHIP_PRICES||S.membershipPlans||S.memberships||S.monthlyPlans; const KT=fs.readFileSync('/workspace/.secrets/stripe_test_secret_key','utf8').trim();
const stT=async p=>(await fetch('https://api.stripe.com/v1/'+p,{headers:{Authorization:'Bearer '+KT}})).json();
const info=[];
for(const t of ['1on1_monthly','1on1_monthly_plus','open_group_monthly']){
  const want=MP?.[t]?.price; if(want==null){row(t+' in config.js','price set','MISSING');continue;}
  const KM=fs.existsSync('/workspace/.secrets/stripe_live_memberships_key')?fs.readFileSync('/workspace/.secrets/stripe_live_memberships_key','utf8').trim():K;
  const stM=async p=>(await fetch('https://api.stripe.com/v1/'+p,{headers:{Authorization:'Bearer '+KM}})).json();
  for(const [mode,f] of [['live',stM],['test',stT]]){
    const pr=(await f(`prices/search?query=${encodeURIComponent(`active:'true' AND metadata['tier']:'${t}'`)}`)).data||[];
    if(!pr.length){ if(mode==='live') info.push(`${t} live price: not created yet (created by live switch)`); else row(`${t} test price $/mo`,want,'NOT FOUND'); continue;}
    row(`${t} ${mode} price $/mo`,want,pr.map(x=>x.unit_amount/100).join(','));
  }
}
const go=S.deals.find(d=>d.id==='grand-opening-2026');
const t=x=>x?new Date(x).toISOString():'null';
row('config.js deal start',t(EXP_START),t(go.start_at)); row('config.js deal end',t(EXP_END),t(go.end_at));
const db=await (await fetch('https://api.supabase.com/v1/projects/jrcozcrfbjcsuqkmoaki/database/query',{method:'POST',headers:{Authorization:'Bearer '+T,'content-type':'application/json'},body:JSON.stringify({query:"select start_at,end_at from training.deals where id='grand-opening-2026'"})})).json();
row('Supabase deal start',t(go.start_at),t(db[0]?.start_at)); row('Supabase deal end',t(go.end_at),t(db[0]?.end_at));
const served=await (await fetch('https://fourcornershoopsandperformance.com/config.js?cb='+Date.now())).text();
row('served config.js == main',true,served.trim()===mainSrc.trim());
console.log('item | expected | actual | result'); for(const r of rows) console.log(`${r.item} | ${r.expect} | ${r.actual} | ${r.ok?'PASS':'FAIL'}`);
for(const i of info) console.log('INFO | '+i);
const f=rows.filter(r=>!r.ok).length; console.log(`VERIFY-LIVE: ${f?'FAIL':'PASS'} (${rows.length-f}/${rows.length}) at ${new Date().toISOString()}`); process.exit(f?1:0);
