"""Merge verified firm destinations and keep institution-wide facts separate."""
import copy
from collections import Counter
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'dist/data/site-data.json'
BATCH = ROOT / 'data/firm_outcomes_20261114'


def save(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def extend(items, incoming, key='id'):
    positions = {item[key]: i for i, item in enumerate(items)}
    for item in incoming:
        item = copy.deepcopy(item)
        if item[key] in positions:
            items[positions[item[key]]] = item
        else:
            positions[item[key]] = len(items)
            items.append(item)


def firm(outcome):
    if outcome.get('type') != 'employment':
        return None
    if re.search(r'实习|internship|\bintern\b|offer_only', ' '.join(str(outcome.get(k) or '') for k in ['stage', 'statusLabel', 'program']), re.I):
        return None
    organization = outcome.get('organization') or ''
    groups = [
        ('普华永道', 'big4', r'普华永道|pricewaterhousecoopers|\bpwc\b'),
        ('德勤', 'big4', r'德勤|deloitte'), ('安永', 'big4', r'安永|ernst\s*&?\s*young|^ey$'),
        ('毕马威', 'big4', r'毕马威|kpmg'),
        *[(name, 'domestic8', rf'^{name}$|{name}(?:会计师|税务师|事务所)') for name in ['立信', '天健', '致同', '容诚', '天职国际', '信永中和', '大华', '大信']],
        ('瑞华', 'historical_other', r'瑞华(?:会计师|事务所)|^瑞华$'),
    ]
    return next(((name, group) for name, group, pattern in groups if re.search(pattern, organization, re.I)), None)


def main():
    data = json.loads(DATA.read_text())
    patch = json.loads((BATCH / 'verified-input.json').read_text())
    registry = data['sourceRegistry']
    for entry in patch['sources']:
        registry[entry['code']] = copy.deepcopy(entry)
    hub = data['studentOutcomes']
    extend(hub['records'], patch['records'])
    for correction in patch.get('corrections', []):
        record = next(item for item in hub['records'] if item['id'] == correction['recordId'])
        record.update(degree=correction['degree'], degreeLabel=correction['degreeLabel'])
    for record in hub['records']:
        found = firm(record['outcome'])
        if found:
            record['outcome'].update(firmName=found[0], firmGroup=found[1])
    extend(hub['statistics'], patch['statistics'])
    hub['statistics'].sort(key=lambda item: (item.get('cohort', ''), 1 if item.get('unit') == '%' else 0))
    extend(hub.setdefault('mentorCareerStatements', []), patch['mentorCareerStatements'])
    extend(hub.setdefault('employerSummaries', []), patch['employerSummaries'])
    hub['firmScope'] = copy.deepcopy(patch['firmScope'])
    hub['asOf'] = patch['asOf']
    record = next(item for item in hub['records'] if item['id'] == 'FO20261114-XIE-KPMG')
    item = registry['FO20261114-XIE']
    post = {
        'id': item['postId'], 'key': 'official:' + item['postId'], 'sourceIds': record['sourceIds'],
        'url': item['url'], 'canonicalUrl': item['canonicalUrl'], 'title': item['title'],
        'author': '金陵科技学院商学院；编辑郑文杰', 'date': item['date'], 'platform': item['platform'],
        'category': '就业与校友资料', 'topic': 'MPAcc毕业后的四大就业', 'population': item['population'],
        'summary': item['summary'], 'tips': ['金融企业审计、鉴证及咨询，涉及上市银行和金融租赁公司。',
        '南审两份专业学位点年报交叉核实MPAcc身份；本科2020届不当硕士届别。'],
        'comments': [], 'limitations': item['limits'], 'reviewReason': '官方具名硕士就业记录，不是导师口碑。',
        'verificationStatus': '原文实际核读，学位类型交叉核实；导师未公开。',
        'readingScopes': [item['readingScope']], 'screenshots': copy.deepcopy(record['screenshots']),
        'screenedOnly': False, 'needsVerification': False,
    }
    extend(data['socialPosts'], [post])
    for entry in patch['sources']:
        evidence = {'key': 'official:firm-outcomes-20261114:' + entry['code'], 'ids': [entry['code']],
            'title': entry['title'], 'date_display': entry['date'], 'url': entry['url'],
            'canonical_url': entry['canonicalUrl'], 'summary': entry['summary'], 'population': entry['population'],
            'tips': [entry['summary']], 'comments': [], 'limits': entry['limits'], 'topic': '学生就业与事务所公开资料',
            'use_status': '有范围的官方资料', 'reading_scopes': [entry['readingScope']], 'official': True, 'screened_only': False}
        extend(data['officialEvidence'], [evidence], 'key')
    data['meta']['counts'].update(studentOutcomes=len(hub['records']), socialPosts=len(data['socialPosts']), officialEvidence=len(data['officialEvidence']))
    data['meta']['socialPostCategories'] = dict(Counter(item.get('category', '') for item in data['socialPosts']))
    targets = [item for item in hub['records'] if item['outcome'].get('firmGroup') in ['big4', 'domestic8']]
    people = lambda values: len({item.get('personId') or item['studentName'] for item in values})
    report = {'batch': 'firm-outcomes-20261114', 'recordCount': len(hub['records']), 'people': people(hub['records']),
        'mpaccRecords': sum(item['degree'] == 'MPAcc' for item in hub['records']),
        'mpaccPeople': people([item for item in hub['records'] if item['degree'] == 'MPAcc']),
        'targetFirmPeople': people(targets), 'mpaccTargetFirmPeople': people([item for item in targets if item['degree'] == 'MPAcc']),
        'namedTargetFirmPeopleWithMentor': people([item for item in targets if item.get('mentorId') and item.get('relationshipStatus') == 'confirmed']),
        'qualitativeMentorStatements': len(hub['mentorCareerStatements']), 'employerSummaries': len(hub['employerSummaries']),
        'sourceRegistryEntries': len(registry), 'newRecordIds': [item['id'] for item in patch['records']],
        'scope': '具名就业、整体历史就业统计、导师未具名描述、学校雇主举例分别保留；不从共著、实习、offer或合作单位推导师就业人数。'}
    data['meta']['firmOutcomeResearch'] = report
    save(DATA, data)
    save(BATCH / 'merge-report.json', report)
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()
