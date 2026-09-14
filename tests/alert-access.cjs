const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
(async()=>{
 const db=new PGlite(),a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
 await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to anon,authenticated; insert into auth.users values ('${a}'),('${b}');`);
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20260915_alert_preferences.sql'),'utf8'));
 async function as(uid,sql){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.exec('set role authenticated');return db.query(sql);}
 await assert.rejects(()=>as(a,"select * from pme_save_alert_preferences(true,'weekly',50,null)"),/consent/);
 for(const sql of ["select * from pme_save_alert_preferences(true,'invalid',50,'alerts-v1')","select * from pme_save_alert_preferences(true,'weekly',101,'alerts-v1')"])await assert.rejects(()=>as(a,sql),/Invalid/);
 await as(a,"select * from pme_save_alert_preferences(true,'weekly',50,'alerts-v1')");
 assert.equal((await as(a,'select * from pme_alert_preferences')).rows[0].enabled,true);
 assert.equal((await as(b,'select * from pme_alert_preferences')).rows.length,0);
 assert.equal((await as(b,'select * from pme_alert_preference_events')).rows.length,0);
 await assert.rejects(()=>as(a,"update pme_alert_preferences set enabled=false"),/permission denied/);
 await assert.rejects(()=>as(a,"delete from pme_alert_preference_events"),/permission denied/);
 await as(b,'select pme_unsubscribe_alerts()');
 assert.equal((await as(a,'select * from pme_alert_preferences')).rows[0].enabled,true);
 await as(a,'select pme_unsubscribe_alerts()');
 assert.equal((await as(a,'select * from pme_alert_preferences')).rows[0].enabled,false);
 assert.equal((await as(a,'select * from pme_alert_preference_events')).rows.length,2);
 await db.exec('reset role; set role anon;');await assert.rejects(()=>db.query('select pme_unsubscribe_alerts()'),/permission denied/);
 await assert.rejects(()=>db.query('select * from pme_alert_preferences'),/permission denied/);
 await db.close();console.log('PASS: alert consent RPC, unsubscribe, input constraints, anonymous denial, account isolation, immutable events.');
})().catch(e=>{console.error(e);process.exitCode=1;});
