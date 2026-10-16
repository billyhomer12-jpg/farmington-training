// Lint window.SITE.deals: every deal with a start must run 3 to 10 days. Run: node tools/deals-lint.mjs
import fs from 'node:fs';const window={};eval(fs.readFileSync(new URL('../config.js',import.meta.url),'utf8'));
let bad=0;for(const d of window.SITE.deals||[]){if(!d.start_at){console.log(d.id,'off (no start_at)');continue}
const days=(new Date(d.end_at)-new Date(d.start_at))/864e5,ok=days>=3&&days<=10;console.log(d.id,days.toFixed(2)+' days',ok?'OK':'FAIL');if(!ok)bad++}
process.exit(bad?1:0);
