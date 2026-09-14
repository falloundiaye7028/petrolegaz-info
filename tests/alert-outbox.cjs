const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
(async () => {
  const db = new PGlite();
  const uid = '11111111-1111-4111-8111-111111111111';
  const recipient = 'internal@example.com', pme = 'rec12345678901234', hash = 'a'.repeat(64);
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to anon,authenticated;
    insert into auth.users values('${uid}','${recipient}',now());`);
  for (const migration of ['20260914_pme_private.sql', '20260915_alert_preferences.sql', '20260916_alert_outbox.sql', '20260917_alert_dispatch.sql']) {
    await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations', migration), 'utf8'));
  }
  async function admin(sql, params = []) { await db.exec('reset role'); return db.query(sql, params); }
  async function service(sql, params = []) { await db.exec('set role service_role'); return db.query(sql, params); }
  async function user(sql) {
    await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
    await db.exec('set role authenticated'); return db.query(sql);
  }
  let n = 100;
  async function enqueue() {
    const opp = 'rec' + String(n++).padStart(14, '0');
    return (await service("select pme_enqueue_alert($1,$2,$3,now()+interval '30 days',70) id", [uid, opp, [pme]])).rows[0].id;
  }
  async function approve() {
    await admin('insert into pme_alert_delivery_approvals(user_id,consent_at) select user_id,consent_at from pme_alert_preferences on conflict(user_id) do update set consent_at=excluded.consent_at,last_attempt_at=null');
  }
  async function authorize(job) { return (await service('select pme_authorize_alert($1,$2,$3) ok', [job, recipient, hash])).rows[0].ok; }
  assert.equal(await enqueue(), null);
  await user("select pme_save_alert_preferences(true,'weekly',50,'alerts-v1')");
  await admin('insert into pme_memberships(user_id,pme_id) values($1,$2)', [uid, pme]);
  assert.equal(await enqueue(), null, 'consent alone must not activate delivery');
  await approve();
  const first = await enqueue(); assert.ok(first);
  const dispatchContext = (await service('select pme_alert_dispatch_context($1) data', [uid])).rows[0].data;
  assert.equal(dispatchContext.approved, true); assert.equal(dispatchContext.recipient, recipient);
  assert.equal(dispatchContext.jobs[0].id, first);
  assert.equal((await service("select pme_dispatch_alert($1,$2,$3,$4,$5,$6,now()+interval '1 day',70) ok",
    [first, uid, recipient, hash, dispatchContext.preferences.consent_at, ['rec99999999999999']])).rows[0].ok, false, 'fresh qualifying PME must still be authorized');
  // Above rejection cancels the job; use a fresh job for the remaining tests.
  const active = await enqueue();
  assert.equal((await service("select pme_enqueue_alert($1,'rec00000000000102',$2,now()+interval '30 days',70) id", [uid, [pme]])).rows[0].id, null, 'duplicate excluded');
  assert.equal((await service("select pme_dispatch_alert($1,$2,$3,$4,$5,$6,now()+interval '1 day',70) ok",
    [active, uid, recipient, hash, dispatchContext.preferences.consent_at, [pme]])).rows[0].ok, true);
  assert.equal(await authorize(active), false, 'same job cannot be attempted twice');
  await service('select pme_finish_alert($1,null)', [active]);
  assert.equal(await authorize(active), false, 'uncertain result cannot be retried');
  const delayed = await enqueue(); assert.ok(delayed);
  assert.equal(await authorize(delayed), false, 'weekly cadence enforced across jobs');
  await admin("update pme_alert_delivery_approvals set last_attempt_at=now()-interval '8 days'");
  assert.equal(await authorize(delayed), true);
  await service('select pme_finish_alert($1,$2)', [delayed, '22222222-2222-4222-8222-222222222222']);
  await service('select pme_finish_alert($1,null)', [delayed]);
  assert.equal((await service('select state from pme_alert_outbox where id=$1', [delayed])).rows[0].state, 'accepted');
  await approve();
  const revoked = await enqueue();
  await admin('delete from pme_memberships where user_id=$1', [uid]);
  assert.equal(await authorize(revoked), false);
  assert.equal((await service('select state from pme_alert_outbox where id=$1', [revoked])).rows[0].state, 'cancelled');
  await admin('insert into pme_memberships(user_id,pme_id) values($1,$2)', [uid, pme]);
  const expired = await enqueue(); await admin("update pme_alert_outbox set deadline=now()-interval '1 day' where id=$1", [expired]);
  assert.equal(await authorize(expired), false);
  const emailChanged = await enqueue(); await admin("update auth.users set email='changed@example.com' where id=$1", [uid]);
  assert.equal(await authorize(emailChanged), false);
  await admin('update auth.users set email=$1 where id=$2', [recipient, uid]);
  const pending = await enqueue();
  await user('select pme_unsubscribe_alerts()');
  assert.equal((await service('select state from pme_alert_outbox where id=$1', [pending])).rows[0].state, 'cancelled');
  assert.equal(await enqueue(), null);
  await user("select pme_save_alert_preferences(true,'daily',50,'alerts-v1')");
  assert.equal(await enqueue(), null, 're-subscription needs separate delivery approval');
  await approve(); assert.ok(await enqueue());
  await service('select pme_unsubscribe_alert_user($1)', [uid]);
  await service('select pme_unsubscribe_alert_user($1)', [uid]);
  assert.equal((await user('select enabled from pme_alert_preferences')).rows[0].enabled, false);
  await user("select pme_save_alert_preferences(true,'daily',50,'alerts-v1')");
  await approve(); assert.equal(await enqueue(), null, 'suppression is not silently lifted');
  // Early provider event is retained and reconciled at acceptance; repeated or
  // out-of-order delivery notifications cannot remove suppression.
  await admin('delete from pme_alert_suppressions where user_id=$1', [uid]);
  await user("select pme_save_alert_preferences(true,'daily',50,'alerts-v1')");
  await approve(); const bounced = await enqueue(); assert.equal(await authorize(bounced), true);
  const provider = '33333333-3333-4333-8333-333333333333';
  await service("select pme_record_alert_event('msg_bounce',$1,'email.bounced')", [provider]);
  await service('select pme_finish_alert($1,$2)', [bounced, provider]);
  assert.equal((await user('select enabled from pme_alert_preferences')).rows[0].enabled, false);
  await service("select pme_record_alert_event('msg_bounce',$1,'email.bounced')", [provider]);
  await service("select pme_record_alert_event('msg_delivered',$1,'email.delivered')", [provider]);
  assert.equal((await admin('select count(*)::int n from pme_alert_provider_events')).rows[0].n, 2);
  assert.equal((await admin('select reason from pme_alert_suppressions where user_id=$1', [uid])).rows[0].reason, 'bounce');
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`reset role; set role ${role}`);
    for (const table of ['pme_alert_outbox', 'pme_alert_delivery_approvals', 'pme_alert_suppressions', 'pme_alert_provider_events']) {
      await assert.rejects(() => db.query(`select * from ${table}`), /permission denied/);
    }
    await assert.rejects(() => db.query('select pme_authorize_alert($1,$2,$3)', [first, recipient, hash]), /permission denied/);
    await assert.rejects(() => db.query('select pme_unsubscribe_alert_user($1)', [uid]), /permission denied/);
    await assert.rejects(() => db.query('select pme_alert_dispatch_context($1)', [uid]), /permission denied/);
  }
  await assert.rejects(() => service("update pme_alert_outbox set state='queued'"), /permission denied/);
  await db.close();
  console.log('PASS: outbox server-only, explicit activation, durable deduplication, atomic once-only dispatch, cadence, revocation, expiry, unsubscribe and suppression. Isolated DB only.');
})().catch(error => { console.error(error); process.exitCode = 1; });
