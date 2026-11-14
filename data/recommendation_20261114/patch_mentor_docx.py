"""Synchronize added review evidence while preserving unrelated handbook content."""
from copy import deepcopy
from hashlib import sha256
import io
import json
from pathlib import Path
import subprocess
from zipfile import ZipFile
from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor

ROOT=Path(__file__).resolve().parents[2]
TARGET=ROOT/'dist/downloads/mentor-guide.docx'
BASE=ROOT.parent/'outputs/recommendation-mentor-docx-20261114/mentor-guide.before.docx'
BEFORE_DATA=ROOT.parent/'outputs/recommendation-mentor-docx-20261114/site-data.before.json'
BASELINE_COMMIT='91d0ba8453afe53994a19c876b960be2d06923ff'
FONT='Noto Sans CJK SC'
PUBLIC='https://nishino0525nanase.github.io/nau-mpacc-guide/'


def clean(value):
    return '；'.join(map(clean,value)) if isinstance(value,list) else str(value or '')


def baseline_bytes(path, repository_path):
    if path.is_file():
        return path.read_bytes()
    return subprocess.check_output(
        ['git', 'show', BASELINE_COMMIT + ':' + repository_path], cwd=ROOT)


def main():
    original=baseline_bytes(BASE,'dist/downloads/mentor-guide.docx')
    data=json.loads((ROOT/'dist/data/site-data.json').read_text())
    old_data=json.loads(baseline_bytes(BEFORE_DATA,'dist/data/site-data.json'))
    old={r['id']:r for m in old_data['mentors'] for r in m['studentReviews']['reviews']}
    registry=data['sourceRegistry'];doc=Document(io.BytesIO(original))
    def fmt(run,size=9,bold=False,color='000000'):
        run.font.name=FONT;run.font.size=Pt(size);run.font.bold=bold;run.font.color.rgb=RGBColor.from_string(color)
        f=run._element.get_or_add_rPr().get_or_add_rFonts()
        for a in ['ascii','hAnsi','eastAsia','cs']:f.set(qn('w:'+a),FONT)
    def run(p,text,size=10,bold=False):
        r=p.add_run(text);fmt(r,size,bold);return r
    def hyperlink(p,label,url,size=9):
        h=OxmlElement('w:hyperlink');h.set(qn('r:id'),doc.part.relate_to(url,'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',is_external=True))
        r=OxmlElement('w:r');pr=OxmlElement('w:rPr');f=OxmlElement('w:rFonts')
        for a in ['ascii','hAnsi','eastAsia','cs']:f.set(qn('w:'+a),FONT)
        pr.append(f)
        for tag,v in [('sz',str(int(size*2))),('color','245A73'),('u','single')]:
            e=OxmlElement('w:'+tag);e.set(qn('w:val'),v);pr.append(e)
        r.append(pr);t=OxmlElement('w:t');t.text=label;r.append(t);h.append(r);p._p.append(h)
    def sources(p,ids):
        for code in ids:
            s=registry[code];hyperlink(p,'['+code+']',s.get('url') or s.get('canonicalUrl') or s.get('originalUrl'))
    def shots(p,items):
        for shot in items:
            run(p,'  ',9);hyperlink(p,'查看评论截图',PUBLIC+shot['src'].removeprefix('./'))
    def line(p,text,bold=False,size=10):
        p.add_run().add_break();run(p,text,size,bold)
    def review_paragraph(r,template):
        p=doc.add_paragraph();p._p.insert(0,deepcopy(template._p.pPr))
        p.paragraph_format.keep_with_next=False;p.paragraph_format.keep_together=True
        p.paragraph_format.line_spacing=Pt(17);p.paragraph_format.space_after=Pt(9)
        experience=r.get('experienceDate')
        when=('经历'+experience+'（网页'+str(r.get('postDate') or r.get('date'))+'）') if experience else str(r.get('date') or '日期未显示')
        relationship=('硕士导师'+str(r.get('mentorName') or '')) if experience else clean(r.get('relationship') or '接触未说明')
        meta=' · '.join([str(r.get('narrator') or '评论者未记录'),when,str(r.get('degree') or '未说明'),relationship])
        run(p,meta+'  来源 ',9);sources(p,r['sourceIds']);shots(p,r.get('screenshots',[]))
        if r.get('sharedCommentId'):
            line(p,'原帖明确劝退：前两个劝你别选',True)
            line(p,'同图名单前两位为董必荣、温素彬。沙雪担心事务繁忙、指导时间有限，未说明本人接触关系；原因仍是其未经核实的个人说法。')
            line(p,'边界：两份档案引用同一条评论；学位与接触关系未明。原话为明确劝退，不提高为强烈避雷。',size=9)
        else:
            line(p,r['text'])
            excerpt=(r.get('contextNotes') or {}).get('excerpt') or {}
            if excerpt.get('text'):
                label='学校报道叙述' if excerpt.get('attributionType')=='school_report_within_named_interview_section' else '原话片段'
                line(p,label+'：'+excerpt['text'])
            boundary='边界：2021年学校选编，同篇三人经历是一篇来源；没有明确选导推荐或劝退语句，不代表当前安排。'
            if r['narrator']=='姚继晴':boundary+='复试帮助来自同门余一品。'
            if r['narrator']=='周会洋':boundary+='鼓励由导师与师兄共同提供。'
            line(p,boundary,size=9)
        return p

    sections={};section=None;started=False
    for p in doc.paragraphs:
        if p.text=='学生评价与原帖语境':started=True;continue
        if p.text=='缩写与姓名对照':break
        if not started:continue
        if p.style.name=='Heading 2':section=p.text;sections[section]={'heading':p,'reviews':[]}
        elif section:sections[section]['reviews'].append(p)
    intro=next(p for p in doc.paragraphs if p.text.startswith('以下55条为可归属记录'))
    intro.runs[0].text=intro.runs[0].text.replace('以下55条','以下60条')
    added=[];image_updates=[]
    for m in data['mentors']:
        fresh=[r for r in m['studentReviews']['reviews'] if r['id'] not in old]
        section=sections.get(m['name'])
        if fresh:
            assert section
            template=section['reviews'][0]
            anchor=template._p
            if m['name']=='潘俊':
                anchor=section['reviews'][-1]._p
                for r in fresh:
                    p=review_paragraph(r,template);anchor.addnext(p._p);anchor=p._p;added.append(r['id'])
            else:
                for r in fresh:
                    p=review_paragraph(r,template);anchor.addprevious(p._p);added.append(r['id'])
        for r in m['studentReviews']['reviews']:
            if r['id'] not in old or r.get('screenshots')==old[r['id']].get('screenshots'):continue
            prior=old[r['id']];assert not prior.get('screenshots'),r['id']
            matches=[p for p in section['reviews'] if p.text.startswith(str(prior.get('narrator') or '评论者未记录')+' · '+str(prior.get('date') or '评论日期未显示'))]
            quote=(prior.get('contextNotes') or {}).get('excerpt',{}).get('text')
            if quote:matches=[p for p in matches if quote in p.text]
            else:matches=[p for p in matches if prior['text'] in p.text]
            assert len(matches)==1,(r['id'],len(matches))
            shots(matches[0],r['screenshots']);image_updates.append(r['id'])
    # Keep the directory status synchronized without touching its other fields.
    roster=doc.tables[1]
    by_name={m['name']:m for m in data['mentors']}
    for row in roster.rows[1:]:
        name=row.cells[0].text.split('\n')[0]
        if name in ['董必荣','温素彬','潘俊']:
            p=row.cells[-1].paragraphs[0];p.clear();run(p,by_name[name]['studentReviews']['coverageLabel'],9)
    refs=doc.tables[-1];codes={r.cells[0].text for r in refs.rows[1:]}
    for code in ['RGE01','RGE02']:
        if code in codes:continue
        row=refs.add_row();row._tr.get_or_add_trPr().append(OxmlElement('w:cantSplit'))
        for i,c in enumerate(row.cells):
            c.width=Inches(1.35 if i==0 else 5.85);c.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER
            p=c.paragraphs[0];p.paragraph_format.space_after=Pt(2);p.paragraph_format.space_before=Pt(2);p.paragraph_format.line_spacing=Pt(14)
        run(row.cells[0].paragraphs[0],code,9.5)
        s=registry[code];hyperlink(row.cells[1].paragraphs[0],s.get('title') or s.get('label'),s.get('url') or s.get('canonicalUrl'),9.5)
    stage=io.BytesIO();doc.save(stage);replacement={}
    with ZipFile(stage) as z:
        for n in ['word/document.xml','word/_rels/document.xml.rels']:replacement[n]=z.read(n)
    final=io.BytesIO()
    with ZipFile(io.BytesIO(original)) as z,ZipFile(final,'w') as out:
        for entry in z.infolist():out.writestr(entry,replacement.get(entry.filename,z.read(entry.filename)))
    TARGET.write_bytes(final.getvalue())
    print(json.dumps({'bytes':TARGET.stat().st_size,'sha256':sha256(TARGET.read_bytes()).hexdigest(),'addedReviewIds':added,'imageUpdates':image_updates},ensure_ascii=False))

if __name__=='__main__':main()
