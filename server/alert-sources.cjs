'use strict';
const { Matching } = require('../assets/matching.js');
const DEMOS = new Set(['recW9b7mflxZPBKV6', 'rec9WfevTRed1XWJE', 'recqb1YnYtK6sjmUB']);
function sources({ env = process.env, fetchImpl = fetch } = {}) {
  async function rpc(name, body) {
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) throw new Error('Server credentials unavailable');
    const response = await fetchImpl('https://ocyjfjddyijaaunzupxe.supabase.co/rest/v1/rpc/' + name, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { apikey: key, ...(key.startsWith('sb_secret_') ? {} : { Authorization: 'Bearer ' + key }), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error('Storage unavailable');
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
  async function records(table, formula) {
    if (!env.AIRTABLE_TOKEN) throw new Error('Catalogue credentials unavailable');
    const result = [], seen = new Set(); let offset = '';
    do {
      if (seen.size >= 100 || seen.has(offset)) throw new Error('Catalogue pagination limit');
      seen.add(offset);
      const params = new URLSearchParams({ pageSize: '100', filterByFormula: formula });
      if (offset) params.set('offset', offset);
      const response = await fetchImpl(`https://api.airtable.com/v0/appCQuqklwVbrz7XF/${encodeURIComponent(table)}?${params}`, {
        headers: { Authorization: 'Bearer ' + env.AIRTABLE_TOKEN }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error('Catalogue unavailable');
      const data = await response.json();
      if (!Array.isArray(data.records) || data.records.some(r => typeof r.id !== 'string' || !r.fields) ||
          (data.offset !== undefined && typeof data.offset !== 'string')) throw new Error('Invalid catalogue response');
      result.push(...data.records); offset = data.offset || '';
    } while (offset);
    return result;
  }
  return {
    store: {
      context: userId => rpc('pme_alert_dispatch_context', { p_user: userId }),
      enqueue: (userId, o) => rpc('pme_enqueue_alert', { p_user: userId, p_opportunity: o.id, p_pmes: o.pmeIds,
        p_deadline: new Date(Matching.deadline(o.deadline)).toISOString(), p_score: o.score }),
      authorize: ({ jobId, userId, recipient, payloadHash, consent, opportunity: o }) => rpc('pme_dispatch_alert', {
        p_job: jobId, p_user: userId, p_recipient: recipient, p_hash: payloadHash, p_consent: consent,
        p_pmes: o.pmeIds, p_deadline: new Date(Matching.deadline(o.deadline)).toISOString(), p_score: o.score,
      }),
      finish: (jobId, providerId) => rpc('pme_finish_alert', { p_job: jobId, p_provider: providerId }),
    },
    catalogue: async () => {
      // Same public-field mapping as the directory, without the CDN cache or
      // private contact fields. Refuse partial pagination rather than send stale data.
      const [pmes, opportunities] = await Promise.all([
        records('PME', "OR({Statut}='Gratuit',{Statut}='Vérifié',{Statut}='Premium')"),
        records("Appels d'offres", "OR({Statut}='Nouveau',{Statut}='En cours')"),
      ]);
      return {
        pmes: pmes.map(({ id, fields: f }) => ({ id, nom: f['Nom entreprise'] || '', secteur: f.Secteur || '',
          localisation: f.Localisation || '', competences: Array.isArray(f['Compétences']) ? f['Compétences'] : [] })),
        opportunities: opportunities.map(({ id, fields: f }) => ({ id, demonstration: DEMOS.has(id) || f['Démonstration'] === true,
          titre: f.Titre || '', description: f.Description || '', secteur: Array.isArray(f['Secteur concerné']) ? f['Secteur concerné'] : [],
          localisation: f.Localisation || '', cloture: f['Date clôture'] || null,
          sourceUrl: [f['URL source'], f['Lien source']].find(v => typeof v === 'string' && v.trim()) || '' })),
      };
    },
  };
}
module.exports = { sources };
