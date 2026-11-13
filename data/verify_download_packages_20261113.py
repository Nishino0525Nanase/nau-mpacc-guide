"""Check Office package integrity and usable links without changing attachments."""
import json
import re
from pathlib import Path
from urllib.parse import urlparse
from zipfile import ZipFile
from lxml import etree

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data/downloads_refresh_20261113/package-qa.json'
REL = {'r': 'http://schemas.openxmlformats.org/package/2006/relationships'}
WORD = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
SHEET = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}


def main():
    results = []
    for filename in ['mentor-guide.docx', 'life-guide.docx', 'evidence-index.xlsx']:
        item = {'filename': filename}
        with ZipFile(ROOT / 'dist/downloads' / filename) as archive:
            assert archive.testzip() is None, filename
            links, errors = [], []
            for part in archive.namelist():
                if part.endswith('.rels'):
                    tree = etree.fromstring(archive.read(part))
                    for link in tree.findall('r:Relationship', REL):
                        if link.get('TargetMode') != 'External':
                            continue
                        target = link.get('Target', '')
                        scheme = urlparse(target).scheme.lower()
                        assert scheme in ['http', 'https', 'mailto', 'tel'], (filename, part, 'non-web external link')
                        links.append(target)
                if re.match(r'xl/worksheets/sheet\d+\.xml$', part):
                    tree = etree.fromstring(archive.read(part))
                    errors.extend(tree.xpath('//s:c[@t="e"]/s:v/text()', namespaces=SHEET))
            item['externalRelationships'] = len(links)
            item['formulaErrors'] = errors
            assert not errors, (filename, errors[:5])
            if filename.endswith('.docx'):
                tree = etree.fromstring(archive.read('word/document.xml'))
                body = ''.join(tree.xpath('//w:t/text()', namespaces=WORD))
                assert body.strip() and links
                assert not any(value in body for value in ['私人后台', 'ghp_'])
                item['textCharacters'] = len(body)
                if filename == 'mentor-guide.docx':
                    data = json.loads((ROOT / 'dist/data/site-data.json').read_text())
                    missing = [mentor['name'] for mentor in data['mentors'] if mentor['name'] not in body]
                    assert not missing, ('mentor names absent', missing)
                    assert 'DBR' in body and '董必荣' in body and '学生去向' in body
                    item['mentorNamesPresent'] = len(data['mentors'])
            else:
                workbook = etree.fromstring(archive.read('xl/workbook.xml'))
                item['sheets'] = workbook.xpath('//s:sheets/s:sheet/@name', namespaces=SHEET)
                item['tables'] = sum(bool(re.match(r'xl/tables/table\d+\.xml$', part)) for part in archive.namelist())
        results.append(item)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(results, ensure_ascii=False))


if __name__ == '__main__':
    main()
