(() => {
  const C=window.Catalogue, el=id=>document.getElementById(id);
  const grid=el('groupes'), search=el('search'), count=el('results-count');
  const countries={senegal:'Sénégal',australia:'Australie','united kingdom':'Royaume-Uni','united states':'États-Unis'};
  const country=g=>countries[C.text(g.pays)]||g.pays||'Pays non renseigné';
  let groupes=[],ready=false;
  function render(){
    if(!ready)return;
    const query=C.text(search.value.trim());
    const rows=groupes.filter(g=>C.text([g.nom,g.ville,g.pays,country(g)].join(' ')).includes(query));
    count.textContent=`${rows.length} groupe(s) à qualifier`;
    grid.innerHTML=rows.length?rows.map(g=>{
      const url=C.source(g.site);
      return `<article class="card"><span class="badge">À qualifier</span><h2>${C.escape(g.nom)}</h2><p>Localisation du groupe : ${C.escape(g.ville||'Ville non renseignée')} · ${C.escape(country(g))}</p>${url?`<a href="${C.escape(url)}" target="_blank" rel="noopener noreferrer">Site officiel ↗</a>`:'<p>Site non renseigné.</p>'}</article>`;
    }).join(''):'<p>Aucun groupe ne correspond à votre recherche.</p>';
  }
  search.addEventListener('input',render);
  el('reset').addEventListener('click',()=>{search.value='';render();});
  async function load(){
    ready=false;count.textContent='';grid.setAttribute('aria-busy','true');grid.innerHTML='<p>Chargement des groupes…</p>';
    try{
      const response=await fetch('/api/donneurs-ordre',{signal:AbortSignal.timeout(20000)});
      if(!response.ok)throw new Error('Source indisponible');
      const data=await response.json();if(!Array.isArray(data.groupes))throw new Error('Réponse invalide');
      groupes=data.groupes.filter(g=>g&&typeof g.nom==='string');ready=true;render();
    }catch{grid.innerHTML='<div><p>Impossible de charger les groupes. Veuillez réessayer.</p><button class="retry" type="button">Réessayer</button></div>';grid.querySelector('button').addEventListener('click',load);}
    finally{grid.setAttribute('aria-busy','false');}
  }
  load();
})();
