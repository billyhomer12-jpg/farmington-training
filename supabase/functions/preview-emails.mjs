// Render previews of EVERY transactional email (no sending): node supabase/functions/preview-emails.mjs
// Writes /workspace/emails-preview/<n>-<name>.html and .txt (Subject + plain text). Sample data only, fake tokens.
import fs from 'fs';import os from 'os';import path from 'path';import url from 'url';
const here=path.dirname(url.fileURLToPath(import.meta.url)),tmp=path.join(os.tmpdir(),'fc-templates.mjs');fs.copyFileSync(path.join(here,'_shared/templates.js'),tmp);const T=await import(url.pathToFileURL(tmp).href+'?'+Date.now());
const OUT='/workspace/emails-preview';fs.rmSync(OUT,{recursive:true,force:true});fs.mkdirSync(OUT,{recursive:true});
const at=(d,h)=>new Date(`2026-10-${d}T${String(h+6).padStart(2,'0')}:00:00Z`).toISOString();
const token='PREVIEW_TOKEN_not_real_0123456789abcdef',wtoken='PREVIEW_WAIVER_TOKEN_not_real_0123456789';
const signup={parent:'Jordan Smith',athlete:'Taylor Smith',email:'parent@example.com',package:'group3',price_cents:35000,amount_paid_cents:35000,programs:['Basketball Skills','Athletic Performance'],additional_players:[{athlete:'Riley Begay',parent:'Sam Begay'},{athlete:'Ava Yazzie',parent:'Lee Yazzie'}]};
const solo={parent:'Morgan Lee',athlete:'Casey Lee',email:'parent2@example.com',package:'open_group',price_cents:12500,amount_paid_cents:12500,programs:['Basketball Skills'],additional_players:[]};
const single={parent:'Pat Reyes',athlete:'Jo Reyes',email:'parent3@example.com',package:'single',price_cents:7500,amount_paid_cents:7500,programs:['Basketball Skills'],additional_players:[]};
const sessions=[{id:1,starts_at:at(20,16),duration_min:120,workout_type:'Gym',status:'confirmed'},{id:2,starts_at:at(22,16),duration_min:120,workout_type:'Outdoor',status:'confirmed'},{id:3,starts_at:at(27,10),duration_min:120,workout_type:'Gym',status:'requested'},{id:4,starts_at:at(29,17),duration_min:120,workout_type:'Outdoor',status:'requested'}];
const group={id:1,label:'Mon/Wed 4 PM',weekdays:[1,3],start_hour:16,capacity:3,min_players:2,taken:2,paid:2,sessions:[at(19,16),at(21,16),at(26,16),at(28,16)]};
const gSessions=group.sessions.map((t,i)=>({id:10+i,starts_at:t,duration_min:120,workout_type:'Gym',status:'confirmed'}));
const links=[{index:1,athlete:'Riley Begay',parent:'Sam Begay',token:wtoken},{index:2,athlete:'Ava Yazzie',parent:'Lee Yazzie',token:wtoken}];
const list=[
 ['confirmation-group3',()=>T.confirmationEmail({signup,sessions,token})],
 ['confirmation-single',()=>T.confirmationEmail({signup:single,sessions:[sessions[3]],token})],
 ['confirmation-open-group',()=>T.confirmationEmail({signup:solo,sessions:gSessions,token,group})],
 ['rescheduled',()=>T.rescheduledEmail({signup,sessions:sessions.map(x=>x.id===3?{...x,starts_at:at(28,9)}:x),token,from:at(27,10),to:at(28,9),session_id:3})],
 ['waiver-copy',()=>T.waiverCopyEmail({signup,payload:{athlete:'Taylor Smith',signer:'Jordan Smith',signed_at:new Date().toISOString(),version:'2026-10-15',url:'https://example.com/preview-signed-waiver.pdf'}})],
 ['waiver-reminder',()=>T.waiverReminderEmail({signup,wtoken})],
 ['waiver-athlete-link',()=>T.waiverAthleteEmail({signup,link:links[0]})],
 ['waiver-share-links',()=>T.waiverShareEmail({signup,links})],
 ['group-under-minimum',()=>T.groupUnderMinEmail({signup:solo,payload:{group:{...group,taken:1,paid:1},move_url:'https://fourcornershoopsandperformance.com/my.html?move=PREVIEW_MOVE_TOKEN'}})],
 ['group-moved',()=>T.groupMovedEmail({signup:solo,sessions:gSessions,group})],
 ['coach-notice-join',()=>T.coachNoticeEmail({signup:solo,payload:{type:'join',group}})],
 ['coach-notice-under-min',()=>T.coachNoticeEmail({signup:solo,payload:{type:'under_min',group:{...group,taken:1,paid:1}}})],
];
list.forEach(([name,fn],i)=>{const n=String(i+1).padStart(2,'0');try{const e=fn();fs.writeFileSync(`${OUT}/${n}-${name}.html`,e.html);fs.writeFileSync(`${OUT}/${n}-${name}.txt`,'Subject: '+e.subject+'\n\n'+(e.text||''));console.log(n,name,'|',e.subject)}catch(err){console.log(n,name,'FAILED',err.message)}});
