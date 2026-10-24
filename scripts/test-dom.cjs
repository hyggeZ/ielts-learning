const fs=require('node:fs'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const path=require('node:path');const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
function open(seed={}){return new JSDOM(html,{runScripts:'dangerously',url:'https://hyggez.github.io/ielts-learning/',pretendToBeVisual:true,beforeParse(w){w.matchMedia=()=>({matches:false});w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};for(const [k,v] of Object.entries(seed))w.localStorage.setItem(k,v);}});}
const dom=open(),w=dom.window,d=w.document,essays=JSON.parse(d.querySelector('#essay-data').textContent);
assert.equal(d.querySelectorAll('[data-essay]').length,25);
assert.equal(d.querySelectorAll('[data-pick]').length,25);
d.querySelector('#essay-picker-toggle').click();assert(!d.querySelector('#essay-picker').hidden);
d.querySelector('[data-pick="essay-25"]').click();assert.equal(w.location.hash,'#essay-25');assert(d.querySelector('#essay-picker').hidden);
d.querySelector('#essay-picker-toggle').click();d.querySelector('#essay-picker').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert(d.querySelector('#essay-picker').hidden);
d.querySelector('#essay-picker-toggle').click();d.querySelector('main').click();assert(d.querySelector('#essay-picker').hidden);

for(const e of essays){d.querySelector(`[data-essay="${e.id}"]`).click();assert.equal(d.querySelectorAll('.original').length,e.paragraphs.length);for(const mode of ['all','structure','syntax','link','expression']){d.querySelector(`[data-filter="${mode}"]`).click();assert.deepEqual([...d.querySelectorAll('.original')].map(p=>p.textContent),e.paragraphs);assert([...d.querySelectorAll('.left .note')].every(n=>n.hidden));for(const n of d.querySelectorAll('.right [data-category]'))assert.equal(n.hidden,mode!=='all'&&n.dataset.category!==mode);}}
d.querySelector('[data-essay="essay-01"]').click();d.querySelector('[data-filter="all"]').click();
d.querySelector('#translate').click();assert([...d.querySelectorAll('.trans')].every(e=>!e.hidden));d.querySelector('#translate').click();assert([...d.querySelectorAll('.trans')].every(e=>e.hidden));
d.querySelector('#theme').click();assert.equal(d.documentElement.dataset.theme,'dark');d.querySelector('#theme').click();assert.equal(d.documentElement.dataset.theme,'light');
const vocab=d.querySelector('.annotation.vocab');vocab.click();assert([...d.querySelectorAll('.left .note')].some(n=>!n.hidden));vocab.click();assert([...d.querySelectorAll('.left .note')].every(n=>n.hidden));
// Select a real text fragment, open inline editor, require a category, and persist safely.
const para=d.querySelector('.original'),text=para.querySelector('.annotation').firstChild,range=d.createRange();range.setStart(text,0);range.setEnd(text,Math.min(5,text.length));const quote=range.toString();w.getSelection().addRange(range);para.dispatchEvent(new w.MouseEvent('mouseup',{bubbles:true}));
assert(d.querySelector('.note-editor'));d.querySelector('.save-note').click();assert.equal(d.querySelector('.save-state').textContent,'请选择标签');
d.querySelector('.note-editor select').value='vocab';d.querySelector('.note-editor textarea').value='<img src=x onerror=alert(1)>\n我的解释';d.querySelector('.save-note').click();assert(!d.querySelector('.note-editor'));
assert.equal(d.querySelector('.personal-note strong').textContent,quote);assert.equal(d.querySelectorAll('.personal-note img').length,0);assert(!d.querySelector('.personal-note .anchor'));
const saved=w.localStorage.getItem('ielts-essay-01-personal-notes-v1');assert(saved);d.querySelector('[data-essay="essay-02"]').click();assert.equal(d.querySelectorAll('.personal-note').length,0);d.querySelector('[data-essay="essay-01"]').click();assert.equal(d.querySelectorAll('.personal-note').length,1);
const second=open({'ielts-essay-01-personal-notes-v1':saved,'ielts-theme':'dark'});assert.equal(second.window.document.querySelectorAll('.personal-note').length,1);assert.equal(second.window.document.documentElement.dataset.theme,'dark');second.window.document.querySelector('[data-delete]').click();assert.equal(second.window.document.querySelectorAll('.personal-note').length,0);
dom.window.close();second.window.close();console.log('PASS: 25 essays × 5 filters, full-text fidelity, translation, themes, vocab toggles, selection notes, validation, escaping, persistence, isolation and deletion.');
