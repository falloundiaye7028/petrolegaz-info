// Fonction serverless Vercel : expose uniquement les informations publiques
// des PME vérifiées. Le jeton Airtable reste exclusivement côté serveur.

const BASE_ID = 'appCQuqklwVbrz7XF';
const TABLE_NAME = 'PME';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');

  const token = process.env.AIRTABLE_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'Configuration serveur manquante' });
  }

  try {
    const records = [];
    let offset = '';

    do {
      const params = new URLSearchParams({
        filterByFormula: "{Statut}='Vérifié'",
        'sort[0][field]': 'Nom entreprise',
        'sort[0][direction]': 'asc',
        pageSize: '100',
      });

      if (offset) params.set('offset', offset);

      const url = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE_NAME)}?${params}`;
      const airtableRes = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!airtableRes.ok) {
        console.error('Airtable request failed with status', airtableRes.status);
        return res.status(502).json({ error: 'Source de données indisponible' });
      }

      const data = await airtableRes.json();
      records.push(...(data.records || []));
      offset = data.offset || '';
    } while (offset);

    const pmes = records.map(({ id, fields }) => ({
      id,
      nom: fields['Nom entreprise'] || '',
      secteur: fields.Secteur || '',
      localisation: fields.Localisation || '',
      description: fields.Description || '',
      competences: Array.isArray(fields['Compétences']) ? fields['Compétences'] : [],
      verifie: Boolean(fields['Badge vérifié']),
      statut: fields.Statut || 'Gratuit',
    }));

    return res.status(200).json({ pmes, count: pmes.length });
  } catch (error) {
    console.error('PME directory handler failed', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}
