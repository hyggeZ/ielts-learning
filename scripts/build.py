from pathlib import Path
import json
R=Path(__file__).resolve().parents[1]
data=json.loads((R/'content/essays.json').read_text(encoding='utf-8'))
template=(R/'index.template.html').read_text(encoding='utf-8')
html=template.replace('/*STYLE*/',(R/'style.css').read_text(encoding='utf-8')).replace('/*ESSAYS*/',json.dumps(data,ensure_ascii=False).replace('</','<\\/')).replace('/*APP*/',(R/'app.js').read_text(encoding='utf-8'))
(R/'index.html').write_text(html,encoding='utf-8')
print('Built index.html:',len(html.encode('utf-8')),'bytes,',len(data),'essays')
