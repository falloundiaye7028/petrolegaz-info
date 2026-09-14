const assert = require('node:assert/strict');
const { makeMessage, sendReserved } = require('../server/alert-transport.cjs');
const { createToken, verifyToken } = require('../server/alert-token.cjs');
const uid = '11111111-1111-4111-8111-111111111111';
const providerId = '22222222-2222-4222-8222-222222222222';
const secret = 'ab'.repeat(32); // Test fixture, never a deployment secret.
const now = Date.parse('2026-09-14T12:00:00Z');
const token = createToken(uid, secret, now / 1000);
assert.equal(verifyToken(token, secret, now / 1000), uid);
assert.equal(verifyToken(token, 'cd'.repeat(32), now / 1000), null);
assert.equal(verifyToken(token, secret, now / 1000 - 1), null);
assert.equal(verifyToken(token, secret, now / 1000 + 180 * 86400), null);
assert.equal(verifyToken('wrong.' + token, secret, now / 1000), null);
assert.equal(verifyToken(token.slice(0, -3) + 'xyz', secret, now / 1000), null);
assert.throws(() => createToken(uid, 'short'), /key unavailable/);
assert.throws(() => createToken('not-a-uuid', secret), /Invalid/);

const input = {
  recipient: 'internal@example.com', now,
  unsubscribeUrl: 'https://www.petrolegaz.com/api/alert-unsubscribe?token=' + token,
  opportunities: [{ id: 'rec12345678901234', title: '<img src=x onerror=alert(1)>', score: 70,
    deadline: '2026-09-30', sourceUrl: 'https://example.com/tender?x=1&y=2' }],
};
const message = makeMessage(input);
assert.match(message.html, /&lt;img/);
assert.doesNotMatch(message.html, /<img/);
assert.match(message.html, /x=1&amp;y=2/);
assert.equal(message.to.length, 1);
assert.equal(message.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
for (const mutation of [
  { recipient: 'a@example.com,b@example.com' },
  { unsubscribeUrl: 'https://evil.example/api/alert-unsubscribe?token=x' },
  { unsubscribeUrl: input.unsubscribeUrl + '&redirect=https://evil.example' },
  { opportunities: [] },
  { opportunities: [...input.opportunities, ...input.opportunities] },
  { opportunities: [{ ...input.opportunities[0], id: 'recTEST0000000001' }] },
  { opportunities: [{ ...input.opportunities[0], sourceUrl: 'javascript:alert(1)' }] },
  { opportunities: [{ ...input.opportunities[0], deadline: '2026-02-30' }] },
  { opportunities: [{ ...input.opportunities[0], deadline: '2026-09-13' }] },
]) assert.throws(() => makeMessage({ ...input, ...mutation }));

(async () => {
  let calls = 0, gates = 0, request;
  const env = { PME_ALERT_EMAIL_ENABLED: 'true', PME_ALERT_CALLBACKS_READY: 'true',
    RESEND_API_KEY: 're_unit_test_only', PME_ALERT_INTERNAL_RECIPIENT: input.recipient };
  const args = {
    jobId: uid, message, env,
    authorize: async ({ jobId, recipient, payloadHash }) => {
      gates++; assert.equal(jobId, uid); assert.equal(recipient, input.recipient);
      assert.match(payloadHash, /^[a-f0-9]{64}$/); return true;
    },
    fetchImpl: async (url, options) => { calls++; request = { url, options }; return { ok: true, json: async () => ({ id: providerId }) }; },
  };
  for (const override of [{}, { ...env, PME_ALERT_EMAIL_ENABLED: 'false' }, { ...env, PME_ALERT_CALLBACKS_READY: 'false' }]) {
    assert.equal((await sendReserved({ ...args, env: override })).state, 'disabled');
  }
  for (const override of [{ ...env, RESEND_API_KEY: '' }, { ...env, PME_ALERT_INTERNAL_RECIPIENT: 'other@example.com' }]) {
    assert.equal((await sendReserved({ ...args, env: override })).state, 'blocked');
  }
  assert.equal(gates, 0); assert.equal(calls, 0);
  assert.equal((await sendReserved({ ...args, authorize: async () => false })).state, 'cancelled');
  assert.equal(calls, 0);
  assert.deepEqual(await sendReserved(args), { state: 'accepted', providerId });
  assert.equal(calls, 1);
  assert.equal(request.url, 'https://api.resend.com/emails');
  assert.equal(request.options.redirect, 'error');
  assert.equal(request.options.headers['Idempotency-Key'], 'pme-alert-' + uid);
  assert.equal(request.options.body, JSON.stringify(message));
  for (const mock of [
    async () => { throw new Error('Network error with private data'); },
    async () => ({ ok: false, status: 429 }),
    async () => ({ ok: false, status: 500 }),
    async () => ({ ok: true, json: async () => ({}) }),
    async () => ({ ok: true, json: async () => { throw new Error('Invalid body'); } }),
  ]) {
    let attempts = 0;
    const outcome = await sendReserved({ ...args, fetchImpl: async (...params) => { attempts++; return mock(...params); } });
    assert.equal(outcome.state, 'unknown'); assert.equal(attempts, 1);
    assert.doesNotMatch(JSON.stringify(outcome), /private|re_unit|internal@example/);
  }
  await assert.rejects(() => sendReserved({ ...args, authorize: async () => { throw new Error('DB unavailable'); } }));
  assert.equal(calls, 1);
  console.log('PASS: transport disabled by default, internal allowlist, last-moment authorization, no retries, safe template, signed expiring tokens. No email sent.');
})().catch(error => { console.error(error); process.exitCode = 1; });
