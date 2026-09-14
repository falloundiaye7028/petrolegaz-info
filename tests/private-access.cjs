// Run with PGLITE_MODULE pointing to an installed @electric-sql/pglite.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
(async () => {
  const db = new PGlite();
  const a='11111111-1111-4111-8111-111111111111', b='22222222-2222-4222-8222-222222222222';
  const p='recAAAAAAAAAAAAAA', q='recBBBBBBBBBBBBBB', ao='recCCCCCCCCCCCCCC';
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated;
    insert into auth.users values ('${a}'),('${b}');`);
  await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20260914_pme_private.sql'),'utf8'));
  await db.exec(`insert into public.pme_memberships(user_id,pme_id) values ('${a}','${p}'),('${b}','${q}');`);
  async function as(user, sql) { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]); await db.exec('set role authenticated'); return db.query(sql); }
  async function denied(user,sql){await assert.rejects(()=>as(user,sql), /permission denied|row-level security|check constraint/);}
  assert.equal((await as(a,'select * from pme_memberships')).rows.length,1);
  await denied(a,`insert into pme_memberships values ('${a}','${q}',now())`);
  await as(a,`insert into pme_access_requests(pme_id,message) values ('${q}','Demande de test sans validation automatique')`);
  await denied(a,`update pme_access_requests set status='approved'`);
  assert.equal((await as(b,'select * from pme_access_requests')).rows.length,0);
  await denied(a,`insert into pme_applications(pme_id,opportunity_id,title) values ('${q}','${ao}','Interdit')`);
  await as(a,`insert into pme_applications(pme_id,opportunity_id,title) values ('${p}','${ao}','Test')`);
  await denied(a,`update pme_applications set pme_id='${q}'`);
  await as(a,"update pme_applications set status='sent'");
  assert.equal((await as(a,'select * from pme_application_events')).rows.length,2);
  await denied(a,"update pme_application_events set status='accepted'");
  assert.equal((await as(b,'select * from pme_applications')).rows.length,0);
  assert.equal((await as(b,'select * from pme_application_events')).rows.length,0);
  assert.equal((await as(b,"update pme_applications set status='accepted' returning *")).rows.length,0);
  await denied(a,"update pme_applications set status='invented'");
  await db.exec(`reset role; delete from pme_memberships where user_id='${a}';`);
  assert.equal((await as(a,'select * from pme_applications')).rows.length,0);
  await db.exec('reset role; set role anon;');
  await assert.rejects(()=>db.query('select * from pme_applications'), /permission denied/);
  await db.close();
  console.log('PASS: real Postgres RLS, anonymous denial, tenant isolation, revoked membership, protected columns, pending-only requests and immutable audit.');
})().catch(error=>{console.error(error);process.exitCode=1;});
