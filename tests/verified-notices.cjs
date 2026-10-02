const {readFileSync}=require('node:fs');
const vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=file=>readFileSync(path.join(root,file),'utf8');
const verified=JSON.parse(read('data/opportunites-verifiees.js').split('export default ')[1].replace(/;\s*$/,''));
const clone=value=>JSON.parse(JSON.stringify(value));
const dataSource=read('api/appels-offres.js').replace(/^import[^\n]+\n/,'').replace('export default async function handler','async function handler');
async function api(records=[],{token='test',fail=false,method='GET'}={}){
  const context=vm.createContext({verifiedNotices:clone(verified),URL,URLSearchParams,console:{error(){}},process:{env:{AIRTABLE_TOKEN:token}},fetch:async url=>({ok:!fail,status:502,json:async()=>({records:url.includes(encodeURIComponent("Appels d'offres"))?records:[{id:'buyer',fields:{'Nom organisation':'SENELEC'}}]})})});
  vm.runInContext(dataSource,context);
  const result={headers:{}};
  await context.handler({method},{setHeader(k,v){result.headers[k]=v},status(status){result.status=status;return this},json(body){result.body=clone(body)}});
  return result;
}
async function ui(notices,now='2026-10-02T20:00:00Z'){
  const elements={};const element=id=>elements[id]??={value:'',hidden:false,textContent:'',innerHTML:'',listeners:{},addEventListener(event,fn){this.listeners[event]=fn},setAttribute(){},replaceChildren(){},focus(){},querySelector(){return element('retry')}};
  class FixedDate extends Date{constructor(...args){super(...(args.length?args:[now]))}static now(){return Date.parse(now)}}
  const context=vm.createContext({Date:FixedDate,window:{},document:{getElementById:element},URL,Option:function(){},AbortSignal,console,fetch:async()=>({ok:true,json:async()=>({appelsOffres:clone(notices)})})});
  vm.runInContext(read('assets/catalogue.js'),context);vm.runInContext(read('assets/opportunites.js'),context);await new Promise(setImmediate);
  const change=(id,value,event='change')=>{elements[id].value=value;elements[id].listeners[event]()};
  return {elements,change,cards:()=>elements['ao-list'].innerHTML.match(/<article[\s\S]*?<\/article>/g)||[]};
}
(async()=>{
  assert.equal(verified.length,5);assert.equal(new Set(verified.map(o=>o.id)).size,5);
  assert.deepEqual(verified.map(o=>o.cloture),['2026-10-21T09:30:00+00:00','2026-10-21T09:30:00+00:00','2026-10-28T09:30:00+00:00','2026-11-04T09:30:00+00:00','2026-10-07T10:00:00+00:00']);
  for(const o of verified){assert.match(o.id,/^rec[A-Za-z0-9]{14}$/);assert.equal(o.demonstration,false);assert.equal(o.verifieLe,'2026-10-02');assert.match(o.sourceUrl,/^https:\/\/(www\.senelec\.sn|rgs\.sn)\//);assert.ok(o.eligibilite&&o.soumission&&o.documents);}
  assert.ok(verified.filter(o=>o.editorialKey.startsWith('senelec')).every(o=>o.publication===null));
  assert.match(verified.find(o=>o.id==='recPGSN2026AO0038').avertissement,/déjà passées/);
  assert.match(verified.find(o=>o.id==='recPGSN2026AM0035').soumission,/ET version électronique/);
  assert.match(verified.find(o=>o.id==='recPGSN2026AO0041').avertissement,/3 milliards/);
  assert.match(verified.find(o=>o.editorialKey.startsWith('rgs')).avertissement,/modalités de dépôt à confirmer/);
  assert.doesNotMatch(JSON.stringify(verified),/senelec-40|senelec-31|senelec-33|T-PETROSEN/);
  const records=['recW9b7mflxZPBKV6','rec9WfevTRed1XWJE','recqb1YnYtK6sjmUB'].map(id=>({id,fields:{Titre:'Exemple','Date clôture':'2099-01-01'}}));
  let result=await api(records);assert.equal(result.status,200);assert.equal(result.body.count,8);assert.equal(result.body.appelsOffres.filter(o=>o.demonstration).length,3);
  assert.equal(result.body.appelsOffres[0].id,'recPGRS2026PQ0001');
  const duplicate={id:'existing-batteries',fields:{Titre:'Avis déjà existant','URL source':verified[0].sourceUrl+'#page=1','Date clôture':'2026-10-20',"Donneur d'ordre":['buyer']}};
  const dedup=await api([...records,duplicate]);assert.equal(dedup.body.count,8);assert.equal(dedup.body.appelsOffres.filter(o=>o.sourceUrl===verified[0].sourceUrl).length,1);assert.ok(dedup.body.appelsOffres.find(o=>o.id==='existing-batteries').eligibilite);
  const multiple=await api([...records,duplicate,{...duplicate,id:'second-copy'}]);assert.equal(multiple.body.count,8);assert.equal(multiple.body.appelsOffres.filter(o=>o.sourceUrl===verified[0].sourceUrl).length,1);
  const byTitle=await api([{id:'by-title',fields:{Titre:verified[0].titre,"Donneur d'ordre":['buyer']}}]);assert.equal(byTitle.body.count,5);assert.ok(byTitle.body.appelsOffres.find(o=>o.id==='by-title'));
  const byRef=await api([{id:'by-ref',fields:{Titre:'Other title','Référence':verified[0].reference}}]);assert.equal(byRef.body.count,5);
  const unrelated=await api([{id:'unrelated',fields:{Titre:'Other notice'}}]);assert.equal(unrelated.body.count,6);
  assert.equal((await api([],{token:''})).status,500);assert.equal((await api([],{fail:true})).status,502);assert.equal((await api([],{method:'POST'})).status,405);
  let page=await ui(result.body.appelsOffres);assert.equal(page.cards().length,8);assert.match(page.elements.counter.textContent,/5 avis hors démonstration · 3 exemple/);
  assert.match(page.elements['ao-list'].innerHTML,/09:30 \(Dakar, GMT\)/);assert.match(page.elements['ao-list'].innerHTML,/10:00 \(Dakar, GMT\)/);
  for(const o of verified){const card=page.cards().find(c=>c.includes(`data-notice-id="${o.id}"`));assert.ok(card);assert.ok(card.includes(o.sourceUrl));assert.match(card,/Conditions et modalités/);}
  for(const card of page.cards().filter(c=>c.includes('Démonstration'))){assert.doesNotMatch(card,/wa.me|Clôture :|source-link/);}
  page.change('urgency','urgent');assert.equal(page.cards().length,1);assert.match(page.cards()[0],/Préqualification/);
  page.change('urgency','open');assert.equal(page.cards().length,5);
  page.change('sector','Solaire');assert.equal(page.cards().length,1);assert.match(page.cards()[0],/déjà passées/);
  page.elements.reset.listeners.click();assert.equal(page.cards().length,8);
  page.change('search','35/2026','input');assert.equal(page.cards().length,1);
  page.elements.reset.listeners.click();page.change('buyer','Réseau Gazier du Sénégal (RGS SA)');assert.equal(page.cards().length,1);
  page=await ui(result.body.appelsOffres,'2026-10-21T09:29:59Z');page.change('urgency','open');assert.equal(page.cards().length,4);
  page=await ui(result.body.appelsOffres,'2026-10-21T09:30:00Z');page.change('urgency','open');assert.equal(page.cards().length,2);page.change('urgency','closed');assert.equal(page.cards().length,3);assert.ok(page.cards().every(c=>!c.includes('wa.me')));
  page=await ui([{id:'day-only',demonstration:false,titre:'Date only',cloture:'2026-10-21'},{id:'unknown',demonstration:false,titre:'Unknown',cloture:'2026-10-21Tbad'}],'2026-10-21T23:59:59Z');page.change('urgency','open');assert.equal(page.cards().length,1);page.change('urgency','unknown');assert.equal(page.cards().length,1);
  page=await ui([{...verified[0],titre:'<script>bad</script>',avertissement:'<img src=x onerror=x>',eligibilite:'<script>x</script>',sourceUrl:'javascript:alert(1)',listeSourceUrl:'javascript:alert(2)'}]);assert.doesNotMatch(page.elements['ao-list'].innerHTML,/<script>|<img|javascript:/);assert.match(page.elements['ao-list'].innerHTML,/&lt;script&gt;/);
  console.log('PASS: 5 verified notices, exact source metadata, deduplication, preservation, API failures, filters, precise deadlines, detail links, visible warnings, demo exclusion and HTML escaping.');
})().catch(error=>{console.error(error);process.exitCode=1});
