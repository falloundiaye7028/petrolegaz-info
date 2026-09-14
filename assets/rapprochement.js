(() => {
  const el = id => document.getElementById(id), M = window.Matching, escape = window.Catalogue.escape;
  const key = 'petrolegaz:matching:v1', statuses = ['À préparer', 'Envoyée', 'En échange', 'Retenue', 'Non retenue', 'Abandonnée'];
  let pmes = [], opportunities = [], state = {}, ready = false;
  try { const saved = JSON.parse(localStorage.getItem(key) || '{}'); if (saved && typeof saved === 'object' && !Array.isArray(saved)) state = saved; }
  catch { el('storage-status').textContent = 'Stockage indisponible ou illisible : votre suivi peut ne pas être conservé.'; }
  function save() {
    try { localStorage.setItem(key, JSON.stringify(state)); el('storage-status').textContent = 'Préférences et suivi enregistrés sur cet appareil uniquement.'; }
    catch { el('storage-status').textContent = 'Échec de sauvegarde : les changements restent uniquement dans cette page.'; }
  }
  function profile() { return pmes.find(p => p.id === el('pme').value); }
  function data() {
    const id = el('pme').value;
    if (!Object.hasOwn(state, id) || !state[id] || typeof state[id] !== 'object') state[id] = {};
    const d = state[id];
    if (!Array.isArray(d.seen)) d.seen = [];
    if (!Array.isArray(d.tracked)) d.tracked = [];
    d.tracked = d.tracked.filter(t => t && typeof t.id === 'string' && statuses.includes(t.status));
    return d;
  }
  function render() {
    const p = profile();
    el('alerts').disabled = el('read').disabled = !ready || !p;
    if (!ready || !p) { el('matches').textContent = ready ? 'Sélectionnez une PME.' : ''; el('tracking').replaceChildren(); el('alert-status').textContent = ''; el('profile-note').textContent = ''; return; }
    const d = data(), matches = M.rank(p, opportunities);
    el('profile-note').textContent = p.verifie ? 'Profil portant un badge vérifié ; qualification à contrôler pour chaque avis.' : 'Profil non vérifié : les correspondances sont exploratoires.';
    el('alerts').checked = d.enabled === true;
    el('alert-status').textContent = d.enabled ? `${matches.filter(m => !d.seen.includes(m.id)).length} nouvelle(s) correspondance(s) depuis votre dernière lecture.` : 'Alertes désactivées. Aucun envoi automatique.';
    el('matches').replaceChildren();
    if (!matches.length) el('matches').textContent = 'Aucune correspondance exploitable actuellement. Cela ne signifie pas que votre entreprise est inéligible.';
    matches.forEach(m => {
      const a = m.opportunity, card = document.createElement('article');
      card.innerHTML = `<h3>${escape(a.titre)}</h3><p>Score indicatif : ${m.score}/100</p><ul>${m.reasons.map(r => `<li>${escape(r)}</li>`).join('')}</ul><p>Clôture : ${escape(a.cloture.slice(0, 10))}</p><a href="${escape(M.source(a.sourceUrl))}" target="_blank" rel="noopener noreferrer">Lire l’avis source</a> `;
      const button = document.createElement('button'); button.type = 'button'; button.textContent = d.tracked.some(t => t.id === a.id) ? 'Déjà dans le suivi' : 'Ajouter au suivi'; button.disabled = d.tracked.some(t => t.id === a.id);
      button.addEventListener('click', () => { d.tracked.push({ id: a.id, title: a.titre, status: statuses[0], updated: new Date().toISOString() }); save(); render(); });
      card.append(button); el('matches').append(card);
    });
    el('tracking').replaceChildren();
    if (!d.tracked.length) el('tracking').textContent = 'Aucune candidature suivie pour ce profil.';
    d.tracked.forEach(t => {
      const card = document.createElement('article'), current = opportunities.find(a => a.id === t.id);
      card.innerHTML = `<h3>${escape(t.title)}</h3><p>${current && M.match(p, current) ? 'Avis actuellement présent dans les correspondances.' : 'Avis clôturé, indisponible ou ne correspondant plus : consultez la source avant toute action.'}</p><p>Dernière modification : ${escape(t.updated || 'Non renseignée')}</p>`;
      const label = document.createElement('label'); label.textContent = 'Statut déclaré ';
      const select = document.createElement('select'); statuses.forEach(s => select.add(new Option(s, s))); select.value = t.status;
      select.addEventListener('change', () => { t.status = select.value; t.updated = new Date().toISOString(); save(); render(); });
      label.append(select); card.append(label); el('tracking').append(card);
    });
  }
  async function load() {
    ready = false; el('pme').disabled = true; el('reload').disabled = true; render(); el('load-status').textContent = 'Chargement…';
    try {
      const results = await Promise.all(['/api/pmes', '/api/appels-offres'].map(async url => { const res = await fetch(url, { signal: AbortSignal.timeout(20000) }); if (!res.ok) throw new Error(); return res.json(); }));
      if (!Array.isArray(results[0].pmes) || !Array.isArray(results[1].appelsOffres)) throw new Error();
      const selected = el('pme').value;
      pmes = results[0].pmes.filter(p => p && typeof p.id === 'string' && !['__proto__', 'constructor', 'prototype'].includes(p.id));
      opportunities = results[1].appelsOffres.filter(a => a && typeof a.id === 'string');
      el('pme').replaceChildren(new Option('Choisir une PME', ''), ...pmes.map(p => new Option(p.nom, p.id)));
      if (pmes.some(p => p.id === selected)) el('pme').value = selected;
      ready = true; el('pme').disabled = false; el('load-status').textContent = 'Données actualisées. Les avis sources restent à vérifier.'; render();
    } catch { el('load-status').textContent = 'Chargement impossible. Réessayez avec le bouton Actualiser. Votre suivi enregistré est conservé.'; }
    finally { el('reload').disabled = false; }
  }
  el('pme').addEventListener('change', render);
  el('reload').addEventListener('click', load);
  el('alerts').addEventListener('change', () => { data().enabled = el('alerts').checked; save(); render(); });
  el('read').addEventListener('click', () => { data().seen = M.rank(profile(), opportunities).map(m => m.id); save(); render(); });
  el('clear').addEventListener('click', () => { if (window.confirm('Effacer tout le suivi et les préférences d’alertes de cet outil sur ce navigateur ?')) { state = {}; save(); render(); } });
  load();
})();
