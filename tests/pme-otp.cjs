const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../assets/espace-pme.js'),'utf8');
const elements={};
function el(id){return elements[id]??=( {value:'',hidden:true,disabled:false,textContent:'',listeners:{},replaceChildren(){},focus(){},addEventListener(k,f){this.listeners[k]=f;},querySelector(){return el(id+'-button');}} );}
let verifyArgs,sendArgs,verifyError={code:'otp_expired'},sendError=null,loggedIn=false,cleanUrl='';
const query={then(resolve){resolve({data:[]});},select(){return this;},order(){return this;},limit(){return this;}};
const client={auth:{getUser:async()=>({data:{user:loggedIn?{email:'a@example.com'}:null}}),onAuthStateChange(){},signInWithOtp:async args=>{sendArgs=args;return {error:sendError};},verifyOtp:async args=>{verifyArgs=args;if(!verifyError)loggedIn=true;return {error:verifyError,data:{session:verifyError?null:{}}};}},from(){return query;}};
vm.runInNewContext(source,{document:{getElementById:el},window:{Catalogue:{escape:x=>x},supabase:{createClient:()=>client}},location:{search:'?error=access_denied&error_code=otp_expired',hash:'',pathname:'/espace-pme.html'},history:{replaceState:(a,b,url)=>cleanUrl=url},URLSearchParams,AbortSignal,Option:function(t,v){this.text=t;this.value=v;},setTimeout,fetch:async url=>({ok:true,json:async()=>url==='/api/pme-config'?{url:'https://example.supabase.co',publishableKey:'sb_publishable_test'}:url==='/api/pmes'?{pmes:[]}:{appelsOffres:[]}})});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function submit(id){await el(id).listeners.submit({preventDefault(){},target:el(id)});}
(async()=>{
 await tick();assert.match(el('notice').textContent,/lien est invalide/);assert.equal(cleanUrl,'/espace-pme.html');
 el('email').value='a@example.com';await submit('login-form');assert.equal(sendArgs.email,'a@example.com');assert.equal(el('otp-form').hidden,false);assert.equal(el('workspace').hidden,true);
 el('otp-code').value='abcdef';await submit('otp-form');assert.equal(verifyArgs,undefined);
 el('otp-code').value='123456';await submit('otp-form');assert.equal(verifyArgs.type,'email');assert.equal(verifyArgs.email,'a@example.com');assert.match(el('notice').textContent,/Code invalide/);assert.equal(el('otp-code').value,'');assert.equal(el('workspace').hidden,true);
 el('email').listeners.input();assert.equal(el('otp-form').hidden,true);verifyArgs=undefined;await submit('otp-form');assert.equal(verifyArgs,undefined);
 sendError={status:429};await submit('login-form');assert.match(el('notice').textContent,/Trop de tentatives/);assert.equal(el('otp-form').hidden,true);
 sendError=null;await submit('login-form');verifyError=null;el('otp-code').value='123456';await submit('otp-form');assert.equal(el('workspace').hidden,false);assert.equal(el('otp-form').hidden,true);assert.equal(el('otp-code').value,'');assert.match(el('notice').textContent,/Aucun rattachement validé/);
 console.log('PASS: OTP request, invalid input, expired code, rate limit, email change, successful session, callback error and no automatic membership.');
})().catch(e=>{console.error(e);process.exitCode=1;});
