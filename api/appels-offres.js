import verifiedNotices from '../data/opportunites-verifiees.js';

const BASE_ID = 'appCQuqklwVbrz7XF';
const AO_TABLE = "Appels d'offres";
const DONNEURS_TABLE = "Donneurs d'ordre";
// Existing examples also displayed as demonstrations on the home page.
// Identify records, not titles or missing URLs, so new notices are unaffected.
const DEMO_IDS = new Set(['recW9b7mflxZPBKV6', 'rec9WfevTRed1XWJE', 'recqb1YnYtK6sjmUB']);

async function fetchAll(table, token, params = {}) {
  const records = [];
  let offset = '';
  do {
    const search = new URLSearchParams({ ...params, pageSize: '100' });
    if (offset) search.set('offset', offset);
    const response = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(table)}?${search}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      console.error('Airtable request failed', table, response.status);
      throw new Error('Airtable indisponible');
    }
    const data = await response.json();
    records.push(...(data.records || []));
    offset = data.offset || '';
  } while (offset);
  return records;
}

// Preserve Airtable records and their IDs. Enrich an existing copy instead of
// inserting the same editorial notice twice when it is later added to Airtable.
function sameNotice(a, b) {
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const sourceKey = value => {
    try { const url = new URL(value); return url.origin + url.pathname; } catch { return ''; }
  };
  const urls = notice => [notice.sourceUrl, notice.source].map(sourceKey).filter(Boolean);
  return a.id === b.id || urls(a).some(url => urls(b).includes(url)) ||
    (!!a.reference && normalize(a.reference) === normalize(b.reference)) ||
    (normalize(a.titre) === normalize(b.titre) && normalize(a.donneur) === normalize(b.donneur));
}
function mergeNotices(records) {
  const merged = records.slice();
  verifiedNotices.forEach(notice => {
    const index = merged.findIndex(record => record.demonstration !== true && sameNotice(record, notice));
    if (index < 0) merged.push(notice);
    else {
      merged[index] = { ...merged[index], ...notice, id: merged[index].id };
      for (let duplicate = merged.length - 1; duplicate > index; duplicate--) {
        if (merged[duplicate].demonstration !== true && sameNotice(merged[duplicate], notice)) merged.splice(duplicate, 1);
      }
    }
  });
  return merged.sort((a, b) => Number(a.demonstration === true) - Number(b.demonstration === true) ||
    (Date.parse(a.cloture) || Infinity) - (Date.parse(b.cloture) || Infinity));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  const token = process.env.AIRTABLE_TOKEN;
  if (!token) return res.status(500).json({ error: 'Configuration serveur manquante' });

  try {
    const [donneurs, records] = await Promise.all([
      fetchAll(DONNEURS_TABLE, token),
      fetchAll(AO_TABLE, token, {
        filterByFormula: "OR({Statut}='Nouveau',{Statut}='En cours')",
        'sort[0][field]': 'Date clôture',
        'sort[0][direction]': 'asc',
      }),
    ]);
    const donneursMap = Object.fromEntries(donneurs.map(({ id, fields }) => [id, fields['Nom organisation'] || '']));
    const mappedRecords = records.map(({ id, fields }) => {
      const donneurIds = fields["Donneur d'ordre"];
      return {
        id,
        demonstration: DEMO_IDS.has(id) || fields['Démonstration'] === true,
        titre: fields.Titre || '',
        reference: fields['Référence'] || '',
        description: fields.Description || '',
        donneur: Array.isArray(donneurIds) ? donneursMap[donneurIds[0]] || 'Non précisé' : 'Non précisé',
        secteur: Array.isArray(fields['Secteur concerné']) ? fields['Secteur concerné'] : [],
        localisation: fields.Localisation || '',
        cloture: fields['Date clôture'] || null,
        source: fields.Source || '',
        sourceUrl: [fields['URL source'], fields['Lien source']].find(value => typeof value === 'string' && value.trim()) || '',
        priorite: fields['Priorité'] || 'Normale',
      };
    });
    const appelsOffres = mergeNotices(mappedRecords);
    return res.status(200).json({ appelsOffres, count: appelsOffres.length });
  } catch (error) {
    console.error("Appels d'offres handler failed", error);
    return res.status(502).json({ error: 'Source de données indisponible' });
  }
}
