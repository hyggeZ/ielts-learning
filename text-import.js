(function(root){
  'use strict';
  const LIMITS=Object.freeze({text:300000,title:120,question:12000,paragraphs:100,paragraph:20000});
  const fields={标题:'title',题目:'question',原文:'body',正文:'body',题目译文:'qzh',译文:'translations'};
  const blocks=s=>s.trim().split(/\n[\t ]*\n+/).map(p=>p.trim()).filter(Boolean);
  const emptyStructure=()=>({title:'',role:'',points:[]});
  function fail(message){throw new Error(message);}
  function validate(essay){
    if(!essay||typeof essay!=='object'||Array.isArray(essay))return false;
    if(typeof essay.title!=='string'||!essay.title.trim()||essay.title.length>LIMITS.title)return false;
    if(typeof essay.question!=='string'||!essay.question.trim()||essay.question.length>LIMITS.question)return false;
    if(typeof essay.qzh!=='string'||essay.qzh.length>LIMITS.question)return false;
    if(!Array.isArray(essay.paragraphs)||!essay.paragraphs.length||essay.paragraphs.length>LIMITS.paragraphs)return false;
    if(!essay.paragraphs.every(p=>typeof p==='string'&&p.trim()&&p.length<=LIMITS.paragraph))return false;
    if(!Array.isArray(essay.translations)||essay.translations.length!==essay.paragraphs.length||!essay.translations.every(p=>typeof p==='string'&&p.length<=LIMITS.paragraph))return false;
    if(essay.kind!==''||essay.stance!=='')return false;
    if(!Array.isArray(essay.structure)||essay.structure.length!==essay.paragraphs.length)return false;
    if(!essay.structure.every(s=>s&&s.title===''&&s.role===''&&Array.isArray(s.points)&&s.points.length===0))return false;
    // Imported articles contain source text only. Notes use the existing personal-note store.
    if(!Array.isArray(essay.readerNotes)||essay.readerNotes.length!==0)return false;
    return essay.question.length+essay.qzh.length+essay.paragraphs.join('').length+essay.translations.join('').length<=LIMITS.text;
  }
  function parse(text){
    if(typeof text!=='string'||!text.trim())fail('请粘贴题目和范文。');
    if(text.length>LIMITS.text)fail('文本过长，请控制在 30 万字以内。');
    if(text.includes('\0'))fail('文本包含无法读取的字符，请使用纯文本。');
    text=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
    const sections={};let field=null,hasLabels=false;
    for(const line of text.split('\n')){
      const match=line.match(/^\s*(?:\[([^\]]+)\]|【([^】]+)】|([^：:]+)[：:])\s*(.*)$/);
      const name=match&&(match[1]||match[2]||match[3]).trim();
      if(name&&Object.hasOwn(fields,name)){
        hasLabels=true;field=fields[name];
        if(Object.hasOwn(sections,field))fail('“'+name+'”重复了，请把同类内容放在一起。');
        sections[field]=match[4];
      }else if(field){sections[field]+='\n'+line;}
      else if(line.trim()){
        if(hasLabels)fail('请把内容放在对应的标题下面。');
        sections.before=(sections.before?sections.before+'\n':'')+line;
      }else if(sections.before){sections.before+='\n';}
    }
    let question,paragraphs;
    if(hasLabels){
      if(sections.before?.trim())fail('请把标题前的文字放入 [题目] 或 [原文]。');
      question=(sections.question||'').trim();paragraphs=blocks(sections.body||'');
      if(!question)fail('缺少题目，请在 [题目] 后填写题目。');
      if(!paragraphs.length)fail('缺少正文，请在 [原文] 后填写范文，段落之间空一行。');
    }else{
      const parts=blocks(text);
      if(parts.length<2)fail('请在题目和正文之间空一行，正文各段之间也空一行；也可以使用 [题目] 和 [原文] 标记。');
      question=parts.shift();paragraphs=parts;
    }
    if(question.length>LIMITS.question)fail('题目过长，请检查题目与正文是否正确分开。');
    if(paragraphs.length>LIMITS.paragraphs)fail('正文段落过多，最多支持 100 段。');
    if(paragraphs.some(p=>p.length>LIMITS.paragraph))fail('单段过长，请检查段落之间是否空了一行。');
    const qzh=(sections.qzh||'').trim();
    if(qzh.length>LIMITS.question)fail('题目译文过长，请检查段落标记。');
    const translated=(sections.translations||'').trim();
    const translations=translated?blocks(translated):paragraphs.map(()=>'');
    if(translations.length!==paragraphs.length)fail('译文有 '+translations.length+' 段，原文有 '+paragraphs.length+' 段，请一一对应并以空行分段。');
    if(translations.some(p=>p.length>LIMITS.paragraph))fail('单段译文过长，请检查段落之间是否空了一行。');
    const title=(sections.title||'').trim()||question.split('\n')[0].slice(0,36);
    if(title.length>LIMITS.title)fail('文章标题请控制在 120 字以内。');
    const essay={title,question,qzh,paragraphs,translations,kind:'',stance:'',structure:paragraphs.map(emptyStructure),readerNotes:[]};
    if(!validate(essay))fail('文本格式不正确，请检查题目、原文和译文。');
    return essay;
  }
  root.IeltsTextImport=Object.freeze({parse,validate,LIMITS});
})(typeof window!=='undefined'?window:globalThis);
