#!/usr/bin/env python3
"""Append a bounded internship supplement while preserving the original DOCX.

Use the bundled primary Python runtime. Authoring writes a review candidate;
--replace-reviewed is a separate final step after rendering every new page.
"""
from __future__ import annotations

import argparse
from copy import deepcopy
from hashlib import sha256
import io
import json
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.opc.constants import RELATIONSHIP_TYPE as RT
from docx.shared import Pt, RGBColor
from lxml import etree as E

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT.parent / 'outputs/nau-intern-downloads-104'
SOURCE = ROOT / 'dist/downloads/life-guide.docx'
EXPECTED = 'd71c47217ec478ce5219688c747bc1da6506292223a479728f6feb26df554aaf'
W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
P = 'http://schemas.openxmlformats.org/package/2006/relationships'
KIND = {'internship_program':'实习项目', 'job_listing':'岗位列表线索', 'channel':'长期入口',
        'historical':'历史公告', 'graduate_recruitment':'毕业生正式招聘', 'preparation_program':'校园准备项目'}


def text(value):
    if value is None:
        return ''
    if isinstance(value, list):
        return '；'.join(text(item) for item in value if item is not None)
    if isinstance(value, dict):
        return value.get('text') or value.get('summary') or value.get('label') or ''
    return str(value)


def unique(items):
    return list(dict.fromkeys(item for item in items if item))


def hub_digest(hub):
    return sha256(json.dumps(hub, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def build():
    original = SOURCE.read_bytes()
    assert sha256(original).hexdigest() == EXPECTED, 'Original life guide changed'
    data = json.loads((ROOT / 'dist/data/site-data.json').read_text())
    hub = data['internships']
    assert len(hub['firms']) == 12
    registry = data['sourceRegistry']
    doc = Document(io.BytesIO(original))
    old_body_count = len(doc.element.body) - 1
    written_codes = set()
    added_hyperlinks = []

    def run_style(run, size=11, bold=False, color='000000'):
        run.font.name = 'Noto Sans CJK SC'
        run.font.size = Pt(size)
        run.font.bold = bold
        run.font.color.rgb = RGBColor.from_string(color)
        fonts = run._element.get_or_add_rPr().get_or_add_rFonts()
        for name in ('ascii', 'hAnsi', 'eastAsia', 'cs'):
            fonts.set(qn('w:' + name), 'Noto Sans CJK SC')

    def para(value='', style='Normal', size=11, bold=False, before=0, after=6, page=False):
        value = value.replace('。；', '。').replace('？；', '？').replace('。。', '。')
        p = doc.add_paragraph(style=style)
        fmt = p.paragraph_format
        fmt.space_before, fmt.space_after = Pt(before), Pt(after)
        # The retained document uses a Chinese line grid. A multiple setting
        # can round small body lines up to two grid pitches in LibreOffice.
        fmt.line_spacing = Pt(16.5 if size <= 11 else size * 1.35)
        snap = OxmlElement('w:snapToGrid');snap.set(qn('w:val'), '0')
        p._p.get_or_add_pPr().append(snap)
        fmt.widow_control = True
        if page:
            fmt.page_break_before = True
        if style.startswith('Heading'):
            fmt.keep_with_next = True
        run_style(p.add_run(value), size, bold)
        return p

    def heading(value, level=2, page=False):
        return para(value, 'Heading ' + str(level), size=17 if level == 1 else 13,
                    bold=True, before=0 if page else 8, after=7, page=page)

    def hyperlink(p, label, url):
        assert url.startswith(('https://', 'http://')), 'Unsafe hyperlink'
        rid = doc.part.relate_to(url, RT.HYPERLINK, is_external=True)
        link = OxmlElement('w:hyperlink')
        link.set(qn('r:id'), rid)
        r = OxmlElement('w:r')
        props = OxmlElement('w:rPr')
        fonts = OxmlElement('w:rFonts')
        for name in ('ascii', 'hAnsi', 'eastAsia', 'cs'):
            fonts.set(qn('w:' + name), 'Noto Sans CJK SC')
        props.append(fonts)
        color = OxmlElement('w:color');color.set(qn('w:val'), '24627B');props.append(color)
        size = OxmlElement('w:sz');size.set(qn('w:val'), '20');props.append(size)
        under = OxmlElement('w:u');under.set(qn('w:val'), 'single');props.append(under)
        r.append(props)
        t = OxmlElement('w:t');t.text = label;r.append(t)
        link.append(r);p._p.append(link)
        added_hyperlinks.append({'label': label, 'url': url})

    def sources(codes, label='依据', after=7):
        codes = unique(codes)
        if not codes:
            return
        p = para(label + ' ', size=9.5, after=after)
        for i, code in enumerate(codes):
            source = registry[code]
            if i:
                run_style(p.add_run('  '), 9.5)
            hyperlink(p, '[' + code + ']', source.get('url') or source.get('canonicalUrl'))
            written_codes.add(code)

    def linked_entry(resource, firm):
        p = para('', after=3 if firm['group'] == 'domestic' else 7)
        p.paragraph_format.keep_with_next = True
        hyperlink(p, '查看项目原文或官方入口', resource['url'])
        if firm['entryLinks']:
            extra = next((entry for entry in firm['entryLinks'] if entry['url'] != resource['url']), None)
            if extra:
                run_style(p.add_run('  '), 10)
                hyperlink(p, '进入官方招聘系统', extra['url'])

    def firm_section(firm):
        gap = 3 if firm['group'] == 'domestic' else 5
        name_heading = heading(firm['name'])
        if firm['group'] == 'domestic':
            name_heading.paragraph_format.space_before = Pt(6)
            name_heading.paragraph_format.space_after = Pt(5)
        offices = [office for office in firm['officeRecords'] if office['city'] == '南京']
        if firm['id'] == 'kpmg':
            para('南京专业服务办公室与KDI技术研发和交付中心分属不同业务场景。KDC交付支持、KDI数字化与前线审计应按具体岗位职责分别选择。')
        elif any(office.get('address') for office in offices):
            office = next(office for office in offices if office.get('address'))
            address = office['address']
            district = office.get('district') or ''
            location = (district + ' ' if district and district not in address[:12] else '') + address
            para('南京机构位置参考：' + location + '。实际客户现场、出差与到岗地点须另问。', after=gap)
        elif offices:
            para('官网列有南京机构，地址在投递前另核。实际客户现场与出差地点也需确认。', after=gap)
        else:
            para('从官方入口筛南京、江苏或适合阶段驻留的异地城市。本页没有南京具体空缺保证。', after=gap)
        priority = {'program_open': 0, 'program_announced': 1, 'listing_seen': 2,
                    'closed': 3, 'entry_only': 4, 'upcoming': 5, 'historical': 6}
        candidates = [r for r in firm['resources'] if r['kind'] not in ('graduate_recruitment', 'preparation_program')]
        primary = sorted(candidates, key=lambda r: priority.get(r['status'], 9))[0]
        para(primary['title'] + '。' + KIND[primary['kind']] + '，' + primary['statusLabel'] + '。', bold=True, after=gap)
        fields = [
            '对象：' + (text(primary['eligibility']) or '未公布'),
            '申请：' + (text(primary['applicationWindow']) or '窗口未公布'),
            '实施：' + (text(primary['period']) or '时间未公布'),
            '截止：' + (text(primary['deadline']) or '未公布'),
        ]
        para('；'.join(fields) + '。', after=gap)
        if primary.get('attendance') or primary.get('duration'):
            para('每周出勤：' + (text(primary['attendance']) or '未公布') + '；最短时长：' + (text(primary['duration']) or '未公布') + '。', after=gap)
        if primary['cityTags']:
            para('公告或列表城市：' + '、'.join(primary['cityTags']) + '。' + primary['geographyNote'], after=gap)
        elif primary['geographyNote']:
            para(primary['geographyNote'], after=gap)
        if primary['limits']:
            para(text(primary['limits']), size=10.5, after=gap)
        others = [r for r in firm['resources'] if r['id'] != primary['id']]
        if others:
            selected = others[:2]
            para('另可查看：' + '；'.join(r['title'] + '（' + r['statusLabel'] + '）' for r in selected) + ('。其余项目见配套Excel和网页。' if len(others) > 2 else '。'), size=10.5, after=gap)
        linked_entry(primary, firm)
        codes = primary['sourceIds'] + [code for office in offices for code in office['sourceIds']]
        if firm['id'] == 'kpmg':
            codes += [code for resource in firm['resources'] if resource['id'] in ('kpmg-kdc-intern', 'kpmg-kdi-intern') for code in resource['sourceIds']]
        sources(codes, after=3 if firm['group'] == 'domestic' else 7)

    heading('四大与国内所实习资源', 1, page=True)
    para('先确认自己能否按岗位要求到岗，再比较业务内容和投递路径。这里以南京为主，苏州、上海等异地机会按驻留安排单独考虑。配套Excel保留全部资源条目和来源，网页可按城市与状态筛选。')
    para(hub['firmGroupNote'])
    heading('先分清项目和投递入口')
    para('项目开放说明表示官方项目页可读，不等于南京有具体空缺。列表线索仍需打开职位详情确认；长期入口只提供查询路径。已结束、历史和未开放的项目用于了解要求，不能当作当前可投岗位。')
    para('申请窗口、实习实施期和明确截止日分别看。未公布截止日就保持未公布，不按月末或实习结束日补算。办公室、学校合作基地和校招宣讲也不保证个人实习名额。')
    heading('先按实际项目地点安排通勤')
    zone_ids = ['jiangbei', 'hexi', 'xinjiekou', 'yuhuatai', 'suzhou', 'shanghai']
    # Keep the reviewed source text, even if a future refresh changes zone IDs.
    for title, positions in [('南京市内', range(0, 4)), ('苏州与上海', range(4, 6))]:
        zones = [hub['commuteZones'][i] for i in positions if i < len(hub['commuteZones'])]
        summaries = []
        for zone in zones:
            summary = zone['summary']
            if '本组未取得' in summary:
                summary = '先确认连续到岗日期、住宿、客户现场和返校安排，再评估阶段驻留。'
            summaries.append(zone['title'] + '。' + summary)
        para(title + '：' + ' '.join(summaries), after=6)
        sources([code for zone in zones for code in zone['sourceIds']])
    para('建议先实测宿舍到校门、接驳到地铁、换乘、办公楼或园区的完整路线。不要只看地图上的轨道运行时间，也不要把迎新接站或特定校车当作每天可用的实习班车。', size=10.5)

    groups = [
        ('四大项目与投递入口', ['pwc', 'ey']),
        ('四大项目与投递入口', ['deloitte', 'kpmg']),
        ('国内所项目与投递入口', ['lixin', 'panchina', 'grant-thornton']),
        ('国内所项目与投递入口', ['shinewing', 'baker-tilly', 'dahua']),
        ('国内所项目与投递入口', ['rsm', 'zhongshen-zhonghuan']),
    ]
    by_id = {firm['id']: firm for firm in hub['firms']}
    for title, ids in groups:
        heading(title, 1, page=True)
        for fid in ids:
            firm_section(by_id[fid])
        if ids == ['rsm', 'zhongshen-zhonghuan']:
            heading('校内合作拓展线索')
            para('学校实践基地还可关注' + '、'.join(item['name'] for item in hub['expansionInstitutions']) + '。这些是机构与合作线索，当前是否接收实习、能否认定实践学分，应分别向岗位和本级学院核实。')
            sources([code for item in hub['expansionInstitutions'] for code in item['sourceIds']])

    heading('投递与到岗前的准备', 1, page=True)
    for plan in hub['applicationPlan'][:2]:
        heading(plan['title'])
        para(plan['text'], size=10.5)
        for item in plan['items']:
            para(text(item), size=10.5, after=4)
        sources(plan['sourceIds'])
    heading('简历和面试准备')
    para('以下是准备建议，具体门槛以职位为准。简历写清真实学籍、预计毕业年月、可到岗日、每周时间和连续周期；选一个真实课程、案例或项目样本，说明本人做了什么、怎样检查数据与支持结论。按岗位补Excel、审计或税务基础、英文表达等短板，不把CPA通过科目数当作所有实习的统一门槛。', size=10.5)
    heading('接受实习前逐项问清')
    questions = next(plan for plan in hub['applicationPlan'] if plan['title'] == '接受实习前逐项问清')['items']
    para('；'.join(text(item) for item in questions) + '。', size=10.5)
    heading('继续跟踪校内渠道')
    channels = [channel for channel in hub['campusChannels'] if channel['kind'] not in ('historical_event',)]
    para('学校智慧就业、研究生院与MPAcc通知可用于继续查岗位和实践手续。已经结束的宣讲、招聘会与毕业生经验只作准备参考；是否有后续补录，回到学校与企业当前页面核对。', size=10.5)
    p = para('', after=6)
    for i, channel in enumerate(channels[:3]):
        if i:
            run_style(p.add_run('  '), 10)
        if channel.get('url'):
            hyperlink(p, channel['title'], channel['url'])
    p = para('', after=0)
    hyperlink(p, '打开网页实习资源专栏', 'https://nishino0525nanase.github.io/nau-mpacc-guide/#life/life-09')

    # Repackage only document.xml and its hyperlink relationships. All old body
    # nodes, styles, numbering, header/footer, media and source hyperlinks stay.
    temporary = io.BytesIO();doc.save(temporary)
    with ZipFile(io.BytesIO(original)) as archive:
        parts = {name: archive.read(name) for name in archive.namelist()}
    with ZipFile(temporary) as archive:
        authored_doc = E.fromstring(archive.read('word/document.xml'))
        authored_rels = E.fromstring(archive.read('word/_rels/document.xml.rels'))
    original_doc = E.fromstring(parts['word/document.xml'])
    ns = {'w': W}
    old_body = original_doc.find('w:body', ns)
    authored_body = authored_doc.find('w:body', ns)
    canon = lambda node: E.tostring(node, method='c14n')
    assert all(canon(a) == canon(b) for a, b in zip(list(old_body)[:-1], list(authored_body)[:old_body_count])), 'Original body changed during append'
    new_nodes = list(authored_body)[old_body_count:-1]
    for node in new_nodes:
        old_body.insert(len(old_body) - 1, deepcopy(node))
    relations = E.fromstring(parts['word/_rels/document.xml.rels'])
    old_ids = {rel.attrib['Id'] for rel in relations}
    for rel in authored_rels:
        if rel.attrib['Id'] not in old_ids:
            assert rel.attrib['Type'] == RT.HYPERLINK and rel.attrib.get('TargetMode') == 'External'
            relations.append(deepcopy(rel))
    parts['word/document.xml'] = E.tostring(original_doc, xml_declaration=True, encoding='UTF-8', standalone=True)
    parts['word/_rels/document.xml.rels'] = E.tostring(relations, xml_declaration=True, encoding='UTF-8', standalone=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    candidate = OUTPUT / 'life-guide.docx'
    with ZipFile(candidate, 'w', ZIP_DEFLATED) as archive:
        for name, payload in parts.items():
            archive.writestr(name, payload)
    with ZipFile(io.BytesIO(original)) as before, ZipFile(candidate) as after:
        modified = {'word/document.xml', 'word/_rels/document.xml.rels'}
        assert all(before.read(name) == after.read(name) for name in before.namelist() if name not in modified)
        new_root = E.fromstring(after.read('word/document.xml'))
        new_body = new_root.find('w:body', ns)
        original_body = E.fromstring(before.read('word/document.xml')).find('w:body', ns)
        assert all(canon(a) == canon(b) for a,b in zip(list(original_body)[:-1], list(new_body)[:old_body_count]))
        assert canon(original_body[-1]) == canon(new_body[-1])
        full_text = ''.join(new_root.itertext())
        assert all(firm['name'] in full_text for firm in hub['firms'])
        assert '四大与国内所实习资源' in full_text
        assert '2026-10-16' in full_text and '本期已结束' in full_text
        assert not any(token in ''.join(''.join(node.itertext()) for node in new_nodes) for token in ('LIBRARY_FILE_ID', 'turn215view', '那些小小的喜欢', '一直放在心上'))
    qa = {'sourceSha256': EXPECTED, 'sourceBytes': len(original),
          'candidateSha256': sha256(candidate.read_bytes()).hexdigest(), 'candidateBytes': candidate.stat().st_size,
          'internshipsSha256': hub_digest(hub), 'originalBodyNodesPreserved': old_body_count,
          'originalNonDocumentPartsByteIdentical': True, 'originalSectionAndStylesPreserved': True,
          'addedBodyNodes': len(new_nodes), 'addedHyperlinks': len(added_hyperlinks),
          'firmCount': 12, 'supplementIntendedPages': 7, 'sourceCodes': sorted(written_codes),
          'renderReviewed': False}
    (OUTPUT / 'docx-verification.json').write_text(json.dumps(qa, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(qa, ensure_ascii=False))


def replace():
    qa = json.loads((OUTPUT / 'docx-verification.json').read_text())
    candidate = OUTPUT / 'life-guide.docx'
    hub = json.loads((ROOT / 'dist/data/site-data.json').read_text())['internships']
    assert qa['renderReviewed'], 'Complete PNG render review before replacing'
    assert SOURCE.read_bytes() and sha256(SOURCE.read_bytes()).hexdigest() == qa['sourceSha256']
    assert sha256(candidate.read_bytes()).hexdigest() == qa['candidateSha256']
    assert hub_digest(hub) == qa['internshipsSha256']
    backup = OUTPUT / 'backup/life-guide.before-internships.docx'
    backup.parent.mkdir(exist_ok=True)
    assert not backup.exists()
    backup.write_bytes(SOURCE.read_bytes())
    stage = SOURCE.with_suffix('.internships104.tmp')
    stage.write_bytes(candidate.read_bytes());stage.replace(SOURCE)
    print(json.dumps({'replaced': True, 'bytes': SOURCE.stat().st_size, 'sha256': qa['candidateSha256']}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--replace-reviewed', action='store_true')
    args = parser.parse_args()
    replace() if args.replace_reviewed else build()
