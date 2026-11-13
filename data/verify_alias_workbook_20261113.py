"""Read-only verification of the scoped alias/comment workbook refresh."""
import hashlib
import json
import posixpath
import re
import sys
import xml.etree.ElementTree as E
from pathlib import Path
from zipfile import ZipFile

out = Path(sys.argv[1])
Q = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
R = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
affected = {'导师反馈', '学生评价总览', '姓名缩写对照'}


def load(path):
    with ZipFile(path) as archive:
        assert archive.testzip() is None
        package = {name: archive.read(name) for name in archive.namelist()}
    strings = E.fromstring(package['xl/sharedStrings.xml']) if 'xl/sharedStrings.xml' in package else []
    rels = {item.attrib['Id']: item.attrib['Target'] for item in E.fromstring(package['xl/_rels/workbook.xml.rels'])}
    sheets = {}
    for item in E.fromstring(package['xl/workbook.xml']).find(Q + 'sheets'):
        target = rels[item.attrib[R + 'id']]
        part = target.lstrip('/') if target.startswith('/') else posixpath.normpath(posixpath.join('xl', target))
        sheets[item.attrib['name']] = E.fromstring(package[part])

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

    return package, sheets, value


def col(index):
    result = ''
    index += 1
    while index:
        result = chr(65 + (index - 1) % 26) + result
        index = (index - 1) // 26
    return result


model = json.loads((out / 'workbook-model.json').read_text())
source, source_sheets, source_value = load(out / 'evidence-index.before.xlsx')
final_path = out / 'evidence-index.xlsx'
final, sheets, value = load(final_path)
assert list(source_sheets) == list(sheets), 'sheet names/order changed'
assert len(sheets) == 16
checked_rows, checked_links = {}, 0
for spec in model['datasets']:
    cells = {cell.attrib['r']: cell for cell in sheets[spec['name']].iter(Q + 'c')}
    links = {(link['rowIndex'], link['colIndex']): link for link in spec['links']}
    for link in spec['links']:
        address = col(link['colIndex']) + str(spec['headerRow'] + 1 + link['rowIndex'])
        cell = cells[address]
        formula = cell.find(Q + 'f')
        assert formula is not None and link['url'].replace('"', '""') in formula.text, (spec['name'], address, 'url')
        assert value(cell) == link['label'], (spec['name'], address, 'cached link label')
        checked_links += 1
    for i, row in enumerate(spec['rows']):
        for j, expected in enumerate(row):
            if (i, j) in links:
                continue
            actual = value(cells.get(col(j) + str(spec['headerRow'] + 1 + i)))
            assert actual == ('' if expected is None else expected), (spec['name'], i, j, actual, expected)
    checked_rows[spec['name']] = len(spec['rows'])


def semantic_cells(tree, get_value):
    result = {}
    for cell in tree.iter(Q + 'c'):
        formula = cell.find(Q + 'f')
        data = (get_value(cell), formula.text if formula is not None else None)
        if data != ('', None):
            result[cell.attrib['r']] = data
    return result


unchanged = []
for name in sheets:
    if name in affected:
        continue
    assert semantic_cells(source_sheets[name], source_value) == semantic_cells(sheets[name], value), ('unrelated cell changed', name)
    for tag in ['cols', 'mergeCells', 'sheetViews']:
        before = source_sheets[name].find(Q + tag)
        after = sheets[name].find(Q + tag)
        before_attrs = [dict(item.attrib) for item in before.iter()] if before is not None else []
        after_attrs = [dict(item.attrib) for item in after.iter()] if after is not None else []
        assert before_attrs == after_attrs, ('unrelated layout changed', name, tag)
    before_heights = {r.attrib['r']: r.attrib.get('ht') for r in source_sheets[name].iter(Q + 'row') if 'ht' in r.attrib}
    after_heights = {r.attrib['r']: r.attrib.get('ht') for r in sheets[name].iter(Q + 'row') if 'ht' in r.attrib}
    assert before_heights == after_heights, ('unrelated row heights changed', name)
    unchanged.append(name)

errors = [(name, cell.attrib['r'], value(cell)) for name, tree in sheets.items() for cell in tree.iter(Q + 'c') if cell.attrib.get('t') == 'e']
assert not errors, errors
tables = [name for name in final if re.fullmatch(r'xl/tables/table\d+\.xml', name)]
assert len(tables) == 17
result = json.loads((out / 'verification.json').read_text())
result.update(checkedModelRows=checked_rows, checkedSourceLinks=checked_links,
              allModelCellValuesMatch=True, allSourceLinksAndLabelsMatch=True,
              unchangedSheetsWithPreservedCellsAndLayout=unchanged,
              outputBytes=final_path.stat().st_size,
              outputSha256=hashlib.sha256(final_path.read_bytes()).hexdigest())
(out / 'verification.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({key: result[key] for key in ['outputBytes', 'outputSha256', 'formulas', 'checkedModelRows', 'checkedSourceLinks', 'unchangedSheetsWithPreservedCellsAndLayout']}, ensure_ascii=False))
