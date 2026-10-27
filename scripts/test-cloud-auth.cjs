const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../cloud-auth.js'),'utf8');
function setup(configured=true,initial={},localWords=3,blockedStorage=false,activateFails=false){
  const storage=new Map(Object.entries(initial)),calls=[],activations=[];
  const localStore={ready:Promise.resolve()};
  let statusListener=()=>{};
  const adapter={
    status:{active:false,userId:null},
    inspect:async()=>({localWords,cloudWords:0,revision:0,pending:0}),
    activate:async options=>{activations.push(options);adapter.status={active:true,userId:options.userId};statusListener({active:true,syncing:false,pending:activateFails?1:0,online:!activateFails,lastSync:null,error:activateFails?'offline':null,userId:options.userId});if(activateFails)throw Error('offline');},
    deactivate:()=>{adapter.status={active:false,userId:null};statusListener({active:false,syncing:false,pending:0,online:true,lastSync:null,error:null,userId:null});},
    sync:async()=>{},subscribeStatus:listener=>{statusListener=listener;},
  };
  const context={
    console,Date,Math,JSON,Object,Promise,URL,Response,setTimeout,clearTimeout,
    location:{protocol:'https:'},navigator:{},
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)},
    addEventListener(){},IeltsVocab:localStore,
    IeltsCloudConfig:configured?{projectUrl:'https://test.supabase.co',publishableKey:'sb_publishable_test_key'}:{projectUrl:'',publishableKey:''},
    IeltsVocabCloud:{create:()=>adapter},
    fetch:async(url,options)=>{
      calls.push({url,body:JSON.parse(options.body)});
      if(url.includes('grant_type=password'))return new Response(JSON.stringify({access_token:'access-A',refresh_token:'refresh-A',expires_in:3600,user:{id:'user-A',email:'person@example.com'}}),{status:200});
      if(url.includes('grant_type=refresh_token'))return new Response(JSON.stringify({access_token:'access-B',refresh_token:'refresh-B',expires_in:3600,user:{id:'user-A',email:'person@example.com'}}),{status:200});
      if(url.endsWith('/signup'))return new Response(JSON.stringify({user:{id:'user-A',email:'person@example.com'}}),{status:200});
      if(url.endsWith('/logout'))return new Response(null,{status:204});
      throw Error('unexpected auth request: '+url);
    },
  };
  context.window=blockedStorage?{...context}:context;
  if(blockedStorage)Object.defineProperty(context.window,'localStorage',{get(){throw Error('storage blocked');}});
  vm.runInNewContext(source,context);
  return {auth:context.window.IeltsCloudAuth,context:context.window,storage,calls,activations,adapter,localStore};
}

(async()=>{
  const offline=setup(false);assert.equal(offline.auth.configured,false);assert.equal(offline.context.IeltsVocab,offline.localStore);
  const blocked=setup(true,{},3,true);assert.equal(blocked.auth.configured,false);assert.equal(blocked.context.IeltsVocab,blocked.localStore);
  const app=setup();assert.equal(app.auth.configured,true);assert.equal(app.context.IeltsVocab,app.adapter);assert.equal(app.auth.state.phase,'signed-out');
  await app.auth.signIn(' person@example.com ','example-password');assert.equal(app.auth.state.phase,'choice');assert.equal(app.auth.state.localWords,3);
  assert.equal(app.calls[0].body.email,'person@example.com');assert.equal(app.storage.has('ielts-cloud-session-v1'),true);
  await app.auth.choose('merge-local');assert.equal(app.auth.state.phase,'active');assert.equal(app.activations[0].initial,'merge-local');
  assert.equal(await app.auth.getAccessToken(),'access-A');
  const saved=JSON.parse(app.storage.get('ielts-cloud-session-v1'));saved.expiresAt=Date.now()-1000;
  const reloaded=setup(true,{'ielts-cloud-session-v1':JSON.stringify(saved),'ielts-cloud-linked-v1:test.supabase.co:user-A':'yes'});
  assert.equal(reloaded.activations[0].initial,'resume','linked session must activate before any network await');
  await reloaded.auth.ready;assert.equal(reloaded.auth.state.phase,'active');assert.equal(reloaded.activations[0].initial,'resume');
  assert.equal(await reloaded.auth.getAccessToken(),'access-B');assert(reloaded.calls.some(call=>call.url.includes('grant_type=refresh_token')));
  await app.auth.signOut();assert.equal(app.auth.state.phase,'signed-out');assert.equal(app.storage.has('ielts-cloud-session-v1'),false);
  await app.auth.signUp('person@example.com','example-password');assert.match(app.auth.state.notice,/验证邮件/);
  const empty=setup(true,{},0);await empty.auth.signIn('person@example.com','example-password');assert.equal(empty.auth.state.phase,'choice');assert.equal(empty.activations.length,0);
  const firstOffline=setup(true,{},3,false,true);await firstOffline.auth.signIn('person@example.com','example-password');await firstOffline.auth.choose('merge-local');assert.equal(firstOffline.auth.state.phase,'active');assert.equal(firstOffline.storage.get('ielts-cloud-linked-v1:test.supabase.co:user-A'),'yes');
  console.log('PASS: cloud auth stays local when unconfigured, uses public project key, presents first-sync choice, stores session and signs out.');
})().catch(error=>{console.error(error);process.exitCode=1;});
