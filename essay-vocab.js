(function(root){
  'use strict';
  const normal=s=>String(s||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
  const plain=s=>String(s||'').replace(/\b(?:adj|adv|n|v|vt|vi|prep|conj|pron|phr)\./gi,'').trim();
  function hash(text){let a=2166136261,b=5381;for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);a=Math.imul(a^c,16777619);b=Math.imul(b,33)^c;}return (a>>>0).toString(36)+(b>>>0).toString(36);}
  function sourceId(essay,n){return 'essay:'+essay.id+':'+n.p+':'+(n.start??essay.paragraphs[n.p].indexOf(n.q))+':'+hash(JSON.stringify(n.libraryWordId?[n.q,normal(n.libraryWord),'library']:[n.q,n.e,n.personal?'personal':'analysis']));}
  function isCollected(rows,id){return rows.some(w=>w.contents.some(c=>c.sources.some(s=>s.id===id&&s.collected)));}
  function candidates(n){
    if(n.libraryWord)return [n.libraryWord];
    const title=plain(n.personal?n.q:n.t),candidate=/[\u3400-\u9fff]/.test(title)?n.q:title;
    return [...new Set(candidate.split(/\s*\/\s*/).map(s=>s.trim()).filter(Boolean))];
  }
  function entries(essay,n,words=candidates(n)){
    const pos=(n.t||'').match(/\b(?:adj|adv|n|v|vt|vi|prep|conj|pron|phr)\./i)?.[0]||'';
    return words.map(word=>({word,pos:n.libraryWordId?'':pos,meaning:n.libraryWordId?'':n.e,aliases:words.length===1&&/^[A-Za-z][A-Za-z'’-]*$/.test(n.q)&&normal(word)!==normal(n.q)?[n.q]:[],phrases:[],examples:[essay.paragraphs[n.p]],raw:'',sourceId:sourceId(essay,n),sourceLabel:essay.title+' · 第'+(n.p+1)+'段',quote:n.q}));
  }
  function describe(word){return word.contents.map(c=>[c.pos,c.meaning,c.phrases.length?'短语：'+c.phrases.join('；'):'',c.examples.length?'例句：'+c.examples.join('\n'):'',c.raw].filter(Boolean).join('\n')).filter(Boolean).join('\n\n');}
  function occurrences(text,term){
    const tokens=String(term).trim().split(/\s+/);if(!tokens.length||!tokens[0])return [];
    const expression=tokens.map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('\\s+');
    let re;try{re=new RegExp(expression,'giu');}catch(e){return [];}
    const result=[];let m;const lexical=c=>c&&/[\p{L}\p{N}_]/u.test(c);
    while((m=re.exec(text))){const before=text.slice(0,m.index),after=text.slice(m.index+m[0].length);const previous=Array.from(before).pop(),next=Array.from(after)[0];
      if(!(lexical(m[0][0])&&lexical(previous))&&!(lexical(m[0].at(-1))&&lexical(next)))result.push({start:m.index,q:m[0]});
    }
    return result;
  }
  function forgottenNotes(essay,existing,rows){
    const result=[];
    for(const word of rows.filter(w=>w.forgotten))for(let p=0;p<essay.paragraphs.length;p++){
      const text=essay.paragraphs[p],found=new Map();
      for(const term of [word.word,...word.aliases])for(const hit of occurrences(text,term)){
        if(existing.some(n=>n.c==='vocab'&&n.p===p&&(n.start??text.indexOf(n.q))===hit.start&&normal(n.q)===normal(hit.q)))continue;
        found.set(hit.start+':'+hit.q.length,hit);
      }
      const ranges=[...found.values()].sort((a,b)=>a.start-b.start);
      if(ranges.length)result.push({p,c:'vocab',q:ranges[0].q,start:ranges[0].start,ranges,t:word.word,e:describe(word)||'尚未添加释义。',libraryWordId:word.id,libraryWord:word.word});
    }
    return result;
  }
  root.IeltsEssayVocab=Object.freeze({sourceId,isCollected,candidates,entries,forgottenNotes,occurrences});
})(typeof window!=='undefined'?window:globalThis);
