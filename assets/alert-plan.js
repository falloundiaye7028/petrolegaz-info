/* Pure dry-run planner. It has no network or email sending capability. */
(function(root){
  function plan({preferences,pmes,opportunities,membershipIds,seenIds=[],now=Date.now(),matching}){
    if(!preferences?.enabled||preferences.consent_version!=='alerts-v1'||!preferences.consent_at||
      !['daily','weekly'].includes(preferences.frequency)||!Number.isInteger(preferences.min_score)||preferences.min_score<1||preferences.min_score>100)return [];
    const allowed=new Set(membershipIds),seen=new Set(seenIds),found=new Map();
    for(const pme of pmes){
      if(!allowed.has(pme.id)||pme.testOnly||/^recTEST/.test(pme.id))continue;
      for(const match of matching.rank(pme,opportunities,now)){
        if(match.score<preferences.min_score||seen.has(match.id)||/^recTEST/.test(match.id))continue;
        const existing=found.get(match.id);
        if(existing){existing.pmeIds=[...new Set([...existing.pmeIds,pme.id])];existing.score=Math.max(existing.score,match.score);}
        else found.set(match.id,{id:match.id,title:match.opportunity.titre,sourceUrl:matching.source(match.opportunity.sourceUrl),deadline:match.opportunity.cloture,score:match.score,pmeIds:[pme.id]});
      }
    }
    return [...found.values()].sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)).slice(0,20);
  }
  root.AlertPlan={plan};
})(typeof window==='undefined'?module.exports:window);
