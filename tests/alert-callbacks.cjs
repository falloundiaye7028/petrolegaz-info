const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { Webhook } = require('svix');
const { createToken } = require('../server/alert-token.cjs');
const { unsubscribeHandler, webhookHandler } = require('../server/alert-callbacks.cjs');
const uid = '11111111-1111-4111-8111-111111111111';
const env = { PME_ALERT_CALLBACKS_ENABLED: 'true', SUPABASE_SERVICE_ROLE_KEY: 'test-only',
  PME_ALERT_UNSUBSCRIBE_SECRET: 'ab'.repeat(32), RESEND_WEBHOOK_SECRET: 'whsec_' + Buffer.alloc(32, 3).toString('base64') };
const token = createToken(uid, env.PME_ALERT_UNSUBSCRIBE_SECRET);
async function run(handler, { method = 'POST', body = '', headers = {}, query = {} } = {}) {
  const req = Readable.from([Buffer.from(body)]);
  Object.assign(req, { method, headers, query });
  const response = { headers: {}, statusCode: 200,
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    send(body) { this.body = body; return this; }, end() { return this; } };
  await handler(req, response); return response;
}
(async () => {
  const calls = [];
  const fetchImpl = async (url, options) => { calls.push({ url, body: JSON.parse(options.body) }); return { ok: true }; };
  const unsub = unsubscribeHandler({ env, fetchImpl });
  assert.equal((await run(unsubscribeHandler({ env: {}, fetchImpl }), { method: 'GET' })).statusCode, 503);
  const confirm = await run(unsub, { method: 'GET', query: { token } });
  assert.equal(confirm.statusCode, 200); assert.match(confirm.body, /form method="post"/);
  assert.doesNotMatch(confirm.body, /11111111|test-only/);
  assert.equal(confirm.headers['Referrer-Policy'], 'no-referrer'); assert.equal(calls.length, 0);
  assert.equal((await run(unsub, { method: 'GET', query: { token: token + 'bad' } })).statusCode, 400);
  assert.equal((await run(unsub, { query: { token }, body: 'List-Unsubscribe=One-Click' })).statusCode, 415);
  const request = { query: { token }, headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' };
  assert.equal((await run(unsub, { ...request, body: 'wrong=true' })).statusCode, 400);
  assert.equal(calls.length, 0);
  assert.equal((await run(unsub, request)).statusCode, 200);
  assert.deepEqual(calls[0].body, { p_user: uid });
  assert.equal((await run(unsubscribeHandler({ env, fetchImpl: async () => ({ ok: false }) }), request)).statusCode, 503);
  assert.equal((await run(unsub, { ...request, body: 'x'.repeat(2000) })).statusCode, 503);

  const hook = webhookHandler({ env, fetchImpl });
  const payload = JSON.stringify({ type: 'email.complained', data: { email_id: uid } });
  const date = new Date(); const id = 'msg_unit_test';
  const signature = new Webhook(env.RESEND_WEBHOOK_SECRET).sign(id, date, payload);
  const headers = { 'svix-id': id, 'svix-timestamp': String(Math.floor(date.getTime() / 1000)), 'svix-signature': signature };
  assert.equal((await run(hook, { body: payload, headers: {} })).statusCode, 400);
  assert.equal((await run(hook, { body: payload + ' ', headers })).statusCode, 400);
  const oldDate = new Date(Date.now() - 600000);
  assert.equal((await run(hook, { body: payload, headers: { ...headers, 'svix-timestamp': String(Math.floor(oldDate.getTime() / 1000)),
    'svix-signature': new Webhook(env.RESEND_WEBHOOK_SECRET).sign(id, oldDate, payload) } })).statusCode, 400);
  assert.equal(calls.length, 1);
  assert.equal((await run(hook, { body: payload, headers })).statusCode, 200);
  assert.deepEqual(calls[1].body, { p_event: id, p_provider: uid, p_type: 'email.complained' });
  assert.equal((await run(webhookHandler({ env, fetchImpl: async () => { throw new Error('DB unavailable'); } }), { body: payload, headers })).statusCode, 503);
  assert.equal((await run(hook, { method: 'GET' })).statusCode, 405);
  console.log('PASS: unsubscribe GET read-only, signed POST, no false success, raw signed webhooks, timestamp/replay window and tampering rejection. Mock network only.');
})().catch(error => { console.error(error); process.exitCode = 1; });
