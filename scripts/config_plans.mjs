// Prints monthly plans from config.js (single source of truth) as JSON: {tier:{label,price,sessions,per_player}}
import fs from 'fs'; import vm from 'vm'; import {execSync} from 'child_process';
const src=process.env.CONFIG_JS?fs.readFileSync(process.env.CONFIG_JS,'utf8'):execSync('git show origin/main:config.js').toString();
const c={window:{},Date,Math,console}; vm.runInNewContext(src,c); const S=c.window.SITE;
const P=S.membershipPlans||S.memberships||S.monthlyPlans||(S.packages&&Object.fromEntries(Object.entries(S.packages).filter(([k])=>k.endsWith('_monthly')||k.endsWith('_monthly_plus'))));
const want=['1on1_monthly','1on1_monthly_plus','open_group_monthly'];
if(!P||!want.every(k=>P[k]&&+P[k].price>0)){console.error('config.js has no monthly plans with prices for '+want.join(','));process.exit(2)}
console.log(JSON.stringify(Object.fromEntries(want.map(k=>[k,{label:P[k].label||P[k].name||k,price:+P[k].price,sessions:+(P[k].sessions||P[k].sessionsPerMonth||0),per_player:!!(P[k].per_player||P[k].perPlayer||P[k].solo)}]))));
