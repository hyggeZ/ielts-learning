"""Essay-specific close-reading additions; exact anchors, no generated filler."""
from pathlib import Path
import json
R=Path(__file__).resolve().parents[1]
def enrich(essays):
    for file in sorted((R/'content').glob('close-reading-*.txt')):
        for line in file.read_text(encoding='utf-8').splitlines():
            if not line.strip() or line.startswith('#'):continue
            number,p,c,q,t,e=line.split('|',5)
            essay=essays[int(number)-1];p=int(p)
            assert c in {'vocab','syntax','link','expression'}
            assert q in essay['paragraphs'][p],(number,p,q)
            notes=essay['readerNotes']
            assert not any(n['p']==p and n['c']==c and n['q']==q for n in notes),(number,'duplicate',q)
            notes.append(dict(p=p,c=c,q=q,t=t,e=e))
    for essay in essays:
        essay['readerNotes'].sort(key=lambda n:(n['p'],essay['paragraphs'][n['p']].index(n['q']),n['c']))
    return essays
if __name__=='__main__':
    raise SystemExit('Run scripts/author.py to rebuild source data, then build.py.')
