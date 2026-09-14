const assert = require('node:assert/strict');
const { sources } = require('../server/alert-sources.cjs');
(async () => {
  const calls = [];
  const env = { AIRTABLE_TOKEN: 'test-airtable', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test' };
  const src = sources({ env, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/rest/v1/')) return { ok: true, text: async () => 'true' };
    const isPME = url.includes('/PME?');
    return { ok: true, json: async () => ({ records: isPME
      ? [{ id: 'rec12345678901234', fields: { 'Nom entreprise': 'PME', 'Email': 'private@example.com', Secteur: 'Énergie', 'Compétences': ['maintenance'] } }]
      : [{ id: 'recW9b7mflxZPBKV6', fields: { Titre: 'Démo', 'Secteur concerné': ['Énergie'], 'URL source': 'https://example.com', 'Email interne': 'private@example.com' } }] }) };
  } });
  const data = await src.catalogue();
  assert.equal(data.opportunities[0].demonstration, true);
  assert.equal(data.pmes[0].competences[0], 'maintenance');
  assert.doesNotMatch(JSON.stringify(data), /private@example/);
  for (const call of calls) { assert.equal(call.options.cache, 'no-store'); assert.equal(call.options.redirect, 'error'); }
  await src.store.authorize({ jobId: 'job', userId: 'user', recipient: 'internal@example.com', payloadHash: 'hash', consent: 'consent',
    opportunity: { pmeIds: ['pme'], deadline: '2026-09-30', score: 50 } });
  const last = calls.at(-1);
  assert.equal(last.options.headers.Authorization, undefined, 'opaque secret keys must not become JWT Bearer tokens');
  assert.equal(JSON.parse(last.options.body).p_deadline, '2026-09-30T23:59:59.999Z');
  assert.match(last.url, /\/rpc\/pme_dispatch_alert$/);
  await assert.rejects(() => sources({ env: {}, fetchImpl: async () => { throw new Error('Must not call'); } }).catalogue(), /credentials/);
  let attempts = 0;
  await assert.rejects(() => sources({ env, fetchImpl: async () => { attempts++; return { ok: true, json: async () => ({ records: [], offset: 'same' }) }; } }).catalogue(), /pagination/);
  assert.ok(attempts <= 4);
  await assert.rejects(() => sources({ env, fetchImpl: async () => ({ ok: false }) }).catalogue(), /unavailable/);
  console.log('PASS: fixed server sources, no CDN cache, public fields only, demo exclusion, bounded pagination and RPC encoding. Mock network only.');
})().catch(error => { console.error(error); process.exitCode = 1; });
