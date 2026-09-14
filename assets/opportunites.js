(() => {
  const C=window.Catalogue, el=id=>document.getElementById(id);
  const list=el('ao-list'), search=el('search'), urgency=el('urgency'), sector=el('sector'), buyer=el('buyer');
  let opportunities=[], page=1, ready=false;
  function date(value) {
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value))return null;
    const d=new Date(value.slice(0,10)+'T00:00:00Z');
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10)===value.slice(0,10)?d:null;
  }
  function days(value) {
    const d=date(value);if(!d)return null;
    const now=new Date();return Math.round((d-Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()))/86400000);
  }
  function render() {
    if(!ready)return;
    const query=C.text(search.value.trim());
    const filtered=opportunities.filter(ao=>{
      const remaining=days(ao.cloture);
      const matchesDate=!urgency.value || (urgency.value==='unknown'?remaining===null:urgency.value==='closed'?remaining!==null&&remaining<0:remaining!==null&&remaining>=0&&(urgency.value!=='urgent'||remaining<=7));
      return matchesDate && (!query||C.text([ao.titre,ao.description,ao.donneur,ao.localisation,ao.source,...C.values(ao.secteur)].join(' ')).includes(query)) &&
        (!sector.value||C.values(ao.secteur).includes(sector.value)) && (!buyer.value||ao.donneur===buyer.value);
    });
    el('result-count').textContent=`${filtered.length} opportunité(s) correspondent à votre recherche`;
    const result=C.paginate(filtered,page,10,el('page-status'),el('previous'),el('next'));page=result.page;
    el('pagination').hidden=filtered.length<=10;
    if(!filtered.length){list.innerHTML='<div class="empty"><p>Aucune opportunité ne correspond à ces critères. Modifiez ou réinitialisez les filtres.</p></div>';return;}
    list.innerHTML=result.items.map(ao=>{
      const remaining=days(ao.cloture), closed=remaining!==null&&remaining<0;
      const badge=remaining===null?'Date inconnue':closed?'Clôturé':remaining===0?"Aujourd’hui":`J-${remaining}`;
      const cls=remaining===null||closed?'closed':remaining<=7?'urgent':'normal';
      const url=C.source(ao.sourceUrl)||C.source(ao.source);
      const source=url?`<a class="source-link" href="${C.escape(url)}" target="_blank" rel="noopener noreferrer">Consulter l’avis source ↗</a>`:'<p class="source-note">Lien de l’avis non renseigné.</p>';
      const formatted=date(ao.cloture)?.toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric',timeZone:'Africa/Dakar'})||'Non précisée';
      const message=C.escape(encodeURIComponent(`Bonjour, je souhaite des informations sur l’appel d’offres : ${ao.titre}`));
      return `<article class="ao"><div class="ao-header"><h3>${C.escape(ao.titre)}</h3><span class="ao-badge ${cls}">${badge}</span></div><p>${C.escape(ao.description)}</p><div class="ao-tags">${C.values(ao.secteur).map(s=>`<span class="ao-tag">${C.escape(s)}</span>`).join('')}</div><div class="ao-meta"><span>🏢 ${C.escape(ao.donneur)}</span><span>📍 ${C.escape(ao.localisation)}</span><span>📅 Clôture : ${formatted}</span><span>Source : ${C.escape(ao.source||'Non précisée')}</span></div>${source}${closed?'':`<a class="btn-primary" href="https://wa.me/221778001717?text=${message}" target="_blank" rel="noopener noreferrer">Demander des informations</a>`}</article>`;
    }).join('');
  }
  function resetPage(){page=1;render();}
  search.addEventListener('input',resetPage);
  [urgency,sector,buyer].forEach(input=>input.addEventListener('change',resetPage));
  el('reset').addEventListener('click',()=>{[search,urgency,sector,buyer].forEach(input=>input.value='');resetPage();});
  el('previous').addEventListener('click',()=>{page--;render();el('result-count').focus();});
  el('next').addEventListener('click',()=>{page++;render();el('result-count').focus();});
  async function load(){
    ready=false;el('counter').hidden=true;el('pagination').hidden=true;el('result-count').textContent='';list.setAttribute('aria-busy','true');
    list.innerHTML='<div class="loading">Chargement des opportunités…</div>';
    try{
      const response=await fetch('/api/appels-offres',{signal:AbortSignal.timeout(20000)});
      if(!response.ok)throw new Error('Chargement impossible');
      const data=await response.json();if(!Array.isArray(data.appelsOffres))throw new Error('Réponse invalide');
      opportunities=data.appelsOffres.filter(ao=>ao&&typeof ao==='object');
      C.options(sector,opportunities.flatMap(ao=>C.values(ao.secteur)),'Tous les secteurs');
      C.options(buyer,opportunities.map(ao=>ao.donneur),'Tous les donneurs d’ordre');
      el('counter').hidden=false;el('counter').textContent=`${opportunities.length} avis référencés. Vérifiez les conditions et l’heure limite dans l’avis source.`;
      ready=true;page=1;render();
    }catch{list.innerHTML='<div class="empty"><p>Impossible de charger les opportunités.</p><button class="retry" type="button">Réessayer</button></div>';list.querySelector('button').addEventListener('click',load);}
    finally{list.setAttribute('aria-busy','false');}
  }
  load();
})();
