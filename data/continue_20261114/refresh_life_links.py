"""Insert the official form links into the existing life handbook locally."""
import copy
import hashlib
import importlib.util
from io import BytesIO
import json
from pathlib import Path
from zipfile import ZipFile

from docx import Document
from docx.oxml.ns import qn
from lxml import etree

ROOT = Path(__file__).resolve().parents[2]
TARGET = ROOT / 'dist/downloads/life-guide.docx'
PATCH = Path(__file__).parent / 'forms/verified-input.json'


def main():
    spec = importlib.util.spec_from_file_location('life_builder', ROOT / 'data/refresh_life_docx_20261113.py')
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    site = json.loads((ROOT / 'dist/data/site-data.json').read_text())
    patch = json.loads(PATCH.read_text())
    original = TARGET.read_bytes()
    doc = Document(BytesIO(original))
    body = doc.element.body
    children = list(body)
    anchor = next(element for element in children if element.tag == qn('w:p') and ''.join(node.text or '' for node in element.iter(qn('w:t'))) == '第十二章 资料出处')
    previous_heading = next((element for element in children if element.tag == qn('w:p') and ''.join(node.text or '' for node in element.iter(qn('w:t'))) == '常用表格直接下载'), None)
    if previous_heading is not None:
        start, end = children.index(previous_heading), children.index(anchor)
        for element in children[start:end]:
            body.remove(element)
    before = set(body)
    helper.heading(doc, '常用表格直接下载', 2)
    helper.paragraph(doc, '以下为学校官网公开模板，未注明适用年级。提交前先核对本级通知。', site['sourceRegistry'])
    helper.table(doc, ['材料', '什么时候用'], [
        [{'label': item['title'], 'url': item['url']}, item['purpose'] + ' [' + item['sourceId'] + ']']
        for item in patch['officialDownloads']
    ], site['sourceRegistry'])
    for element in [element for element in list(body) if element not in before]:
        body.remove(element)
        body.insert(list(body).index(anchor), element)
    stage = BytesIO()
    doc.save(stage)
    changed = []
    with ZipFile(BytesIO(original)) as old, ZipFile(stage) as generated, ZipFile(TARGET, 'w') as output:
        for info in old.infolist():
            content = generated.read(info.filename) if info.filename in ['word/document.xml', 'word/_rels/document.xml.rels'] else old.read(info.filename)
            if content != old.read(info.filename):
                changed.append(info.filename)
            output.writestr(copy.copy(info), content)
    with ZipFile(TARGET) as package:
        assert package.testzip() is None
        rels = etree.fromstring(package.read('word/_rels/document.xml.rels'))
        urls = {item.get('Target') for item in rels}
        assert all(item['url'] in urls for item in patch['officialDownloads'])
        core = etree.fromstring(package.read('docProps/core.xml'))
        assert not ''.join(core.xpath('//*[local-name()="creator" or local-name()="lastModifiedBy"]/text()'))
    report = {'file': 'dist/downloads/life-guide.docx', 'bytes': TARGET.stat().st_size,
              'sha256': hashlib.sha256(TARGET.read_bytes()).hexdigest(), 'officialTemplateLinks': len(patch['officialDownloads']),
              'changedPackageParts': changed, 'authorMetadataBlank': True, 'rendered': False}
    (Path(__file__).parent / 'life-docx-qa.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()
