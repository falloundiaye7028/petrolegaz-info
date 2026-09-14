const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>readFileSync(path.join(root,file),'utf8');
(async()=>{
  const ids=['recW9b7mflxZPBKV6','rec9WfevTRed1XWJE','recqb1YnYtK6sjmUB','new-notice','explicit-demo'];
  const records=ids.map(id=>({id,fields:{Titre:'Transport de matériel vers le site GTA',"Date clôture":'2099-01-01',"Démonstration":id==='explicit-demo'}}));
  let payload;
  const api=vm.createContext({URLSearchParams,console,process:{env:{AIRTABLE_TOKEN:'test'}},fetch:async url=>({ok:true,json:async()=>({records:url.includes(encodeURIComponent("Appels d'offres"))?records:[]})})});
  vm.runInContext(read('api/appels-offres.js').replace('export default async function handler','async function handler'),api);
  await api.handler({method:'GET'},{setHeader(){},status(){return this},json(value){payload=value}});
  assert.deepEqual(Array.from(payload.appelsOffres,ao=>ao.demonstration),[true,true,true,false,true]);
  const elements={};
  const element=id=>elements[id]??=( {value:'',hidden:false,textContent:'',innerHTML:'',listeners:{},addEventListener(event,fn){this.listeners[event]=fn},setAttribute(){},replaceChildren(){},focus(){}} );
  const context=vm.createContext({window:{},document:{getElementById:element},URL,Option:function(){},AbortSignal,console,fetch:async()=>({ok:true,json:async()=>payload})});
  vm.runInContext(read('assets/catalogue.js'),context);
  vm.runInContext(read('assets/opportunites.js'),context);
  await new Promise(resolve=>setImmediate(resolve));
  const cards=elements['ao-list'].innerHTML.match(/<article[\s\S]*?<\/article>/g);
  assert.equal(cards.length,5);
  for(const index of [0,1,2,4]){
    assert.match(cards[index],/Démonstration/);
    assert.doesNotMatch(cards[index],/wa.me|Clôture :|source-link/);
  }
  assert.match(cards[3],/wa.me/);
  assert.match(cards[3],/Lien de l’avis non renseigné/);
  assert.doesNotMatch(cards[3],/Exemple de démonstration/);
  assert.match(elements.counter.textContent,/1 avis hors démonstration · 4 exemple/);
  elements.urgency.value='open';elements.urgency.listeners.change();
  assert.equal((elements['ao-list'].innerHTML.match(/<article/g)||[]).length,1);
  elements.urgency.value='closed';elements.urgency.listeners.change();
  assert.match(elements['ao-list'].innerHTML,/Aucune opportunité/);
  console.log('PASS: API flags, exact IDs, explicit checkbox, demo rendering, contact suppression, counters and date filters.');
})().catch(error=>{console.error(error);process.exitCode=1});
