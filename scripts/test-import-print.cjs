const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const opened=[];
function open(seed={}){
  const downloads=[];
  const dom=new JSDOM(html,{runScripts:'dangerously',url:'https://hyggez.github.io/ielts-learning/',pretendToBeVisual:true,beforeParse(w){
    w.matchMedia=()=>({matches:false});w.scrollTo=()=>{};w.print=()=>{};
    w.HTMLElement.prototype.scrollIntoView=()=>{};w.HTMLAnchorElement.prototype.click=()=>{};
    w.Blob=Blob;w.URL.createObjectURL=blob=>{downloads.push(blob);return 'blob:test';};w.URL.revokeObjectURL=()=>{};
    for(const [k,v] of Object.entries(seed))w.localStorage.setItem(k,v);
  }});
  opened.push(dom);return {dom,w:dom.window,d:dom.window.document,downloads};
}
const strings=v=>JSON.parse(JSON.stringify(v));
function stored(w){return Object.fromEntries(Object.keys(w.localStorage).sort().map(k=>[k,w.localStorage.getItem(k)]));}
async function importBackup(instance,data){
  const input=instance.d.querySelector('#import-notes'),text=JSON.stringify(data);
  Object.defineProperty(input,'files',{configurable:true,value:[{size:Buffer.byteLength(text),text:async()=>text}]});
  await input.onchange({target:input});
}
function addNote(instance,quote,category,body){
  const {w,d}=instance,para=d.querySelector('.original'),walker=d.createTreeWalker(para,w.NodeFilter.SHOW_TEXT);
  let node,found;while((node=walker.nextNode())){const start=node.textContent.indexOf(quote);if(start>=0){found={node,start};break;}}
  assert(found,'selection quote exists');const range=d.createRange();range.setStart(found.node,found.start);range.setEnd(found.node,found.start+quote.length);
  w.getSelection().removeAllRanges();w.getSelection().addRange(range);para.dispatchEvent(new w.MouseEvent('mouseup',{bubbles:true}));
  assert(d.querySelector('.note-editor'));d.querySelector('.note-editor select').value=category;d.querySelector('.note-editor textarea').value=body;d.querySelector('.save-note').click();
  assert(!d.querySelector('.note-editor'));
}
(async()=>{
  const a=open(),{w,d}=a,parse=w.IeltsTextImport.parse;
  const source='[标题]\n自选范文 <img src=x onerror=alert(1)>\n[题目]\nShould educators support reading?\nGive your opinion.\n[题目译文]\n教育者应支持阅读吗？\n[原文]\nImported educators help students read <img src=x onerror=alert(1)>.\n\nA second paragraph supports this view.\n[译文]\n导入的教育者帮助学生阅读。\n\n第二段支持这一观点。';
  const labelled=parse(source);assert.equal(labelled.paragraphs.length,2);assert.equal(labelled.translations.length,2);assert.equal(labelled.kind,'');assert.equal(labelled.readerNotes.length,0);
  const plain=parse('Should children read?\nGive your opinion.\n\nFirst paragraph.\n\nSecond paragraph.');
  assert.deepEqual(strings(plain.paragraphs),['First paragraph.','Second paragraph.']);assert.deepEqual(strings(plain.translations),['','']);
  assert.throws(()=>parse('[题目]\nQ?\n[原文]\nOne.\n\nTwo.\n[译文]\n一。'),/译文.*原文/);
  assert.throws(()=>parse('x'.repeat(w.IeltsTextImport.LIMITS.text+1)),/文本过长/);
  assert.throws(()=>parse('[题目]\nQ?\n[原文]\n'+'x'.repeat(w.IeltsTextImport.LIMITS.paragraph+1)),/单段过长/);
  assert.throws(()=>parse('[题目]\nQ?\n[原文]\n'+Array.from({length:101},(_,i)=>'Paragraph '+i).join('\n\n')),/段落过多/);
  d.querySelector('#text-import-toggle').click();assert(!d.querySelector('#text-import-panel').hidden);
  d.querySelector('#text-import-input').value=source;d.querySelector('#text-import-save').click();
  assert(d.querySelector('#text-import-panel').hidden);assert.equal(d.querySelectorAll('[data-essay]').length,26);
  const id=w.location.hash.slice(1);assert.match(id,/^custom-/);assert.deepEqual([...d.querySelectorAll('.original')].map(p=>p.textContent),strings(labelled.paragraphs));
  assert.equal(d.querySelectorAll('#content img,#essay-tabs img').length,0);assert.equal(d.querySelector('#text-import-input').value,'');
  d.querySelector('#text-import-toggle').click();d.querySelector('#text-import-input').value=source;d.querySelector('#text-import-save').click();
  assert.equal(d.querySelectorAll('[data-essay]').length,26);assert.equal(w.location.hash,'#'+id);assert.match(d.querySelector('#status').textContent,/已经存在/);
  addNote(a,'educators','vocab','educator 教育者\n<img src=x onerror=alert(1)>');
  assert.equal(d.querySelector('.personal-note strong').textContent,'educators');assert.equal(d.querySelectorAll('.personal-note img').length,0);
  const seed=stored(w),refresh=open(seed);assert.equal(refresh.d.querySelectorAll('[data-essay]').length,26);refresh.d.querySelector('[data-essay="'+id+'"]').click();
  assert.equal(refresh.d.querySelectorAll('.personal-note').length,1);assert.equal(refresh.d.querySelector('.personal-note strong').textContent,'educators');
  d.querySelector('#export-notes').click();assert.equal(a.downloads.length,1);const backup=JSON.parse(await a.downloads[0].text());
  assert.equal(backup.customEssays.length,1);assert.equal(backup.customEssays[0].id,id);assert.equal(backup.essays[id].length,1);
  const restored=open();await importBackup(restored,backup);assert.equal(restored.d.querySelectorAll('[data-essay]').length,26);restored.d.querySelector('[data-essay="'+id+'"]').click();
  assert.deepEqual([...restored.d.querySelectorAll('.original')].map(p=>p.textContent),strings(labelled.paragraphs));assert.equal(restored.d.querySelectorAll('.personal-note').length,1);assert.equal(restored.d.querySelectorAll('#content img,#essay-tabs img').length,0);
  const snapshot=stored(restored.w),bad=structuredClone(backup);bad.essays[id][0].q='anchor no longer exists';await importBackup(restored,bad);
  assert.match(restored.d.querySelector('#status').textContent,/导入失败/);assert.deepEqual(stored(restored.w),snapshot);assert.equal(restored.d.querySelectorAll('[data-essay]').length,26);
  // Reimporting the same source can update translations while keeping its notes and id.
  restored.d.querySelector('#text-import-toggle').click();restored.d.querySelector('#text-import-input').value=source.replace('导入的教育者帮助学生阅读。','更新后的段落译文。');restored.d.querySelector('#text-import-save').click();
  assert.equal(restored.w.location.hash,'#'+id);assert.equal(restored.d.querySelectorAll('[data-essay]').length,26);assert.equal(restored.d.querySelectorAll('.personal-note').length,1);
  assert.equal(restored.d.querySelector('.translation').textContent,'更新后的段落译文。');
  await importBackup(restored,backup);assert.equal(restored.d.querySelector('.translation').textContent,'更新后的段落译文。');assert.equal(restored.d.querySelectorAll('.personal-note').length,1);
  // Printing must be independent of the current reading filters and hidden vocabulary.
  const built=JSON.parse(d.querySelector('#essay-data').textContent)[0];d.querySelector('[data-essay="essay-01"]').click();d.querySelector('[data-filter="syntax"]').click();
  addNote(a,'academic burden','expression','个人打印笔记 <b>literal</b>');d.querySelector('#theme').click();assert.equal(d.documentElement.dataset.theme,'dark');
  const vocab=d.querySelector('.annotation.vocab');assert(vocab);vocab.click();assert([...d.querySelectorAll('.left .note')].some(n=>!n.hidden));
  const before={content:d.querySelector('#content').innerHTML,theme:d.documentElement.dataset.theme,filter:d.querySelector('[data-filter].active').dataset.filter,translation:d.querySelector('#translate').getAttribute('aria-pressed'),source:[...d.querySelectorAll('.original')].map(p=>p.textContent)};
  w.dispatchEvent(new w.Event('beforeprint'));const print=d.querySelector('#print-view');
  assert.deepEqual([...print.querySelectorAll('.print-original')].map(p=>p.textContent),built.paragraphs);
  for(const text of built.translations)assert(print.textContent.includes(text));assert(print.textContent.includes(built.qzh));
  assert.equal(print.querySelectorAll('.print-note:not(.structure)').length,built.readerNotes.length+1);assert.equal(print.querySelectorAll('.print-note.vocab').length,built.readerNotes.filter(n=>n.c==='vocab').length);
  assert.equal(print.querySelectorAll('.print-note.structure').length,built.structure.length);assert(print.textContent.includes(built.kind));assert(print.textContent.includes('个人打印笔记 <b>literal</b>'));assert.equal(print.querySelectorAll('b').length,0);
  for(const n of built.readerNotes){assert(print.textContent.includes(n.e));assert(print.textContent.includes(n.q)||print.textContent.includes(n.t));}
  assert.equal(d.querySelector('#content').innerHTML,before.content);assert.equal(d.documentElement.dataset.theme,before.theme);assert.equal(d.querySelector('[data-filter].active').dataset.filter,before.filter);assert.equal(d.querySelector('#translate').getAttribute('aria-pressed'),before.translation);assert.deepEqual([...d.querySelectorAll('.original')].map(p=>p.textContent),before.source);
  w.dispatchEvent(new w.Event('afterprint'));assert.equal(print.childNodes.length,0);assert.equal(d.querySelector('#content').innerHTML,before.content);
  console.log('PASS: text parsing/import, bounds, deduplication, persistence, escaped selection notes, custom-article backup/restore, atomic rejection, complete PDF content and unchanged reading state.');
})().catch(err=>{console.error(err);process.exitCode=1;}).finally(()=>opened.forEach(dom=>dom.window.close()));
