'use strict';
const { Matching } = require('../assets/matching.js');
const { AlertPlan } = require('../assets/alert-plan.js');
const { makeMessage, sendReserved } = require('./alert-transport.cjs');
const { createToken } = require('./alert-token.cjs');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function eligible(context, env) {
  return context && context.userId === env.PME_ALERT_INTERNAL_USER_ID && context.verified === true &&
    context.recipient === env.PME_ALERT_INTERNAL_RECIPIENT && context.approved === true &&
    context.suppressed === false && context.due === true && Array.isArray(context.jobs) && Array.isArray(context.membershipIds);
}
function matches(context, catalogue, now) {
  if (!catalogue || !Array.isArray(catalogue.pmes) || !Array.isArray(catalogue.opportunities)) throw new Error('Invalid catalogue');
  return AlertPlan.plan({ ...catalogue, preferences: context.preferences, membershipIds: context.membershipIds,
    seenIds: context.jobs.filter(j => j.state !== 'queued').map(j => j.opportunityId), matching: Matching, now });
}

// No HTTP entry point. Only a trusted operator can run this single-account worker.
// Dry run is the default and performs NO writes, including no queue reservation.
async function dispatchOne({ store, catalogue, env = process.env, send = false, clock = Date.now, fetchImpl = fetch }) {
  if (!UUID.test(env.PME_ALERT_INTERNAL_USER_ID || '') || !env.PME_ALERT_INTERNAL_RECIPIENT) return { state: 'not_configured' };
  if (send && (env.PME_ALERT_EMAIL_ENABLED !== 'true' || env.PME_ALERT_CALLBACKS_READY !== 'true' || env.PME_ALERT_CALLBACKS_ENABLED !== 'true')) return { state: 'disabled' };
  if (send && (!/^re_[A-Za-z0-9_-]+$/.test(env.RESEND_API_KEY || '') || !/^[a-f0-9]{64}$/i.test(env.PME_ALERT_UNSUBSCRIBE_SECRET || ''))) return { state: 'not_configured' };
  let jobId;
  try {
    const context = await store.context(env.PME_ALERT_INTERNAL_USER_ID);
    if (!eligible(context, env)) return { state: 'ineligible' };
    const candidates = matches(context, await catalogue(), clock());
    if (!candidates.length) return { state: 'empty' };
    if (!send) return { state: 'dry_run', count: candidates.length }; // No private data in console output.
    const chosen = candidates[0];
    const pending = context.jobs.find(j => j.state === 'queued' && j.opportunityId === chosen.id);
    jobId = pending?.id || await store.enqueue(context.userId, chosen);
    if (!UUID.test(jobId || '')) return { state: 'not_reserved' };

    // Both sources are read again; no stale CDN response or queue title is sent.
    const freshCatalogue = await catalogue();
    const fresh = await store.context(context.userId);
    if (!eligible(fresh, env)) return { state: 'cancelled' };
    const currentJob = fresh.jobs.find(j => j.id === jobId && j.opportunityId === chosen.id && j.state === 'queued');
    const current = matches(fresh, freshCatalogue, clock()).find(o => o.id === chosen.id);
    if (!currentJob || !current) return { state: 'cancelled' };
    const token = createToken(fresh.userId, env.PME_ALERT_UNSUBSCRIBE_SECRET, Math.floor(clock() / 1000));
    const message = makeMessage({ recipient: fresh.recipient, opportunities: [current], now: clock(),
      unsubscribeUrl: 'https://www.petrolegaz.com/api/alert-unsubscribe?token=' + token });
    const outcome = await sendReserved({ jobId, message, env, fetchImpl,
      authorize: ({ payloadHash, recipient }) => store.authorize({ jobId, userId: fresh.userId, recipient, payloadHash,
        consent: fresh.preferences.consent_at, opportunity: current }),
    });
    if (['accepted', 'unknown'].includes(outcome.state)) {
      try { await store.finish(jobId, outcome.providerId || null); }
      catch { return { state: 'reconciliation_required' }; } // Never resend on DB failure after HTTP.
    }
    return { state: outcome.state };
  } catch {
    // Authorization might have committed before a network error. Never retry
    // here; a future run will exclude attempting/unknown/accepted jobs.
    return { state: jobId ? 'reconciliation_required' : 'unavailable' };
  }
}
module.exports = { dispatchOne };
