(function(root){
  'use strict';
  const DB_NAME='ielts-vocabulary',DB_VERSION=1,FALLBACK_KEY='ielts-vocabulary-local-v1',SIGNAL_KEY='ielts-vocabulary-change-v1';
  const LIMITS=Object.freeze({words:50000,contents:150000,batch:10000,word:160,text:30000,items:200,sources:500});
  let database=null,mode=root.indexedDB?'indexeddb':'localStorage',fallbackQueue=Promise.resolve();
  const listeners=new Set();
  const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  const clone=v=>JSON.parse(JSON.stringify(v));
  function fail(message){throw new Error(message);}
  function normalizeWord(value){if(typeof value!=='string')fail('单词必须是文本');return value.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();}
  function text(value,name,max=LIMITS.text){if(value===undefined||value===null)return '';if(typeof value!=='string'||value.length>max||value.includes('\0'))fail(name+'格式不正确或过长');return value.replace(/\r\n?/g,'\n').trim();}
  function wordText(value){const valueText=text(value,'单词',LIMITS.word);if(!valueText||/[\r\n\u0000-\u001f]/.test(valueText))fail('请填写单词或短语，不要包含换行');const normalized=valueText.normalize('NFKC').replace(/\s+/g,' ');if(normalized.length>LIMITS.word)fail('单词或短语过长');return normalized;}
  function mergeAliases(first,second){const unique=new Map();for(const alias of [...first,...second]){const key=normalizeWord(alias);if(!unique.has(key))unique.set(key,alias);}return strings([...unique.values()],'词形',true);}
  function strings(value,name,wordList=false){if(value===undefined||value===null)return [];if(!Array.isArray(value)||value.length>(wordList?50:LIMITS.items))fail(name+'格式不正确或数量过多');const seen=new Set();return value.map(s=>wordList?wordText(s):text(s,name,5000)).filter(s=>{const key=wordList?normalizeWord(s):s;if(!s||seen.has(key))return false;seen.add(key);return true;});}
  function identifier(value,name){const result=text(value,name,1000);if(!result)fail(name+'不能为空');return result;}
  function uid(prefix){return prefix+'-'+(root.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)+'-'+Math.random().toString(36).slice(2));}
  function hash(value){let h=2166136261;for(let i=0;i<value.length;i++)h=Math.imul(h^value.charCodeAt(i),16777619);return (h>>>0).toString(36);}
  function fingerprint(content){return JSON.stringify([content.pos,content.meaning,[...content.phrases].sort(),[...content.examples].sort(),content.raw]);}
  function contentFields(entry){return {pos:text(entry.pos,'词性',100),meaning:text(entry.meaning,'释义'),phrases:strings(entry.phrases,'短语'),examples:strings(entry.examples,'例句'),raw:text(entry.raw,'原始资料')};}
  function normalizeEntry(entry){if(!entry||typeof entry!=='object'||Array.isArray(entry))fail('词条格式不正确');const word=wordText(entry.word),key=normalizeWord(word),fields=contentFields(entry),label=text(entry.sourceLabel,'来源',500)||'导入';return {word,key,aliases:strings(entry.aliases,'词形',true).filter(a=>normalizeWord(a)!==key),fields,source:{id:entry.sourceId?identifier(entry.sourceId,'来源编号'):'import:'+hash(label)+':'+key,label,quote:text(entry.quote,'原文摘录'),collected:true}};}
  function notify(){for(const listener of [...listeners]){try{listener();}catch(error){}}}
  let channel=null;
  try{if(root.BroadcastChannel){channel=new root.BroadcastChannel('ielts-vocabulary');channel.onmessage=event=>{if(event.data?.type==='changed')notify();};}}catch(error){}
  function changed(){notify();try{channel?.postMessage({type:'changed'});}catch(error){}try{root.localStorage?.setItem(SIGNAL_KEY,Date.now()+':'+Math.random());}catch(error){}}
  root.addEventListener?.('storage',event=>{if(event.key===SIGNAL_KEY||event.key===FALLBACK_KEY)notify();});
  const ready=new Promise((resolve,reject)=>{
    if(mode==='localStorage'){try{if(!root.localStorage)fail('当前浏览器无法保存词库');readFallback();resolve();}catch(error){reject(error);}return;}
    let request;try{request=root.indexedDB.open(DB_NAME,DB_VERSION);}catch(error){reject(error);return;}
    request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('words')){const words=db.createObjectStore('words',{keyPath:'id'});words.createIndex('key','key',{unique:true});}if(!db.objectStoreNames.contains('contents')){const contents=db.createObjectStore('contents',{keyPath:'id'});contents.createIndex('wordId','wordId');}};
    request.onsuccess=()=>{database=request.result;database.onversionchange=()=>{database.close();database=null;};resolve();};
    request.onerror=()=>reject(new Error('词库数据库无法打开：'+(request.error?.message||'请检查浏览器存储权限')));
    request.onblocked=()=>reject(new Error('词库正在升级，请关闭其他旧页面后重试'));
  });
  function readFallback(){const stored=root.localStorage.getItem(FALLBACK_KEY);if(!stored)return {words:[],contents:[]};let state;try{state=JSON.parse(stored);}catch(error){fail('本地词库无法读取，请从备份恢复');}if(!state||!Array.isArray(state.words)||!Array.isArray(state.contents))fail('本地词库格式损坏');return state;}
  function writeDiff(store,before,after){const previous=new Map(before.map(value=>[value.id,JSON.stringify(value)])),next=new Set(after.map(value=>value.id));for(const value of before)if(!next.has(value.id))store.delete(value.id);for(const value of after)if(previous.get(value.id)!==JSON.stringify(value))store.put(value);}
  async function transaction(write,operation){
    await ready;
    if(mode==='localStorage'){
      const run=()=>{const state=readFallback(),result=operation(state);if(write){root.localStorage.setItem(FALLBACK_KEY,JSON.stringify(state));changed();}return clone(result);};
      const lockedRun=()=>root.navigator?.locks?.request?root.navigator.locks.request(DB_NAME,run):run();
      const result=fallbackQueue.then(lockedRun,lockedRun);fallbackQueue=result.catch(()=>{});return result;
    }
    if(!database)fail('词库连接已关闭，请刷新页面');
    return new Promise((resolve,reject)=>{
      const tx=database.transaction(['words','contents'],write?'readwrite':'readonly'),wordStore=tx.objectStore('words'),contentStore=tx.objectStore('contents');let wordRows,contentRows,result,processingError;
      tx.oncomplete=()=>{if(write)changed();resolve(clone(result));};
      tx.onabort=()=>reject(processingError||tx.error||new Error('词库操作未完成'));
      tx.onerror=()=>{};
      function process(){if(!wordRows||!contentRows)return;try{const state={words:wordRows,contents:contentRows};const before=write?clone(state):null;result=operation(state);if(write){writeDiff(wordStore,before.words,state.words);writeDiff(contentStore,before.contents,state.contents);}}catch(error){processingError=error;tx.abort();}}
      const wordRequest=wordStore.getAll();wordRequest.onsuccess=()=>{wordRows=wordRequest.result;process();};
      const contentRequest=contentStore.getAll();contentRequest.onsuccess=()=>{contentRows=contentRequest.result;process();};
    });
  }
  function fullWords(state){const contents=new Map();for(const content of state.contents){if(!contents.has(content.wordId))contents.set(content.wordId,[]);contents.get(content.wordId).push(content);}return state.words.map(word=>({...word,contents:contents.get(word.id)||[]}));}
  async function list(options={}){const query=options.query?normalizeWord(String(options.query)):'';return transaction(false,state=>fullWords(state).filter(word=>(!options.forgottenOnly||word.forgotten)&&(!query||word.key.includes(query)||word.aliases.some(a=>normalizeWord(a).includes(query))||word.contents.some(c=>c.meaning.toLowerCase().includes(query)))).sort((a,b)=>a.word.localeCompare(b.word,'en')));}
  function mergeSources(target,sources){for(const source of sources){const existing=target.sources.find(s=>s.id===source.id);if(existing){existing.collected=existing.collected||source.collected;if(!existing.label)existing.label=source.label;if(!existing.quote)existing.quote=source.quote;}else{if(target.sources.length>=LIMITS.sources)fail('同一份资料的来源过多');target.sources.push(clone(source));}}}
  function mergeEntries(state,entries){const words=new Map(state.words.map(word=>[word.key,word])),contents=new Map(state.contents.map(content=>[content.wordId+'\0'+fingerprint(content),content]));let addedWords=0,addedContents=0;const wordIds=[];
    for(const entry of entries){let word=words.get(entry.key);if(!word){if(state.words.length>=LIMITS.words)fail('词库数量超过上限');word={id:uid('w'),key:entry.key,word:entry.word,aliases:[],forgotten:false,forgetCount:0,createdAt:new Date().toISOString()};state.words.push(word);words.set(word.key,word);addedWords++;}word.aliases=mergeAliases(word.aliases,entry.aliases).filter(a=>normalizeWord(a)!==word.key);wordIds.push(word.id);const key=word.id+'\0'+fingerprint(entry.fields);let content=contents.get(key);if(!content){if(state.contents.length>=LIMITS.contents)fail('词库资料数量超过上限');content={id:uid('c'),wordId:word.id,...clone(entry.fields),sources:[]};state.contents.push(content);contents.set(key,content);addedContents++;}mergeSources(content,[entry.source]);}
    return {addedWords,addedContents,wordIds:[...new Set(wordIds)]};
  }
  async function importEntries(entries){if(!Array.isArray(entries)||!entries.length||entries.length>LIMITS.batch)fail('每次请导入 1 至 '+LIMITS.batch+' 条词汇资料');const normalized=entries.map(normalizeEntry);return transaction(true,state=>mergeEntries(state,normalized));}
  async function uncollect(sourceId){sourceId=identifier(sourceId,'来源编号');return transaction(true,state=>{let updated=0;for(const content of state.contents)for(const source of content.sources)if(source.id===sourceId&&source.collected){source.collected=false;updated++;}return {updated};});}
  async function setForgotten(id,value){if(typeof value!=='boolean')fail('忘词状态不正确');return transaction(true,state=>{const word=state.words.find(word=>word.id===id);if(!word)fail('这个词已被删除，请刷新词库');word.forgotten=value;if(value)word.forgetCount=Math.min(1000000000,word.forgetCount+1);return word;});}
  async function updateWord(id,patch){if(!patch||typeof patch!=='object'||Array.isArray(patch))fail('单词修改格式不正确');const nextWord=own(patch,'word')?wordText(patch.word):null,nextAliases=own(patch,'aliases')?strings(patch.aliases,'词形',true):null;return transaction(true,state=>{const word=state.words.find(word=>word.id===id);if(!word)fail('这个词已被删除，请刷新词库');const key=nextWord?normalizeWord(nextWord):word.key;if(state.words.some(other=>other.id!==id&&other.key===key))fail('这个单词已经存在，请使用已有词条');if(nextWord){word.word=nextWord;word.key=key;}word.aliases=(nextAliases||word.aliases).filter(alias=>normalizeWord(alias)!==key);return word;});}
  async function updateContent(wordId,contentId,patch){if(!patch||typeof patch!=='object'||Array.isArray(patch))fail('资料修改格式不正确');return transaction(true,state=>{const content=state.contents.find(content=>content.id===contentId&&content.wordId===wordId);if(!content)fail('这份资料已被删除，请刷新词库');const values=contentFields({...content,...patch}),duplicate=state.contents.find(other=>other.id!==contentId&&other.wordId===wordId&&fingerprint(other)===fingerprint(values));if(duplicate){mergeSources(duplicate,content.sources);state.contents=state.contents.filter(other=>other.id!==contentId);return {wordId,contentId:duplicate.id,merged:true};}Object.assign(content,values);return {wordId,contentId,merged:false};});}
  async function updateDetails(id,patch){
    if(!patch||typeof patch!=='object'||Array.isArray(patch))fail('单词修改格式不正确');
    const nextWord=own(patch,'word')?wordText(patch.word):null,nextAliases=own(patch,'aliases')?strings(patch.aliases,'词形',true):null;
    const updates=own(patch,'contents')?patch.contents:[];if(!Array.isArray(updates)||updates.length>LIMITS.contents||updates.some(item=>!item||typeof item!=='object'||Array.isArray(item)||typeof item.id!=='string')||new Set(updates.map(item=>item.id)).size!==updates.length)fail('资料修改格式不正确');
    return transaction(true,state=>{
      const word=state.words.find(word=>word.id===id);if(!word)fail('这个词已被删除，请刷新词库');const key=nextWord?normalizeWord(nextWord):word.key;
      if(state.words.some(other=>other.id!==id&&other.key===key))fail('这个单词已经存在，请使用已有词条');
      if(nextWord){word.word=nextWord;word.key=key;}word.aliases=(nextAliases||word.aliases).filter(alias=>normalizeWord(alias)!==key);
      for(const item of updates){const content=state.contents.find(content=>content.id===item.id&&content.wordId===id);if(!content)fail('这份资料已被删除，请刷新词库');Object.assign(content,contentFields({...content,...item}));}
      const kept=new Map(),removed=new Set();
      for(const content of state.contents.filter(content=>content.wordId===id)){const signature=fingerprint(content),existing=kept.get(signature);if(existing){mergeSources(existing,content.sources);removed.add(content.id);}else kept.set(signature,content);}
      state.contents=state.contents.filter(content=>!removed.has(content.id));return {...word,contents:state.contents.filter(content=>content.wordId===id)};
    });
  }
  async function deleteWord(id){return transaction(true,state=>{const before=state.words.length;state.words=state.words.filter(word=>word.id!==id);state.contents=state.contents.filter(content=>content.wordId!==id);return {deleted:before!==state.words.length};});}
  async function exportData(){return transaction(false,state=>({format:'ielts-vocabulary',version:1,words:fullWords(state)}));}
  function backupWords(data){if(!data||data.format!=='ielts-vocabulary'||data.version!==1||!Array.isArray(data.words)||data.words.length>LIMITS.words)fail('词库备份格式不正确');let contentCount=0;return data.words.map(item=>{if(!item||typeof item!=='object'||Array.isArray(item))fail('词库备份词条不正确');const word=wordText(item.word),key=normalizeWord(word),aliases=strings(item.aliases,'词形',true);if(typeof item.forgotten!=='boolean'||!Number.isSafeInteger(item.forgetCount)||item.forgetCount<0||item.forgetCount>1000000000)fail('词库学习状态不正确');if(!Array.isArray(item.contents)||item.contents.length>LIMITS.contents)fail('词库资料不正确');contentCount+=item.contents.length;if(contentCount>LIMITS.contents)fail('词库资料过多');const createdAt=text(item.createdAt,'创建时间',100);if(!createdAt||!Number.isFinite(Date.parse(createdAt)))fail('创建时间不正确');const contents=item.contents.map(content=>{if(!content||typeof content!=='object'||!Array.isArray(content.sources)||content.sources.length>LIMITS.sources)fail('资料来源不正确');return {...contentFields(content),sources:content.sources.map(source=>{if(!source||typeof source.collected!=='boolean')fail('收藏状态不正确');return {id:identifier(source.id,'来源编号'),label:text(source.label,'来源',500),quote:text(source.quote,'原文摘录'),collected:source.collected};})};});return {word,key,aliases,forgotten:item.forgotten,forgetCount:item.forgetCount,createdAt,contents};});}
  async function restoreData(data){const incoming=backupWords(data);return transaction(true,state=>{let addedWords=0,addedContents=0;for(const item of incoming){let word=state.words.find(word=>word.key===item.key);if(!word){if(state.words.length>=LIMITS.words)fail('词库数量超过上限');word={id:uid('w'),key:item.key,word:item.word,aliases:[],forgotten:item.forgotten,forgetCount:item.forgetCount,createdAt:item.createdAt};state.words.push(word);addedWords++;}else{word.forgotten=word.forgotten||item.forgotten;word.forgetCount=Math.max(word.forgetCount,item.forgetCount);}word.aliases=mergeAliases(word.aliases,item.aliases).filter(a=>normalizeWord(a)!==word.key);for(const source of item.contents){let content=state.contents.find(c=>c.wordId===word.id&&fingerprint(c)===fingerprint(source));if(!content){if(state.contents.length>=LIMITS.contents)fail('词库资料数量超过上限');content={id:uid('c'),wordId:word.id,...contentFields(source),sources:[]};state.contents.push(content);addedContents++;}mergeSources(content,source.sources);}}return {addedWords,addedContents};});}
  root.IeltsVocab=Object.freeze({ready,normalizeWord,list,importEntries,collect:entry=>importEntries([entry]),uncollect,setForgotten,updateWord,updateContent,updateDetails,deleteWord,exportData,restoreData,subscribe(listener){if(typeof listener!=='function')fail('监听器不正确');listeners.add(listener);return ()=>listeners.delete(listener);},get storageMode(){return mode;},LIMITS});
})(typeof window!=='undefined'?window:globalThis);
