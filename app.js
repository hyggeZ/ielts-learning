'use strict';
const ESSAYS=JSON.parse(document.querySelector('#essay-data').textContent);
const labels={vocab:'词汇',structure:'结构',syntax:'句型',link:'衔接',expression:'积累'};
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const CUSTOM_KEY='ielts-custom-essays-v1';
let customEssays=[];
let current,notes=[],personal=[],filter='all',showTranslation=false,editor=null,pending=null,opened=new Set();
let vocabulary=[],vocabSequence=0;
const vocabTools=window.IeltsEssayVocab;
const SUN='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.7"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg>';
const MOON='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.2A8.5 8.5 0 0 1 9.8 4a8.5 8.5 0 1 0 10.2 10.2Z"/></svg>';
function status(text){$('#status').textContent=text;$('#status').hidden=!text;}
function validCustom(essay){return window.IeltsTextImport.validate(essay)&&typeof essay.id==='string'&&/^custom-[a-z0-9-]+$/.test(essay.id);}
try{const stored=JSON.parse(localStorage.getItem(CUSTOM_KEY)||'[]');if(!Array.isArray(stored)||stored.length>100||!stored.every(validCustom)||new Set(stored.map(e=>e.id)).size!==stored.length)throw Error('invalid');customEssays=stored;ESSAYS.push(...stored);}catch(e){status('导入文章的存储无法读取，请使用备份恢复。');}
function setTheme(dark){document.documentElement.dataset.theme=dark?'dark':'light';$('#theme').innerHTML=dark?SUN:MOON;$('#theme').setAttribute('aria-label',dark?'切换浅色模式':'切换暗色模式');$('#theme').title=dark?'切换浅色模式':'切换暗色模式';try{localStorage.setItem('ielts-theme',dark?'dark':'light');}catch(e){}}
let theme;try{theme=localStorage.getItem('ielts-theme');}catch(e){}setTheme(theme?theme==='dark':matchMedia('(prefers-color-scheme: dark)').matches);
$('#theme').onclick=()=>setTheme(document.documentElement.dataset.theme!=='dark');
function key(id){return 'ielts-'+id+'-personal-notes-v1';}
function valid(n,essay){return n&&Number.isInteger(n.p)&&typeof n.q==='string'&&n.q.length>0&&typeof n.e==='string'&&Object.hasOwn(labels,n.c)&&Number.isInteger(n.start)&&n.start>=0&&essay.paragraphs[n.p]?.slice(n.start,n.start+n.q.length)===n.q;}
function load(essay){try{const value=JSON.parse(localStorage.getItem(key(essay.id))||'[]');return Array.isArray(value)?value.filter(n=>valid(n,essay)):[];}catch(e){status('无法读取笔记存储。');return [];}}
function save(next){try{localStorage.setItem(key(current.id),JSON.stringify(next));personal=next;return true;}catch(e){status('笔记保存失败，请先复制内容或导出备份。');return false;}}
function guard(){if(!editor)return true;editor.querySelector('.save-state').textContent='请先保存或取消当前笔记';return false;}
function dismiss(){editor?.remove();editor=null;pending=null;}
function spans(text,p){const r=notes.flatMap((n,id)=>(n.ranges||[{start:n.start??text.indexOf(n.q),q:n.q}]).map(hit=>({...n,...hit,id}))).filter(n=>n.p===p&&(n.c==='vocab'||filter==='all'||filter===n.c));const bounds=[...new Set([0,text.length,...r.flatMap(n=>[n.start,n.start+n.q.length])])].sort((a,b)=>a-b);let html='';for(let i=0;i<bounds.length-1;i++){const a=bounds[i],b=bounds[i+1],group=r.filter(n=>n.start<=a&&n.start+n.q.length>=b);const str=esc(text.slice(a,b));if(!group.length){html+=str;continue;}const n=group.find(n=>n.c===filter)||group.find(n=>n.c==='vocab')||group[0];html+=`<span tabindex="0" role="button" class="annotation ${n.c}" data-ids="${[...new Set(group.map(n=>n.id))].join(',')}" title="${group.map(n=>labels[n.c]).join(' / ')}">${str}</span>`;}return html;}
function card(n,id){const own=Boolean(n.personal),saved=n.c==='vocab'&&vocabTools.isCollected(vocabulary,vocabTools.sourceId(current,n));return `<div class="note ${n.c} ${own?'personal-note':''} ${n.libraryWordId?'library-vocab':''}" id="n${id}" data-id="${id}" data-category="${n.c}" ${n.c==='vocab'&&!opened.has(id)?'hidden':''} tabindex="0" role="button"><span class="note-actions">${n.c==='vocab'?`<button class="vocab-star" data-star="${id}" aria-pressed="${saved}" aria-label="${saved?'取消这处收藏':'收藏到单词本'}" title="${saved?'取消这处收藏':'收藏到单词本'}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.6l6.2-.9Z"/></svg></button>`:''}${own?`<button class="personal-delete" data-delete="${id}" aria-label="删除笔记：${esc(n.q)}">删除</button>`:''}</span><span class="type">${n.libraryWordId?'忘过':'词汇'===labels[n.c]?'词汇':labels[n.c]}</span><strong>${esc(own?n.q:n.t)}</strong>${!own&&n.t!==n.q?`<div class="anchor">${esc(n.q)}</div>`:''}<p>${esc(n.e)}</p></div>`;}
function structural(i){const s=current.structure[i];if(!s||!s.title&&!s.role&&!s.points.length)return '';return `<div class="note structure" data-category="structure"><span class="type">结构</span><strong>${esc(s.title)}</strong>${s.role?`<p>${esc(s.role)}</p>`:''}<ul>${s.points.map(t=>'<li>'+esc(t)+'</li>').join('')}</ul></div>`;}
function overview(){if(!current.kind&&!current.stance)return '';return `<div class="note structure" data-category="structure"><span class="type">题型</span><strong>${esc(current.kind)}</strong><p>${esc(current.stance)}</p></div>`;}
function highlight(ids){$$('.selected').forEach(e=>e.classList.remove('selected'));ids.forEach(id=>$('#n'+id)?.classList.add('selected'));$$('[data-ids]').forEach(e=>{if(e.dataset.ids.split(',').map(Number).some(i=>ids.includes(i)))e.classList.add('selected');});}
function render(expandedSources=null){notes=[...current.readerNotes,...personal.map((n,i)=>({...n,t:n.q,personal:true,personalIndex:i}))];notes.push(...vocabTools.forgottenNotes(current,notes,vocabulary));if(expandedSources)opened=new Set(notes.map((n,id)=>expandedSources.has(vocabTools.sourceId(current,n))?id:-1).filter(id=>id>=0));$('#question').innerHTML=current.question.split('\n').map(esc).join('<br>');$('#question-translation').textContent=current.qzh;
$('#content').innerHTML=current.paragraphs.map((text,p)=>`<section class="row body-row"><aside class="left">${notes.map((n,id)=>n.p===p&&n.c==='vocab'?card(n,id):'').join('')}</aside><article class="center"><div class="para-heading">${p+1}</div><p class="original" id="p${p}">${spans(text,p)}</p>${current.translations[p]?`<p class="translation trans" ${showTranslation?'':'hidden'}>${esc(current.translations[p])}</p>`:''}</article><aside class="right">${p===0?overview():''}${structural(p)}${notes.map((n,id)=>n.p===p&&n.c!=='vocab'?card(n,id):'').join('')}</aside></section>`).join('');
$$('.right [data-category]').forEach(n=>n.hidden=filter!=='all'&&filter!==n.dataset.category);$$('.trans').forEach(n=>n.hidden=!showTranslation||!n.textContent);$('#translate').disabled=!current.qzh&&!current.translations.some(Boolean);$('#translate').title=$('#translate').disabled?'尚未添加译文':'';
$$('[data-ids]').forEach(s=>{const ids=s.dataset.ids.split(',').map(Number);const vs=ids.filter(i=>notes[i].c==='vocab');if(vs.length)s.setAttribute('aria-expanded',String(vs.some(i=>opened.has(i))));s.onclick=()=>{if(editor)return;const close=vs.length&&vs.every(i=>opened.has(i));vs.forEach(i=>{if(close)opened.delete(i);else opened.add(i);$('#n'+i).hidden=Boolean(close);});highlight(ids.filter(i=>!close||!vs.includes(i)));syncExpanded();};s.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();s.click();}};});
$$('[data-id]').forEach(n=>{n.onclick=e=>{if(e.target.closest('[data-delete],[data-star],.word-collect-editor')||editor)return;const id=Number(n.dataset.id);if(notes[id].c==='vocab'){opened.delete(id);n.hidden=true;syncExpanded();highlight([]);}else{highlight([id]);const anchor=$$('[data-ids]').find(s=>s.dataset.ids.split(',').map(Number).includes(id));if(anchor)anchor.scrollIntoView({block:'center',behavior:'smooth'});}};n.onkeydown=e=>{if(e.target!==n)return;if(e.key==='Enter'||e.key===' '){e.preventDefault();n.click();}};});
$$('[data-star]').forEach(b=>b.onclick=e=>{e.stopPropagation();if(guard())toggleCollection(Number(b.dataset.star));});
$$('[data-delete]').forEach(b=>b.onclick=e=>{e.stopPropagation();if(!guard())return;const n=notes[Number(b.dataset.delete)];const next=personal.filter((_,i)=>i!==n.personalIndex);if(save(next)){opened=new Set([...opened].filter(id=>id<current.readerNotes.length));render();}});
}
function syncExpanded(){$$('[data-ids]').forEach(s=>{const ids=s.dataset.ids.split(',').map(Number).filter(i=>notes[i].c==='vocab');if(ids.length)s.setAttribute('aria-expanded',String(ids.some(i=>opened.has(i))));});}
async function refreshVocabulary(){if(!window.document?.body)return;const sequence=++vocabSequence;try{await window.IeltsVocab.ready;if(!window.document?.body)return;const rows=await window.IeltsVocab.list();if(sequence!==vocabSequence)return;const expandedSources=new Set([...opened].filter(id=>notes[id]).map(id=>vocabTools.sourceId(current,notes[id])));vocabulary=rows;if(current&&!editor&&window.document?.body)render(expandedSources);}catch(err){if(window.document?.body)status('词库读取失败：'+err.message);}}
async function saveCollection(essay,n,id,words){await window.IeltsVocab.importEntries(vocabTools.entries(essay,n,words));if(current.id===essay.id)opened.add(id);await refreshVocabulary();}
async function toggleCollection(id){
 const n=notes[id],essay=current,button=$('[data-star="'+id+'"]');if(!n||!button)return;button.disabled=true;
 try{await window.IeltsVocab.ready;const source=vocabTools.sourceId(essay,n);
 if(vocabTools.isCollected(vocabulary,source)){await window.IeltsVocab.uncollect(source);await refreshVocabulary();return;}
 const words=vocabTools.candidates(n);
 if(!words.length||words.some(word=>word.length>160||/[\u3400-\u9fff]/.test(word)||word.split(/\s+/).length>6)){
   if(current.id!==essay.id||!notes[id]||vocabTools.sourceId(essay,notes[id])!==source)return;const card=$('#n'+id);if(!card||card.querySelector('.word-collect-editor'))return;
   const form=document.createElement('form');form.className='word-collect-editor';form.innerHTML='<input aria-label="收藏的单词或短语" placeholder="单词或短语"><button type="submit">收藏</button><button type="button">取消</button><span role="status"></span>';form.querySelector('input').value=words.join(' / ');form.onclick=e=>e.stopPropagation();form.querySelector('[type=button]').onclick=()=>form.remove();
   form.onsubmit=async e=>{e.preventDefault();const word=form.querySelector('input').value.trim();if(!word){form.querySelector('span').textContent='请填写词条';return;}const submit=form.querySelector('[type=submit]');submit.disabled=true;try{await saveCollection(essay,n,id,[word]);}catch(err){form.querySelector('span').textContent=err.message;submit.disabled=false;}};card.append(form);form.querySelector('input').focus();
 }else await saveCollection(essay,n,id,words);
 }catch(err){status('收藏未保存：'+err.message);}finally{if(button.isConnected)button.disabled=false;}
}
window.IeltsVocab.subscribe(refreshVocabulary);
window.addEventListener('focus',refreshVocabulary);
function selectEssay(id,scroll=true){if(!guard())return false;current=ESSAYS.find(e=>e.id===id)||ESSAYS[0];opened.clear();personal=load(current);document.title=current.title+' · hyggeZ';$$('[data-essay]').forEach(b=>{const active=b.dataset.essay===current.id;b.classList.toggle('active',active);b.setAttribute('aria-current',active?'page':'false');});history.replaceState(null,'','#'+current.id);render();if(scroll)window.scrollTo({top:0});return true;}
function refreshEssayNavigation(){
$('#essay-tabs').innerHTML=ESSAYS.map((e,i)=>`<button data-essay="${e.id}" title="${esc(e.title)}"><span class="tab-number">${i+1}</span><span class="tab-name">${esc(e.title)}</span></button>`).join('');
$('#essay-picker').innerHTML=ESSAYS.map((e,i)=>'<button data-pick="'+e.id+'">'+(i+1)+'. '+esc(e.title)+'</button>').join('');
$$('[data-essay]').forEach(b=>b.onclick=()=>{const track=$('#essay-tabs');const nearEnd=b.getBoundingClientRect().right>track.getBoundingClientRect().left+track.clientWidth*.75;if(selectEssay(b.dataset.essay)){closePicker();revealEssay(b.dataset.essay,nearEnd);}});
$$('[data-pick]').forEach(b=>b.onclick=()=>{if(selectEssay(b.dataset.pick)){closePicker();revealEssay(b.dataset.pick,true);$('#essay-picker-toggle').focus();}});
if(current)$$('[data-essay]').forEach(b=>{b.classList.toggle('active',b.dataset.essay===current.id);b.setAttribute('aria-current',b.dataset.essay===current.id?'page':'false');});
}
function closePicker(){ $('#essay-picker').hidden=true;$('#essay-picker-toggle').setAttribute('aria-expanded','false'); }
function revealEssay(id,advance=false){requestAnimationFrame(()=>{const track=$('#essay-tabs'),button=track.querySelector('[data-essay="'+id+'"]');if(!button)return;const left=button.getBoundingClientRect().left-track.getBoundingClientRect().left+track.scrollLeft,right=left+button.offsetWidth;let target=track.scrollLeft;if(advance||right>target+track.clientWidth-45)target=left-track.clientWidth*.35;else if(left<target)target=left-16;target=Math.max(0,Math.min(target,track.scrollWidth-track.clientWidth));if(track.scrollTo)track.scrollTo({left:target,behavior:'smooth'});else track.scrollLeft=target;});}
$('#essay-picker-toggle').onclick=()=>{const open=$('#essay-picker').hidden;$('#essay-picker').hidden=!open;$('#essay-picker-toggle').setAttribute('aria-expanded',String(open));if(open){$$('[data-pick]').forEach(b=>b.setAttribute('aria-current',b.dataset.pick===current.id?'page':'false'));$('#essay-picker').querySelector('[aria-current="page"]')?.focus();}};
document.addEventListener('click',e=>{if(!e.target.closest('.essay-navigation'))closePicker();});
$('#essay-picker').addEventListener('keydown',e=>{const items=$$('[data-pick]');let i=items.indexOf(document.activeElement);if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();items[(i+(e.key==='ArrowDown'?1:-1)+items.length)%items.length].focus();}if(e.key==='Escape'){closePicker();$('#essay-picker-toggle').focus();}});
$('#essay-picker-toggle').addEventListener('keydown',e=>{if(e.key==='Escape')closePicker();});
window.addEventListener('resize',()=>revealEssay(current.id));

$$('[data-filter]').forEach(b=>b.onclick=()=>{if(!guard())return;filter=b.dataset.filter;$$('[data-filter]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});render();});
$('#translate').onclick=()=>{if(!guard())return;showTranslation=!showTranslation;$('#translate').textContent=showTranslation?'隐藏译文':'显示译文';$('#translate').setAttribute('aria-pressed',String(showTranslation));$$('.trans').forEach(n=>n.hidden=!showTranslation||!n.textContent);};
function addEditor(range,p,start,q){pending={p,start,q};editor=document.createElement('span');editor.className='note-editor';editor.setAttribute('role','group');editor.setAttribute('aria-label','添加笔记');editor.innerHTML='<select aria-label="笔记标签"><option value="">选择标签</option>'+Object.entries(labels).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')+'</select><textarea aria-label="笔记内容" placeholder="写笔记…"></textarea><button class="save-note">保存</button><button class="cancel-note">取消</button><span class="save-state" role="status"></span>';const insert=range.cloneRange();insert.collapse(false);insert.insertNode(editor);editor.addEventListener('click',e=>e.stopPropagation());editor.addEventListener('keydown',e=>e.stopPropagation());editor.querySelector('.cancel-note').onclick=()=>{dismiss();render();};editor.querySelector('.save-note').onclick=()=>{const c=editor.querySelector('select').value,e=editor.querySelector('textarea').value;if(!c){editor.querySelector('.save-state').textContent='请选择标签';return;}if(save([...personal,{...pending,c,e}])){const id=current.readerNotes.length+personal.length-1;if(c==='vocab')opened.add(id);dismiss();render();highlight([id]);}else editor.querySelector('.save-state').textContent='未保存，请先复制内容。';};getSelection().removeAllRanges();editor.querySelector('select').focus();}
function captureSelection(e){if(editor||e.target.closest('button,select,textarea,.note-editor,.note'))return;const selection=getSelection();if(!selection||selection.isCollapsed||!selection.rangeCount)return;const range=selection.getRangeAt(0),a=range.startContainer.nodeType===1?range.startContainer:range.startContainer.parentElement,b=range.endContainer.nodeType===1?range.endContainer:range.endContainer.parentElement;const para=a.closest('.original');if(!para||b.closest('.original')!==para)return;const q=range.toString();if(!q.trim())return;const prefix=range.cloneRange();prefix.selectNodeContents(para);prefix.setEnd(range.startContainer,range.startOffset);const start=prefix.toString().length,p=Number(para.id.slice(1));if(current.paragraphs[p].slice(start,start+q.length)!==q)return;addEditor(range,p,start,q);}
document.addEventListener('mouseup',captureSelection);document.addEventListener('keyup',e=>{if(e.key==='Shift')captureSelection(e);});
document.addEventListener('click',e=>{if(editor&&e.target.closest('.original')&&!e.target.closest('.note-editor')){e.stopImmediatePropagation();e.preventDefault();}},true);
window.addEventListener('beforeunload',e=>{if(editor&&editor.querySelector('textarea').value){e.preventDefault();e.returnValue='';}});
$('#export-notes').onclick=()=>{if(!guard())return;const exportData={format:'ielts-notes',version:1,customEssays,essays:Object.fromEntries(ESSAYS.map(e=>[e.id,load(e)]))};const url=URL.createObjectURL(new Blob([JSON.stringify(exportData,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='ielts-notes.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
function importBackup(data){
 if(data.format!=='ielts-notes'||data.version!==1||!data.essays||typeof data.essays!=='object'||Array.isArray(data.essays))throw Error('笔记格式不正确');
 const incoming=data.customEssays??[];
 if(!Array.isArray(incoming)||incoming.length>100||!incoming.every(validCustom)||new Set(incoming.map(e=>e.id)).size!==incoming.length)throw Error('导入文章格式不正确');
 const extra=[],updates=new Map();
 for(const essay of incoming){const existing=ESSAYS.find(e=>e.id===essay.id);if(existing){if(existing.question!==essay.question||JSON.stringify(existing.paragraphs)!==JSON.stringify(essay.paragraphs))throw Error('导入文章与已有文章冲突');updates.set(essay.id,{...existing,qzh:existing.qzh||essay.qzh,translations:existing.translations.map((t,p)=>t||essay.translations[p])});}else extra.push(essay);}
 if(customEssays.length+extra.length>100)throw Error('最多保留 100 篇导入文章');
 const combined=[...ESSAYS.map(e=>updates.get(e.id)||e),...extra],nextCustom=[...customEssays.map(e=>updates.get(e.id)||e),...extra];
 for(const [id,items] of Object.entries(data.essays)){const essay=combined.find(x=>x.id===id);if(!essay||!Array.isArray(items)||!items.every(n=>valid(n,essay)))throw Error('笔记与文章不匹配');}
 let added=0;const changes=[];
 for(const essay of combined){const existing=load(essay),seen=new Set(existing.map(n=>JSON.stringify([n.p,n.start,n.q,n.c,n.e]))),next=[...existing];for(const n of data.essays[essay.id]||[]){const sig=JSON.stringify([n.p,n.start,n.q,n.c,n.e]);if(!seen.has(sig)){next.push(n);seen.add(sig);added++;}}changes.push([key(essay.id),JSON.stringify(next)]);}
 changes.push([CUSTOM_KEY,JSON.stringify(nextCustom)]);
 const previous=changes.map(([k])=>[k,localStorage.getItem(k)]);
 try{changes.forEach(([k,v])=>localStorage.setItem(k,v));}catch(err){for(const [k,v] of previous){try{v===null?localStorage.removeItem(k):localStorage.setItem(k,v);}catch(rollbackError){}}throw err;}
 customEssays=nextCustom;ESSAYS.splice(0,ESSAYS.length,...combined);current=ESSAYS.find(e=>e.id===current.id);refreshEssayNavigation();personal=load(current);render();status('已导入 '+added+' 条笔记'+(extra.length?'、'+extra.length+' 篇文章':'')+'。');
}
$('#import-notes').onchange=async e=>{if(!guard()){e.target.value='';return;}const file=e.target.files[0];if(!file)return;try{if(file.size>30*1024*1024)throw Error('文件超过 30 MB');importBackup(JSON.parse(await file.text()));}catch(err){status('导入失败：'+err.message);}e.target.value='';};

function toggleTextImport(open){$('#text-import-panel').hidden=!open;$('#text-import-toggle').setAttribute('aria-expanded',String(open));if(open){$('#text-import-input').focus();$('#text-import-panel').scrollIntoView({block:'nearest'});}}
$('#text-import-toggle').onclick=()=>{if(guard())toggleTextImport($('#text-import-panel').hidden);};
$('#text-import-close').onclick=()=>toggleTextImport(false);
$('#text-import-save').onclick=()=>{
 if(!guard())return;
 try{const essay=window.IeltsTextImport.parse($('#text-import-input').value);const duplicate=ESSAYS.find(e=>e.question===essay.question&&JSON.stringify(e.paragraphs)===JSON.stringify(essay.paragraphs));
 if(duplicate){let updated=false;const i=customEssays.findIndex(e=>e.id===duplicate.id);if(i>=0){const next={...duplicate,qzh:essay.qzh||duplicate.qzh,translations:essay.translations.map((t,p)=>t||duplicate.translations[p])};if(JSON.stringify(next)!==JSON.stringify(duplicate)){const customs=customEssays.map((e,p)=>p===i?next:e);localStorage.setItem(CUSTOM_KEY,JSON.stringify(customs));customEssays=customs;ESSAYS[ESSAYS.indexOf(duplicate)]=next;updated=true;}}selectEssay(duplicate.id);revealEssay(duplicate.id,true);toggleTextImport(false);status(updated?'已更新这篇文章的译文。':'这篇文章已经存在，已为你打开。');return;}
 if(customEssays.length>=100)throw Error('最多保留 100 篇导入文章');
 essay.id='custom-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
 localStorage.setItem(CUSTOM_KEY,JSON.stringify([...customEssays,essay]));customEssays.push(essay);ESSAYS.push(essay);refreshEssayNavigation();selectEssay(essay.id);revealEssay(essay.id,true);toggleTextImport(false);$('#text-import-input').value='';$('#text-import-status').textContent='';status('文章已导入并保存在当前浏览器。');
 }catch(err){$('#text-import-status').textContent=err.name==='QuotaExceededError'?'存储空间不足，请先导出笔记备份。':err.message;}
};
$('#text-import-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>1024*1024)throw Error('文件超过 1 MB');const text=await file.text();if(text.includes('\uFFFD'))throw Error('请将文件保存为 UTF-8 编码后重新读取。');$('#text-import-input').value=text;$('#text-import-status').textContent='已读取，请检查文本后导入。';}catch(err){$('#text-import-status').textContent=err.message;}e.target.value='';};

function renderPrint(){
 if(!current)return;
 const all=[...current.readerNotes,...load(current).map(n=>({...n,t:n.q,personal:true}))];all.push(...vocabTools.forgottenNotes(current,all,vocabulary));
 const note=n=>`<div class="print-note ${esc(n.c)}"><span>${labels[n.c]}</span> <strong>${esc(n.personal?n.q:n.t)}</strong>${!n.personal&&n.t!==n.q?`<p class="print-quote">${esc(n.q)}</p>`:''}<p>${esc(n.e)}</p></div>`;
 const structure=s=>s&&(s.title||s.role||s.points.length)?`<div class="print-note structure"><span>结构</span> <strong>${esc(s.title)}</strong>${s.role?'<p>'+esc(s.role)+'</p>':''}${s.points.length?'<ul>'+s.points.map(t=>'<li>'+esc(t)+'</li>').join('')+'</ul>':''}</div>`:'';
 $('#print-view').innerHTML=`<div class="print-brand">hyggeZ · 雅思学习·范文分析</div><h1>${esc(current.title)}</h1><div class="print-question">${esc(current.question)}</div>${current.qzh?'<p class="print-translation">'+esc(current.qzh)+'</p>':''}${current.kind||current.stance?'<div class="print-overview"><strong>'+esc(current.kind)+'</strong><p>'+esc(current.stance)+'</p></div>':''}`+current.paragraphs.map((text,p)=>`<section class="print-paragraph"><h2>第 ${p+1} 段</h2><p class="print-original">${esc(text)}</p>${current.translations[p]?'<p class="print-translation">'+esc(current.translations[p])+'</p>':''}<div class="print-analysis">${structure(current.structure[p])}${all.filter(n=>n.p===p).map(note).join('')}</div></section>`).join('');
}
window.addEventListener('beforeprint',renderPrint);
window.addEventListener('afterprint',()=>{$('#print-view').replaceChildren();});
$('#export-pdf').onclick=()=>{if(!guard())return;renderPrint();status('请在打印界面选择“另存为 PDF”。');try{window.print();}catch(err){status('当前浏览器未能打开打印，请使用浏览器菜单中的打印功能。');}};
refreshEssayNavigation();
selectEssay(location.hash.slice(1),false);

revealEssay(current.id);
refreshVocabulary();
