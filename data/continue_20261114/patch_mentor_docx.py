"""Insert current public achievements and aggregate firm context without rebuilding prior pages."""
from copy import deepcopy
from hashlib import sha256
import io
import json
from pathlib import Path
from zipfile import ZipFile
from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor

ROOT=Path(__file__).resolve().parents[2]
TARGET=ROOT/'dist/downloads/mentor-guide.docx'
DATA=ROOT/'dist/data/site-data.json'
FONT='Noto Sans CJK SC'


def main():
    original=TARGET.read_bytes()
    data=json.loads(DATA.read_text()); registry=data['sourceRegistry']
    doc=Document(io.BytesIO(original))
    assert not any(p.text=='培养成果与指导对应' for p in doc.paragraphs), 'Continuation already applied.'
    def fmt(run,size=10,bold=False,color='000000'):
        run.font.name=FONT;run.font.size=Pt(size);run.font.bold=bold;run.font.color.rgb=RGBColor.from_string(color)
        f=run._element.get_or_add_rPr().get_or_add_rFonts()
        for attr in ['ascii','hAnsi','eastAsia','cs']:f.set(qn('w:'+attr),FONT)
    def para(text='',size=10,bold=False,style='Normal',after=5,keep=False):
        p=doc.add_paragraph(style=style);p.paragraph_format.space_after=Pt(after);p.paragraph_format.space_before=Pt(0)
        p.paragraph_format.line_spacing=Pt(size*1.5);p.paragraph_format.keep_with_next=keep;p.paragraph_format.widow_control=True
        fmt(p.add_run(text),size,bold);return p
    def source_link(p,code,size=9,label=None):
        s=registry[code];url=s.get('url') or s.get('canonicalUrl')
        h=OxmlElement('w:hyperlink');h.set(qn('r:id'),doc.part.relate_to(url,'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',is_external=True))
        r=OxmlElement('w:r');props=OxmlElement('w:rPr');font=OxmlElement('w:rFonts')
        for attr in ['ascii','hAnsi','eastAsia','cs']:font.set(qn('w:'+attr),FONT)
        props.append(font)
        for tag,value in [('sz',str(int(size*2))),('color','245A73'),('u','single')]:
            el=OxmlElement('w:'+tag);el.set(qn('w:val'),value);props.append(el)
        r.append(props);t=OxmlElement('w:t');t.text=label or '['+code+']';r.append(t);h.append(r);p._p.append(h)
    def move_before(anchor,elements):
        for el in elements:anchor.addprevious(el)

    heading=next(p for p in doc.paragraphs if p.text=='学校公开的事务所雇主举例')
    heading.runs[0].text='学校公开的事务所资料'
    anchor=next(p for p in doc.paragraphs if p.text=='其他明确MPAcc的个案')
    emp=next(r for r in data['studentOutcomes']['employerSummaries'] if r['id']=='CO01-ACCA-BIG4-2022-2025')
    ep=[para(emp['label']+'  '+emp['date'],10.5,True,after=4,keep=True),para(emp['text'],10,after=4),para('范围 '+emp['scope'],9,after=4),para('来源 ',9,after=6)]
    source_link(ep[-1],'CO01');move_before(anchor._p,[p._p for p in ep])

    anchor=next(p for p in doc.paragraphs if p.text=='联系导师前要问清的事')
    h=para('培养成果与指导对应',16,True,'Heading 1',after=8,keep=True);h.paragraph_format.page_break_before=False
    note=para('论文获奖与案例竞赛分开看。以下成果可核对指导关系，不计入毕业去向或学生评价人数；赛事指导不等于学位论文导师。',10,after=8,keep=True)
    table=doc.add_table(rows=1,cols=3);table.autofit=False;table.style='Table Grid'
    widths=[1.55,1.4,4.25]
    for i,w in enumerate(widths):table.columns[i].width=Inches(w)
    borders=OxmlElement('w:tblBorders')
    for edge in ['top','left','bottom','right','insideH','insideV']:
        e=OxmlElement('w:'+edge);e.set(qn('w:val'),'single');e.set(qn('w:sz'),'4');e.set(qn('w:color'),'D9D9D9');borders.append(e)
    table._tbl.tblPr.append(borders)
    margins=OxmlElement('w:tblCellMar')
    for edge in ['top','left','bottom','right']:
        e=OxmlElement('w:'+edge);e.set(qn('w:w'),'85');e.set(qn('w:type'),'dxa');margins.append(e)
    table._tbl.tblPr.append(margins)
    def fill(row,values,header=False,index=0):
        row._tr.get_or_add_trPr().append(OxmlElement('w:cantSplit'))
        for i,val in enumerate(values):
            c=row.cells[i];c.width=Inches(widths[i]);c.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER
            p=c.paragraphs[0];p.paragraph_format.space_before=Pt(1);p.paragraph_format.space_after=Pt(2);p.paragraph_format.line_spacing=Pt(14.5)
            p.paragraph_format.keep_with_next=header
            fmt(p.add_run(val),10,header,'FFFFFF' if header else '000000')
            sh=OxmlElement('w:shd');sh.set(qn('w:fill'),'284F63' if header else ('F4F7F8' if index%2 else 'FFFFFF'));c._tc.get_or_add_tcPr().append(sh)
    fill(table.rows[0],['学生或团队','指导关系','公开成果与来源'],True)
    table.rows[0]._tr.get_or_add_trPr().append(OxmlElement('w:tblHeader'))
    achievements=data['studentOutcomes']['achievements']
    for index,item in enumerate(achievements):
        competition=item.get('relationshipType')=='competition_guidance'
        relation=('赛事指导' if competition else '论文导师')+'\n'+'、'.join([item['mentorName']]+item.get('coMentors',[]))
        row=table.add_row();fill(row,[item['studentName'],relation,item['achievement']['text']],index=index)
        p=row.cells[2].add_paragraph();p.paragraph_format.space_after=Pt(2)
        for code in item['achievement']['sourceIds']:source_link(p,code)
    after=para('共同指导的论文保留两位指导老师；团队成果按一项展示。获奖年份不作为毕业年份，未公开的就业单位和届别不补猜测。',9,after=6)
    move_before(anchor._p,[h._p,note._p,table._tbl,after._p])
    anchor.paragraph_format.page_break_before=False
    intro = next(p for p in doc.paragraphs if p.text.startswith('先确定研究兴趣、可投入时间和实习计划'))
    intro.paragraph_format.keep_with_next=True
    references=doc.tables[-2] if doc.tables[-1] is table else doc.tables[-1]
    existing_codes={row.cells[0].text for row in references.rows[1:]}
    for code in ['A403','CO01','MOB01']:
        if code in existing_codes:continue
        row=references.add_row();row._tr.get_or_add_trPr().append(OxmlElement('w:cantSplit'))
        for i,c in enumerate(row.cells):
            c.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER
            c.width=Inches(1.35 if i==0 else 5.85)
            p=c.paragraphs[0];p.paragraph_format.space_after=Pt(2);p.paragraph_format.space_before=Pt(2);p.paragraph_format.line_spacing=Pt(14)
        fmt(row.cells[0].paragraphs[0].add_run(code),9.5)
        source_link(row.cells[1].paragraphs[0],code,9.5,registry[code].get('title') or registry[code].get('label') or code)
    stage=io.BytesIO();doc.save(stage)
    replacement={}
    with ZipFile(stage) as z:
        for name in ['word/document.xml','word/_rels/document.xml.rels']:replacement[name]=z.read(name)
    final=io.BytesIO()
    with ZipFile(io.BytesIO(original)) as z,ZipFile(final,'w') as out:
        for entry in z.infolist():out.writestr(entry,replacement.get(entry.filename,z.read(entry.filename)))
    TARGET.write_bytes(final.getvalue())
    print(json.dumps({'bytes':TARGET.stat().st_size,'sha256':sha256(TARGET.read_bytes()).hexdigest(),'achievements':len(achievements),'newAggregate':'CO01','changedParts':list(replacement)},ensure_ascii=False))

if __name__=='__main__':main()
