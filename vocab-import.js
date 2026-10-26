(function(root){
  'use strict';
  const MAX_TEXT=3000000,MAX_ROWS=10000,MAX_FILE=5*1024*1024;
  const names={word:['word','headword','term','单词','词汇','词条','词'],aliases:['aliases','alias','变形','词形','别名'],pos:['pos','partofspeech','part of speech','词性'],meaning:['meaning','meanings','definition','definitions','translation','释义','词义','解释','中文','意思'],phrases:['phrases','phrase','collocations','搭配','短语','词组','词组搭配','相关短语'],examples:['examples','example','sentences','例句','例子'],raw:['raw','notes','note','备注','笔记','其他']};
  const clean=v=>String(v??'').trim();
  const key=v=>clean(v).normalize('NFKC').toLowerCase().replace(/[ _-]/g,'');
  const column=v=>Object.keys(names).find(k=>names[k].some(n=>key(n)===key(v)));
  const valueText=v=>v&&typeof v==='object'?JSON.stringify(v):clean(v);
  const lines=v=>Array.isArray(v)?v.map(valueText).filter(Boolean):valueText(v).split(/\r?\n|\s*[；;]\s*/).map(clean).filter(Boolean);
  const fail=m=>{throw Error(m);};
  function stamp(entry,label){
    const word=clean(entry.word);if(!word)fail('有一条记录缺少单词。');
    if(word.length>160)fail('单词或短语过长，请检查列是否对应。');
    return {word,aliases:lines(entry.aliases),pos:Array.isArray(entry.pos)?lines(entry.pos).join('\n'):valueText(entry.pos),meaning:Array.isArray(entry.meaning)?lines(entry.meaning).join('\n'):valueText(entry.meaning),phrases:lines(entry.phrases),examples:lines(entry.examples),raw:valueText(entry.raw),sourceLabel:clean(entry.sourceLabel)||label||'文本导入',...(entry.sourceId?{sourceId:clean(entry.sourceId)}:{}),...(entry.quote?{quote:clean(entry.quote)}:{})};
  }
  function finish(entries,label){if(!entries.length)fail('没有读到单词。');if(entries.length>MAX_ROWS)fail('一次最多导入 10000 条记录，请拆分文件。');return entries.map(e=>stamp(e,label));}
  function fromObjects(rows,label){
    return finish(rows.map((row,i)=>{
      if(typeof row==='string')return {word:row};
      if(!row||typeof row!=='object'||Array.isArray(row))fail('第 '+(i+1)+' 条记录格式不正确。');
      const result={},extras=[];
      for(const [k,v] of Object.entries(row)){const field=column(k);if(field)result[field]=Array.isArray(v)?v:typeof v==='object'&&v!==null?JSON.stringify(v):v;else if(!['sourceId','sourceLabel','quote'].includes(k)&&v!==null&&v!=='')extras.push(k+'：'+(typeof v==='object'?JSON.stringify(v):String(v)));}
      if(extras.length)result.raw=[clean(result.raw),...extras].filter(Boolean).join('\n');
      for(const k of ['sourceId','sourceLabel','quote'])if(typeof row[k]==='string')result[k]=row[k];
      return result;
    }),label);
  }
  function delimited(text,separator){
    const rows=[];let row=[],cell='',quoted=false,atStart=true;
    for(let i=0;i<text.length;i++){
      const c=text[i];
      if(quoted){if(c==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(c==='"')quoted=false;else cell+=c;continue;}
      if(c==='"'&&atStart){quoted=true;atStart=false;continue;}
      if(c===separator){row.push(cell);cell='';atStart=true;}
      else if(c==='\n'){row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell='';atStart=true;}
      else {cell+=c;atStart=false;}
    }
    if(quoted)fail('表格中有未闭合的双引号，请检查文件。');
    row.push(cell);if(row.some(v=>v.trim()))rows.push(row);
    return rows;
  }
  function fromRows(rows,label){
    if(rows.length>MAX_ROWS+1)fail('一次最多导入 10000 条记录，请拆分文件。');
    const first=rows[0]||[],fields=first.map(column),hasHeader=fields.includes('word');
    const body=hasHeader?rows.slice(1):rows;
    return finish(body.filter(r=>r.some(v=>clean(v))).map(row=>{
      if(!hasHeader)return {word:row[0],meaning:row[1],pos:row[2],phrases:row[3],examples:row[4],raw:row.slice(5).map(clean).filter(Boolean).join('\n')};
      const entry={},extras=[];
      row.forEach((v,i)=>{if(fields[i]){const f=fields[i];entry[f]=[entry[f],clean(v)].filter(Boolean).join('\n');}else if(clean(v))extras.push((clean(first[i])||'其他')+'：'+clean(v));});
      entry.raw=[entry.raw,...extras].filter(Boolean).join('\n');return entry;
    }),label);
  }
  function parseText(text,{sourceLabel='文本导入',separator}={}){
    if(typeof text!=='string'||!text.trim())fail('请粘贴单词表。');
    if(text.length>MAX_TEXT)fail('文本过长，请拆分后导入。');
    text=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
    if(text.includes('\0'))fail('文件不是可读取的纯文本。');
    if(/^\s*[\[{]/.test(text)){
      let data;try{data=JSON.parse(text);}catch(e){fail('JSON 格式不正确。');}
      if(data?.format==='ielts-vocabulary')fail('这是词库备份，请使用“恢复备份”。');
      const rows=Array.isArray(data)?data:data?.words||data?.entries;
      if(!Array.isArray(rows))fail('JSON 需要是单词数组，或包含 words / entries 数组。');
      return fromObjects(rows,sourceLabel);
    }
    const first=text.split('\n')[0];
    const sep=separator||(first.includes('\t')?'\t':first.includes(',')?',':null);
    if(sep)return fromRows(delimited(text,sep),sourceLabel);
    const rows=text.split('\n').map(clean).filter(Boolean).map(line=>{
      const m=line.match(/^(.+?)(?:\s+[—–]\s+|\s*[:：]\s*|\s{2,}|\s+(?=(?:n|v|vt|vi|adj|adv|prep|conj|pron|phr)\.\s))(.+)$/i);
      if(m){const part=m[2].match(/^((?:n|v|vt|vi|adj|adv|prep|conj|pron|phr)\.)\s*(.*)$/i);return {word:m[1],pos:part?part[1]:'',meaning:part?part[2]:m[2]};}
      const mixed=line.match(/^([A-Za-z][A-Za-z\s'’.-]*?)\s*([\u3400-\u9fff].*)$/);if(mixed)return {word:mixed[1],meaning:mixed[2]};
      return {word:line};
    });
    return finish(rows,sourceLabel);
  }
  function xml(bytes){
    const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    if(/<!DOCTYPE|<!ENTITY/i.test(text))fail('不支持含外部实体的 Excel 文件。');
    const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.getElementsByTagName('parsererror').length)fail('Excel 表格内容损坏。');return doc;
  }
  const elements=(node,name)=>[...node.getElementsByTagName('*')].filter(e=>e.localName===name);
  const richText=node=>elements(node,'t').filter(e=>{for(let p=e.parentElement;p&&p!==node;p=p.parentElement)if(p.localName==='rPh')return false;return true;}).map(e=>e.textContent).join('');
  function parseXlsx(buffer,label){
    if(!root.fflate?.unzipSync)fail('Excel 读取模块未加载。');
    let total=0,files;
    try{files=root.fflate.unzipSync(new Uint8Array(buffer),{filter:f=>{if(!/^xl\/(?:workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(f.name))return false;total+=f.originalSize;if(total>20*1024*1024||f.originalSize>12*1024*1024)fail('Excel 解压后的内容过大，请改用 CSV。');return true;}});}catch(err){fail(err.message.includes('过大')?err.message:'无法读取 Excel，请使用 .xlsx 或另存为 CSV。');}
    let sheet;
    if(files['xl/workbook.xml']&&files['xl/_rels/workbook.xml.rels']){
      const first=elements(xml(files['xl/workbook.xml']),'sheet')[0];const rid=first?.getAttribute('r:id');
      const relationship=elements(xml(files['xl/_rels/workbook.xml.rels']),'Relationship').find(r=>r.getAttribute('Id')===rid);
      const target=relationship?.getAttribute('Target')||'';
      if(relationship?.getAttribute('TargetMode')==='External')fail('不支持外部 Excel 工作表。');
      const path=target.startsWith('/')?target.slice(1):'xl/'+target;
      if(/^xl\/worksheets\/[^/]+\.xml$/.test(path))sheet=files[path];
    }
    if(!sheet)fail('没有找到第一张工作表，请另存为标准 .xlsx 或 CSV。');
    const shared=files['xl/sharedStrings.xml']?elements(xml(files['xl/sharedStrings.xml']),'si').map(richText):[];
    const rows=elements(xml(sheet),'row').filter(r=>elements(r,'c').length);
    if(rows.length>MAX_ROWS+1)fail('一次最多导入 10000 条记录，请拆分文件。');
    const values=rows.map(r=>{
      const result=[];let previous=-1;
      for(const cell of elements(r,'c')){
        const ref=cell.getAttribute('r')||'',letters=ref.match(/^[A-Z]+/i)?.[0];let index=previous+1;
        if(letters){index=0;for(const ch of letters.toUpperCase())index=index*26+ch.charCodeAt(0)-64;index--;}
        if(index>1000)fail('表格列数过多，请仅保留单词相关列。');previous=index;
        const type=cell.getAttribute('t'),value=elements(cell,'v')[0]?.textContent||'';
        if(type==='s'){const si=Number(value);if(!Number.isInteger(si)||si<0||si>=shared.length)fail('Excel 文本索引损坏。');result[index]=shared[si];}
        else if(type==='inlineStr')result[index]=richText(cell);
        else result[index]=value;
      }
      return Array.from({length:result.length},(_,i)=>result[i]||'');
    });
    return fromRows(values,label);
  }
  async function parseFile(file){
    if(!file||file.size>MAX_FILE)fail('文件超过 5 MB，请拆分后导入。');
    const label=file.name||'文件导入',ext=label.split('.').pop().toLowerCase();
    if(ext==='xlsx')return parseXlsx(await file.arrayBuffer(),label);
    if(ext==='xls')fail('请把旧版 .xls 另存为 .xlsx 或 CSV。');
    const text=await file.text();if(text.includes('\uFFFD'))fail('请把文本文件另存为 UTF-8 编码。');
    return parseText(text,{sourceLabel:label,separator:ext==='tsv'?'\t':ext==='csv'?',':undefined});
  }
  root.IeltsVocabImport=Object.freeze({parseText,parseFile});
})(typeof window!=='undefined'?window:globalThis);
