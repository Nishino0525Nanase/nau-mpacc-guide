"""Refresh the downloadable life guide from the site's concise, sourced content."""
from __future__ import annotations
import hashlib,json,re
from datetime import datetime,timezone
from pathlib import Path
from urllib.parse import urlsplit
from zipfile import ZipFile,ZipInfo,ZIP_DEFLATED
from io import BytesIO
from docx import Document
from docx.shared import Inches,Pt,RGBColor
from docx.enum.table import WD_TABLE_ALIGNMENT,WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.opc.constants import RELATIONSHIP_TYPE as RT

ROOT=Path(__file__).resolve().parents[1]
TARGET=ROOT/'dist/downloads/life-guide.docx'
QA=ROOT/'data/download_refresh_20261113'
SITE='https://nishino0525nanase.github.io/nau-mpacc-guide/'
FONT='Noto Sans CJK SC'
LINKS=[]
CODES=set()


def txt(value):
    if value is None:return ''
    if isinstance(value,list):return '；'.join(txt(v) for v in value if txt(v))
    if isinstance(value,dict):return value.get('text') or value.get('label') or value.get('summary') or ''
    return str(value)


def safe(url):
    try:
        p=urlsplit(url)
        return isinstance(url,str) and p.scheme in ('http','https') and bool(p.netloc) and not p.username and not p.password
    except (ValueError,TypeError):return False


def fmt_run(run,size=11,bold=False,color='000000'):
    run.font.name=FONT;run.font.size=Pt(size);run.font.bold=bold;run.font.color.rgb=RGBColor.from_string(color)
    f=run._element.get_or_add_rPr().get_or_add_rFonts()
    for a in ('ascii','hAnsi','eastAsia','cs'):f.set(qn('w:'+a),FONT)


def link(doc,p,label,url,size=10.5):
    if not safe(url):
        fmt_run(p.add_run(label),size);return
    h=OxmlElement('w:hyperlink');h.set(qn('r:id'),doc.part.relate_to(url,RT.HYPERLINK,is_external=True))
    r=OxmlElement('w:r');pr=OxmlElement('w:rPr')
    f=OxmlElement('w:rFonts')
    for a in ('ascii','hAnsi','eastAsia','cs'):f.set(qn('w:'+a),FONT)
    pr.append(f)
    for tag,val in [('color','24546A'),('sz',str(round(size*2))),('u','single')]:
        n=OxmlElement('w:'+tag);n.set(qn('w:val'),val);pr.append(n)
    r.append(pr);t=OxmlElement('w:t');t.text=label;r.append(t);h.append(r);p._p.append(h)
    LINKS.append({'label':label,'url':url})


def inline(doc,p,value,registry,size=11,bold=False):
    value=txt(value).replace('。；','。').replace('？；','？').replace('。。','。')
    pos=0
    for m in re.finditer(r'\[([A-Za-z0-9-]+)\]',value):
        fmt_run(p.add_run(value[pos:m.start()]),size,bold)
        code=m.group(1);s=registry.get(code,{})
        url=s.get('url') or s.get('canonicalUrl') or s.get('originalUrl')
        if safe(url):link(doc,p,m.group(0),url,size);CODES.add(code)
        else:fmt_run(p.add_run(m.group(0)),size,bold)
        pos=m.end()
    fmt_run(p.add_run(value[pos:]),size,bold)


def paragraph(doc,value='',registry=None,size=11,bold=False,style=None):
    p=doc.add_paragraph(style=style)
    pf=p.paragraph_format;pf.space_after=Pt(5);pf.space_before=Pt(0);pf.line_spacing=Pt(16.5);pf.widow_control=True
    snap=OxmlElement('w:snapToGrid');snap.set(qn('w:val'),'0');p._p.get_or_add_pPr().append(snap)
    inline(doc,p,value,registry or {},size,bold)
    return p


def heading(doc,value,level=1,page=False):
    value=re.sub(r'[、，,:：·/（）()|｜;；]+',' ',value).strip()
    p=paragraph(doc,value,size=16 if level==1 else 12.5,bold=True,style='Heading '+str(level))
    p.paragraph_format.space_before=Pt(11 if level==1 else 7);p.paragraph_format.space_after=Pt(6);p.paragraph_format.keep_with_next=True
    if page:p.paragraph_format.page_break_before=True
    return p


def cell_content(doc,cell,value,registry,header=False):
    cell.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER
    p=cell.paragraphs[0];p.paragraph_format.space_after=Pt(3);p.paragraph_format.space_before=Pt(3);p.paragraph_format.line_spacing=Pt(14.5)
    inline(doc,p,value,registry,10.5,header)
    tcPr=cell._tc.get_or_add_tcPr()
    mar=OxmlElement('w:tcMar')
    for tag,val in [('top','65'),('left','90'),('bottom','65'),('right','90')]:
        e=OxmlElement('w:'+tag);e.set(qn('w:w'),val);e.set(qn('w:type'),'dxa');mar.append(e)
    tcPr.append(mar)
    return p


def table(doc,headers,rows,registry,widths=None):
    t=doc.add_table(rows=1,cols=len(headers));t.alignment=WD_TABLE_ALIGNMENT.CENTER;t.autofit=False
    widths=widths or ([2.1,5.0] if len(headers)==2 else [7.1/len(headers)]*len(headers))
    for c,w in zip(t.columns,widths):c.width=Inches(w)
    for c,w in zip(t.rows[0].cells,widths):c.width=Inches(w)
    borders=OxmlElement('w:tblBorders')
    for n in ('top','left','bottom','right','insideH','insideV'):
        e=OxmlElement('w:'+n);e.set(qn('w:val'),'single');e.set(qn('w:sz'),'4');e.set(qn('w:color'),'D9D9D9');borders.append(e)
    t._tbl.tblPr.append(borders)
    repeat=OxmlElement('w:tblHeader');t.rows[0]._tr.get_or_add_trPr().append(repeat)
    t.rows[0]._tr.get_or_add_trPr().append(OxmlElement('w:cantSplit'))
    for c,v in zip(t.rows[0].cells,headers):
        cell_content(doc,c,v,registry,True);sh=OxmlElement('w:shd');sh.set(qn('w:fill'),'E8EDF1');c._tc.get_or_add_tcPr().append(sh)
    for row in rows:
        rr=t.add_row();rr._tr.get_or_add_trPr().append(OxmlElement('w:cantSplit'))
        for c,w,v in zip(rr.cells,widths,row):c.width=Inches(w);cell_content(doc,c,v,registry)
    paragraph(doc,'',size=3).paragraph_format.space_after=Pt(0)
    return t


def append_resource(doc,firm,r,registry):
    kinds={'internship_program':'实习项目','job_listing':'岗位记录','channel':'长期入口','historical':'历史资料','graduate_recruitment':'毕业生正式校招','preparation_program':'校园准备项目','organization_reference':'机构参考'}
    heading(doc,r['title'],2)
    paragraph(doc,kinds.get(r['kind'],r['kind'])+'；'+r['statusLabel']+'。'+txt(r.get('statusDetail')),registry,10.5)
    if r.get('eligibility'):paragraph(doc,'对象：'+txt(r['eligibility']),registry,10.5)
    fields=[]
    for k,label in [('applicationWindow','申请窗口'),('period','实习实施期'),('deadline','申请截止')]:
        if r.get(k):fields.append(label+'：'+txt(r[k]))
    if fields:paragraph(doc,'；'.join(fields)+'。',registry,10.5)
    if r.get('attendance') or r.get('duration'):
        paragraph(doc,'每周出勤：'+(txt(r.get('attendance')) or '未公布')+'；连续周期：'+(txt(r.get('duration')) or '未公布')+'。',registry,10.5)
    if r.get('cityTags'):paragraph(doc,'公告城市：'+'、'.join(r['cityTags'])+'。'+txt(r.get('geographyNote')),registry,10.5)
    elif r['kind'] not in ('channel','organization_reference') and r.get('geographyNote'):paragraph(doc,txt(r['geographyNote']),registry,10.5)
    if r.get('limits'):paragraph(doc,txt(r['limits']),registry,10)
    doc.paragraphs[-1].paragraph_format.keep_with_next=True
    p=paragraph(doc,'',registry,10.5);link(doc,p,'查看原文或官方入口',r['url'])
    codes=r.get('sourceIds',[])
    if codes:inline(doc,p,'  '+''.join('['+c+']' for c in codes),registry,10)


def main():
    data=json.loads((ROOT/'dist/data/site-data.json').read_text());registry=data['sourceRegistry']
    doc=Document();sec=doc.sections[0]
    sec.page_width=Inches(8.5);sec.page_height=Inches(11)
    sec.top_margin=sec.bottom_margin=sec.left_margin=sec.right_margin=Inches(.7)
    for style,size in [('Normal',11),('Title',23),('Subtitle',12),('Heading 1',16),('Heading 2',12.5),('Heading 3',11)]:
        st=doc.styles[style];st.font.name=FONT;st.font.size=Pt(size);st.font.color.rgb=RGBColor(0,0,0)
        f=st.element.get_or_add_rPr().get_or_add_rFonts()
        for a in ('ascii','hAnsi','eastAsia','cs'):f.set(qn('w:'+a),FONT)
        pp=st.element.get_or_add_pPr()
        for b in list(pp.findall(qn('w:pBdr'))):pp.remove(b)
    doc.core_properties.title='南京审计大学MPAcc学习生活攻略';doc.core_properties.author='';doc.core_properties.subject='入学准备 校园生活 实习资源'
    doc.core_properties.created=doc.core_properties.modified=datetime(2026,11,13,tzinfo=timezone.utc)
    paragraph(doc,'南京审计大学MPAcc学习生活攻略',size=23,style='Title')
    paragraph(doc,'入学准备 住宿日常 课程实践与实习资源',size=12,style='Subtitle')
    paragraph(doc,'',size=10.5)
    paragraph(doc,'来浦口读会计专硕，先确认本人校区和宿舍，再安排床品、行程与预算；课程、论文和实践按本级通知衔接。这里把常用事项按16章列出，正文编号可直接打开出处。',registry)
    paragraph(doc,'宿舍、店铺、交通和资助都保留资料年份或适用对象。学生生活帖用于了解具体经历，不能代替当届分房、收费或培养通知。',registry)
    p=paragraph(doc,'');link(doc,p,'打开网页版指南',SITE+'#life');fmt_run(p.add_run('  '),10.5);link(doc,p,'查看原帖与访谈索引',SITE+'#posts')
    heading(doc,'阅读目录')
    for i in range(0,len(data['lifeChapters']),2):
        row=data['lifeChapters'][i:i+2]
        p=paragraph(doc,'',registry,10.5);p.paragraph_format.tab_stops.add_tab_stop(Inches(3.6))
        for j,c in enumerate(row):
            if j:fmt_run(p.add_run('\t'),10.5)
            inline(doc,p,re.sub(r'[、，]',' ',c['title']),registry,10.5)
    heading(doc,'入学清单')
    for phase in data['studentStart']['phases']:
        paragraph(doc,phase['label']+'：'+'；'.join(t['title']+'：'+t['text'].rstrip('。；') for t in phase['tasks']),registry,10.5)
    for c in data['lifeChapters']:
        heading(doc,c['title'],1)
        blocks=[b for b in c['blocks'] if b['type'] not in ('details','source')]
        if c['id']=='life-12':
            paragraph(doc,'正文中的来源编号都可点击。原帖作者、日期和评论语境，可在原帖索引继续查看；完整资料登记见配套Excel。',registry)
            for label,url in [('原帖与访谈索引',SITE+'#posts'),('宿舍与用品照片',SITE+'#life/life-03'),('校园与地图资料',SITE+'#life/life-16'),('资料下载',SITE+'#downloads')]:
                p=paragraph(doc,'');link(doc,p,label,url)
            continue
        for b in blocks:
            if b['type']=='p':paragraph(doc,b['text'],registry)
            elif b['type']=='table':table(doc,b['headers'],b['rows'],registry)
            elif b['type']=='heading':heading(doc,b['text'],2)
            elif b['type']=='list':
                for item in b['items']:paragraph(doc,'• '+txt(item),registry)
        if c['id'] in ('life-03','life-16'):
            p=paragraph(doc,'');link(doc,p,'查看本章照片与原始来源',SITE+'#life/'+c['id'])
    heading(doc,'四大 国内所与企业实习资源',1,page=True)
    paragraph(doc,'下面按机构列出53条项目、岗位与查询入口。项目期、申请窗口、明确截止日分开看；未公布的日期不按月末补算。长期入口、历史岗位和毕业生正式校招分别标注，均不等于当前有空缺。',registry)
    paragraph(doc,'办公室地址不等于客户现场。投递前核对学籍、毕业年月、每周出勤、连续周期、实际地点和返校安排；实践认定须问本级学院。',registry)
    groups=[('big_four','四大'),('domestic','国内事务所'),('enterprise','企业财务与业务岗位')]
    count=0
    for group,label in groups:
        heading(doc,label,1)
        for firm in data['internships']['firms']:
            if firm['group']!=group:continue
            heading(doc,firm['name'],1)
            for r in firm['resources']:append_resource(doc,firm,r,registry);count+=1
    heading(doc,'投递和接受实习前')
    for label,body in [('简历','写清真实学籍、预计毕业时间、可到岗日期、每周时间和连续周期。用真实课程、项目或实习经历说明本人做了什么，不把CPA科目数当作所有岗位的统一门槛。'),('接受前','核对实习协议、薪资计算与发放、差旅和住宿承担、客户现场、请假、单位鉴定及盖章材料。留用机会另有考核和毕业年份要求，不视为录用承诺。')]:paragraph(doc,label+'：'+body,registry)
    p=paragraph(doc,'');link(doc,p,'继续查看网页实习筛选',SITE+'#life/life-09')
    temp=BytesIO();doc.save(temp)
    with ZipFile(BytesIO(temp.getvalue())) as z,ZipFile(TARGET,'w',ZIP_DEFLATED) as out:
        for name in z.namelist():
            info=ZipInfo(name,date_time=(2026,11,13,0,0,0));info.compress_type=ZIP_DEFLATED;out.writestr(info,z.read(name))
    QA.mkdir(exist_ok=True)
    report={'file':'dist/downloads/life-guide.docx','chapterCount':len(data['lifeChapters']),'firmCount':len(data['internships']['firms']),'resourceCount':count,'hyperlinkOccurrences':len(LINKS),'uniqueHyperlinks':len({x['url'] for x in LINKS}),'sourceCodes':sorted(CODES),'bytes':TARGET.stat().st_size,'sha256':hashlib.sha256(TARGET.read_bytes()).hexdigest(),'links':LINKS,'rendered':False}
    (QA/'life-docx-content.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k not in ('links','sourceCodes')},ensure_ascii=False))

if __name__=='__main__':main()
