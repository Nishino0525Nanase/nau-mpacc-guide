"""Refresh the downloadable mentor handbook from the public site dataset.

Run with CODEX_PRIMARY_RUNTIME_PYTHON. Render and inspect before publication.
"""
from __future__ import annotations

import json
import re
from hashlib import sha256
from pathlib import Path
from urllib.parse import urlsplit
import io
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.opc.constants import RELATIONSHIP_TYPE as RT
from docx.shared import Inches, Pt, RGBColor

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'dist/downloads/mentor-guide.docx'
DATA = ROOT / 'dist/data/site-data.json'
QA = ROOT / 'data/download_refresh_20261113'
BASE_URL = 'https://nishino0525nanase.github.io/nau-mpacc-guide/'
FONT = 'Noto Sans CJK SC'


def text(value):
    if value is None:
        return ''
    if isinstance(value, list):
        return '；'.join(text(v) for v in value if v is not None)
    if isinstance(value, dict):
        return text(value.get('text') or value.get('label') or value.get('summary') or '')
    return str(value)


def clean(value):
    return text(value).replace('*未公开', '未公开').replace('。；', '。').replace('；；', '；').replace('。。', '。')


def main():
    data = json.loads(DATA.read_text())
    registry = data['sourceRegistry']
    mentors = data['mentors']
    by_id = {m['id']: m for m in mentors}
    doc = Document(TARGET)
    for element in list(doc.element.body):
        if element.tag != qn('w:sectPr'):
            doc.element.body.remove(element)
    sec = doc.sections[0]
    sec.page_width, sec.page_height = Inches(8.5), Inches(11)
    sec.top_margin = sec.bottom_margin = Inches(.62)
    sec.left_margin = sec.right_margin = Inches(.65)
    sec.header_distance = sec.footer_distance = Inches(.26)
    for p in sec.header.paragraphs:
        p.clear()
    for p in sec.footer.paragraphs:
        p.clear()
    foot = sec.footer.paragraphs[0]
    foot.alignment = 2
    f = OxmlElement('w:fldSimple'); f.set(qn('w:instr'), 'PAGE'); foot._p.append(f)
    for name in ['Normal', 'Title', 'Subtitle', 'Heading 1', 'Heading 2', 'Heading 3']:
        style = doc.styles[name]
        style.font.name = FONT
        style.font.color.rgb = RGBColor(0, 0, 0)
        fonts = style.element.get_or_add_rPr().get_or_add_rFonts()
        for attr in ['ascii', 'hAnsi', 'eastAsia', 'cs']:
            fonts.set(qn('w:' + attr), FONT)
        style.paragraph_format.line_spacing = Pt(16.5)
        for border in style.element.xpath('.//w:pBdr'):
            border.getparent().remove(border)
    doc.styles['Normal'].font.size = Pt(10.5)
    doc.core_properties.title = '南京审计大学 MPAcc 导师选择参考'
    doc.core_properties.author = '胡雨诺'
    doc.core_properties.subject = '导师研究方向 学生评价与公开去向'
    used_codes = set()
    link_count = 0

    def style_run(run, size=10.5, bold=False, color='000000'):
        run.font.name, run.font.size, run.font.bold = FONT, Pt(size), bold
        run.font.color.rgb = RGBColor.from_string(color)
        fonts = run._element.get_or_add_rPr().get_or_add_rFonts()
        for attr in ['ascii', 'hAnsi', 'eastAsia', 'cs']:
            fonts.set(qn('w:' + attr), FONT)

    def link(p, label, url, size=10):
        nonlocal link_count
        parsed = urlsplit(url or '')
        if parsed.scheme not in ['http', 'https', 'mailto']:
            style_run(p.add_run(label), size)
            return
        h = OxmlElement('w:hyperlink')
        h.set(qn('r:id'), doc.part.relate_to(url, RT.HYPERLINK, is_external=True))
        r = OxmlElement('w:r'); props = OxmlElement('w:rPr')
        font = OxmlElement('w:rFonts')
        for attr in ['ascii', 'hAnsi', 'eastAsia', 'cs']:
            font.set(qn('w:' + attr), FONT)
        props.append(font)
        color = OxmlElement('w:color'); color.set(qn('w:val'), '245A73'); props.append(color)
        sz = OxmlElement('w:sz'); sz.set(qn('w:val'), str(int(size * 2))); props.append(sz)
        u = OxmlElement('w:u'); u.set(qn('w:val'), 'single'); props.append(u)
        r.append(props); t = OxmlElement('w:t'); t.text = label; r.append(t)
        h.append(r); p._p.append(h); link_count += 1

    def codes_of(bracket):
        out = []
        for value in re.split(r'[、,，\s]+', bracket):
            m = re.fullmatch(r'([A-Z]*)(\d+)[—–-]([A-Z]*)(\d+)', value)
            if m and m[1] == m[3] and int(m[4]) - int(m[2]) < 20:
                out.extend(m[1] + str(n).zfill(len(m[2])) for n in range(int(m[2]), int(m[4]) + 1))
            else:
                out.append(value)
        return out

    def inline(p, value, size=10.5, bold=False):
        value = clean(value)
        pos = 0
        for match in re.finditer(r'\[([^\[\]]+)\]', value):
            codes = codes_of(match[1])
            if not codes or not all(code in registry for code in codes):
                continue
            style_run(p.add_run(value[pos:match.start()]), size, bold)
            for code in codes:
                s = registry[code]
                link(p, '[' + code + ']', s.get('url') or s.get('canonicalUrl') or s.get('originalUrl'), size)
                used_codes.add(code)
            pos = match.end()
        style_run(p.add_run(value[pos:]), size, bold)

    def para(value='', size=10.5, bold=False, style='Normal', after=5, before=0, keep=False):
        p = doc.add_paragraph(style=style)
        fmt = p.paragraph_format
        fmt.space_before, fmt.space_after = Pt(before), Pt(after)
        fmt.line_spacing = Pt(max(14.5, size * 1.5))
        fmt.keep_with_next = keep
        fmt.widow_control = True
        snap = OxmlElement('w:snapToGrid'); snap.set(qn('w:val'), '0'); p._p.get_or_add_pPr().append(snap)
        inline(p, value, size, bold)
        return p

    def heading(value, level=1, page=False):
        p = para(value, 16 if level == 1 else 12.5, True, 'Heading ' + str(level), after=7, before=10, keep=True)
        p.paragraph_format.page_break_before = False
        return p

    def source_line(codes, caption='来源'):
        codes = list(dict.fromkeys(c for c in codes if c in registry))
        if not codes:
            return
        para(caption + ' ' + ''.join('[' + c + ']' for c in codes), size=9, after=6)

    def table(headers, rows, widths, size=9.5):
        t = doc.add_table(rows=1, cols=len(headers))
        t.autofit = False
        t.style = 'Table Grid'
        for i, w in enumerate(widths):
            t.columns[i].width = Inches(w)
        borders = OxmlElement('w:tblBorders')
        for edge in ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']:
            e = OxmlElement('w:' + edge); e.set(qn('w:val'), 'single'); e.set(qn('w:sz'), '4'); e.set(qn('w:color'), 'D9D9D9'); borders.append(e)
        t._tbl.tblPr.append(borders)
        margins = OxmlElement('w:tblCellMar')
        for edge in ['top', 'left', 'bottom', 'right']:
            m = OxmlElement('w:' + edge); m.set(qn('w:w'), '75' if edge in ['top', 'bottom'] else '90'); m.set(qn('w:type'), 'dxa'); margins.append(m)
        t._tbl.tblPr.append(margins)
        def fill(row, values, header=False, number=0):
            row._tr.get_or_add_trPr().append(OxmlElement('w:cantSplit'))
            for i, value in enumerate(values):
                c = row.cells[i]; c.width = Inches(widths[i]); c.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
                p = c.paragraphs[0]; p.paragraph_format.space_after = Pt(2); p.paragraph_format.space_before = Pt(2); p.paragraph_format.line_spacing = Pt(14)
                snap = OxmlElement('w:snapToGrid'); snap.set(qn('w:val'), '0'); p._p.get_or_add_pPr().append(snap)
                if isinstance(value, tuple):
                    link(p, clean(value[0]), value[1], size)
                else:
                    inline(p, value, size, header)
                shade = OxmlElement('w:shd'); shade.set(qn('w:fill'), '284F63' if header else ('F4F7F8' if number % 2 else 'FFFFFF')); c._tc.get_or_add_tcPr().append(shade)
                if header:
                    for r in p.runs:
                        r.font.color.rgb = RGBColor(255, 255, 255)
        fill(t.rows[0], headers, True)
        repeat = OxmlElement('w:tblHeader'); t.rows[0]._tr.get_or_add_trPr().append(repeat)
        for i, values in enumerate(rows):
            fill(t.add_row(), values, number=i)
        para('', after=3, size=3)
        return t

    para('南京审计大学 MPAcc 导师选择参考', size=22, style='Title', after=10)
    para('研究方向 学生评价 公开去向 联系方式', size=12, style='Subtitle', after=12)
    para('先用名录确定研究方向，再看具体指导经历和学生去向，最后联系导师与近年直系学生。34位导师按官方名单原序排列；17张详细卡片用于比较公开研究背景，不构成排名。')
    para('本科课堂印象、朋友转述、身份不明的提名与MPAcc指导亲历分别标注。公开去向是有时间范围的个案，不能据此计算导师就业率或承诺读博、实习与就业。名额及双选安排以当年学院通知和导师回复为准。', size=10)
    p = para('在线查看图片与筛选资料 ', size=10)
    link(p, '打开南审手记', BASE_URL + '#mentors')
    para('内容导航  培养方向  34人名录  17张详细卡片  学生评价  缩写对照  学生公开去向  联系准备', size=10, after=12)

    heading('培养方向与选导分类')
    for b in data['mentorGuideSections'][0]['blocks']:
        if b['type'] == 'table':
            table(b['headers'], b['rows'], [1.55, 1, 4.65])
        elif b['type'] == 'p':
            para(b['text'])

    heading('34位导师名录', page=True)
    para('姓名可点击打开官方教师页。职称与导师资格分别看；当前名录不代表当年每位老师均有招生名额。反馈栏只显示材料类型，具体评价见后文。', size=10)
    rows = []
    for m in mentors:
        rows.append([(m['name'] + '\n' + '／'.join(m['directions']), m['profileUrl']), m['title'], m['research'], m['email'], m['studentReviews']['coverageLabel']])
    table(['导师及分类', '职称', '研究内容', '公开邮箱', '学生材料'], rows, [.78, .55, 2.75, 1.45, 1.67], size=9)

    heading('17位导师详细资料', page=True)
    para('研究方向、案例和论文记录来自公开资料；日常指导与学生相处另看评价。', size=10)
    for card in data['mentorCards']:
        mentor = by_id[card['mentorId']]
        heading(card['name'], 2)
        para(card['reason'], size=10)
        fields = [(f['label'], f['value']) for f in card['profileFields'] if f['label'] not in ['姓名', '备注']]
        table(['事项', '公开信息'], fields, [1.35, 5.85], size=10)
        p = para('教师与资料入口 ', size=9)
        for i, item in enumerate(card['links']):
            if i:
                style_run(p.add_run('  '), 9)
            link(p, item['label'], item['url'], 9)
        source_line(card.get('sourceCodes', []))

    heading('学生评价与原帖语境', page=True)
    para('以下44条为可归属记录，包含笼统提名、课程接触、转述和指导自述，不是44名MPAcc直系学生。同一评论者的跟评合并；学校精选访谈有选择偏差。', size=10)
    for m in mentors:
        reviews = m['studentReviews']['reviews']
        if not reviews:
            continue
        heading(m['name'], 2)
        for r in reviews:
            review_start = len(doc.paragraphs)
            relationship = clean(r.get('relationship') or '接触关系未说明')
            meta = ' · '.join(str(v) for v in [r.get('narrator') or '评论者未记录', r.get('date') or '评论日期未显示', r.get('degree') or '学位未说明', relationship] if v)
            para(meta, size=9, after=3, keep=True)
            note = r.get('contextNotes')
            if note:
                kind = note['excerpt']['kind']
                label = '原话片段' if kind == 'visible_quote' else '此前摘记用词' if kind == 'recorded_quote' else '已存摘要'
                para(label + '：' + note['excerpt']['text'], after=3)
                para('上下文：' + clean(note['context']), size=10, after=3)
                para('可能含义：' + note['interpretation']['text'] + ' ' + clean(note['interpretation'].get('alternative')), size=10, after=3)
                para('边界：' + clean(note['limits']), size=9, after=4)
            else:
                para(r['text'], after=3)
                if r['experienceType'] == 'general':
                    boundaries = ['此条只有提名或总体印象，不推定MPAcc日常指导方式、实习安排或毕业要求。']
                elif r['experienceType'] == 'course':
                    boundaries = ['只反映记录中的课程接触，不外推为MPAcc论文指导体验。']
                elif r['experienceType'] == 'interview':
                    boundaries = ['精选访谈有选择性，只反映本人该时点的经历；不代表全组体验或当前安排。']
                else:
                    boundaries = ['仅记录中的个人经历；学位、接触关系和时点以本条自述为限，不代表全组或当前安排。']
                if r.get('firsthand') is False:
                    boundaries.insert(0, '涉及指导体验的部分为转述，未作为本人亲历。')
                scopes = r.get('hearsayParts', [])
                if scopes:
                    para('转述部分：' + clean(scopes), size=9, after=3)
                if boundaries:
                    para('边界：' + '；'.join(boundaries), size=9, after=4)
            p = para('来源 ', size=9, after=8)
            codes = [c for c in r['sourceIds'] if c in registry]
            if codes:
                inline(p, ''.join('[' + c + ']' for c in codes), 9)
            elif r.get('sourceUrl'):
                link(p, '查看原文', r['sourceUrl'], 9)
            for shot in r.get('screenshots', []):
                style_run(p.add_run('  '), 9)
                link(p, '查看评论截图', BASE_URL + shot['src'].removeprefix('./'), 9)
            group = doc.paragraphs[review_start:]
            first = group[0]
            first.add_run('  ')
            source_paragraph = group[-1]
            for child in list(source_paragraph._p):
                if child.tag != qn('w:pPr'):
                    first._p.append(child)
            source_paragraph._p.getparent().remove(source_paragraph._p)
            for following in group[1:-1]:
                first.add_run().add_break()
                for child in list(following._p):
                    if child.tag != qn('w:pPr'):
                        first._p.append(child)
                following._p.getparent().remove(following._p)
            first.paragraph_format.keep_with_next = False
            first.paragraph_format.keep_together = True
            first.paragraph_format.line_spacing = Pt(17)
            first.paragraph_format.space_after = Pt(9)

    heading('缩写与姓名对照', page=True)
    para('姓名对应与评价内容分别判断。缩写能对应到人，不代表评论者是其直系学生，也不能由一句态度词补出具体经历。以下列原帖出现过的写法及有歧义的常用缩写。', size=10)
    aliases = [a for a in data['mentorAliases'] if a.get('observedInComment') or a['status'] == 'ambiguous']
    rows = [(a['alias'], '／'.join(by_id[mid]['name'] for mid in a['mentorIds']), a['basis'] + (' ' + ''.join('[' + c + ']' for c in a['sourceIds']) if a['sourceIds'] else '')) for a in aliases]
    table(['原帖写法', '姓名或候选', '判断范围'], rows, [1, 1.8, 4.4], size=10)
    para('单文涛的规范姓名缩写采用SWT；DWT仅为历史检索变体。许汉y所在句是提问，不算评价。WY同时对应王烨、王禹；LH对应李华、凌华、李慧，须结合上下文。 [AM-SWT-PINYIN]', size=10)

    heading('学校公开的学生去向', page=True)
    records = data['studentOutcomes']['records']
    para('共28条时间点记录，涉及27人；其中明确MPAcc的为6人7条。袁璐的读博与博士毕业后任教分开记录。同名不拼接，导师未公开的保留为空；不是导师名下全体毕业生名单。', size=10)
    for title, group in [('明确MPAcc的个案', [r for r in records if r['degree'] == 'MPAcc']), ('其他或未注明学位的个案', [r for r in records if r['degree'] != 'MPAcc'])]:
        heading(title, 2)
        rows = []
        for r in group:
            o = r['outcome']
            when = o.get('asOf') or '资料未列日期'
            status = o.get('statusLabel') or ''
            degree = r['degreeLabel']
            outcome = o['organization'] + ('\n' + o['program'] if o.get('program') else '')
            time_scope = status + '\n资料日期 ' + str(when) + '\n' + ''.join('[' + c + ']' for c in r['sourceIds'] if c in registry)
            rows.append([r['studentName'] + '\n' + degree, r.get('mentorName') or '未公开', outcome, time_scope])
        table(['学生及学位', '导师', '公开去向', '状态与来源时点'], rows, [1.4, .75, 1.9, 3.15], size=9.5)
    para('未注明学位的考博名单不能归入MPAcc。朱安琪只确认报道时与华为签约；审计署相关个案按2026年7月报道的“将入职”记载，不改写为已入职或当前任职。公开去向不构成导师就业保荐或录取承诺。', size=10)
    for stat in data['studentOutcomes']['statistics']:
        para(stat['cohort'] + ' ' + stat['label'] + ' ' + str(stat['value']) + '人。' + clean(stat['limits']), size=10)
        source_line(stat['sourceIds'])
    para('2023年报告中的就业率和分类表存在相互冲突的文字，本稿不选择其中一个数字作为统一就业率。', size=10)

    heading('联系导师前要问清的事', page=True)
    para('先确定研究兴趣、可投入时间和实习计划，挑选两三位方向相近的老师。邮件写清姓名、本科学校专业、拟入学身份、具体兴趣与一项真实成果，附件用简短PDF简历。不要编造论文、项目或导师承诺。')
    table(['想了解的问题', '可向导师或直系学生询问的事实'], [
        ('日常指导', '主要由谁指导；组会大致频率；初稿通常怎样反馈；遇到选题或数据困难怎样处理。'),
        ('任务与实习', '论文、课程、竞赛的节点；竞赛参与是否自愿；实习出勤与返校要求；冲突时怎样协调。'),
        ('名额与双选', '本年度是否招生、可联系的时间、是否有统一双选流程；未收到回复时的后续联系安排。'),
        ('培养与去向', '近年直系学生实际做过什么课题、使用什么方法、如何准备求职或读博；不要只问“轻不轻松”。')
    ], [1.3, 5.9], size=10.5)
    p = para('需要继续查资料时 ', size=10)
    link(p, '打开在线导师与学生去向', BASE_URL + '#outcomes', 10)

    heading('引用来源入口', page=True)
    para('正文编号均可直接点击。教师页已在名录与卡片单独链接；下表列引用过的原帖、官方报道及资料。原帖图片只证明画面中可见内容，未展开的回复不补猜测。', size=10)
    rows = []
    for code in sorted(used_codes, key=lambda c: (not c.isdigit(), c)):
        s = registry[code]
        title = s.get('title') or s.get('label') or code
        rows.append([code, (title, s.get('url') or s.get('canonicalUrl') or s.get('originalUrl'))])
    table(['编号', '点击打开来源'], rows, [1, 6.2], size=9.5)
    doc.save(TARGET)
    payload = io.BytesIO()
    with ZipFile(TARGET) as source_zip, ZipFile(payload, 'w', ZIP_DEFLATED) as target_zip:
        for name in sorted(source_zip.namelist()):
            entry = ZipInfo(name, (1980, 1, 1, 0, 0, 0))
            entry.compress_type = ZIP_DEFLATED
            target_zip.writestr(entry, source_zip.read(name))
    TARGET.write_bytes(payload.getvalue())
    QA.mkdir(exist_ok=True)
    report = {'file':'dist/downloads/mentor-guide.docx', 'bytes':TARGET.stat().st_size, 'sha256':sha256(TARGET.read_bytes()).hexdigest(), 'mentors':len(mentors), 'detailedCards':len(data['mentorCards']), 'reviewRecords':sum(len(m['studentReviews']['reviews']) for m in mentors), 'contextNotes':sum('contextNotes' in r for m in mentors for r in m['studentReviews']['reviews']), 'outcomeTimepointRecords':len(records), 'outcomePeople':len({r['studentName'] for r in records}), 'observedOrAmbiguousAliases':len(aliases), 'hyperlinkElements':link_count, 'referencedSourceCodes':len(used_codes), 'datasetSha256':sha256(DATA.read_bytes()).hexdigest()}
    with ZipFile(TARGET) as z:
        xml = z.read('word/document.xml').decode()
        assert xml.count('<w:hyperlink ') == link_count
        assert '私人后台' not in xml and '未重新取得' not in xml
        assert '<w:tblHeader' in xml
    (QA/'mentor-docx-build.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(report,ensure_ascii=False))


if __name__ == '__main__':
    main()
