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
    const appelsOffres = records.map(({ id, fields }) => {
      const donneurIds = fields["Donneur d'ordre"];
      return {
        id,
        demonstration: DEMO_IDS.has(id) || fields['Démonstration'] === true,
        titre: fields.Titre || '',
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
    return res.status(200).json({ appelsOffres, count: appelsOffres.length });
  } catch (error) {
    console.error("Appels d'offres handler failed", error);
    return res.status(502).json({ error: 'Source de données indisponible' });
  }
}
