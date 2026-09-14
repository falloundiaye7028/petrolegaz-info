/* Account settings, independent of catalogue loading. No sender is enabled. */
(() => {
  const $=id=>document.getElementById(id);
  let client,userId,revision=0,preferences=null,busy=false;
  function reset(){revision++;userId=null;preferences=null;busy=false;$('alert-settings').hidden=true;$('alert-enabled').checked=false;$('alert-preview').replaceChildren();$('alert-status').textContent='';}
  function populate(row){preferences=row||null;$('alert-enabled').checked=row?.enabled===true;$('alert-frequency').value=row?.frequency||'weekly';$('alert-score').value=String(row?.min_score||50);}
  async function load(c,user){reset();if(!user)return;client=c;userId=user.id;const stamp=revision;$('alert-settings').hidden=false;$('alert-save').disabled=true;$('alert-unsubscribe').disabled=false;$('alert-status').textContent='Chargement des préférences…';
    try{const r=await client.from('pme_alert_preferences').select('enabled,frequency,min_score,consent_version,consent_at').maybeSingle();if(r.error)throw r.error;if(stamp!==revision)return;populate(r.data);$('alert-save').disabled=false;$('alert-status').textContent=r.data?.enabled?'Consentement enregistré. Envois non activés.':'Aucun abonnement actif. Envois non activés.';}
    catch{if(stamp===revision)$('alert-status').textContent='Préférences indisponibles. Aucun abonnement ne peut être confirmé. Réessayez avec Actualiser mon espace.';}
  }
  async function save(unsubscribe){if(!userId||busy)return;busy=true;const stamp=++revision;$('alert-save').disabled=true;$('alert-unsubscribe').disabled=true;$('alert-preview').replaceChildren();
    try{const enabled=$('alert-enabled').checked;
      const r=unsubscribe?await client.rpc('pme_unsubscribe_alerts'):await client.rpc('pme_save_alert_preferences',{p_enabled:enabled,p_frequency:$('alert-frequency').value,p_min_score:Number($('alert-score').value),p_consent_version:enabled?'alerts-v1':null});
      if(r.error)throw r.error;if(stamp!==revision)return;
      populate(unsubscribe?null:r.data?.[0]);if(!unsubscribe&&!r.data?.[0])throw Error();
      $('alert-status').textContent=unsubscribe?'Désabonnement enregistré. Aucun email d’opportunités ne sera envoyé.':'Préférences enregistrées. Les envois restent désactivés.';
    }catch{if(stamp===revision)$('alert-status').textContent='Modification non confirmée. Réessayez ; le statut enregistré précédemment peut être inchangé.';}
    finally{if(stamp===revision){busy=false;$('alert-save').disabled=false;$('alert-unsubscribe').disabled=false;}}
  }
  function preview(pmes,opportunities,membershipIds){$('alert-preview').replaceChildren();if(!userId||!preferences?.enabled)return;
    const rows=window.AlertPlan.plan({preferences,pmes,opportunities,membershipIds,matching:window.Matching});
    const note=document.createElement('p');note.textContent=rows.length?'Simulation à partir des préférences enregistrées — aucun email envoyé.':'Aucune opportunité admissible à la simulation (PME autorisée, source, échéance et score requis).';$('alert-preview').append(note);
    for(const row of rows){const p=document.createElement('p'),a=document.createElement('a');a.textContent=row.title;a.href=row.sourceUrl;a.target='_blank';a.rel='noopener noreferrer';p.append(a,document.createTextNode(' — score '+row.score+'/100'));$('alert-preview').append(p);}
  }
  $('alert-form').addEventListener('submit',e=>{e.preventDefault();save(false);});
  $('alert-unsubscribe').addEventListener('click',()=>save(true));
  window.AlertPreferences={load,reset,preview};
})();
