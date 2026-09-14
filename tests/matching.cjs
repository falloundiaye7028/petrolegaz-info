const assert = require('node:assert/strict');
const { Matching: M } = require('../assets/matching.js');
const now = Date.parse('2026-09-14T12:00:00Z');
const pme = { secteur: 'Énergie', localisation: 'Dakar', competences: ['Électricité', 'HSE'] };
const ao = { id: 'a', demonstration: false, titre: 'Électricité et HSE', secteur: ['Energie'], localisation: 'DAKAR', sourceUrl: 'https://example.org/avis', cloture: '2026-09-14' };
assert.equal(M.match(pme, ao, now).score, 100);
assert.equal(M.match(pme, {...ao, cloture:'2026-09-13'}, now), null);
assert.equal(M.match(pme, {...ao, cloture:'2026-02-30'}, now), null);
for (const cloture of [null, '', 'invalide']) assert.equal(M.match(pme, {...ao, cloture}, now), null);
for (const demonstration of [true, undefined]) assert.equal(M.match(pme, {...ao, demonstration}, now), null);
for (const sourceUrl of ['', 'javascript:alert(1)', 'https://user:password@example.org']) assert.equal(M.match(pme, {...ao, sourceUrl}, now), null);
assert.equal(M.match({...pme, competences:[], secteur:'Autre'}, ao, now), null, 'Location alone is insufficient');
assert.equal(M.match({...pme, competences:['HSE', 'hse'], secteur:''}, ao, now).score, 30);
assert.equal(M.match({...pme, competences:['HSE'], secteur:''}, {...ao, titre:'HSEplus'}, now), null);
assert.equal(M.rank(pme, [ao, {...ao,id:'b',titre:'Autre',localisation:''}], now)[0].id, 'a');
assert.equal(M.rank(pme, [{...ao, demonstration:true}], now).length, 0);
console.log('Matching: score, accents, exclusions, dates, safe URLs and ranking passed.');

const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
class Element {
  constructor(){this.value='';this.children=[];this.listeners={};this.textContent='';}
  addEventListener(type, fn){this.listeners[type]=fn;}
  replaceChildren(...children){this.children=children;}
  append(...children){this.children.push(...children);}
  add(child){this.children.push(child);}
}
(async () => {
  const elements={}, storage={}; let fail=false;
  const get=id=>elements[id] ||= new Element();
  const context=vm.createContext({window:{Matching:M,confirm:()=>true},document:{getElementById:get,createElement:()=>new Element()},Option:function(label,value){this.label=label;this.value=value;},URL,AbortSignal,localStorage:{getItem:k=>storage[k],setItem:(k,v)=>storage[k]=v},fetch:async url=>({ok:!fail,json:async()=>url.includes('pmes')?{pmes:[{...pme,id:'p',nom:'PME'}]}:{appelsOffres:[{...ao,cloture:'2099-01-01'}]}})});
  vm.runInContext(read('assets/catalogue.js'),context);
  vm.runInContext(read('assets/rapprochement.js'),context);
  await new Promise(setImmediate);
  get('pme').value='p'; get('pme').listeners.change();
  assert.equal(get('matches').children.length,1);
  get('alerts').checked=true; get('alerts').listeners.change();
  assert.match(get('alert-status').textContent,/1 nouvelle/);
  get('read').listeners.click(); assert.match(get('alert-status').textContent,/0 nouvelle/);
  get('matches').children[0].children[0].listeners.click();
  assert.equal(get('tracking').children.length,1);
  let select=get('tracking').children[0].children[0].children[0]; select.value='Envoyée';select.listeners.change();
  assert.match(storage['petrolegaz:matching:v1'],/Envoyée/);
  get('pme').value='';get('pme').listeners.change();assert.equal(get('tracking').children.length,0);
  get('pme').value='p';get('pme').listeners.change();assert.equal(get('tracking').children.length,1);
  fail=true;await get('reload').listeners.click();assert.match(get('load-status').textContent,/impossible/);assert.match(storage['petrolegaz:matching:v1'],/Envoyée/);
  fail=false;await get('reload').listeners.click();assert.equal(get('tracking').children.length,1);
  get('clear').listeners.click();assert.equal(storage['petrolegaz:matching:v1'],'{}');
  console.log('UI simulation: alerts, read state, tracking, profile isolation, API failure/retry and clear passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
