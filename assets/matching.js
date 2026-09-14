/* Explainable public-data matching; never an eligibility decision. */
(function (root) {
  const text = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const values = v => Array.isArray(v) ? v : v ? [v] : [];
  function deadline(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value)) return null;
    const day = value.slice(0, 10), ms = Date.parse(day + 'T23:59:59.999Z');
    return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === day ? ms : null;
  }
  function source(value) {
    try { const u = new URL(value); return /^https?:$/.test(u.protocol) && !u.username && !u.password ? u.href : ''; } catch { return ''; }
  }
  function match(pme, ao, now = Date.now()) {
    if (!pme || !ao || !ao.id || ao.demonstration !== false || !source(ao.sourceUrl) || deadline(ao.cloture) === null || deadline(ao.cloture) < now) return null;
    const sectors = values(pme.secteur).map(text).filter(Boolean);
    const sameSector = values(ao.secteur).some(v => sectors.includes(text(v)));
    const haystack = ' ' + text([ao.titre, ao.description, ...values(ao.secteur)].join(' ')) + ' ';
    const skills = [...new Set(values(pme.competences).map(text).filter(v => v.length >= 3))].filter(v => haystack.includes(' ' + v + ' '));
    if (!sameSector && !skills.length) return null;
    const samePlace = !!text(pme.localisation) && text(pme.localisation) === text(ao.localisation);
    const reasons = [...(sameSector ? ['Secteur commun'] : []), ...skills.map(v => 'Compétence citée : ' + v), ...(samePlace ? ['Localisation commune'] : [])];
    return { id: ao.id, score: (sameSector ? 50 : 0) + Math.min(40, skills.length * 20) + (samePlace ? 10 : 0), reasons, opportunity: ao };
  }
  function rank(pme, opportunities, now) {
    return opportunities.map(ao => match(pme, ao, now)).filter(Boolean).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  }
  root.Matching = { rank, match, deadline, source };
})(typeof window === 'undefined' ? module.exports : window);
