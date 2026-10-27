const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {randomUUID,webcrypto}=require('node:crypto'),{IDBFactory}=require('fake-indexeddb');
const localCode=fs.readFileSync(path.join(__dirname,'../vocab-store.js'),'utf8');
const cloudCode=fs.readFileSync(path.join(__dirname,'../vocab-cloud.js'),'utf8');
const copy=value=>JSON.parse(JSON.stringify(value));
const user='e8f995ad-6e9f-4349-bc12-ae19a3bfb8cf';
const token='x.'+Buffer.from(JSON.stringify({sub:user})).toString('base64url')+'.x';
const fp=c=>JSON.stringify([c.pos||'',c.meaning||'',[...(c.phrases||[])].sort(),[...(c.examples||[])].sort(),c.raw||'']);
class MemoryStorage{
 constructor(){this.data=new Map();}
 get length(){return this.data.size;}
 key(i){return [...this.data.keys()][i]??null;}
 getItem(k){return this.data.get(k)??null;}
 setItem(k,v){this.data.set(k,String(v));}
 removeItem(k){this.data.delete(k);}
}
class Server{
 constructor(){this.revision=0;this.backup={format:'ielts-vocabulary',version:1,words:[]};this.ids=new Map();this.snapshots=0;this.heads=0;this.offline=false;this.conflicts=0;}
 response(data,status=200){return new Response(JSON.stringify(status===200?{data}:{error:data.error,code:data.code}),{status,headers:{'content-type':'application/json'}});}
 upsert(incoming){const old=this.backup.words.find(word=>word.key===incoming.key),next=copy(incoming);next.id=old?.id||randomUUID();next.contents=next.contents.map(content=>{const previous=old?.contents.find(item=>fp(item)===fp(content));return {...content,id:previous?.id||randomUUID(),wordId:next.id};});this.backup.words=this.backup.words.filter(word=>word.key!==next.key);this.backup.words.push(next);}
 async fetch(url,init){if(this.offline)throw new TypeError('Offline');assert.equal(init.headers.apikey,'public');assert.equal(init.headers.Authorization,'Bearer '+token);const input=JSON.parse(init.body);
  if(input.action==='snapshot'){this.snapshots++;return this.response({revision:this.revision,backup:copy(this.backup)});}
  if(input.action==='head'){this.heads++;return this.response({revision:this.revision});}
  if(input.action==='mutate'||input.action==='replace'){
   if(this.ids.has(input.operationId))return this.response({revision:this.ids.get(input.operationId)});
   if(input.baseRevision!==this.revision){this.conflicts++;return this.response({error:'Revision conflict',code:'revision_conflict'},409);}
   if(input.action==='replace'){this.backup={format:'ielts-vocabulary',version:1,words:[]};for(const word of input.backup.words)this.upsert(word);}
   else for(const op of input.operations){
    if(op.type==='upsert')this.upsert(op.word);
    else if(op.type==='rename'){const old=this.backup.words.find(word=>word.key===op.oldKey);this.backup.words=this.backup.words.filter(word=>word.key!==op.oldKey);this.upsert({...op.word,id:old?.id||op.word.id});}
    else if(op.type==='delete')this.backup.words=this.backup.words.filter(word=>word.key!==op.key);
    else if(op.type==='forget'){const word=this.backup.words.find(word=>word.key===op.key);if(word){word.forgotten=op.forgotten;if(op.forgotten)word.forgetCount++;}}
    else if(op.type==='uncollect'){for(const word of this.backup.words)for(const content of word.contents)for(const source of content.sources)if(source.id===op.sourceId)source.collected=false;}
    else throw new Error('Unexpected operation '+op.type);
   }
   this.revision++;this.ids.set(input.operationId,this.revision);return this.response({revision:this.revision});
  }
  throw new Error('Unexpected action '+input.action);
 }
}
function open(server,indexedDB=new IDBFactory(),storage=new MemoryStorage(),wrapLocal=null){const context=vm.createContext({indexedDB,localStorage:storage,crypto:webcrypto,atob,URL,Response,console,setInterval:()=>0,clearInterval(){},addEventListener(){}});vm.runInContext(localCode,context);vm.runInContext(cloudCode,context);const local=context.IeltsVocab,cloud=context.IeltsVocabCloud.create({localStore:wrapLocal?wrapLocal(local):local,endpoint:'https://example.supabase.co/functions/v1/vocabulary',apiKey:'public',getAccessToken:async()=>token,fetch:server.fetch.bind(server),storage,crypto:webcrypto});return {local,cloud,storage};}
const entry=(word,meaning,sourceId)=>({word,pos:'n.',meaning,sourceId,sourceLabel:'测试',quote:word});
const word=(rows,key)=>rows.find(item=>item.key===key);
(async()=>{
 const server=new Server(),a=open(server),b=open(server);await Promise.all([a.local.ready,b.local.ready]);
 await a.local.importEntries([entry('Alpha','第一个','source:alpha'),entry('Beta','第二个','source:beta')]);
 const preview=await a.cloud.inspect(user);assert.deepEqual([preview.localWords,preview.cloudWords,preview.wasActive],[2,0,false]);
 await a.cloud.activate({userId:user,initial:'merge-local'});assert.equal(server.backup.words.length,2);assert.equal(a.cloud.status.pending,0);
 await b.cloud.activate({userId:user,initial:'use-cloud'});assert.equal((await b.cloud.list()).length,2);
 const noChange=server.snapshots;await b.cloud.sync();assert.equal(server.snapshots,noChange,'unchanged poll should only ask for head');
 let alpha=word(await a.cloud.list(),'alpha');await a.cloud.setForgotten(alpha.id,true);await a.cloud.sync();await b.cloud.sync();assert.equal(word(await b.cloud.list(),'alpha').forgotten,true);assert.equal(word(await b.cloud.list(),'alpha').forgetCount,1);
 alpha=word(await b.cloud.list(),'alpha');await b.cloud.setForgotten(alpha.id,false);await b.cloud.sync();await a.cloud.sync();assert.equal(word(await a.cloud.list(),'alpha').forgotten,false);assert.equal(word(await a.cloud.list(),'alpha').forgetCount,1);
 await a.cloud.uncollect('source:alpha');await a.cloud.sync();await b.cloud.sync();assert.equal(word(await b.cloud.list(),'alpha').contents[0].sources[0].collected,false);
 const beta=word(await a.cloud.list(),'beta');await a.cloud.deleteWord(beta.id);await a.cloud.sync();await b.cloud.sync();assert.equal(word(await b.cloud.list(),'beta'),undefined,'hard delete must propagate');
 server.offline=true;await b.cloud.importEntries([entry('Gamma','离线新增','source:gamma')]);await assert.rejects(()=>b.cloud.sync(),/网络暂不可用/);assert.equal(word(await b.cloud.list(),'gamma').word,'Gamma');assert.equal(b.cloud.status.pending,1);
 await assert.rejects(()=>b.cloud.activate({userId:user,initial:'use-cloud'}),/未完成的上传/);assert.equal(b.cloud.status.pending,1,'a failed merge cannot silently switch to cloud overwrite');
 server.offline=false;await b.cloud.sync();await a.cloud.sync();assert.equal(word(await a.cloud.list(),'gamma').word,'Gamma');assert.equal(b.cloud.status.pending,0);
 await a.cloud.importEntries([entry('Alpha','新释义甲','source:third')]);await b.cloud.importEntries([entry('Alpha','新释义乙','source:fourth')]);await a.cloud.sync();await b.cloud.sync();assert(server.conflicts>=1,'concurrent devices must rebase via CAS');await a.cloud.sync();assert.equal(word(await a.cloud.list(),'alpha').contents.length,3,'both concurrent meanings must survive');
 alpha=word(await a.cloud.list(),'alpha');const first=alpha.contents.find(content=>content.meaning==='第一个');
 await a.cloud.updateDetails(alpha.id,{aliases:['alpha-alt'],contents:[{id:first.id,meaning:'更新后的释义'}]});await a.cloud.sync();await b.cloud.sync();
 const edited=word(await b.cloud.list(),'alpha');assert(edited.aliases.includes('alpha-alt'));assert.equal(edited.contents.length,3);assert(edited.contents.some(content=>content.meaning==='更新后的释义'));
 const gamma=word(await a.cloud.list(),'gamma');await a.cloud.updateWord(gamma.id,{word:'Delta'});await a.cloud.sync();await b.cloud.sync();assert.equal(word(await b.cloud.list(),'gamma'),undefined);assert.equal(word(await b.cloud.list(),'delta').word,'Delta');
 const status=[];const off=a.cloud.subscribeStatus(value=>status.push(value));assert(status.at(-1).active);off();a.cloud.deactivate();assert.equal(a.cloud.status.active,false);
 const resuming=a.cloud.activate({userId:user,initial:'resume'});assert.equal(a.cloud.status.active,true,'linked browser must journal edits before network completes');await resuming;assert.equal((await a.cloud.list()).length,2);
 const c=open(server);await c.local.ready;const stranger='22222222-2222-4222-8222-222222222222',host='example.supabase.co';c.storage.setItem(`ielts-vocab-cloud-v1:${host}:${user}:op:held`,JSON.stringify({id:'held',owner:user,kind:'forget',at:1,key:'alpha',forgotten:true}));
 await assert.rejects(()=>c.cloud.activate({userId:stranger,initial:'use-cloud'}),/另一个账号/);c.storage.removeItem(`ielts-vocab-cloud-v1:${host}:${user}:op:held`);
 c.storage.setItem(`ielts-vocab-cloud-v1:${host}:cache-owner`,user);await assert.rejects(()=>c.cloud.activate({userId:stranger,initial:'merge-local'}),/属于另一个/);
 const firstServer=new Server(),sharedDb=new IDBFactory(),sharedStorage=new MemoryStorage(),firstDevice=open(firstServer,sharedDb,sharedStorage);await firstDevice.local.ready;await firstDevice.local.importEntries([entry('Only local','待迁移','source:only')]);
 firstServer.offline=true;await assert.rejects(()=>firstDevice.cloud.activate({userId:user,initial:'merge-local'}),/网络暂不可用/);assert.equal(firstDevice.cloud.status.pending,1);firstDevice.cloud.deactivate();
 const reloaded=open(firstServer,sharedDb,sharedStorage);await reloaded.local.ready;await assert.rejects(()=>reloaded.cloud.activate({userId:user,initial:'use-cloud'}),/未完成的上传/);
 await assert.rejects(()=>reloaded.cloud.activate({userId:user,initial:'merge-local'}),/网络暂不可用/);assert.equal(reloaded.cloud.status.pending,1,'reload must not duplicate migration batches');
 firstServer.offline=false;await reloaded.cloud.activate({userId:user,initial:'merge-local'});assert.equal(firstServer.backup.words.length,1);assert.equal(reloaded.cloud.status.pending,0);
 const raceServer=new Server(),raceDevice=open(raceServer);await raceDevice.local.ready;
 await raceDevice.local.importEntries([entry('Baseline','先前的词','source:baseline')]);
 let releaseBaseline;const baselineGate=new Promise(resolve=>{releaseBaseline=resolve;});
 const originalExport=raceDevice.local.exportData;
 raceDevice.local.exportData=async()=>{await baselineGate;return originalExport();};
 const firstActivation=raceDevice.cloud.activate({userId:user,initial:'merge-local'});
 assert.equal(raceDevice.cloud.status.active,true,'first merge must activate journaling before reading the local baseline');
 const concurrentCollect=raceDevice.cloud.collect(entry('During merge','同时收藏','source:during'));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal((await raceDevice.local.list()).length,1,'writes must wait until the initial baseline has been queued');
 releaseBaseline();await Promise.all([firstActivation,concurrentCollect]);await raceDevice.cloud.sync();
 assert.deepEqual(raceServer.backup.words.map(item=>item.key).sort(),['baseline','during merge'],'a word collected during first merge must survive cloud snapshot replacement');
 const applyingServer=new Server();let holdApply=false,releaseApply,signalApply;
 const applyGate=new Promise(resolve=>{releaseApply=resolve;});const applyStarted=new Promise(resolve=>{signalApply=resolve;});
 const applyingA=open(applyingServer,new IDBFactory(),new MemoryStorage(),local=>({...local,replaceSnapshot:async backup=>{if(holdApply){signalApply();await applyGate;}return local.replaceSnapshot(backup);}}));
 const applyingB=open(applyingServer);
 await Promise.all([applyingA.local.ready,applyingB.local.ready]);
 await applyingA.local.importEntries([entry('Old','已有','source:old')]);
 await applyingA.cloud.activate({userId:user,initial:'merge-local'});
 applyingA.cloud.deactivate();
 await applyingB.cloud.activate({userId:user,initial:'use-cloud'});
 await applyingB.cloud.collect(entry('Remote','另一台新增','source:remote'));await applyingB.cloud.sync();
 holdApply=true;
 const catchingUp=applyingA.cloud.activate({userId:user,initial:'resume'});await applyStarted;
 const whileApplying=applyingA.cloud.collect(entry('During apply','快照时新增','source:applying'));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(word(await applyingA.local.list(),'during apply'),undefined,'local writes must wait for an in-flight cloud replacement');
 releaseApply();await Promise.all([catchingUp,whileApplying]);await applyingA.cloud.sync();
 assert(word(applyingServer.backup.words,'during apply'),'a word entered during snapshot replacement must be uploaded');
 console.log('PASS: cloud migration, same-account devices, lightweight head polling, forgotten clear, uncollect, hard delete, offline queue and restart, CAS rebase, content editing, rename, account isolation and write barriers.');
})().catch(error=>{console.error(error);process.exitCode=1;});
