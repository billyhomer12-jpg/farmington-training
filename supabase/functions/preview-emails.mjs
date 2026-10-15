// Render email previews (no sending): node supabase/functions/preview-emails.mjs
import fs from 'fs';import os from 'os';import path from 'path';import url from 'url';
const here=path.dirname(url.fileURLToPath(import.meta.url)),tmp=path.join(os.tmpdir(),'fc-templates.mjs');fs.copyFileSync(path.join(here,'_shared/templates.js'),tmp);const T=await import(url.pathToFileURL(tmp).href);fs.mkdirSync('/workspace/emails-preview',{recursive:true});
const at=(d,h)=>new Date(`2026-10-${d}T${String(h+6).padStart(2,'0')}:00:00Z`).toISOString();
const signup={parent:'Jordan Smith',athlete:'Taylor Smith',email:'parent@example.com',package:'group3',price_cents:35000,amount_paid_cents:35000,programs:['Basketball Skills','Youth Strength Training'],additional_players:[{athlete:'Riley Begay'},{athlete:'Ava Yazzie'}]};
const sessions=[{id:1,starts_at:at(20,16),duration_min:120,workout_type:'Gym',status:'confirmed'},{id:2,starts_at:at(22,16),duration_min:120,workout_type:'Weight room',status:'confirmed'},{id:3,starts_at:at(27,10),duration_min:120,workout_type:'Gym',status:'requested'},{id:4,starts_at:at(29,17),duration_min:120,workout_type:'Weight room',status:'requested'}];
const token='PREVIEW_TOKEN_not_real_0123456789abcdef';
const c=T.confirmationEmail({signup,sessions,token});fs.writeFileSync('/workspace/emails-preview/1-confirmation.html',c.html);fs.writeFileSync('/workspace/emails-preview/1-confirmation.txt','Subject: '+c.subject+'\n\n'+c.text);
const s2=sessions.map(x=>x.id===3?{...x,starts_at:at(28,9)}:x);
const r=T.rescheduledEmail({signup,sessions:s2,token,from:at(27,10),to:at(28,9),session_id:3});fs.writeFileSync('/workspace/emails-preview/2-rescheduled.html',r.html);fs.writeFileSync('/workspace/emails-preview/2-rescheduled.txt','Subject: '+r.subject+'\n\n'+r.text);
console.log(c.subject,'|',r.subject);
