// Only the explicitly public Supabase key may reach the browser.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({error:'Méthode non autorisée'}); }
  // Public project identifiers, NOT a service-role key. RLS is mandatory.
  const url=process.env.PME_SUPABASE_URL || 'https://ocyjfjddyijaaunzupxe.supabase.co';
  const key=process.env.PME_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_Ko1YpSGJ1j5GxwXSGavjNA_whblvdt0';
  const enabled=process.env.PME_AUTH_ENABLED === 'true' || process.env.VERCEL_ENV === 'preview';
  if (!enabled || !/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(url) || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
    return res.status(503).json({error:'Espace sécurisé en cours de préparation. Le suivi local reste disponible.'});
  }
  // Synthetic fixture, never inserted into Airtable or the public directory.
  const testPme=process.env.VERCEL_ENV === 'preview' ? {id:'recTEST0000000001',nom:'PME TEST PétroleGaz — entreprise fictive',secteur:'TEST',localisation:'TEST',description:'Entreprise fictive réservée aux essais de rattachement. Aucune activité réelle.',competences:[],verifie:false,statut:'TEST',testOnly:true} : null;
  return res.status(200).json({url, publishableKey:key, testPme});
}
