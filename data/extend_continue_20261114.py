"""Merge the verified continuation sources without resetting earlier research."""
import copy
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BATCH = ROOT / 'data/continue_20261114'
TARGET = ROOT / 'dist/data/site-data.json'


def extend(items, incoming, key='id'):
    positions = {item[key]: index for index, item in enumerate(items)}
    for item in incoming:
        item = copy.deepcopy(item)
        if item[key] in positions:
            items[positions[item[key]]] = item
        else:
            positions[item[key]] = len(items)
            items.append(item)


def main():
    data = json.loads(TARGET.read_text())
    patch = json.loads((BATCH / 'forms/verified-input.json').read_text())
    for source in patch['sources']:
        data['sourceRegistry'][source['code']] = copy.deepcopy(source)
        extend(data['officialEvidence'], [{
            'key': 'official:continue-20261114:' + source['code'],
            'ids': [source['code']], 'title': source['title'],
            'date_display': '未标注', 'url': source['url'],
            'canonical_url': source['url'], 'summary': source['summary'],
            'population': source['population'], 'tips': [source['summary']],
            'comments': [], 'limits': source['limits'],
            'topic': '研究生常用表格与论文写作',
            'use_status': '官网公开模板，适用年级需核对',
            'reading_scopes': [source['readingScope']], 'official': True,
            'screened_only': False,
        }], 'key')
    data['officialDownloads'] = copy.deepcopy(patch['officialDownloads'])
    chapter = next(chapter for chapter in data['lifeChapters'] if chapter['id'] == 'life-11')
    chapter['blocks'] = [block for block in chapter['blocks'] if block.get('continuationBlock') != 'official-downloads']
    position = next((index for index, block in enumerate(chapter['blocks']) if block.get('readingArchive')), len(chapter['blocks']))
    codes = [item['sourceId'] for item in patch['officialDownloads']]
    blocks = [
        {'type': 'heading', 'text': '常用表格直接下载'},
        {'type': 'p', 'text': '以下为学校官网公开模板，未注明适用年级。提交前先核对本级通知。'},
        {'type': 'table', 'headers': ['材料', '什么时候用'], 'rows': [
            [{'label': item['title'], 'url': item['url']}, item['purpose'] + ' [' + item['sourceId'] + ']']
            for item in patch['officialDownloads']
        ]},
    ]
    for block in blocks:
        block.update(continuationBlock='official-downloads', sourceCodes=codes)
    chapter['blocks'][position:position] = blocks
    chapter['sourceCodes'] = list(dict.fromkeys(chapter.get('sourceCodes', []) + codes))
    outcomes = json.loads((BATCH / 'outcomes/verified-patch.json').read_text())
    data['sourceRegistry'].update(copy.deepcopy(outcomes['sourceRegistry']))
    extend(data['officialEvidence'], outcomes['officialEvidence'], 'key')
    extend(data['studentOutcomes'].setdefault('employerSummaries', []),
           outcomes['studentOutcomes']['employerSummaries'])
    for item in data['studentOutcomes']['employerSummaries']:
        if item['id'] == 'FO20261114-EMPLOYERS-2019':
            item['degrees'] = ['MPAcc', 'academic_master', 'master_unspecified']
        elif item['id'] == 'FO20261114-EMPLOYERS-2025':
            item['degree'] = 'MPAcc'
    achievements = json.loads((BATCH / 'reviews/achievement-patch.json').read_text())
    for code, updates in achievements['sourceRegistryUpdates'].items():
        data['sourceRegistry'][code].update(copy.deepcopy(updates))
    extend(data['studentOutcomes'].setdefault('achievements', []), achievements['achievements'])
    data['meta']['counts']['officialEvidence'] = len(data['officialEvidence'])
    TARGET.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'officialTemplates': len(data['officialDownloads']), 'newSources': len(patch['sources']),
                      'registryEntries': len(data['sourceRegistry']), 'officialEvidence': len(data['officialEvidence'])}))


if __name__ == '__main__':
    main()
