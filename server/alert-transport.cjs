'use strict';

// Server-only transport primitive. No HTTP route or scheduler imports this file.
// A durable dispatcher must reserve each job and re-authorize it before calling.
const { createHash } = require('node:crypto');
const { Matching } = require('../assets/matching.js');
const FROM = 'PétroleGaz <alertes@send.petrolegaz.com>';
const ORIGIN = 'https://www.petrolegaz.com';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function makeMessage({ recipient, opportunities, unsubscribeUrl, now = Date.now() }) {
  if (typeof recipient !== 'string' || recipient.length > 254 || !/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(recipient)) {
    throw new Error('Invalid recipient');
  }
  const unsubscribe = new URL(unsubscribeUrl);
  if (unsubscribe.origin !== ORIGIN || unsubscribe.pathname !== '/api/alert-unsubscribe' ||
      unsubscribe.username || unsubscribe.password || unsubscribe.hash ||
      [...unsubscribe.searchParams.keys()].join(',') !== 'token' || !unsubscribe.searchParams.get('token')) {
    throw new Error('Invalid unsubscribe URL');
  }
  // This outbox version reserves ONE opportunity per job/account. Multi-item
  // digests need an item-reservation table before this limit can be increased.
  if (!Array.isArray(opportunities) || opportunities.length !== 1) throw new Error('Invalid digest');
  const seen = new Set();
  const entries = opportunities.map(opportunity => {
    const url = Matching.source(opportunity.sourceUrl);
    const deadline = Matching.deadline(opportunity.deadline);
    if (!/^rec[A-Za-z0-9]{14}$/.test(opportunity.id) || /^recTEST/.test(opportunity.id) || seen.has(opportunity.id) ||
        !url || deadline === null || deadline < now || typeof opportunity.title !== 'string' ||
        opportunity.title.length < 1 || opportunity.title.length > 300 ||
        !Number.isInteger(opportunity.score) || opportunity.score < 1 || opportunity.score > 100) throw new Error('Invalid opportunity');
    seen.add(opportunity.id);
    return { ...opportunity, sourceUrl: url };
  });
  const explanation = 'Correspondances indicatives : vérifiez les critères auprès de la source officielle. Aucun dossier n’a été envoyé et le score ne garantit pas votre éligibilité.';
  const text = ['Vos opportunités PétroleGaz', explanation, ...entries.map(o => `${o.title}\nScore indicatif : ${o.score}/100 — Clôture : ${o.deadline}\n${o.sourceUrl}`),
    `Espace PME : ${ORIGIN}/espace-pme.html`, `Se désabonner : ${unsubscribe.href}`].join('\n\n');
  const html = '<!doctype html><html lang="fr"><body><h1>Vos opportunités PétroleGaz</h1><p>' + escapeHtml(explanation) + '</p><ul>' +
    entries.map(o => `<li><a href="${escapeHtml(o.sourceUrl)}">${escapeHtml(o.title)}</a><p>Score indicatif : ${o.score}/100 — Clôture : ${escapeHtml(o.deadline)}</p></li>`).join('') +
    `</ul><p><a href="${ORIGIN}/espace-pme.html">Mon espace PME</a></p><p><a href="${escapeHtml(unsubscribe.href)}">Me désabonner des alertes</a></p></body></html>`;
  return {
    from: FROM, to: [recipient], subject: 'Vos opportunités PétroleGaz', text, html,
    headers: { 'List-Unsubscribe': `<${unsubscribe.href}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  };
}

// No retries here. A timeout (including an unreadable response) is an UNKNOWN
// delivery, never a failure safe to resend. Resend acceptance is NOT delivery.
async function sendReserved({ jobId, message, authorize, env = process.env, fetchImpl = fetch }) {
  if (env.PME_ALERT_EMAIL_ENABLED !== 'true' || env.PME_ALERT_CALLBACKS_READY !== 'true') return { state: 'disabled' };
  if (!UUID.test(jobId) || !/^re_[A-Za-z0-9_-]+$/.test(env.RESEND_API_KEY || '') ||
      typeof authorize !== 'function' || message?.from !== FROM || message?.to?.length !== 1 ||
      !env.PME_ALERT_INTERNAL_RECIPIENT || message.to[0] !== env.PME_ALERT_INTERNAL_RECIPIENT) {
    return { state: 'blocked' };
  }
  // Caller must build the message through makeMessage and persist this hash
  // against the reserved job before authorizing. No caller-controlled API URL.
  const body = JSON.stringify(message);
  const payloadHash = createHash('sha256').update(body).digest('hex');
  const gate = await authorize({ jobId, recipient: message.to[0], payloadHash });
  if (gate !== true) return { state: 'cancelled' };
  try {
    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `pme-alert-${jobId}` },
      body,
    });
    if (!response.ok) return { state: 'unknown', httpStatus: response.status };
    const data = await response.json();
    if (!UUID.test(data?.id)) return { state: 'unknown' };
    return { state: 'accepted', providerId: data.id };
  } catch {
    // Never return/log the request, key, recipient, token, or provider response.
    return { state: 'unknown' };
  }
}

module.exports = { makeMessage, sendReserved };
