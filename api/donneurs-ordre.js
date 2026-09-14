const BASE = 'appCQuqklwVbrz7XF';
const TABLE = 'tbl2LDWPNQ5RE9UrU';
// Publication limited to the four reviewed group identities, not future imports.
const PUBLIC_IDS = ['recV7eQ1adT3yieNi', 'recqgGD2TXgeuqZsc', 'recdPu8o55bBFq89k', 'rec8YqnuW7bBAOEs5'];
const FIELDS = ['firmo_name', 'firmo_city_name', 'firmo_country_name', 'firmo_website'];
function value(input) { return typeof input === 'string' ? input.trim() : ''; }
function safeUrl(input) {
  try { const u = new URL(value(input)); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password ? u.href : ''; }
  catch { return ''; }
}
export default async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({error:'Méthode non autorisée'}); }
  if (!process.env.AIRTABLE_TOKEN) return res.status(500).json({error:'Configuration serveur manquante'});
  try {
    const params = new URLSearchParams({filterByFormula:`OR(${PUBLIC_IDS.map(id=>`RECORD_ID()='${id}'`).join(',')})`,pageSize:'100'});
    FIELDS.forEach(field=>params.append('fields[]',field));
    const response = await fetch(`https://api.airtable.com/v0/${BASE}/${TABLE}?${params}`, {
      headers:{Authorization:`Bearer ${process.env.AIRTABLE_TOKEN}`}, signal:AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error('Source indisponible');
    const data = await response.json();
    if (!Array.isArray(data.records)) throw new Error('Réponse invalide');
    const groupes = data.records.filter(r=>PUBLIC_IDS.includes(r.id) && value(r.fields?.firmo_name)).map(({id,fields})=>({
      id, nom:value(fields.firmo_name), ville:value(fields.firmo_city_name), pays:value(fields.firmo_country_name),
      site:safeUrl(fields.firmo_website), statut:'À qualifier'
    })).sort((a,b)=>a.nom.localeCompare(b.nom,'fr'));
    res.setHeader('Cache-Control','s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({groupes,count:groupes.length});
  } catch { return res.status(502).json({error:'Source de données indisponible'}); }
}
