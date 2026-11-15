"""Package Artifact Tool-authored display values without rewriting native features."""
import hashlib
import json
from pathlib import Path
import posixpath
import re
import sys
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape
import zipfile

baseline, stage, manifest, out = map(Path, sys.argv[1:])
Q = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
R = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
marker = '检索于2026-11-04'
changes = json.loads(manifest.read_text())
assert len(changes) == 34


def load(path):
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None
        return {item.filename: archive.read(item) for item in archive.infolist()}


def sheet_parts(package):
    relations = {item.attrib['Id']: item.attrib['Target'] for item in ET.fromstring(package['xl/_rels/workbook.xml.rels'])}
    result = {}
    for item in ET.fromstring(package['xl/workbook.xml']).find(Q + 'sheets'):
        target = relations[item.attrib[R + 'id']]
        result[item.attrib['name']] = target.lstrip('/') if target.startswith('/') else posixpath.normpath(posixpath.join('xl', target))
    return result


def cell_values(package):
    shared = []
    if 'xl/sharedStrings.xml' in package:
        shared = [''.join(item.itertext()) for item in ET.fromstring(package['xl/sharedStrings.xml'])]
    result = {}
    for sheet, part in sheet_parts(package).items():
        for cell in ET.fromstring(package[part]).iter(Q + 'c'):
            if cell.attrib.get('t') == 's':
                value = shared[int(cell.findtext(Q + 'v'))]
            elif cell.attrib.get('t') == 'inlineStr':
                value = ''.join(cell.find(Q + 'is').itertext())
            else:
                value = cell.findtext(Q + 'v', '')
            result[sheet, cell.attrib['r']] = (value, cell)
    return result


original = load(baseline)
authored = cell_values(load(stage))
parts = sheet_parts(original)
before = cell_values(original)
expected = {(item['sheetName'], item['address']) for item in changes}
assert {(sheet, address) for (sheet, address), (value, _) in before.items() if marker in value} == expected
updated = dict(original)
for item in changes:
    key = item['sheetName'], item['address']
    value, cell = before[key]
    assert value == item['oldValue'] and authored[key][0] == item['newValue']
    assert cell.find(Q + 'f') is None and cell.attrib.get('t') == 'str'
    part = parts[item['sheetName']]
    text = updated[part].decode()
    pattern = re.compile(r'(<(?:\w+:)?c\b[^>]*\br="' + re.escape(item['address']) + r'"[^>]*>)(.*?)(</(?:\w+:)?c>)', re.S)
    found = list(pattern.finditer(text))
    assert len(found) == 1
    match = found[0]
    body, count = re.subn(r'(<(?:\w+:)?v>).*?(</(?:\w+:)?v>)', lambda m: m[1] + escape(item['newValue']) + m[2], match[2], flags=re.S)
    assert count == 1
    updated[part] = (text[:match.start()] + match[1] + body + match[3] + text[match.end():]).encode()

final = out / 'evidence-index.xlsx'
with zipfile.ZipFile(baseline) as source, zipfile.ZipFile(final, 'w') as target:
    target.comment = source.comment
    for info in source.infolist():
        target.writestr(info, updated[info.filename])

saved = load(final)
after = cell_values(saved)
assert set(original) == set(saved) and set(before) == set(after)
changed_parts = [part for part in original if original[part] != saved[part]]
assert set(changed_parts) == {parts[sheet] for sheet, _ in expected}
for key, (old_value, old_cell) in before.items():
    new_value, new_cell = after[key]
    assert old_cell.attrib == new_cell.attrib
    if key in expected:
        assert new_value == next(item['newValue'] for item in changes if key == (item['sheetName'], item['address']))
        old_cell.find(Q + 'v').text = new_value
    else:
        assert new_value == old_value
    assert ET.tostring(old_cell) == ET.tostring(new_cell), key

# Removing the exact value spans must leave each affected worksheet byte-for-byte
# identical. All other native package parts must already be byte-identical.
for part in changed_parts:
    old, new = original[part].decode(), saved[part].decode()
    for item in changes:
        if parts[item['sheetName']] != part:
            continue
        def neutralize(text):
            pattern = r'(<(?:\w+:)?c\b[^>]*\br="' + item['address'] + r'"[^>]*>)(.*?)(</(?:\w+:)?c>)'
            return re.sub(pattern, lambda m: m[1] + re.sub(r'(<(?:\w+:)?v>).*?(</(?:\w+:)?v>)', r'\1VALUE\2', m[2], flags=re.S) + m[3], text, flags=re.S)
        old, new = neutralize(old), neutralize(new)
    assert old == new

formulas = caches = 0
errors = []
for key, (value, cell) in after.items():
    assert marker not in value
    if cell.find(Q + 'f') is not None:
        formulas += 1
        assert re.fullmatch(r'HYPERLINK\("(?:[^"]|"")*","(?:[^"]|"")*"\)', cell.find(Q + 'f').text)
        assert cell.find(Q + 'v') is not None
        caches += 1
    if cell.attrib.get('t') == 'e':
        errors.append([*key, value])
assert not errors and formulas == caches == 1813
tables = [name for name in saved if name.startswith('xl/tables/') and name.endswith('.xml')]
assert len(parts) == 16 and len(tables) == 19
result = {
    'status': 'verified',
    'sourceBytes': baseline.stat().st_size,
    'sourceSha256': hashlib.sha256(baseline.read_bytes()).hexdigest(),
    'outputBytes': final.stat().st_size,
    'outputSha256': hashlib.sha256(final.read_bytes()).hexdigest(),
    'changedDisplayCells': len(changes),
    'suffixesRemoved': sum(item['oldValue'] != marker for item in changes),
    'undatedLabelsInserted': sum(item['oldValue'] == marker for item in changes),
    'remainingRemovedMarkerHits': 0,
    'sheets': len(parts),
    'tables': len(tables),
    'unchangedFormulasAndCaches': formulas,
    'allFormulasAreConstantHyperlinksWithoutEditedCellDependencies': True,
    'formulaErrors': errors,
    'onlyThreeWorksheetPartsChanged': True,
    'onlyRequestedValueTextSpansChanged': True,
    'allOtherPackagePartsByteIdentical': True,
    'allUnrelatedCellsStylesTablesLinksAndLayoutPreserved': True,
    'realDatesPreservedByExactRequestedReplacement': True,
    'nativeRecalculationRequired': False,
    'nativeRecalculationReason': 'Only constant display labels changed; formula definitions and all existing native caches are byte-identical.',
    'changes': changes,
}
(out / 'workbook-qa.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({key: result[key] for key in ['status', 'outputBytes', 'outputSha256', 'changedDisplayCells', 'suffixesRemoved', 'undatedLabelsInserted', 'unchangedFormulasAndCaches']}, ensure_ascii=False))
