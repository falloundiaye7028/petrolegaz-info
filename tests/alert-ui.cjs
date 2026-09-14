const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const els={};function el(id){return els[id]??={value:'',checked:false,hidden:true,disabled:false,textContent:'',events:{},replaceChildren(){},append(){},addEventListener(k,f){this.events[k]=f;}};}
let row=null,error=null,lastRpc=null,deferred=null;
const client={from(){return {select(){return this;},maybeSingle(){return deferred||Promise.resolve({data:row,error});}};},async rpc(name,args){lastRpc={name,args};if(error)return {error};row=name==='pme_unsubscribe_alerts'?null:{enabled:args.p_enabled,frequency:args.p_frequency,min_score:args.p_min_score,consent_version:args.p_consent_version,consent_at:'2026-01-01'};return {data:row?[row]:null};}};
const window={AlertPlan:{plan:()=>[]},Matching:{}};
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../assets/alert-preferences.js'),'utf8'),{window,document:{getElementById:el,createElement:()=>el('created'),createTextNode:x=>x}});
const tick=()=>new Promise(r=>setImmediate(r));
(async()=>{
 await window.AlertPreferences.load(client,{id:'a'});assert.equal(el('alert-enabled').checked,false);assert.equal(el('alert-save').disabled,false);
 el('alert-enabled').checked=true;el('alert-frequency').value='daily';el('alert-score').value='70';el('alert-form').events.submit({preventDefault(){}});await tick();
 assert.equal(lastRpc.args.p_consent_version,'alerts-v1');assert.equal(lastRpc.args.p_min_score,70);assert.match(el('alert-status').textContent,/envois restent désactivés/);
 el('alert-unsubscribe').events.click();await tick();assert.equal(lastRpc.name,'pme_unsubscribe_alerts');assert.equal(el('alert-enabled').checked,false);
 error={message:'offline'};await window.AlertPreferences.load(client,{id:'a'});assert.equal(el('alert-save').disabled,true);assert.match(el('alert-status').textContent,/indisponibles/);
 el('alert-unsubscribe').events.click();await tick();assert.match(el('alert-status').textContent,/non confirmée/);
 error=null;let resolve;deferred=new Promise(r=>resolve=r);const pending=window.AlertPreferences.load(client,{id:'a'});window.AlertPreferences.reset();resolve({data:{enabled:true},error:null});await pending;assert.equal(el('alert-settings').hidden,true);assert.equal(el('alert-enabled').checked,false);
 console.log('PASS: alert UI default opt-out, explicit consent, unsubscribe, offline errors and stale response after logout.');
})().catch(e=>{console.error(e);process.exitCode=1;});
