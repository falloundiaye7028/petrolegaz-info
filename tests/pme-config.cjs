const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const env={},ctx=vm.createContext({process:{env}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../api/pme-config.js'),'utf8').replace('export default function handler','function handler'),ctx);
function run(method='GET'){const r={headers:{}};ctx.handler({method},{setHeader:(k,v)=>r.headers[k]=v,status:s=>{r.status=s;return {json:data=>r.data=data};}});return r;}
assert.equal(run().status,503);
env.VERCEL_ENV='preview';assert.equal(run().status,200);assert.equal(run().data.testPme.testOnly,true);assert.match(run().data.testPme.id,/^rec[A-Za-z0-9]{14}$/);env.VERCEL_ENV='production';assert.equal(run().status,503);
env.PME_AUTH_ENABLED='true';env.PME_SUPABASE_URL='https://ocyjfjddyijaaunzupxe.supabase.co';env.PME_SUPABASE_PUBLISHABLE_KEY='sb_publishable_test';
assert.equal(run().status,200);assert.equal(run().data.testPme,null);assert.equal(run().headers['Cache-Control'],'no-store');
env.SUPABASE_SERVICE_ROLE_KEY='never-expose';assert.doesNotMatch(JSON.stringify(run()),/never-expose/);
env.PME_SUPABASE_PUBLISHABLE_KEY='sb_secret_bad';assert.equal(run().status,503);
env.PME_SUPABASE_PUBLISHABLE_KEY='eyJlegacy';assert.equal(run().status,503);
assert.equal(run('POST').status,405);
env.PME_SUPABASE_PUBLISHABLE_KEY='sb_publishable_test';env.PME_SUPABASE_URL='http://attacker.example';assert.equal(run().status,503);
console.log('PASS: config fails closed, no secret keys, no caching, GET-only.');
