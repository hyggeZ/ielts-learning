(function(root){
  'use strict';
  // The local database remains the offline reading cache. Cloud writes are a
  // journal of user actions, not a comparison of two old whole-library copies.
  const POLL_MS=30000,CHUNK=50,PREFIX='ielts-vocab-cloud-v1:';
  const clone=value=>JSON.parse(JSON.stringify(value));
  const fields=content=>({pos:content.pos||'',meaning:content.meaning||'',phrases:content.phrases||[],examples:content.examples||[],raw:content.raw||''});
  const fingerprint=content=>JSON.stringify([content.pos||'',content.meaning||'',[...(content.phrases||[])].sort(),[...(content.examples||[])].sort(),content.raw||'']);
  const sourceKey=source=>source.id;
  function fail(message){throw new Error(message);}
  function uuid(crypto){if(crypto?.randomUUID)return crypto.randomUUID();if(!crypto?.getRandomValues)fail('当前浏览器无法生成同步编号');const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const hex=[...bytes].map(n=>n.toString(16).padStart(2,'0')).join('');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;}
  function validBackup(backup){return backup?.format==='ielts-vocabulary'&&backup.version===1&&Array.isArray(backup.words);}
  function unionAliases(a,b,normalize){const seen=new Set();return [...a,...b].filter(alias=>{const key=normalize(alias);if(seen.has(key))return false;seen.add(key);return true;});}
  function mergeSources(oldSources,newSources,mode){const map=new Map(oldSources.map(source=>[sourceKey(source),clone(source)]));for(const source of newSources){const old=map.get(sourceKey(source));if(!old){map.set(sourceKey(source),clone(source));continue;}if(mode==='import')old.collected=old.collected||source.collected;if(!old.label)old.label=source.label;if(!old.quote)old.quote=source.quote;}return [...map.values()];}
  function mergeWord(old,incoming,normalize,mode){if(!old)return clone(incoming);const next=clone(old);next.aliases=unionAliases(next.aliases||[],incoming.aliases||[],normalize).filter(alias=>normalize(alias)!==next.key);if(mode==='restore'){next.forgotten=next.forgotten||incoming.forgotten;next.forgetCount=Math.max(next.forgetCount||0,incoming.forgetCount||0);}
    for(const content of incoming.contents||[]){let existing=next.contents.find(item=>fingerprint(item)===fingerprint(content));if(!existing){next.contents.push(clone(content));continue;}existing.sources=mergeSources(existing.sources||[],content.sources||[],mode);}
    return next;
  }
  function fnv(value){let hash=2166136261;for(let i=0;i<value.length;i++)hash=Math.imul(hash^value.charCodeAt(i),16777619);return (hash>>>0).toString(36);}
  function clean(value){return String(value??'').replace(/\r\n?/g,'\n').trim();}
  function strings(values){return [...new Set((values||[]).map(clean).filter(Boolean))];}
  function importEntry(backup,entry,normalize,newId){const wordText=clean(entry.word).normalize('NFKC').replace(/\s+/g,' '),key=normalize(wordText);let word=backup.words.find(item=>item.key===key);if(!word){word={id:newId(),key,word:wordText,aliases:[],forgotten:false,forgetCount:0,createdAt:new Date().toISOString(),contents:[]};backup.words.push(word);}word.aliases=unionAliases(word.aliases||[],entry.aliases||[],normalize).filter(alias=>normalize(alias)!==key);
    const content=fields({pos:clean(entry.pos),meaning:clean(entry.meaning),phrases:strings(entry.phrases),examples:strings(entry.examples),raw:clean(entry.raw)});let saved=word.contents.find(item=>fingerprint(item)===fingerprint(content));if(!saved){saved={id:newId(),wordId:word.id,...content,sources:[]};word.contents.push(saved);}const label=clean(entry.sourceLabel)||'导入',source={id:clean(entry.sourceId)||`import:${fnv(label)}:${key}`,label,quote:clean(entry.quote),collected:true};saved.sources=mergeSources(saved.sources,[source],'import');return word;}
  function sameFields(a,b){return fingerprint(a)===fingerprint(b);}
  function editedWord(remote,before,after,normalize){if(!remote)fail('云端的这个词已被删除；请先导出本地备份再处理冲突');const next=clone(remote);if(before.word!==after.word){next.word=after.word;next.key=normalize(after.word);}if(JSON.stringify(before.aliases)!==JSON.stringify(after.aliases))next.aliases=clone(after.aliases);
    const prior=new Map(before.contents.map(content=>[content.id,content]));const later=new Map(after.contents.map(content=>[content.id,content]));
    for(const original of before.contents){const changed=later.get(original.id),index=next.contents.findIndex(item=>item.id===original.id||fingerprint(item)===fingerprint(original));if(!changed){if(index>=0){if(!sameFields(next.contents[index],original))fail('云端资料也被修改；请先核对冲突');next.contents.splice(index,1);}continue;}if(sameFields(original,changed))continue;if(index<0||!sameFields(next.contents[index],original))fail('云端资料也被修改；请先核对冲突');const remoteContent=next.contents[index];next.contents[index]={...remoteContent,...fields(changed),sources:mergeSources(remoteContent.sources||[],changed.sources||[],'restore')};}
    for(const content of after.contents){if(prior.has(content.id))continue;const existing=next.contents.find(item=>fingerprint(item)===fingerprint(content));if(existing)existing.sources=mergeSources(existing.sources||[],content.sources||[],'restore');else next.contents.push(clone(content));}
    const seen=new Map();for(const content of next.contents){const key=fingerprint(content),previous=seen.get(key);if(previous)previous.sources=mergeSources(previous.sources||[],content.sources||[],'restore');else seen.set(key,content);}next.contents=[...seen.values()];return next;
  }
  function applyOperation(backup,op,normalize,newId){const operations=[],words=backup.words;
    if(op.kind==='import'){const changed=new Set();for(const entry of op.entries){const word=importEntry(backup,entry,normalize,newId);changed.add(word.key);}for(const key of changed)operations.push({type:'upsert',word:clone(words.find(word=>word.key===key))});}
    else if(op.kind==='restore'){for(const incoming of op.words){const key=normalize(incoming.word),index=words.findIndex(word=>word.key===key),merged=mergeWord(index<0?null:words[index],incoming,normalize,'restore');if(index<0)words.push(merged);else words[index]=merged;operations.push({type:'upsert',word:clone(merged)});}}
    else if(op.kind==='forget'){const word=words.find(item=>item.key===op.key);if(word){word.forgotten=op.forgotten;if(op.forgotten)word.forgetCount=Math.min(1000000000,(word.forgetCount||0)+1);operations.push({type:'forget',key:op.key,forgotten:op.forgotten});}}
    else if(op.kind==='uncollect'){for(const word of words)for(const content of word.contents)for(const source of content.sources)if(source.id===op.sourceId)source.collected=false;operations.push({type:'uncollect',sourceId:op.sourceId});}
    else if(op.kind==='delete'){const index=words.findIndex(word=>word.key===op.key);if(index>=0){words.splice(index,1);operations.push({type:'delete',key:op.key});}}
    else if(op.kind==='edit'){const before=op.before,after=op.after;if(!after)fail('本地编辑尚未完成');const index=words.findIndex(word=>word.key===before.key);if(index<0)fail('云端的这个词已被删除；请先核对冲突');const next=editedWord(words[index],before,after,normalize);if(next.key!==before.key&&words.some((word,i)=>i!==index&&word.key===next.key))fail('云端已有同名词条；请先核对冲突');words[index]=next;operations.push(next.key===before.key?{type:'upsert',word:clone(next)}:{type:'rename',oldKey:before.key,word:clone(next)});}
    else fail('未知的同步操作');
    return operations;
  }
  class CloudError extends Error{constructor(message,status,code){super(message);this.status=status;this.code=code;}}
  function create(options){
    const local=options?.localStore;if(!local?.replaceSnapshot||!local?.exportData||!local?.normalizeWord)fail('词库缺少云同步需要的本地接口');
    const endpoint=String(options.endpoint||''),apiKey=String(options.apiKey||'');if(!/^https:\/\//.test(endpoint)||!apiKey||typeof options.getAccessToken!=='function')fail('云端连接配置不完整');
    const fetcher=options.fetch||root.fetch?.bind(root),storage=options.storage||root.localStorage,crypto=options.crypto||root.crypto;if(!fetcher||!storage)fail('当前浏览器无法连接或保存云同步队列');
    const host=new URL(endpoint).host,newId=()=>uuid(crypto),listeners=new Set();let userId=null,active=false,remote=null,revision=null,syncPromise=null,seedPromise=null,applyPromise=null,clock=null,writes=0,lastSync=null,error=null,online=true,serial=0;
    const normalize=local.normalizeWord;
    const scope=id=>`${PREFIX}${host}:${id}:`,opPrefix=id=>scope(id)+'op:',flagKey=id=>scope(id)+'active',cacheOwnerKey=`${PREFIX}${host}:cache-owner`;
    function otherPending(id){const prefix=`${PREFIX}${host}:`;let count=0;for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key?.startsWith(prefix)&&key.includes(':op:')&&!key.startsWith(opPrefix(id)))count++;}return count;}
    function operations(id=userId){if(!id)return [];const prefix=opPrefix(id),result=[];for(let i=0;i<storage.length;i++){const key=storage.key(i);if(!key?.startsWith(prefix))continue;let item;try{item=JSON.parse(storage.getItem(key));}catch(cause){fail('同步队列无法读取；请先导出本地词库备份');}if(!item||item.id!==key.slice(prefix.length)||item.owner!==id)fail('同步队列格式不正确；请先导出备份');result.push(item);}return result.sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id));}
    function state(){return {active,syncing:!!syncPromise,pending:operations().length,online,lastSync,error,userId};}
    function emit(){const value=state();for(const listener of [...listeners]){try{listener(value);}catch(cause){}}}
    function saveOp(op){op.id=newId();op.owner=userId;op.at=Date.now()*1000+(serial++%1000);storage.setItem(opPrefix(op.owner)+op.id,JSON.stringify(op));emit();return op;}
    function removeOp(op){storage.removeItem(opPrefix(op.owner)+op.id);emit();}
    function updateOp(op){storage.setItem(opPrefix(op.owner)+op.id,JSON.stringify(op));emit();}
    function queueMany(items){const saved=[];try{for(const item of items)saved.push(saveOp(item));return saved;}catch(cause){for(const item of saved)removeOp(item);throw new Error('本地同步队列存储不足，请先导出词库备份');}}
    async function request(action,values={}){const token=await options.getAccessToken();if(typeof token!=='string'||!token)throw new CloudError('请先登录云端词库',401,'login_required');let subject;try{const piece=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');subject=JSON.parse((root.atob||atob)(piece)).sub;}catch(cause){throw new CloudError('登录状态无效，请重新登录',401,'invalid_token');}if(subject!==userId)throw new CloudError('登录账号已改变，请重新连接词库',401,'account_changed');
      let response;try{response=await fetcher(endpoint,{method:'POST',headers:{'Content-Type':'application/json',apikey:apiKey,Authorization:'Bearer '+token},body:JSON.stringify({action,...values})});}catch(cause){throw new CloudError('网络暂不可用，改动已保存在本机',0,'offline');}
      let body;try{body=await response.json();}catch(cause){body={};}if(!response.ok)throw new CloudError(body.error||'云端请求失败',response.status,body.code||'request_failed');if(!Object.prototype.hasOwnProperty.call(body,'data'))throw new CloudError('云端响应格式不正确',502,'invalid_response');online=true;return body.data;
    }
    async function snapshot(){const value=await request('snapshot');if(!Number.isSafeInteger(value?.revision)||!validBackup(value.backup))fail('云端快照格式不正确');return clone(value);}
    async function inspect(id){if(typeof id!=='string'||!id)fail('请先登录');if(active&&userId!==id)fail('请先退出原账号的云同步');if(applyPromise)await applyPromise.catch(()=>{});const prior=userId;userId=id;try{const [localBackup,cloud]=await Promise.all([local.exportData(),snapshot()]);return {localWords:localBackup.words.length,cloudWords:cloud.backup.words.length,revision:cloud.revision,pending:operations(id).length,otherAccountPending:otherPending(id),otherAccountCache:!!storage.getItem(cacheOwnerKey)&&storage.getItem(cacheOwnerKey)!==id,wasActive:storage.getItem(flagKey(id))==='1'};}finally{userId=prior;}}
    async function resolveUnfinishedEdit(op){if(op.kind!=='edit'||op.after)return op;const list=await local.list(),target=op.desiredKey||op.before.key,current=list.find(word=>word.key===target);if(!current||JSON.stringify(current)===JSON.stringify(op.before)){removeOp(op);return null;}op.after=current;updateOp(op);return op;}
    async function runSync(){if(!active)return state();const runningUser=userId;let needApply=false,needCanonical=false;error=null;emit();try{
        if(seedPromise)await seedPromise;
        if(!active||userId!==runningUser||writes)return state();
        if(!remote){remote=await snapshot();revision=remote.revision;needApply=true;}
        for(let op of operations()){
          if(!active||userId!==runningUser)return state();
          op=await resolveUnfinishedEdit(op);if(!op)continue;
          let completed=false;
          for(let attempt=0;attempt<5&&!completed;attempt++){
            const candidate=clone(remote.backup),changes=applyOperation(candidate,op,normalize,newId);
            if(!changes.length){removeOp(op);completed=true;break;}
            try{const result=await request('mutate',{baseRevision:revision,operationId:op.id,operations:changes});if(!active||userId!==runningUser)return state();if(!Number.isSafeInteger(result?.revision))fail('云端版本格式不正确');revision=result.revision;remote={revision,backup:candidate};needCanonical ||= changes.some(change=>change.type==='upsert'||change.type==='rename');removeOp(op);completed=true;}
            catch(cause){if(cause.code!=='revision_conflict')throw cause;remote=await snapshot();revision=remote.revision;needApply=true;}
          }
          if(!completed)fail('云端同时发生多次修改，请稍后重试');
        }
        const current=await request('head');if(!Number.isSafeInteger(current?.revision))fail('云端版本格式不正确');if(current.revision!==revision||needCanonical){remote=await snapshot();revision=remote.revision;needApply=true;}
        if(active&&userId===runningUser&&!operations().length&&!writes&&needApply){
          // Hold local mutations until the authoritative replacement commits.
          // Otherwise an edit started during this await can be overwritten.
          const applying=local.replaceSnapshot(remote.backup);applyPromise=applying;
          try{await applying;storage.setItem(cacheOwnerKey,runningUser);}finally{if(applyPromise===applying)applyPromise=null;}
        }
        lastSync=new Date().toISOString();online=true;error=null;emit();return state();
      }catch(cause){online=cause.status===0?false:online;error=cause.message||'同步失败';emit();throw cause;}
    }
    function sync(){if(!active)return Promise.resolve(state());if(syncPromise)return syncPromise;syncPromise=runSync().finally(()=>{syncPromise=null;emit();});emit();return syncPromise;}
    function schedule(){if(!active)return;Promise.resolve().then(()=>sync()).catch(()=>{});}
    function startPolling(){if(clock||!root.setInterval)return;clock=root.setInterval(()=>{if(!root.document||root.document.visibilityState==='visible')schedule();},POLL_MS);}
    function stopPolling(){if(clock&&root.clearInterval)root.clearInterval(clock);clock=null;}
    async function activate({userId:id,initial='use-cloud'}={}){
      if(typeof id!=='string'||!id)fail('请先登录');if(!['use-cloud','merge-local','resume'].includes(initial))fail('同步方式不正确');if(active&&userId!==id)fail('请先退出原账号的云同步');
      if(otherPending(id))fail('另一个账号仍有待同步修改，请先用原账号完成同步');
      const pending=operations(id).length,owner=storage.getItem(cacheOwnerKey);
      if(initial==='use-cloud'&&pending)fail('本机还有未完成的上传；请继续合并本地词库，不能直接覆盖');
      if(initial==='merge-local'&&owner&&owner!==id)fail('本地词库属于另一个云端账号，不能合并到当前账号');
      if(active)return sync();userId=id;
      const started=storage.getItem(flagKey(id))==='1';
      if(initial==='resume'&&!started)fail('这台浏览器尚未连接云词库');
      active=true;emit();
      try{
        if(initial==='merge-local'&&!pending&&!started){
          // Publish the active facade before reading the baseline. Mutators wait
          // for this seed, so its restore operations always precede later edits.
          seedPromise=(async()=>{
            if(applyPromise)await applyPromise.catch(()=>{});
            const backup=await local.exportData();
            if(!active||userId!==id)fail('同步初始化已中断，请重试');
            if(backup.words.length){const chunks=[];for(let i=0;i<backup.words.length;i+=CHUNK)chunks.push({kind:'restore',words:backup.words.slice(i,i+CHUNK)});queueMany(chunks);}
          })();
          await seedPromise;
          seedPromise=null;
        }
        if(!active||userId!==id)fail('同步初始化已中断，请重试');
        storage.setItem(flagKey(id),'1');if(initial==='merge-local')storage.setItem(cacheOwnerKey,id);startPolling();emit();
        return await sync();
      }catch(cause){
        if(seedPromise){seedPromise=null;if(userId===id){active=false;userId=null;stopPolling();emit();}}
        if(initial==='resume')return state();throw cause;
      }
    }
    function deactivate(){active=false;remote=null;revision=null;userId=null;stopPolling();emit();}
    async function mutate(items,operation,after){const wasActive=active,operationUser=userId;if(seedPromise)await seedPromise;if(applyPromise)await applyPromise.catch(()=>{});if(active!==wasActive||(wasActive&&userId!==operationUser))fail('同步账号已改变，请重试');if(!active)return operation();const queued=queueMany(items);let applied=false;writes++;try{const result=await operation();applied=true;storage.setItem(cacheOwnerKey,userId);if(after)await after(queued,result);schedule();return result;}catch(cause){if(!applied)for(const op of queued)removeOp(op);throw cause;}finally{writes--;if(!writes)schedule();}}
    async function byId(id){if(applyPromise)await applyPromise.catch(()=>{});return (await local.list()).find(word=>word.id===id)||fail('这个词已被删除，请刷新词库');}
    async function edit(id,call,desiredKey){const before=await byId(id);return mutate([{kind:'edit',before,after:null,desiredKey:desiredKey||before.key}],call,async queued=>{const after=(await local.list()).find(word=>word.key===(desiredKey||before.key));if(!after)fail('无法读取编辑后的词条');queued[0].after=after;updateOp(queued[0]);});}
    const facade={
      ready:local.ready,normalizeWord:local.normalizeWord,LIMITS:local.LIMITS,
      list:options=>local.list(options),exportData:()=>local.exportData(),replaceSnapshot:backup=>local.replaceSnapshot(backup),subscribe:listener=>local.subscribe(listener),
      inspect,activate,deactivate,sync,subscribeStatus(listener){if(typeof listener!=='function')fail('监听器不正确');listeners.add(listener);listener(state());return ()=>listeners.delete(listener);},get status(){return state();},get storageMode(){return local.storageMode;},
      importEntries(entries){if(!Array.isArray(entries))return local.importEntries(entries);const items=[];for(let i=0;i<entries.length;i+=CHUNK)items.push({kind:'import',entries:clone(entries.slice(i,i+CHUNK))});return mutate(items,()=>local.importEntries(entries));},
      collect(entry){return facade.importEntries([entry]);},
      async setForgotten(id,value){const word=await byId(id);return mutate([{kind:'forget',key:word.key,forgotten:value}],()=>local.setForgotten(id,value));},
      uncollect(sourceId){return mutate([{kind:'uncollect',sourceId}],()=>local.uncollect(sourceId));},
      async deleteWord(id){const word=await byId(id);return mutate([{kind:'delete',key:word.key}],()=>local.deleteWord(id));},
      async updateWord(id,patch){const before=await byId(id),key=Object.prototype.hasOwnProperty.call(patch||{},'word')?normalize(patch.word):before.key;return edit(id,()=>local.updateWord(id,patch),key);},
      async updateContent(wordId,contentId,patch){return edit(wordId,()=>local.updateContent(wordId,contentId,patch));},
      async updateDetails(id,patch){const before=await byId(id),key=Object.prototype.hasOwnProperty.call(patch||{},'word')?normalize(patch.word):before.key;return edit(id,()=>local.updateDetails(id,patch),key);},
      restoreData(backup){if(!validBackup(backup))return local.restoreData(backup);const items=[];for(let i=0;i<backup.words.length;i+=CHUNK)items.push({kind:'restore',words:clone(backup.words.slice(i,i+CHUNK))});return mutate(items,()=>local.restoreData(backup));},
    };
    root.addEventListener?.('online',schedule);root.addEventListener?.('focus',schedule);
    root.addEventListener?.('storage',event=>{if(userId&&event.key?.startsWith(scope(userId)))schedule();});
    return Object.freeze(facade);
  }
  root.IeltsVocabCloud=Object.freeze({create,CloudError});
})(typeof window!=='undefined'?window:globalThis);
