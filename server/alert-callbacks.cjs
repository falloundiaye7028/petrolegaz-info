'use strict';
const { verifyToken } = require('./alert-token.cjs');
const PROJECT = 'https://ocyjfjddyijaaunzupxe.supabase.co';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function rpc(name, data, env, fetchImpl) {
  // Never accept a URL, key, function name or user id from the HTTP caller.
  const response = await fetchImpl(`${PROJECT}/rest/v1/rpc/${name}`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Storage unavailable');
}
function configured(env) {
  return env.PME_ALERT_CALLBACKS_ENABLED === 'true' && !!env.SUPABASE_SERVICE_ROLE_KEY;
}
async function rawBody(req, max) {
  // Stream bytes, not req.body: parsing/stringifying JSON would break Svix.
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > max) throw new Error('Body too large');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}
function common(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

function unsubscribeHandler({ env = process.env, fetchImpl = fetch } = {}) {
  return async (req, res) => {
    common(res);
    res.setHeader('Content-Security-Policy', "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
    if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); return res.status(405).end(); }
    if (!configured(env) || !/^[a-f0-9]{64}$/i.test(env.PME_ALERT_UNSUBSCRIBE_SECRET || '')) return res.status(503).send('Service de désabonnement indisponible. Utilisez votre espace PME.');
    const token = req.query?.token;
    let userId;
    try { userId = verifyToken(token, env.PME_ALERT_UNSUBSCRIBE_SECRET); } catch { /* fail closed */ }
    if (!userId) return res.status(400).send('Lien invalide ou expiré. Utilisez votre espace PME pour vous désabonner.');
    // GET never mutates data: anti-virus/link previews must not unsubscribe.
    if (req.method === 'GET') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send('<!doctype html><html lang="fr"><meta charset="utf-8"><title>Désabonnement PétroleGaz</title><h1>Arrêter les alertes PétroleGaz</h1><p>Confirmez pour ne plus recevoir les alertes d’opportunités.</p><form method="post"><button name="List-Unsubscribe" value="One-Click">Me désabonner</button></form></html>');
    }
    try {
      const type = req.headers['content-type'] || '';
      if (!/^application\/x-www-form-urlencoded(?:;|$)/i.test(type)) return res.status(415).end();
      const body = new URLSearchParams((await rawBody(req, 1024)).toString('utf8'));
      if (body.get('List-Unsubscribe') !== 'One-Click') return res.status(400).end();
      await rpc('pme_unsubscribe_alert_user', { p_user: userId }, env, fetchImpl);
      return res.status(200).send('Vous êtes désabonné des alertes PétroleGaz.');
    } catch { return res.status(503).send('Désabonnement non confirmé. Réessayez ou utilisez votre espace PME.'); }
  };
}

function webhookHandler({ env = process.env, fetchImpl = fetch } = {}) {
  return async (req, res) => {
    common(res);
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).end(); }
    if (!configured(env) || !env.RESEND_WEBHOOK_SECRET?.startsWith('whsec_')) return res.status(503).end();
    let event, eventId;
    try {
      const raw = await rawBody(req, 65536);
      eventId = req.headers['svix-id'];
      if (typeof eventId !== 'string' || eventId.length > 200) throw new Error('Invalid event');
      // Svix 2.5 is ESM-only. Dynamic import also works on the deployed Node
      // runtime, where synchronous require(ESM) is not enabled.
      const { Webhook } = await import('svix');
      new Webhook(env.RESEND_WEBHOOK_SECRET).verify(raw, {
        'svix-id': eventId, 'svix-timestamp': req.headers['svix-timestamp'], 'svix-signature': req.headers['svix-signature'],
      });
      // Svix 2.5 verifies bytes without returning parsed JSON.
      event = JSON.parse(raw.toString('utf8'));
      if (!event || typeof event.type !== 'string') throw new Error('Invalid event');
    } catch { return res.status(400).end(); }
    if (!['email.delivered', 'email.bounced', 'email.complained', 'email.suppressed'].includes(event.type)) return res.status(200).end();
    if (!UUID.test(event.data?.email_id)) return res.status(400).end();
    try {
      await rpc('pme_record_alert_event', { p_event: eventId, p_provider: event.data.email_id, p_type: event.type }, env, fetchImpl);
      return res.status(200).end();
    } catch { return res.status(503).end(); } // Resend retries; no false acknowledgement.
  };
}
module.exports = { unsubscribeHandler, webhookHandler };
