"""Read-only XLSX checks for the scoped continuation and form-link refresh."""
import hashlib
import json
import posixpath
import re
import sys
import xml.etree.ElementTree as E
from pathlib import Path
from zipfile import ZipFile

Q = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
R = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
out = Path(sys.argv[1])
qa_path = Path(sys.argv[2])


def load_xlsx(path):
    with ZipFile(path) as archive:
        assert archive.testzip() is None
        package = {name: archive.read(name) for name in archive.namelist()}
    strings = E.fromstring(package['xl/sharedStrings.xml']) if 'xl/sharedStrings.xml' in package else []
    rels = {item.attrib['Id']: item.attrib['Target'] for item in E.fromstring(package['xl/_rels/workbook.xml.rels'])}
    sheets, tables = {}, {}
    for item in E.fromstring(package['xl/workbook.xml']).find(Q + 'sheets'):
        target = rels[item.attrib[R + 'id']]
        part = target.lstrip('/') if target.startswith('/') else posixpath.normpath(posixpath.join('xl', target))
        sheets[item.attrib['name']] = E.fromstring(package[part])
        relation_part = posixpath.join(posixpath.dirname(part), '_rels', posixpath.basename(part) + '.rels')
        sheet_rels = {r.attrib['Id']: r.attrib['Target'] for r in E.fromstring(package[relation_part])} if relation_part in package else {}
        current = []
        for ref in sheets[item.attrib['name']].findall('./' + Q + 'tableParts/' + Q + 'tablePart'):
            target = sheet_rels[ref.attrib[R + 'id']]
            table_part = target.lstrip('/') if target.startswith('/') else posixpath.normpath(posixpath.join(posixpath.dirname(part), target))
            current.append(E.fromstring(package[table_part]))
        tables[item.attrib['name']] = current

    def value(cell):
        if cell is None:
            return ''
        typ = cell.attrib.get('t')
        if typ == 'inlineStr':
            return ''.join(cell.find(Q + 'is').itertext())
        elem = cell.find(Q + 'v')
        result = (elem.text or '') if elem is not None else ''
        if typ == 's':
            return ''.join(strings[int(result)].itertext())
        if typ in ['str', 'e', 'd']:
            return result
        return float(result) if result else ''

    return package, sheets, tables, value


def col(index):
    result, index = '', index + 1
    while index:
        result = chr(65 + (index - 1) % 26) + result
        index = (index - 1) // 26
    return result


def cells(tree, value):
    result = {}
    for cell in tree.iter(Q + 'c'):
        formula = cell.find(Q + 'f')
        data = (value(cell), formula.text if formula is not None else None)
        if data != ('', None):
            result[cell.attrib['r']] = data
    return result


def table_signature(table):
    return {'name': table.attrib['name'], 'ref': table.attrib['ref'],
            'columns': [c.attrib['name'] for c in table.find(Q + 'tableColumns')],
            'filter': table.find(Q + 'autoFilter').attrib if table.find(Q + 'autoFilter') is not None else None}


def style_reader(package):
    root = E.fromstring(package['xl/styles.xml'])
    parts = {name: list(root.find(Q + name)) for name in ['fonts', 'fills', 'borders', 'cellXfs']}
    formats = {int(node.attrib['numFmtId']): node.attrib['formatCode'] for node in root.findall('./' + Q + 'numFmts/' + Q + 'numFmt')}

    def signature(style_id):
        node = parts['cellXfs'][int(style_id or 0)]
        attrs = dict(node.attrib)
        result = []
        for attr, section in [('fontId', 'fonts'), ('fillId', 'fills'), ('borderId', 'borders')]:
            result.append((section, E.tostring(parts[section][int(attrs.pop(attr, 0))], encoding='unicode')))
        number = int(attrs.pop('numFmtId', 0))
        result.extend([('numberFormat', formats.get(number, number)), ('attributes', attrs),
                       ('children', [E.tostring(child, encoding='unicode') for child in node])])
        return result
    return signature


source, old_sheets, old_tables, old_value = load_xlsx(out / 'evidence-index.before.xlsx')
old_style = style_reader(source)
schema = {name: {'tables': [table_signature(t) for t in old_tables[name]], 'nonemptyCells': len(cells(tree, old_value))} for name, tree in old_sheets.items()}
(out / 'before-schema.json').write_text(json.dumps(schema, ensure_ascii=False, indent=2) + '\n')
if '--profile' in sys.argv:
    qa_path.write_text(json.dumps({'status': 'scripts_ready_waiting_for_merged_data', 'sourceSheets': list(old_sheets), 'sheetCount': len(old_sheets), 'schema': str(out / 'before-schema.json'), 'profile': str(out / 'before-profile.ndjson'), 'workbookNotAuthoredYet': True}, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'sheets': len(old_sheets), 'profiledTables': sum(map(len, old_tables.values()))}))
    raise SystemExit()

model = json.loads((out / 'workbook-model.json').read_text())
final_path = out / 'evidence-index.xlsx'
final, sheets, tables, value = load_xlsx(final_path)
style = style_reader(final)
assert list(old_sheets) == list(sheets), 'sheet names/order changed'
assert len(sheets) == 16
affected = {spec['name'] for spec in model['datasets']}
checked_rows, checked_links = {}, 0


def check_matrix(sheet_name, spec):
    global checked_links
    data = {cell.attrib['r']: cell for cell in sheets[sheet_name].iter(Q + 'c')}
    links = {(link['rowIndex'], link['colIndex']): link for link in spec['links']}
    for link in spec['links']:
        address = col(link['colIndex']) + str(spec['headerRow'] + 1 + link['rowIndex'])
        cell, expected_url = data[address], link['url'].replace('"', '""')
        formula = cell.find(Q + 'f')
        assert formula is not None and expected_url in formula.text, (sheet_name, address, 'url')
        assert value(cell) == link['label'], (sheet_name, address, 'native cached label')
        checked_links += 1
    for i, row in enumerate(spec['rows']):
        for j, expected in enumerate(row):
            if (i, j) not in links:
                actual = value(data.get(col(j) + str(spec['headerRow'] + 1 + i)))
                assert actual == ('' if expected is None else expected), (sheet_name, i, j, actual, expected)


for spec in model['datasets']:
    check_matrix(spec['name'], spec)
    checked_rows[spec['name']] = len(spec['rows'])
for section in model.get('outcomeSections', []):
    check_matrix('学生公开去向', section)
    checked_rows['学生公开去向/' + section['key']] = len(section['rows'])

unchanged = []
for name in sheets:
    if name in affected:
        continue
    assert cells(old_sheets[name], old_value) == cells(sheets[name], value), ('unrelated cell changed', name)
    before_styles = {cell.attrib['r']: old_style(cell.attrib.get('s')) for cell in old_sheets[name].iter(Q + 'c')}
    after_styles = {cell.attrib['r']: style(cell.attrib.get('s')) for cell in sheets[name].iter(Q + 'c')}
    assert before_styles == after_styles, ('unrelated cell style changed', name)
    for tag in ['cols', 'mergeCells', 'sheetViews', 'dataValidations', 'conditionalFormatting']:
        before = [dict(item.attrib) for node in old_sheets[name].findall(Q + tag) for item in node.iter()]
        after = [dict(item.attrib) for node in sheets[name].findall(Q + tag) for item in node.iter()]
        assert before == after, ('unrelated layout changed', name, tag)
    before = {r.attrib['r']: r.attrib.get('ht') for r in old_sheets[name].iter(Q + 'row') if 'ht' in r.attrib}
    after = {r.attrib['r']: r.attrib.get('ht') for r in sheets[name].iter(Q + 'row') if 'ht' in r.attrib}
    assert before == after, ('unrelated row heights changed', name)
    assert [table_signature(t) for t in old_tables[name]] == [table_signature(t) for t in tables[name]], ('unrelated table changed', name)
    unchanged.append(name)

errors = [(name, cell.attrib['r'], value(cell)) for name, tree in sheets.items() for cell in tree.iter(Q + 'c') if cell.attrib.get('t') == 'e']
assert not errors, errors
student_spec = next(s for s in model['datasets'] if s['name'] == '学生公开去向')
assert student_spec['headers'][7:9] == ['事务所组', '规范所名']
firm_count = student_spec['summary']['firmRecords']
assert all(row[6] == '就业' and row[7] and row[8] for row in student_spec['rows'][:firm_count]), 'firm employment first'
last = student_spec['headerRow'] + len(student_spec['rows'])
for section in model.get('outcomeSections', []):
    assert section['titleRow'] > last, ('overlapping section', section['key'])
    last = section['headerRow'] + len(section['rows'])
student_tables = [table_signature(t) for t in tables['学生公开去向']]
assert len(student_tables) == 1 + len(model.get('outcomeSections', []))
assert sum(len(group) for group in tables.values()) == sum(len(group) for group in old_tables.values()) == 19
awards = next(section for section in model['outcomeSections'] if section['key'] == 'achievements')
assert awards['title'] == '培养成果（不作为就业记录）'
assert all(row[2].startswith(('赛事指导：', '论文导师：')) for row in awards['rows'])
assert any('董必荣、刘辉' in row[2] for row in awards['rows'])
assert any('高凤莲、史晓明' in row[2] for row in awards['rows'])
assert all(row[2].startswith('赛事指导：') for row in awards['rows'] if '队' in row[0])
employers = next(section for section in model['outcomeSections'] if section['key'] == 'employerSummaries')
assert employers['title'] == '学校公开事务所资料（不计入具名记录）'
assert any('45' in row[1] and '本科' in row[2] and '非MPAcc' in row[2] for row in employers['rows'])
assert not any('无人数' in str(row) or '无具名学生或分单位人数' in str(row) for row in employers['rows'])
formula_count = 0
for name, tree in sheets.items():
    for cell in tree.iter(Q + 'c'):
        formula = cell.find(Q + 'f')
        if formula is None:
            continue
        formula_count += 1
        target = re.search(r'HYPERLINK\("([^\"]+)"', formula.text or '', re.I)
        if target:
            assert target.group(1).startswith(('https://', 'http://')), (name, cell.attrib['r'], 'unsafe link')
result = json.loads((out / 'verification.json').read_text())
result.update(status='verified', checkedModelRows=checked_rows, checkedSourceLinks=checked_links,
              allModelCellValuesMatch=True, allSourceLinksAndNativeLabelsMatch=True,
              unchangedSheetsWithPreservedCellsTablesAndLayout=unchanged,
              all16SheetsPreserved=True, studentSectionsNonoverlapping=True,
              unchangedCellEffectiveStylesPreserved=True,
              allNativeHyperlinkProtocolsSafe=True,
              checkedNativeFormulas=formula_count,
              achievementsDistinguishThesisAndCompetition=True,
              coMentorsPreserved=True,
              aggregateUndergraduateScopePreserved=True,
              firmEmploymentFirst=True, firmFilterFieldsPresent=True,
              qualitativeStatementsExcludedFromNamedPeople=True,
              studentTables=student_tables, outputPath=str(final_path),
              outputBytes=final_path.stat().st_size,
              outputSha256=hashlib.sha256(final_path.read_bytes()).hexdigest(),
              formulaErrors=errors)
qa_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({key: result[key] for key in ['status', 'sheets', 'outputBytes', 'checkedModelRows', 'checkedSourceLinks', 'unchangedSheetsWithPreservedCellsTablesAndLayout']}, ensure_ascii=False))
