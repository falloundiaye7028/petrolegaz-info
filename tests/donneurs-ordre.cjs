const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');
(async()=>{
  const record={id:'recV7eQ1adT3yieNi',fields:{firmo_name:'Groupe PETROSEN',firmo_city_name:'dakar',firmo_country_name:'senegal',firmo_website:'https://www.petrosen.sn/',Email:'private@example.com',firmo_yearly_revenue_range:'unverified'}};
  let fail=false,requestUrl;
  const context=vm.createContext({URL,URLSearchParams,AbortSignal,process:{env:{AIRTABLE_TOKEN:'secret-test'}},fetch:async url=>{requestUrl=url;return {ok:!fail,json:async()=>({records:[record,{...record,id:'unapproved'}]})}}});
  vm.runInContext(read('api/donneurs-ordre.js').replace('export default async function handler','async function handler'),context);
  async function request(method='GET'){const result={headers:{}};await context.handler({method},{setHeader(k,v){result.headers[k]=v},status(code){result.status=code;return this},json(data){result.data=data;return this}});return result;}
  let result=await request();assert.equal(result.status,200);assert.equal(result.data.count,1);
  assert.equal(result.data.groupes[0].site,'https://www.petrosen.sn/');
  assert.doesNotMatch(JSON.stringify(result.data),/private@example|unverified|secret-test/);
  assert.equal(new URL(requestUrl).searchParams.getAll('fields[]').length,4);
  record.fields.firmo_website='javascript:alert(1)';result=await request();assert.equal(result.data.groupes[0].site,'');
  assert.equal((await request('POST')).status,405);fail=true;assert.equal((await request()).status,502);
  context.process.env.AIRTABLE_TOKEN='';assert.equal((await request()).status,500);
  const elements={};const element=id=>elements[id]??={value:'',innerHTML:'',textContent:'',listeners:{},addEventListener(e,fn){this.listeners[e]=fn},setAttribute(){},querySelector(){return element('retry')}};
  let browserFail=false;
  const ui=vm.createContext({window:{},document:{getElementById:element},URL,AbortSignal,fetch:async()=>({ok:!browserFail,json:async()=>({groupes:[{nom:'PETROSEN <script>',ville:'Dakar',pays:'senegal',site:'https://www.petrosen.sn/'},{nom:'BP',pays:'united kingdom',site:'javascript:alert(1)'}]})})});
  vm.runInContext(read('assets/catalogue.js'),ui);vm.runInContext(read('assets/donneurs-ordre.js'),ui);await new Promise(setImmediate);
  assert.match(elements.groupes.innerHTML,/&lt;script&gt;/);assert.doesNotMatch(elements.groupes.innerHTML,/javascript:|wa.me/);
  elements.search.value='Sénégal';elements.search.listeners.input();assert.match(elements['results-count'].textContent,/1 groupe/);
  elements.search.value='absent';elements.search.listeners.input();assert.match(elements.groupes.innerHTML,/Aucun groupe/);
  elements.reset.listeners.click();assert.match(elements['results-count'].textContent,/2 groupe/);
  browserFail=true;vm.runInContext(read('assets/donneurs-ordre.js'),ui);await new Promise(setImmediate);assert.match(elements.groupes.innerHTML,/Réessayer/);
  browserFail=false;await elements.retry.listeners.click();assert.match(elements['results-count'].textContent,/2 groupe/);
  console.log('PASS: public allowlist, field privacy, URLs, method, upstream failures, missing token, escaping, accent search, reset and retry.');
})().catch(e=>{console.error(e);process.exitCode=1});
