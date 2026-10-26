from pathlib import Path
import json
R=Path(__file__).resolve().parents[1]
data=json.loads((R/'content/essays.json').read_text(encoding='utf-8'))
template=(R/'index.template.html').read_text(encoding='utf-8')
html=template.replace('/*STYLE*/',(R/'style.css').read_text(encoding='utf-8')).replace('/*ESSAYS*/',json.dumps(data,ensure_ascii=False).replace('</','<\\/')).replace('/*IMPORT*/',(R/'text-import.js').read_text(encoding='utf-8')).replace('/*VOCAB_STORE*/',(R/'vocab-store.js').read_text(encoding='utf-8')).replace('/*ESSAY_VOCAB*/',(R/'essay-vocab.js').read_text(encoding='utf-8')).replace('/*APP*/',(R/'app.js').read_text(encoding='utf-8'))
(R/'index.html').write_text(html,encoding='utf-8')
print('Built index.html:',len(html.encode('utf-8')),'bytes,',len(data),'essays')

word_html=(R/'words.template.html').read_text(encoding='utf-8')
for marker,file in [('WORD_STYLE','words.css'),('VOCAB_STORE','vocab-store.js'),('VOCAB_IMPORT','vocab-import.js'),('VOCAB_DECK','vocab-deck.js'),('WORD_APP','words.js'),('XLSX_ZIP','node_modules/fflate/umd/index.js')]:
    source=(R/file).read_text(encoding='utf-8')
    if marker=='XLSX_ZIP':
        source='/*! fflate 0.8.2\n'+(R/'node_modules/fflate/LICENSE').read_text(encoding='utf-8')+'\n*/\n'+source
    word_html=word_html.replace('/*'+marker+'*/',source.replace('</script','<\\/script'))
(R/'words.html').write_text(word_html,encoding='utf-8')
print('Built words.html:',len(word_html.encode('utf-8')),'bytes')
