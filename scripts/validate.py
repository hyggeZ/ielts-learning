from pathlib import Path
import json,re
R=Path(__file__).resolve().parents[1]
essays=json.loads((R/'content/essays.json').read_text(encoding='utf-8'))
source=json.loads((R/'content/source-pages.json').read_text(encoding='utf-8'))
assert len(essays)==25
assert len({e['id'] for e in essays})==25
categories={'vocab','syntax','link','expression'}
for i,e in enumerate(essays,1):
    assert e['id']==f'essay-{i:02}'
    assert len(e['paragraphs'])==len(e['translations'])==len(e['structure'])
    assert e['question'] and e['qzh'] and e['kind'] and e['stance']
    assert all(e['translations'])
    assert {n['c'] for n in e['readerNotes']}==categories
    for n in e['readerNotes']:assert n['q'] in e['paragraphs'][n['p']],(e['id'],n)
    raw=source[i].replace('quick-\nwitted','quick-witted').replace('well-\ninformed','well-informed').replace('problem-\nsolving','problem-solving').replace('ofjobs','of jobs')
    raw=re.sub(r'\s+\d+\s*$','',' '.join(raw.split()))
    full=' '.join(e['paragraphs'])
    assert raw[raw.index(e['paragraphs'][0]):]==full,(e['id'],'source fidelity')
    for mode in ['all','structure',*categories]:
        for p,text in enumerate(e['paragraphs']):
            ns=[n for n in e['readerNotes'] if n['p']==p and (n['c']=='vocab' or mode=='all' or n['c']==mode)]
            bounds=sorted(set([0,len(text)]+[x for n in ns for x in [text.index(n['q']),text.index(n['q'])+len(n['q'])]]))
            assert ''.join(text[a:b] for a,b in zip(bounds,bounds[1:]))==text
html=(R/'index.html').read_text(encoding='utf-8')
embedded=json.loads(re.search(r'<script id="essay-data" type="application/json">(.*?)</script>',html,re.S).group(1))
assert embedded==essays
assert not re.search(r'/\*(?:STYLE|ESSAYS|APP)\*/',html)
assert (R/'VERSION').read_text().strip()=='1.0.0'
print('PASS:',len(essays),'essays;',sum(len(e['paragraphs']) for e in essays),'paragraphs;',sum(len(e['readerNotes']) for e in essays),'anchored notes; source fidelity and filters verified.')
