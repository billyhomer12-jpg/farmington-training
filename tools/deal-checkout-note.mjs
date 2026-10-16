// DEAL-5 / LAUNCH-4: add/remove the window-only custom-text note on the 5 eligible Payment Links (never the single).
// DRY RUN by default: prints and logs the before/after plan only. Nothing is sent to Stripe unless --apply is passed
// AND STRIPE_KEY is set. Not scheduled. Needs Billy's OK before any --apply run (no price/product/coupon changes ever).
// Usage: node tools/deal-checkout-note.mjs <holiday-4pack-2026|grand-opening-2026> <add|remove> [--apply]
import fs from 'node:fs';
const window={};eval(fs.readFileSync(new URL('../config.js',import.meta.url),'utf8'));
const [id,act]=process.argv.slice(2),apply=process.argv.includes('--apply');
const NOTE={'holiday-4pack-2026':'Holiday bonus: free 5th session, redeem by 3/31/27','grand-opening-2026':'Founding Family bonus: free 5th session, use within 90 days'}[id];
const d=(window.SITE.deals||[]).find(x=>x.id===id);if(!d||!NOTE||!['add','remove'].includes(act)){console.error('usage: <deal id> <add|remove> [--apply]');process.exit(2)}
const links=d.eligible_packages.filter(k=>k!=='single').map(k=>({pkg:k,url:window.SITE.paymentLinks[k]}));
const plan={at:new Date().toISOString(),deal:id,action:act,note:act==='add'?NOTE:null,field:'custom_text.submit.message',links,apply};
const dir=new URL('../../web-team/evidence/DEALS-SLOT/',import.meta.url);fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(new URL(`checkout-note-${id}-${act}-${Date.now()}.json`,dir),JSON.stringify(plan,null,2));
console.log(JSON.stringify(plan,null,2));
if(!apply||!process.env.STRIPE_KEY){console.log('DRY RUN: no Stripe calls made.');process.exit(0)}
console.error('Live apply is intentionally not implemented without an approved run; resolve plink ids and PATCH custom_text only.');process.exit(3);
