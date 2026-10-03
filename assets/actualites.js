/* Public reading only. Airtable remains the authenticated editorial interface. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const categories = ['Pétrole', 'Gaz', 'Mines'];
  const actors = ['Entreprise', 'Institution', 'Projet', 'Autre'];
  const recordId = /^rec[A-Za-z0-9]{14}$/;
  const date = value => new Intl.DateTimeFormat('fr-SN', {dateStyle:'long', timeZone:'Africa/Dakar'}).format(new Date(value));
  const text = (tag, value, className) => { const node=document.createElement(tag); node.textContent=value; if(className)node.className=className; return node; };
  const safeUrl = (value, image=false) => {try{const url=new URL(value);return (image ? url.protocol==='https:' : ['https:','http:'].includes(url.protocol)) && !url.username && !url.password ? url.href : '';}catch{return '';}};
  function link(label, url, className, external=false) {const node=text('a',label,className);node.href=url;if(external){node.target='_blank';node.rel='noopener noreferrer';}return node;}
  function publishedTime(article) {const node=text('time',date(article.publishedAt));node.dateTime=article.publishedAt;return node;}
  function state(container, heading, message, action) {
    const block=text('div','','news-state');
    block.append(text(container.id==='news-article'?'h1':'h2',heading),text('p',message));
    if(action){const button=text('button',action.label,'news-button secondary');button.type='button';button.addEventListener('click',action.run);block.append(button);}
    container.replaceChildren(block);
  }
  function validArticle(article) {
    return article && recordId.test(article.id) && typeof article.title==='string' && article.title.trim() &&
      typeof article.body==='string' && article.body.trim() && categories.includes(article.category) &&
      typeof article.summary==='string' && typeof article.sourceName==='string' && article.sourceName.trim() &&
      !!safeUrl(article.sourceUrl) && Number.isFinite(Date.parse(article.publishedAt)) && Date.parse(article.publishedAt)<=Date.now();
  }
  function photo(article, detail=false) {
    const url=safeUrl(article.image?.url,true);
    if(!url)return null;
    const wrapper=document.createElement(detail?'figure':'div');
    if(!detail)wrapper.className='news-card-visual';
    const img=document.createElement('img');img.src=url;img.alt=article.image.alt||article.title;img.loading=detail?'eager':'lazy';img.decoding='async';img.referrerPolicy='no-referrer';
    img.addEventListener('error',()=>wrapper.remove(),{once:true});wrapper.append(img);
    if(detail){const caption=[article.image.caption,article.image.credit ? 'Crédit : '+article.image.credit : ''].filter(Boolean).join(' · ');if(caption)wrapper.append(text('figcaption',caption));}
    return wrapper;
  }
  async function request(params, signal) {
    const response=await fetch('/api/actualites?'+params.toString(),{signal,headers:{Accept:'application/json'}});
    let data;try{data=await response.json();}catch{throw Object.assign(new Error('Réponse indisponible'),{status:response.status});}
    if(!response.ok)throw Object.assign(new Error(data.error||'Actualités indisponibles'),{status:response.status,code:data.code});
    return data;
  }
  if(document.body.dataset.newsView==='article') {
    const target=$('news-article');
    async function loadArticle() {
      target.setAttribute('aria-busy','true');target.replaceChildren(text('div','Chargement de l’article…','news-state'));
      const params=new URLSearchParams(location.search),id=params.get('id');
      if(!recordId.test(id||'')){state(target,'Article introuvable','Ce lien ne correspond à aucun article. Consultez les actualités pour retrouver une publication.');target.setAttribute('aria-busy','false');return;}
      try {
        const result=await request(new URLSearchParams({id}),AbortSignal.timeout(15000));
        const a=result.article;if(!validArticle(a))throw new Error('Article non valide');
        const article=text('article','','news-article');
        const kicker=text('p','','news-kicker');kicker.append(text('span',a.category,'news-category'));if(a.actorType)kicker.append(text('span',a.actorType));article.append(kicker,text('h1',a.title));
        if(a.summary)article.append(text('p',a.summary,'news-lead'));
        const meta=text('div','','news-article-meta'),publication=text('p','Publié le ');publication.append(publishedTime(a));meta.append(publication);
        if(a.organization)meta.append(text('p',a.organization+(a.location?' · '+a.location:'')));
        else if(a.location)meta.append(text('p',a.location));
        article.append(meta);const image=photo(a,true);if(image)article.append(image);
        const body=text('div','','news-body');a.body.split(/\n\s*\n/).filter(p=>p.trim()).forEach(p=>body.append(text('p',p.trim())));article.append(body);
        const source=text('section','','news-source');source.setAttribute('aria-label','Source de l’information');source.append(text('h2','Source de l’information'),link(a.sourceName+' ↗',safeUrl(a.sourceUrl),'',true),text('p','Consultez la source pour les informations et documents d’origine.'));
        source.append(link('Signaler une correction','mailto:contact@petrolegaz.com?subject='+encodeURIComponent('Correction actualité : '+a.title)));
        article.append(source);target.replaceChildren(article);document.title=a.title+' — PétroleGaz';
        document.querySelector('meta[name="description"]').content=a.summary||a.title;
        document.querySelector('link[rel="canonical"]').href='https://www.petrolegaz.com/actualite.html?id='+encodeURIComponent(a.id);
        document.querySelector('meta[name="robots"]').content='index,follow';
      }catch(error){
        if(error.status===404)state(target,'Article introuvable','Cet article n’est pas disponible ou n’est plus publié. Retrouvez les autres publications dans les actualités.');
        else state(target,'L’article ne peut pas être chargé','La source des actualités est momentanément indisponible. Vous pouvez réessayer.',{label:'Réessayer',run:loadArticle});
      }finally{target.setAttribute('aria-busy','false');}
    }
    loadArticle();return;
  }
  if(document.body.dataset.newsView!=='list')return;
  const list=$('news-list'),count=$('news-count'),pagination=$('news-pagination');
  let controller,revision=0,nextCursor=null,previousCursors=[],currentCursor='',page=1;
  function readFilters() {
    const params=new URLSearchParams(location.search);
    return {q:(params.get('q')||'').slice(0,120),category:categories.includes(params.get('category'))?params.get('category'):'',actorType:actors.includes(params.get('actorType'))?params.get('actorType'):''};
  }
  function updateControls(filters) {
    $('news-query').value=filters.q;$('news-actor').value=filters.actorType;
    document.querySelectorAll('[data-category]').forEach(a=>{a.setAttribute('aria-current',String(a.dataset.category===filters.category));});
  }
  function navigate(filters) {
    const params=new URLSearchParams();for(const [key,value]of Object.entries(filters))if(value)params.set(key,value);
    history.pushState(null,'','actualites.html'+(params.size?'?'+params:''));resetPage();load();
  }
  function resetPage(){previousCursors=[];currentCursor='';page=1;nextCursor=null;}
  function card(a) {
    const article=text('article','','news-card'),url='actualite.html?id='+encodeURIComponent(a.id);
    const image=photo(a);if(image)article.append(image);
    const content=text('div','','news-card-main'),kicker=text('p','','news-kicker');kicker.append(text('span',a.category,'news-category'),publishedTime(a));content.append(kicker);
    const title=document.createElement('h2');title.append(link(a.title,url));content.append(title);
    if(a.summary)content.append(text('p',a.summary,'news-summary'));
    const bottom=text('div','','news-card-bottom');if(a.organization)bottom.append(text('p',a.organization+(a.actorType?' · '+a.actorType:'')));bottom.append(text('p','Source : '+a.sourceName));
    const more=link('Lire l’article →',url,'news-read');more.setAttribute('aria-label','Lire l’article : '+a.title);bottom.append(more);content.append(bottom);article.append(content);return article;
  }
  async function load(focus=false) {
    controller?.abort();controller=new AbortController();const activeController=controller,stamp=++revision,timeout=setTimeout(()=>activeController.abort(),15000);
    const filters=readFilters();updateControls(filters);nextCursor=null;pagination.hidden=true;
    list.setAttribute('aria-busy','true');count.textContent='Chargement des publications…';list.replaceChildren(text('div','Chargement des publications…','news-state'));
    try{
      const params=new URLSearchParams({limit:'12'});for(const [key,value]of Object.entries(filters))if(value)params.set(key,value);if(currentCursor)params.set('cursor',currentCursor);
      const result=await request(params,activeController.signal);if(stamp!==revision)return;
      if(!Array.isArray(result.articles)||!result.articles.every(validArticle))throw new Error('Réponse non valide');
      const articles=result.articles;nextCursor=result.hasMore&&typeof result.nextCursor==='string'?result.nextCursor:null;
      list.replaceChildren(...articles.map(card));
      count.textContent=articles.length ? `${articles.length} publication${articles.length>1?'s':''} sur cette page` : 'Aucune publication à afficher';
      if(!articles.length){
        if(filters.q||filters.category||filters.actorType)state(list,'Aucun résultat pour ces critères','Essayez un autre mot-clé, un autre secteur ou affichez toutes les publications.',{label:'Tout afficher',run:()=>navigate({})});
        else if(nextCursor)state(list,'Aucun article sur cette page','Vous pouvez poursuivre la consultation avec le bouton Suivant.');
        else state(list,'Les premières publications arrivent ici','Cette rubrique accueillera les activités des entreprises, institutions et projets du pétrole, du gaz et des mines au Sénégal. Aucun article n’a encore été publié.');
      }
      $('news-previous').disabled=page===1;$('news-next').disabled=!nextCursor;$('news-page-label').textContent='Page '+page;pagination.hidden=page===1&&!nextCursor;
    }catch(error){if(stamp!==revision)return;count.textContent='Publications indisponibles';
      if(error.status===400&&currentCursor)state(list,'La liste a évolué','Revenez à la première page pour poursuivre votre lecture.',{label:'Revenir à la première page',run:()=>{resetPage();load();}});
      else state(list,'Les actualités sont momentanément indisponibles','Nous ne pouvons pas charger les publications pour le moment. Réessayez dans quelques instants.',{label:'Réessayer',run:()=>load()});
    }finally{clearTimeout(timeout);if(stamp===revision){list.setAttribute('aria-busy','false');if(focus)count.focus();}}
  }
  $('news-filters').addEventListener('submit',event=>{event.preventDefault();navigate({...readFilters(),q:$('news-query').value.trim(),actorType:$('news-actor').value});});
  $('news-reset').addEventListener('click',()=>navigate({}));
  document.querySelectorAll('[data-category]').forEach(a=>a.addEventListener('click',event=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();navigate({...readFilters(),category:a.dataset.category});}));
  $('news-next').addEventListener('click',()=>{if(!nextCursor)return;previousCursors.push(currentCursor);currentCursor=nextCursor;page++;load(true);});
  $('news-previous').addEventListener('click',()=>{if(page<=1)return;currentCursor=previousCursors.pop()||'';page--;load(true);});
  window.addEventListener('popstate',()=>{resetPage();load();});
  load();
})();
