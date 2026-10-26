(function(){
  'use strict';
  const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],store=window.IeltsVocab;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const SUN='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.7"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg>';
  const MOON='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.2A8.5 8.5 0 0 1 9.8 4a8.5 8.5 0 1 0 10.2 10.2Z"/></svg>';
  let allWords=[],book='all',mode='browse',overview=false,revealed=false,viewId=null,page=0,sequence=0,busy=false,pendingEntries=null,editingId=null;
  const PAGE_SIZE=50,decks={all:new window.IeltsVocabDeck(),forgotten:new window.IeltsVocabDeck()};let deck=decks.all,progressLoaded=false;
  function status(message){$('#word-status').textContent=message;$('#word-status').hidden=!message;}
  function theme(dark){document.documentElement.dataset.theme=dark?'dark':'light';$('#word-theme').innerHTML=dark?SUN:MOON;$('#word-theme').setAttribute('aria-label',dark?'切换浅色模式':'切换暗色模式');try{localStorage.setItem('ielts-theme',dark?'dark':'light');}catch(error){}}
  let savedTheme;try{savedTheme=localStorage.getItem('ielts-theme');}catch(error){}theme(savedTheme?savedTheme==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches);
  $('#word-theme').onclick=()=>theme(document.documentElement.dataset.theme!=='dark');
  function selectedWords(){return allWords.filter(word=>book!=='forgotten'||word.forgotten);}
  function syncDecks(){for(const name of ['all','forgotten']){const ids=allWords.filter(word=>name==='all'||word.forgotten).map(word=>word.id);if(!progressLoaded){try{const state=JSON.parse(localStorage.getItem('ielts-vocab-deck-'+name+'-v1')||'null');if(state)decks[name].restore(state,ids);else decks[name].setIds(ids);}catch(error){decks[name].reset(ids);}}else decks[name].setIds(ids);}progressLoaded=true;deck=decks[book];}
  function saveProgress(){try{for(const name of ['all','forgotten'])localStorage.setItem('ielts-vocab-deck-'+name+'-v1',JSON.stringify(decks[name].snapshot()));}catch(error){status('抽词进度未能保存，当前仍可继续背词。');}}
  function currentWord(){return selectedWords().find(word=>word.id===deck.current())||null;}
  function closeEdit(){editingId=null;$('#word-edit-panel').hidden=true;$('#word-edit-toggle').setAttribute('aria-expanded','false');}
  function editingGuard(){if(!editingId)return true;status('请先保存或取消编辑。');return false;}
  function resetReveal(){revealed=mode==='browse';viewId=deck.current();$('#word-delete-confirm').hidden=true;closeEdit();}
  function showImport(open){$('#word-import-panel').hidden=!open;$('#word-import-toggle').setAttribute('aria-expanded',String(open));if(open){$('#word-import-input').focus();$('#word-import-panel').scrollIntoView({block:'nearest'});}}
  function clearPreview(){pendingEntries=null;$('#word-import-preview').hidden=true;$('#word-import-preview-list').replaceChildren();}
  function preview(entries){if(!Array.isArray(entries)||!entries.length)throw Error('没有可导入的单词。');pendingEntries=entries;$('#word-import-preview-count').textContent=entries.length+' 条资料'+(entries.length>10?'（预览前 10 条）':'');$('#word-import-preview-list').innerHTML=entries.slice(0,10).map(entry=>'<div><strong>'+esc(entry.word)+'</strong><span>'+esc([entry.pos,entry.meaning].filter(Boolean).join(' '))+'</span></div>').join('');$('#word-import-preview').hidden=false;}
  function download(data){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='ielts-vocabulary.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  async function action(operation){if(busy)return;busy=true;try{await operation();}catch(error){status(error.message||'操作未完成，请重试。');}finally{busy=false;}}
  async function refresh(){const request=++sequence;try{await store.ready;const loaded=await store.list();if(request!==sequence)return;allWords=loaded;syncDecks();if(!deck.current())deck.next();saveProgress();if(viewId!==deck.current())resetReveal();render();}catch(error){if(request===sequence)status(error.message||'词库无法读取，请刷新后重试。');}}
  function detailHTML(word){
    if(!word.contents?.length)return '<p class="word-no-details">尚未添加释义</p>';
    return word.contents.map(content=>{
      const hasMeaning=Boolean(content.pos||content.meaning),phrases=content.phrases||[],examples=content.examples||[],sources=[...new Set((content.sources||[]).map(s=>s.label).filter(Boolean))];
      return '<section class="word-content">'+(hasMeaning?'<p class="word-meaning">'+(content.pos?'<span class="word-pos">'+esc(content.pos)+'</span>':'')+esc(content.meaning)+'</p>':'')+(phrases.length?'<h2>短语</h2><ul>'+phrases.map(p=>'<li>'+esc(p)+'</li>').join('')+'</ul>':'')+(examples.length?'<h2>例句</h2><ul>'+examples.map(p=>'<li>'+esc(p)+'</li>').join('')+'</ul>':'')+(content.raw&&content.raw!==content.meaning?(hasMeaning||phrases.length||examples.length?'<h2>其他资料</h2>':'')+'<p class="word-raw">'+esc(content.raw)+'</p>':'')+(!hasMeaning&&!content.raw&&!phrases.length&&!examples.length?'<p class="word-no-details">尚未添加释义</p>':'')+(sources.length?'<p class="word-source">'+esc(sources.join(' · '))+'</p>':'')+'</section>';
    }).join('');
  }
  function openEdit(){
    const word=currentWord();if(!word)return;editingId=word.id;$('#word-delete-confirm').hidden=true;$('#word-edit-word').value=word.word;$('#word-edit-aliases').value=(word.aliases||[]).join(', ');
    $('#word-edit-contents').innerHTML=(word.contents||[]).map((content,i)=>'<fieldset data-edit-content="'+esc(content.id)+'"><legend>资料 '+(i+1)+'</legend><label>词性<input data-field="pos" maxlength="100" value="'+esc(content.pos)+'"></label><label>释义<textarea data-field="meaning" rows="2">'+esc(content.meaning)+'</textarea></label><label>短语<textarea data-field="phrases" rows="2">'+esc((content.phrases||[]).join('\n'))+'</textarea></label><label>例句<textarea data-field="examples" rows="3">'+esc((content.examples||[]).join('\n'))+'</textarea></label><label>其他资料<textarea data-field="raw" rows="2">'+esc(content.raw)+'</textarea></label></fieldset>').join('');
    $('#word-edit-panel').hidden=false;$('#word-edit-toggle').setAttribute('aria-expanded','true');$('#word-edit-word').focus();
  }
  function renderOverview(){
    const query=$('#word-search').value.normalize('NFKC').trim().toLocaleLowerCase('en'),words=selectedWords().filter(word=>!query||word.word.toLocaleLowerCase('en').includes(query)||(word.aliases||[]).some(a=>a.toLocaleLowerCase('en').includes(query))||(word.contents||[]).some(c=>(c.meaning||'').toLocaleLowerCase('en').includes(query)));
    const pages=Math.max(1,Math.ceil(words.length/PAGE_SIZE));page=Math.min(Math.max(0,page),pages-1);const batch=words.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);
    $('#word-list').innerHTML=batch.map(word=>'<button data-word-id="'+esc(word.id)+'"><span class="word-list-name">'+esc(word.word)+'</span><span class="word-list-meaning">'+esc((word.contents||[]).map(c=>[c.pos,c.meaning||c.raw].filter(Boolean).join(' ')).filter(Boolean).join(' / '))+'</span></button>').join('');
    $('#word-list-empty').hidden=Boolean(words.length);$('#word-page-position').textContent=words.length?(page+1)+' / '+pages:'';$('#word-page-prev').disabled=page===0;$('#word-page-next').disabled=page>=pages-1;$('.word-pagination').hidden=!words.length;
    $$('[data-word-id]').forEach(button=>button.onclick=()=>{if(!editingGuard())return;deck.visit(button.dataset.wordId);saveProgress();overview=false;resetReveal();render();window.scrollTo({top:0});});
  }
  function render(){
    $$('[data-book]').forEach(button=>{const active=button.dataset.book===book;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
    $$('[data-mode]').forEach(button=>{const active=button.dataset.mode===mode;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
    $('#word-overview-toggle').setAttribute('aria-pressed',String(overview));$('#word-overview-toggle').textContent=overview?'背词':'总览';
    $('#word-overview').hidden=!overview;
    const word=currentWord(),empty=!selectedWords().length;$('#word-empty').hidden=!empty||overview;$('#word-empty-message').textContent=book==='forgotten'?'还没有忘过的词':'词库为空';$('#word-empty-import').hidden=book==='forgotten';$('#word-card').hidden=overview||!word;
    if(overview){renderOverview();return;}if(!word)return;
    $('#word-position').textContent=selectedWords().length+' 词';$('#word-reveal').textContent=word.word;$('#word-reveal').setAttribute('aria-expanded',String(mode==='browse'||revealed));$('#word-details').innerHTML=detailHTML(word);$('#word-details').hidden=mode==='memory'&&!revealed;$('#word-reveal-hint').hidden=mode!=='memory'||revealed;
    $('#word-previous').disabled=!deck.canPrevious();$('#word-remove-forgotten').hidden=book!=='forgotten';$('#word-delete').hidden=book==='forgotten';document.title=word.word+' · 单词本 · hyggeZ';
  }
  function reveal(){if(!currentWord())return;revealed=true;render();}
  function move(next){if(!editingGuard())return;if(next)deck.next();else deck.previous();saveProgress();resetReveal();render();window.scrollTo({top:0});}
  $('#word-reveal').onclick=reveal;$('#word-reveal-hint').onclick=reveal;
  $('#word-stage').onclick=e=>{if(mode==='memory'&&!revealed&&!e.target.closest('a,input,textarea'))reveal();};
  $('#word-next').onclick=()=>move(true);$('#word-previous').onclick=()=>move(false);
  $('#word-forget').onclick=()=>action(async()=>{if(!editingGuard())return;const word=currentWord();if(!word)return;await store.setForgotten(word.id,true);revealed=true;await refresh();});
  $('#word-remove-forgotten').onclick=()=>action(async()=>{if(!editingGuard())return;const word=currentWord();if(!word)return;await store.setForgotten(word.id,false);await refresh();status('已移出忘词本。');});
  $('#word-delete').onclick=()=>{if(!editingGuard())return;$('#word-delete-confirm').hidden=false;$('#word-delete-yes').focus();};
  $('#word-delete-cancel').onclick=()=>{$('#word-delete-confirm').hidden=true;$('#word-delete').focus();};
  $('#word-delete-yes').onclick=()=>action(async()=>{const word=currentWord();if(!word)return;await store.deleteWord(word.id);$('#word-delete-confirm').hidden=true;await refresh();status('已从总词库删除。');});
  $$('[data-book]').forEach(button=>button.onclick=()=>{if(!editingGuard())return;saveProgress();book=button.dataset.book;page=0;deck=decks[book];deck.setIds(selectedWords().map(word=>word.id));if(!deck.current())deck.next();saveProgress();resetReveal();status('');render();});
  $$('[data-mode]').forEach(button=>button.onclick=()=>{if(!editingGuard())return;mode=button.dataset.mode;overview=false;resetReveal();render();});
  $('#word-overview-toggle').onclick=()=>{if(!editingGuard())return;overview=!overview;$('#word-delete-confirm').hidden=true;render();if(overview)$('#word-search').focus();};
  $('#word-edit-toggle').onclick=()=>{if(editingId){status('请先保存或取消编辑。');return;}openEdit();};
  $('#word-edit-cancel').onclick=()=>{closeEdit();$('#word-edit-toggle').focus();};
  $('#word-edit-panel').onsubmit=e=>{e.preventDefault();action(async()=>{if(!editingId)return;const id=editingId,contents=$$('[data-edit-content]').map(fieldset=>{const value=name=>fieldset.querySelector('[data-field="'+name+'"]').value;return {id:fieldset.dataset.editContent,pos:value('pos'),meaning:value('meaning'),phrases:value('phrases').split('\n').filter(s=>s.trim()),examples:value('examples').split('\n').filter(s=>s.trim()),raw:value('raw')};});await store.updateDetails(id,{word:$('#word-edit-word').value,aliases:$('#word-edit-aliases').value.split(/[,，\n]/).map(s=>s.trim()).filter(Boolean),contents});closeEdit();await refresh();status('已保存。');});};
  $('#word-search').oninput=()=>{page=0;renderOverview();};$('#word-page-prev').onclick=()=>{page--;renderOverview();window.scrollTo({top:0});};$('#word-page-next').onclick=()=>{page++;renderOverview();window.scrollTo({top:0});};
  $('#word-import-toggle').onclick=()=>showImport($('#word-import-panel').hidden);$('#word-import-close').onclick=()=>showImport(false);$('#word-empty-import').onclick=()=>showImport(true);
  $('#word-import-input').oninput=clearPreview;
  $('#word-import-save').onclick=()=>action(async()=>{clearPreview();preview(window.IeltsVocabImport.parseText($('#word-import-input').value,{sourceLabel:'文本导入'}));status('');});
  $('#word-import-file').onchange=e=>action(async()=>{const file=e.target.files?.[0];try{if(!file)return;clearPreview();preview(await window.IeltsVocabImport.parseFile(file));status('');}finally{e.target.value='';}});
  $('#word-import-confirm').onclick=()=>action(async()=>{if(!pendingEntries)return;const result=await store.importEntries(pendingEntries);clearPreview();$('#word-import-input').value='';await refresh();status('已新增 '+result.addedWords+' 个词、'+result.addedContents+' 条资料。');showImport(false);});
  $('#word-backup-export').onclick=()=>action(async()=>{download(await store.exportData());status('词库备份已导出。');});
  $('#word-backup-import').onchange=e=>action(async()=>{const file=e.target.files?.[0];try{if(!file)return;if(file.size>50*1024*1024)throw Error('备份超过 50 MB。');const result=await store.restoreData(JSON.parse(await file.text()));await refresh();status('已合并备份，新增 '+result.addedWords+' 个词、'+result.addedContents+' 条资料。');}finally{e.target.value='';}});
  document.addEventListener('keydown',e=>{if(e.target.closest('input,textarea,select')||!$('#word-delete-confirm').hidden)return;if(overview)return;if(e.key==='ArrowRight'){e.preventDefault();move(true);}if(e.key==='ArrowLeft'){e.preventDefault();move(false);}if(e.key===' '&&!e.target.closest('button,a')){e.preventDefault();reveal();}});
  window.addEventListener('storage',e=>{if(e.key==='ielts-theme')theme(e.newValue==='dark');});
  store.subscribe(refresh);refresh();
})();
