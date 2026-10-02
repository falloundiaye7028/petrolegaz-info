const assert = require('node:assert/strict');
const { dispatchOne } = require('../server/alert-dispatch.cjs');
const uid = '11111111-1111-4111-8111-111111111111', job = '22222222-2222-4222-8222-222222222222';
const now = Date.parse('2026-09-14T12:00:00Z');
function fixture() {
  const env = { PME_ALERT_INTERNAL_USER_ID: uid, PME_ALERT_INTERNAL_RECIPIENT: 'internal@example.com',
    PME_ALERT_EMAIL_ENABLED: 'true', PME_ALERT_CALLBACKS_READY: 'true', PME_ALERT_CALLBACKS_ENABLED: 'true',
    RESEND_API_KEY: 're_test', PME_ALERT_UNSUBSCRIBE_SECRET: 'ab'.repeat(32) };
  const context = { userId: uid, recipient: env.PME_ALERT_INTERNAL_RECIPIENT, verified: true, approved: true, suppressed: false, due: true,
    membershipIds: ['rec12345678901234'], jobs: [], preferences: { enabled: true, consent_version: 'alerts-v1', consent_at: '2026-09-14T00:00:00Z', frequency: 'daily', min_score: 50 } };
  const data = { pmes: [{ id: context.membershipIds[0], secteur: 'Énergie' }],
    opportunities: [{ id: 'rec12345678901235', demonstration: false, titre: 'Offre', secteur: ['Énergie'], cloture: '2026-09-30', sourceUrl: 'https://example.com/offre' }] };
  const counts = { reads: 0, catalogue: 0, enqueue: 0, authorize: 0, send: 0, finish: 0 };
  const store = {
    context: async () => { counts.reads++; return structuredClone(context); },
    enqueue: async () => { counts.enqueue++; context.jobs.push({ id: job, opportunityId: data.opportunities[0].id, state: 'queued' }); return job; },
    authorize: async args => {
      counts.authorize++; assert.deepEqual(args.opportunity.pmeIds, context.membershipIds);
      if (context.jobs[0].state !== 'queued') return false;
      context.jobs[0].state = 'attempting'; return true;
    },
    finish: async () => { counts.finish++; context.jobs[0].state = 'accepted'; },
  };
  const options = { env, store, clock: () => now, catalogue: async () => { counts.catalogue++; return structuredClone(data); },
    fetchImpl: async () => { counts.send++; return { ok: true, json: async () => ({ id: uid }) }; } };
  return { env, context, data, counts, store, options };
}
(async () => {
  let f = fixture();
  assert.deepEqual(await dispatchOne(f.options), { state: 'dry_run', count: 1 });
  assert.equal(f.counts.enqueue + f.counts.authorize + f.counts.send, 0);
  f = fixture(); f.env.PME_ALERT_EMAIL_ENABLED = 'false';
  assert.equal((await dispatchOne({ ...f.options, send: true })).state, 'disabled'); assert.equal(f.counts.reads, 0);
  f = fixture(); assert.equal((await dispatchOne({ ...f.options, send: true })).state, 'accepted');
  assert.deepEqual(f.counts, { reads: 2, catalogue: 2, enqueue: 1, authorize: 1, send: 1, finish: 1 });
  assert.equal((await dispatchOne({ ...f.options, send: true })).state, 'empty'); assert.equal(f.counts.send, 1);
  f = fixture(); f.context.jobs.push({ id: job, opportunityId: f.data.opportunities[0].id, state: 'queued' });
  await Promise.all([dispatchOne({ ...f.options, send: true }), dispatchOne({ ...f.options, send: true })]);
  assert.equal(f.counts.send, 1, 'competing workers cannot both pass the final reservation');
  for (const change of [
    f => { f.context.membershipIds = []; }, f => { f.context.suppressed = true; },
    f => { f.context.preferences.enabled = false; }, f => { f.context.recipient = 'other@example.com'; },
    f => { f.data.opportunities[0].cloture = '2026-09-13'; }, f => { f.data.opportunities[0].demonstration = true; },
    f => { f.data.opportunities[0].secteur = ['Autre']; }, f => { f.context.jobs[0].state = 'attempting'; },
  ]) {
    f = fixture(); const read = f.options.catalogue;
    f.options.catalogue = async () => { if (f.counts.catalogue === 1) change(f); return read(); };
    assert.equal((await dispatchOne({ ...f.options, send: true })).state, 'cancelled'); assert.equal(f.counts.send, 0);
  }
  f = fixture(); f.store.authorize = async () => false;
  assert.equal((await dispatchOne({ ...f.options, send: true })).state, 'cancelled'); assert.equal(f.counts.send, 0);
  f = fixture(); f.store.finish = async () => { throw new Error('DB secret'); };
  assert.deepEqual(await dispatchOne({ ...f.options, send: true }), { state: 'reconciliation_required' }); assert.equal(f.counts.send, 1);
  assert.equal((await dispatchOne({ ...f.options, send: true })).state, 'empty'); assert.equal(f.counts.send, 1);
  f = fixture(); f.options.fetchImpl = async () => { f.counts.send++; throw new Error('Provider secret'); };
  f.store.finish = async (id, provider) => { assert.equal(provider, null); f.context.jobs[0].state = 'unknown'; };
  assert.deepEqual(await dispatchOne({ ...f.options, send: true }), { state: 'unknown' });
  assert.equal((await dispatchOne({ ...f.options, send: true })).state, 'empty'); assert.equal(f.counts.send, 1);
  f = fixture(); f.options.catalogue = async () => { throw new Error('Private error'); };
  assert.deepEqual(await dispatchOne({ ...f.options, send: true }), { state: 'unavailable' }); assert.equal(f.counts.enqueue, 0);
  console.log('PASS: manual dispatcher dry-run, repeated reads, changed/revoked eligibility, duplicate job, last gate, provider ambiguity and persistence failure. Mock transport only.');
})().catch(error => { console.error(error); process.exitCode = 1; });
