(() => {
  const C = window.Catalogue;
  const el = id => document.getElementById(id);
  const grid = el('grid'), search = el('search'), verification = el('verification'), location = el('location');
  const previous = el('previous'), next = el('next');
  let pmes = [], sector = '', page = 1, ready = false;
  function render() {
    if (!ready) return;
    const query = C.text(search.value.trim());
    const filtered = pmes.filter(p => {
      const haystack = C.text([p.nom,p.description,p.localisation,...C.values(p.secteur),...C.values(p.competences)].join(' '));
      return (!query || haystack.includes(query)) && (!sector || C.values(p.secteur).includes(sector)) &&
        (!location.value || p.localisation === location.value) &&
        (!verification.value || (verification.value === 'verified' ? p.verifie : !p.verifie));
    });
    el('results-count').textContent = `${filtered.length} entreprise(s) correspondent à votre recherche`;
    const result = C.paginate(filtered,page,12,el('page-status'),previous,next);
    page = result.page;
    el('pagination').hidden = filtered.length <= 12;
    if (!filtered.length) {
      grid.innerHTML = '<div class="empty"><p>Aucune entreprise ne correspond à ces critères. Modifiez ou réinitialisez les filtres.</p></div>';
      return;
    }
    grid.innerHTML = result.items.map(p => {
      const message = p.verifie ? `Bonjour, je souhaite contacter ${p.nom}` : `Bonjour, je représente ${p.nom} et je souhaite revendiquer et compléter cette fiche.`;
      return `<article class="card"><div class="card-header"><h3>${C.escape(p.nom)}</h3>${p.verifie ? '<span class="badge">✓ Vérifié</span>' : '<span class="badge-pending">Profil à compléter</span>'}</div>
        <div class="card-meta">📍 ${C.escape(p.localisation)} · 🏢 ${C.escape(C.values(p.secteur).join(', '))}</div>
        <p class="card-desc">${C.escape(p.description)}</p><div class="tags">${C.values(p.competences).slice(0,5).map(c=>`<span class="tag">${C.escape(c)}</span>`).join('')}</div>
        <a href="https://wa.me/221778001717?text=${C.escape(encodeURIComponent(message))}" target="_blank" rel="noopener noreferrer" class="contact-btn">${p.verifie ? 'Demander une mise en relation' : 'Revendiquer et compléter cette fiche'}</a></article>`;
    }).join('');
  }
  function resetPage() { page=1; render(); }
  el('filters').addEventListener('click',event=>{
    const button = event.target.closest('button[data-secteur]');
    if (!button) return;
    sector=button.dataset.secteur;
    el('filters').querySelectorAll('button').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});
    resetPage();
  });
  search.addEventListener('input',resetPage);
  verification.addEventListener('change',resetPage);
  location.addEventListener('change',resetPage);
  el('reset').addEventListener('click',()=>{
    search.value=''; verification.value=''; location.value=''; sector='';
    el('filters').querySelectorAll('button').forEach(b=>{const active=b.dataset.secteur==='';b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
    resetPage();
  });
  previous.addEventListener('click',()=>{page--;render();el('results-count').focus();});
  next.addEventListener('click',()=>{page++;render();el('results-count').focus();});
  async function load() {
    ready=false; el('results-count').textContent=''; el('pagination').hidden=true;
    grid.setAttribute('aria-busy','true');
    grid.innerHTML='<div class="empty">Chargement des entreprises…</div>';
    try {
      const response=await fetch('/api/pmes',{signal:AbortSignal.timeout(20000)});
      if (!response.ok) throw new Error('Chargement impossible');
      const data=await response.json();
      if (!Array.isArray(data.pmes)) throw new Error('Réponse invalide');
      pmes=data.pmes.filter(p=>p && typeof p==='object');
      C.options(location,pmes.map(p=>p.localisation),'Toutes les localisations');
      const sectors=[...new Set(pmes.flatMap(p=>C.values(p.secteur)))].sort((a,b)=>String(a).localeCompare(String(b),'fr'));
      el('filters').innerHTML=['',...sectors].map(s=>`<button type="button" class="filter${s?'':' active'}" aria-pressed="${!s}" data-secteur="${C.escape(s)}">${C.escape(s||'Tous')}</button>`).join('');
      sector='';ready=true;page=1;render();
    } catch {
      grid.innerHTML='<div class="empty"><p>Impossible de charger les entreprises.</p><button class="retry" type="button">Réessayer</button></div>';
      grid.querySelector('button').addEventListener('click',load);
    } finally {grid.setAttribute('aria-busy','false');}
  }
  load();
})();
