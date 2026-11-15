"""Patch four saved review evidence updates onto the approved handbook."""
from copy import deepcopy
from hashlib import sha256
import io
import json
from pathlib import Path
import subprocess
from zipfile import ZipFile
from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt, RGBColor

ROOT=Path(__file__).resolve().parents[2]
TARGET=ROOT/'dist/downloads/mentor-guide.docx'
BASE=ROOT.parent/'outputs/mentor-signals-word-20261115/mentor-guide.before.docx'
BEFORE_DATA=ROOT.parent/'outputs/mentor-signals-word-20261115/site-data.before.json'
BASELINE_COMMIT='b7bd55d2975ff33dcb0d321adb4a4137d3bebd1b'
BASELINE_SHA='c3f5aa53bf418f043796c79d9ae18962680fee86e3c6143f62bfd411daf1007b'
FONT='Noto Sans CJK SC'
PUBLIC='https://nishino0525nanase.github.io/nau-mpacc-guide/'
SIGNALS=['sr-alias-comments-20261113-tzd','sr-alias-comments-20261113-zl']
QUOTE='sr-e63702f4d750b2'
IMAGE='sr-4c04a46901e7aa'


def baseline_bytes(path,repository_path):
    if path.is_file():return path.read_bytes()
    return subprocess.check_output(['git','show',BASELINE_COMMIT+':'+repository_path],cwd=ROOT)


def clean(value):
    text='；'.join(map(clean,value)) if isinstance(value,list) else str(value or '')
    return text.replace('。；','。').replace('；；','；')


def main():
    original=baseline_bytes(BASE,'dist/downloads/mentor-guide.docx');assert sha256(original).hexdigest()==BASELINE_SHA
    before=json.loads(baseline_bytes(BEFORE_DATA,'dist/data/site-data.json'))
    data=json.loads((ROOT/'dist/data/site-data.json').read_text());registry=data['sourceRegistry']
    old={r['id']:(m,r) for m in before['mentors'] for r in m['studentReviews']['reviews']}
    current={r['id']:(m,r) for m in data['mentors'] for r in m['studentReviews']['reviews']}
    assert len(old)==len(current)==60
    changed=[key for key,(_,r) in current.items() if r!=old[key][1]]
    assert set(changed)==set(SIGNALS+[QUOTE,IMAGE]),changed
    doc=Document(io.BytesIO(original))
    def fmt(run,size=9,bold=False):
        run.font.name=FONT;run.font.size=Pt(size);run.font.bold=bold;run.font.color.rgb=RGBColor(0,0,0)
        f=run._element.get_or_add_rPr().get_or_add_rFonts()
        for a in ['ascii','hAnsi','eastAsia','cs']:f.set(qn('w:'+a),FONT)
    def run(p,text,size=10,bold=False):
        r=p.add_run(text);fmt(r,size,bold);return r
    def link_element(label,url,size=9):
        h=OxmlElement('w:hyperlink');h.set(qn('r:id'),doc.part.relate_to(url,'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',is_external=True))
        r=OxmlElement('w:r');pr=OxmlElement('w:rPr');f=OxmlElement('w:rFonts')
        for a in ['ascii','hAnsi','eastAsia','cs']:f.set(qn('w:'+a),FONT)
        pr.append(f)
        for tag,val in [('sz',str(int(size*2))),('color','245A73'),('u','single')]:
            e=OxmlElement('w:'+tag);e.set(qn('w:val'),val);pr.append(e)
        r.append(pr);t=OxmlElement('w:t');t.text=label;r.append(t);h.append(r);return h
    def sources(p,ids):
        for code in ids:
            s=registry[code];p._p.append(link_element('['+code+']',s.get('url') or s.get('canonicalUrl') or s.get('originalUrl')))
    def screenshots(p,items):
        for shot in items:
            run(p,'  ',9);p._p.append(link_element('查看评论截图',PUBLIC+shot['src'].removeprefix('./')))
    def line(p,text,size=10.5,bold=False):
        p.add_run().add_break();run(p,text,size,bold)
    sections={};name=None;started=False
    for p in doc.paragraphs:
        if p.text=='学生评价与原帖语境':started=True;continue
        if p.text=='缩写与姓名对照':break
        if not started:continue
        if p.style.name=='Heading 2':name=p.text;sections[name]=[]
        elif name:sections[name].append(p)
    def find(review_id):
        mentor,r=old[review_id];prefix=str(r['narrator'])+' · '+str(r['date'])
        matches=[p for p in sections[mentor['name']] if p.text.startswith(prefix)]
        quote=(r.get('contextNotes') or {}).get('excerpt',{}).get('text')
        if quote:matches=[p for p in matches if quote in p.text]
        else:matches=[p for p in matches if r['text'] in p.text]
        assert len(matches)==1,(review_id,len(matches));return matches[0]
    for review_id in SIGNALS:
        p=find(review_id);r=current[review_id][1]
        assert r['selectionSignal']['intensity']=='explicit' and r['selectionSignal']['direction']=='recommend'
        assert r['sharedCommentId']==old[review_id][1]['sharedCommentId']
        quote=(r.get('contextNotes') or {}).get('excerpt',{}).get('text')
        matches=[x for x in p.runs if x.text=='原话片段：'+quote];assert len(matches)==1
        matches[0].text='原帖明确推荐  '+matches[0].text;fmt(matches[0],10.5,True)
    # Rebuild only the amended conditional quote; keep its uncertainty explicit.
    oldp=find(QUOTE);r=current[QUOTE][1];p=doc.add_paragraph();p._p.insert(0,deepcopy(oldp._p.pPr))
    p.paragraph_format.keep_together=True;p.paragraph_format.keep_with_next=False
    meta=' · '.join(str(v) for v in [r.get('narrator'),r.get('date'),r.get('degree'),r.get('relationship')] if v)
    run(p,meta+'  来源 ',9);sources(p,r['sourceIds']);screenshots(p,r.get('screenshots',[]))
    note=r['contextNotes'];line(p,'原话片段：'+note['excerpt']['text'])
    line(p,'上下文：'+clean(note.get('context')))
    interpretation=note.get('interpretation') or {}
    line(p,'可能含义：'+str(interpretation.get('text') or '')+' '+str(interpretation.get('alternative') or ''))
    line(p,'边界：'+clean(note.get('limits')),9)
    oldp._p.addprevious(p._p);oldp._p.getparent().remove(oldp._p)
    assert not r.get('selectionSignal')
    # Attach the course comment image next to its existing source, before the body.
    p=find(IMAGE);r=current[IMAGE][1];assert not old[IMAGE][1].get('screenshots') and not r.get('selectionSignal')
    insert=next(i for i,c in enumerate(p._p) if c.xpath('.//w:br'))
    for shot in r.get('screenshots',[]):
        space=OxmlElement('w:r');t=OxmlElement('w:t');t.set(qn('xml:space'),'preserve');t.text='  ';space.append(t)
        p._p.insert(insert,space);insert+=1
        p._p.insert(insert,link_element('查看评论截图',PUBLIC+shot['src'].removeprefix('./')));insert+=1
    stage=io.BytesIO();doc.save(stage)
    with ZipFile(stage) as z:replacement={n:z.read(n) for n in ['word/document.xml','word/_rels/document.xml.rels']}
    final=io.BytesIO()
    with ZipFile(io.BytesIO(original)) as z,ZipFile(final,'w') as out:
        for e in z.infolist():out.writestr(e,replacement.get(e.filename,z.read(e.filename)))
    TARGET.write_bytes(final.getvalue())
    print(json.dumps({'bytes':TARGET.stat().st_size,'sha256':sha256(TARGET.read_bytes()).hexdigest(),'reviewUpdates':changed,'reviewCount':len(current)},ensure_ascii=False))

if __name__=='__main__':main()
