(() => {
  const $=id=>document.getElementById(id), E=window.Catalogue.escape;
  const labels={preparing:'À préparer',sent:'Envoyée',discussion:'En échange',accepted:'Retenue',rejected:'Non retenue',abandoned:'Abandonnée'};
  let client, user, pmes=[], opportunities=[], generation=0;
  const say=text=>{$('notice').textContent=text;};
  function clearPrivate(){generation++;user=null;$('workspace').hidden=true;['requests','applications','matches','identity','member-pme','claim-pme'].forEach(id=>$(id).replaceChildren());$('claim-message').value='';}
  async function result(query){const r=await query;if(r.error)throw r.error;return r.data;}
  async function catalogue(){const data=await Promise.all(['/api/pmes','/api/appels-offres'].map(async url=>{const r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error();return r.json();}));if(!Array.isArray(data[0].pmes)||!Array.isArray(data[1].appelsOffres))throw Error();return data;}
  async function session(){
    clearPrivate(); const stamp=generation;
    const {data,error}=await client.auth.getUser(); if(stamp!==generation)return;
    $('login').hidden=false;
    if(error||!data.user){say('Connectez-vous pour accéder à votre espace privé.');return;}
    user=data.user;$('login').hidden=true;$('workspace').hidden=false;$('identity').textContent='Connecté : '+user.email;
    await refresh();
  }
  async function refresh(){
    if(!user)return;const stamp=++generation;
    $('applications').replaceChildren();$('matches').replaceChildren();$('member-pme').replaceChildren();$('claim-pme').replaceChildren();$('requests').replaceChildren();
    say('Chargement de votre espace…');
    try{
      const [catalog,members,requests]=await Promise.all([catalogue(),result(client.from('pme_memberships').select('pme_id')),result(client.from('pme_access_requests').select('pme_id,status').order('created_at',{ascending:false}).limit(100))]);
      if(stamp!==generation)return;
      pmes=catalog[0].pmes;opportunities=catalog[1].appelsOffres;
      $('claim-pme').replaceChildren(new Option('Choisir une PME',''),...pmes.map(p=>new Option(p.nom,p.id)));
      const allowed=members.map(m=>new Option(pmes.find(p=>p.id===m.pme_id)?.nom||m.pme_id,m.pme_id));
      $('member-pme').replaceChildren(new Option('Choisir une PME autorisée',''),...allowed);
      $('requests').textContent=requests.length?requests.map(r=>`${pmes.find(p=>p.id===r.pme_id)?.nom||r.pme_id} : ${{pending:'en attente',approved:'approuvée',rejected:'refusée'}[r.status]||'à vérifier'}`).join(' · '):'Aucune demande de rattachement.';
      say(allowed.length?'Vos rattachements ont été chargés.':'Aucun rattachement validé. Vous pouvez demander l’accès à votre PME.');
    }catch{if(stamp===generation)say('Impossible de charger votre espace. Réessayez avec Actualiser ; aucun accès n’est accordé en cas d’erreur.');}
  }
  async function renderApplications(){
    const pmeId=$('member-pme').value, stamp=++generation;
    $('matches').replaceChildren();$('applications').replaceChildren();if(!user||!pmeId)return;
    try{
      const rows=await result(client.from('pme_applications').select('opportunity_id,title,status,updated_at').eq('pme_id',pmeId).order('updated_at',{ascending:false}).limit(200));
      if(stamp!==generation)return;
      const matches=window.Matching.rank(pmes.find(p=>p.id===pmeId),opportunities);
      $('matches').textContent=matches.length?'Correspondances indicatives — vérifiez les exigences dans l’avis source.':'Aucune correspondance exploitable actuellement.';
      for(const match of matches){const a=match.opportunity,card=document.createElement('article');card.innerHTML=`<h3>${E(a.titre)}</h3><p>Score indicatif ${match.score}/100 : ${E(match.reasons.join(' ; '))}</p><a href="${E(window.Matching.source(a.sourceUrl))}" target="_blank" rel="noopener noreferrer">Vérifier l’avis source</a>`;
        const button=document.createElement('button');button.type='button';button.textContent='Ajouter au suivi privé';button.disabled=rows.some(r=>r.opportunity_id===a.id);
        button.addEventListener('click',()=>mutate(button,async()=>result(client.from('pme_applications').insert({pme_id:pmeId,opportunity_id:a.id,title:a.titre.slice(0,300)}))));card.append(button);$('matches').append(card);}
      $('applications').textContent=rows.length?'':'Aucune candidature suivie.';
      for(const row of rows){const card=document.createElement('article');card.innerHTML=`<h3>${E(row.title)}</h3><p>Modification : ${E(row.updated_at)}</p>`;
        const label=document.createElement('label');label.textContent='Statut déclaré';const select=document.createElement('select');select.replaceChildren(...Object.entries(labels).map(([v,l])=>new Option(l,v)));select.value=row.status;
        select.addEventListener('change',()=>mutate(select,async()=>{const changed=await result(client.from('pme_applications').update({status:select.value}).eq('pme_id',pmeId).eq('opportunity_id',row.opportunity_id).select('opportunity_id'));if(!changed.length)throw Error();}));label.append(select);card.append(label);$('applications').append(card);}
      say('Suivi privé chargé. Aucun dossier n’a été transmis à un acheteur.');
    }catch{if(stamp===generation)say('Suivi indisponible ou accès révoqué. Actualisez votre espace.');}
  }
  async function mutate(control,action){const stamp=generation;control.disabled=true;try{await action();if(stamp!==generation)return;say('Enregistré dans votre espace privé.');await renderApplications();}catch{if(stamp===generation)say('Enregistrement impossible : accès à vérifier ou candidature déjà présente.');}finally{control.disabled=false;}}
  $('login-form').addEventListener('submit',async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;
    try{const {error}=await client.auth.signInWithOtp({email:$('email').value.trim(),options:{emailRedirectTo:location.origin+'/espace-pme.html',shouldCreateUser:true}});if(error)throw error;say('Si l’envoi est autorisé, un lien vous parviendra par email. Vérifiez les indésirables. Ouvrez-le dans ce navigateur.');}catch{say('Envoi indisponible. Réessayez plus tard ou contactez l’équipe ; aucun accès PME n’a été accordé.');}finally{button.disabled=false;}});
  $('claim-form').addEventListener('submit',async e=>{e.preventDefault();if(!user)return;const button=e.target.querySelector('button'),stamp=generation;button.disabled=true;
    try{await result(client.from('pme_access_requests').insert({pme_id:$('claim-pme').value,message:$('claim-message').value.trim()}));if(stamp!==generation)return;$('claim-message').value='';await refresh();say('Demande enregistrée, en attente de vérification manuelle. Aucun email de notification automatique.');}catch{if(stamp===generation)say('Demande non enregistrée : elle existe peut-être déjà, ou le service est indisponible.');}finally{button.disabled=false;}});
  $('member-pme').addEventListener('change',renderApplications);$('refresh').addEventListener('click',refresh);
  $('logout').addEventListener('click',async()=>{clearPrivate();$('login').hidden=true;const {error}=await client.auth.signOut();$('login').hidden=false;say(error?'Déconnexion distante non confirmée. Fermez ce navigateur sur un appareil partagé.':'Vous êtes déconnecté.');});
  (async()=>{try{const r=await fetch('/api/pme-config',{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error();const config=await r.json();if(!window.supabase)throw Error();
    client=window.supabase.createClient(config.url,config.publishableKey,{auth:{flowType:'pkce',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    client.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT'){clearPrivate();$('login').hidden=false;}else if(event==='SIGNED_IN')setTimeout(session,0);});await session();
  }catch{clearPrivate();say('Espace sécurisé en cours de préparation ou indisponible. Utilisez le suivi local en attendant.');}})();
})();
