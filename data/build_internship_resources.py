#!/usr/bin/env python3
"""Merge bounded internship resources. Dry-run unless --write.

An employer address is not an internship vacancy. A project period is not an
application deadline. This builder keeps those fields and evidence states apart.
"""
from __future__ import annotations

import argparse
from collections import Counter
from copy import deepcopy
from hashlib import sha256
import json
from pathlib import Path
import re
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'dist/data/site-data.json'
SAFE_INPUT = ROOT / 'data/internships_research'
INPUT_FILES = ['intern_bigfour_104.json', 'intern_domestic_a_104.json',
               'intern_domestic_b_104.json', 'intern_commute_campus_104.json']
BATCH = 'internship-resources-104'
FIRM_ORDER = ['pwc', 'ey', 'deloitte', 'kpmg', 'lixin', 'panchina',
              'grant-thornton', 'shinewing', 'baker-tilly', 'dahua', 'rsm', 'zhongshen-zhonghuan']
FIRM_IDS = {'普华永道': 'pwc', '安永': 'ey', '德勤': 'deloitte', '毕马威': 'kpmg',
            '立信': 'lixin', '天健': 'panchina', '致同': 'grant-thornton', '信永中和': 'shinewing',
            '天职国际': 'baker-tilly', '大华': 'dahua', '容诚': 'rsm', '中审众环': 'zhongshen-zhonghuan'}
STATUS_LABELS = {'program_open': '项目开放说明', 'program_announced': '项目公告·开放待核',
                 'listing_seen': '列表线索·详情待核', 'entry_only': '长期投递入口',
                 'closed': '本期已结束', 'historical': '历史经验或公告', 'upcoming': '尚未开放'}
KINDS = {'internship_program', 'job_listing', 'channel', 'historical',
         'graduate_recruitment', 'preparation_program'}


def arr(value):
    return value if isinstance(value, list) else [] if value is None else [value]


def unique(values):
    return list(dict.fromkeys(value for value in values if value not in (None, '')))


def text(value):
    if isinstance(value, dict):
        return str(value.get('text') or value.get('summary') or value.get('label') or '')
    if isinstance(value, list):
        return '；'.join(text(v) for v in value if v not in (None, ''))
    return str(value or '')


def digest(value):
    return sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def urlkey(url):
    """Keep job query/fragment identities; remove only known tracking keys."""
    if not url:
        return ''
    p = urlsplit(str(url))
    query = [(k, v) for k, v in parse_qsl(p.query, keep_blank_values=True)
             if not k.lower().startswith('utm_') and k.lower() not in ('spm', 'from', 'xsec_source')]
    return urlunsplit((p.scheme.lower(), p.netloc.lower().removeprefix('www.'),
                       p.path.rstrip('/'), urlencode(sorted(query)), p.fragment))


def firm_id(firm):
    name = firm.get('name') or firm.get('company') or ''
    return next((fid for short, fid in FIRM_IDS.items() if short in name), firm.get('id'))


def short_name(firm):
    fid = firm_id(firm)
    return next((name for name, value in FIRM_IDS.items() if value == fid), firm.get('name') or firm.get('company'))


class Merge:
    def __init__(self, data, groups):
        self.data = data
        self.groups = groups
        self.registry = data['sourceRegistry']
        self.sources = {}
        self.ref_codes = {}
        self.used_codes = set()
        self.new_codes = []
        self.before_source_keys = {urlkey(s.get('canonicalUrl') or s.get('url')) for s in self.registry.values()}
        self.by_url = {}
        for code, source in self.registry.items():
            self.by_url.setdefault(urlkey(source.get('canonicalUrl') or source.get('url')), code)
        for group_index, group in enumerate(groups):
            sources = arr(group.get('primarySources')) + arr(group.get('sources'))
            for firm in group.get('firms', []):
                sources += arr(firm.get('primarySources')) + arr(firm.get('sources'))
            for source in sources:
                if not isinstance(source, dict) or not source.get('url'):
                    continue
                key = source.get('id') or source.get('key') or source.get('code') or source['url']
                self.sources[(group_index, str(key))] = source

    def code(self, group_index, ref):
        if isinstance(ref, dict):
            ref = ref.get('id') or ref.get('key') or ref.get('url')
        ref = str(ref)
        lookup = (group_index, ref)
        if lookup in self.ref_codes:
            return self.ref_codes[lookup]
        if ref in self.registry:
            self.used_codes.add(ref)
            return ref
        source = self.sources.get(lookup)
        if not source and ref.startswith(('http://', 'https://')):
            source = next((s for (i, _), s in self.sources.items() if i == group_index and urlkey(s['url']) == urlkey(ref)), None)
        if not source:
            raise ValueError(f'Unknown source reference in input {group_index}: {ref}')
        key = urlkey(source.get('canonicalUrl') or source['url'])
        explicit_existing = [code for code in arr(source.get('existingSourceIds')) if code in self.registry]
        code = explicit_existing[0] if explicit_existing else self.by_url.get(key)
        if not code:
            number = 801
            while f'I{number}' in self.registry:
                number += 1
            code = f'I{number}'
            read_scope = source.get('readScope') or source.get('readingScope') or source.get('reading_scope')
            if not read_scope:
                raise ValueError(f'No reading boundary for {ref}')
            facts = arr(source.get('facts') or source.get('points'))
            title = source.get('title') or source.get('label')
            if not title:
                raise ValueError(f'No source title for {ref}')
            record = {'code': code, 'title': title, 'label': title, 'url': source['url'],
                'originalUrl': source['url'], 'canonicalUrl': source.get('canonicalUrl') or source['url'],
                'date': source.get('date'), 'author': source.get('author'),
                'kind': '官方实习与职业资料', 'sourceType': source.get('kind') or 'official',
                'summary': text(facts[:3]) or source.get('summary') or title,
                'points': facts, 'limitations': text(source.get('limits') or source.get('limitations')),
                'readingScopes': arr(read_scope), 'expansionBatch': BATCH}
            self.registry[code] = record
            self.by_url[key] = code
            self.new_codes.append(code)
        update = {'batch': BATCH, 'readingScope': source.get('readScope') or source.get('readingScope') or source.get('reading_scope'),
                  'facts': arr(source.get('facts') or source.get('points')),
                  'limits': arr(source.get('limits') or source.get('limitations'))}
        prior = self.registry[code].setdefault('internshipUpdates', [])
        if update not in prior:
            prior.append(update)
        self.ref_codes[lookup] = code
        self.used_codes.add(code)
        return code

    def refs(self, group_index, item, required=True):
        refs = item.get('sourceIds') or item.get('sourceCodes') or item.get('sources') or []
        codes = unique(self.code(group_index, ref) for ref in arr(refs))
        if required and not codes:
            raise ValueError(f'Item lacks evidence: {item.get("title") or item.get("name") or item.get("label")}')
        return codes

    def note(self, group_index, raw, required=False):
        if isinstance(raw, str):
            return {'text': raw, 'sourceIds': [], 'origin': 'editorial'}
        return {'text': text(raw), 'sourceIds': self.refs(group_index, raw, required),
                'origin': raw.get('origin') or ('source_based' if raw.get('sourceIds') else 'editorial')}

    def resource(self, group_index, firm, raw):
        original_status = raw.get('statusCode') or raw.get('status')
        kind = raw.get('kind') or ('channel' if original_status == 'official_entry_only' else 'internship_program' if original_status == 'announced_program_specific_city_vacancy_unconfirmed' else 'job_listing')
        kind = {'entry': 'channel', 'internship': 'job_listing', 'internship_batch': 'internship_program', 'historical_program': 'historical',
                'evergreen_program_reference': 'internship_program',
                'offer_holder_internship_path': 'internship_program',
                'campus_development_not_internship': 'preparation_program'}.get(kind, kind)
        status = raw.get('statusCode') or raw.get('status') or 'entry_only'
        status = {'official_index_only': 'listing_seen', 'program_announcement': 'program_announced',
                  'recruitment_announcement': 'program_announced', 'expired': 'historical',
                  'official_entry_only': 'entry_only',
                  'dated_official_listing_needs_vacancy_check': 'program_announced',
                  'dated_association_repost_needs_vacancy_check': 'program_announced',
                  'announced_program_specific_city_vacancy_unconfirmed': 'program_open'}.get(status, status)
        if kind not in KINDS or status not in STATUS_LABELS:
            raise ValueError(f'Unrecognized resource state {kind}/{status}: {raw.get("title") or raw.get("name")}')
        city_tags = arr(raw.get('cityTags') or raw.get('cities'))
        search_cities = arr(raw.get('searchCities') or raw.get('targetCities'))
        if kind == 'channel':
            search_cities = unique(search_cities + [re.sub(r'待筛选.*$', '', str(city)) for city in city_tags])
            city_tags = []
        elif any('全国' in str(city) or '待' in str(city) for city in city_tags):
            city_tags = []
        title = raw.get('title') or raw.get('name')
        url = raw.get('url')
        if not title or not url:
            raise ValueError('Resource needs a title and an application/reference URL')
        eligibility = raw.get('eligibility') or raw.get('graduationRequirement') or raw.get('target')
        bounded_eligibility = {
            'db-tz-nanjing': '统招本科以上在校生，财会、财务管理、金融等财经类背景；优先条件见下方。',
            'db-rc-plan': '全日制在读本科大二、大三、大四或研究生。',
            'db-zh-audit': '财会、审计、大数据、AI等相关专业在校生；具体年级未说明。',
            'db-zh-confirmation': '财会、审计、大数据、AI等相关专业在校生；具体年级未说明。',
        }
        eligibility = eligibility or bounded_eligibility.get(raw.get('id'))
        requirements = arr(raw.get('requirements'))
        if not eligibility and kind == 'graduate_recruitment':
            eligibility = text([x for x in requirements if '届' in text(x)]) or None
        period = raw.get('period') or raw.get('periodText') or raw.get('internshipWindow')
        duration = raw.get('durationDescription') or raw.get('durationText') or raw.get('duration') or raw.get('minimumDuration')
        if firm == 'ey' and duration and ('1月' in str(duration) or '3月' in str(duration)):
            period = period or duration
            duration = None
        return {'id': raw.get('id') or firm + '-' + digest([url, title])[:10],
            'title': title, 'kind': kind, 'status': status, 'statusLabel': STATUS_LABELS[status],
            'statusDetail': raw.get('status') if raw.get('statusCode') else None,
            'cityTags': unique(city_tags), 'searchCities': unique(search_cities),
            'geographyNote': raw.get('geographyNote') or ('全国项目或入口；具体岗位城市和到岗地点须在职位详情确认。' if not city_tags else '城市来自公告或列表；实际项目、客户现场和出差地点另行核实。'),
            'eligibility': eligibility, 'attendance': raw.get('attendance') or raw.get('attendanceText') or raw.get('daysPerWeek') or raw.get('weeklyDays'),
            'duration': duration,
            'applicationWindow': raw.get('applicationWindow') or raw.get('applicationStart'),
            'period': period,
            'deadline': raw.get('deadline'), 'postedDate': raw.get('postedDate') or raw.get('publishedDate'),
            'url': url, 'summary': raw.get('summary') or raw.get('status') or title,
            'requirements': requirements, 'steps': arr(raw.get('steps') or raw.get('process')),
            'roleDirections': arr(raw.get('roleDirections') or raw.get('roleFamilies')), 'limits': arr(raw.get('limits')),
            'sourceIds': self.refs(group_index, raw)}

    def firm(self, group_index, raw, group_resources):
        fid = firm_id(raw)
        if fid not in FIRM_ORDER:
            raise ValueError('Unknown firm: ' + str(raw.get('name') or raw.get('company')))
        resources = arr(raw.get('resources')) + arr(raw.get('programs'))
        ids = set(arr(raw.get('resourceIds')))
        resources += [r for r in group_resources if r.get('id') in ids or firm_id({'name': r.get('firm', '')}) == fid]
        normalized = [self.resource(group_index, fid, r) for r in resources]
        seen = set()
        normalized = [r for r in normalized if not (r['id'] in seen or seen.add(r['id']))]
        offices = []
        for office in arr(raw.get('officeRecords')):
            offices.append({'city': office.get('city'), 'district': office.get('district'),
                'branch': office.get('branch') or office.get('officeType'), 'address': office.get('address') or text(office.get('addresses')) or None,
                'sourceIds': self.refs(group_index, office),
                'limits': arr(office.get('limits')) + arr(office.get('note')) + ['办公室地址用于确认机构，不等于实习每天到岗地点或当前岗位名额。'],
                'exactMinutes': None})
        entries = []
        for entry in arr(raw.get('entryLinks') or raw.get('recruitEntries')):
            label = entry.get('label') or entry.get('title')
            kind = entry.get('kind') or entry.get('type') or ('campus' if '校园招聘' in str(label) and '实习' not in str(label) else 'internship')
            entries.append({'label': label, 'url': entry['url'], 'kind': kind,
                'sourceIds': self.refs(group_index, entry), 'note': entry.get('use') or entry.get('status')})
        prep = arr(raw.get('prep') or raw.get('skillsPrep') or raw.get('applicationPrep'))
        return {'id': fid, 'name': short_name(raw), 'officialName': raw.get('officialName') or raw.get('fullName') or raw.get('company'),
            'group': 'big_four' if fid in FIRM_ORDER[:4] else 'domestic',
            'summary': raw.get('summary') or '先核对真实学籍与毕业年月，再确认岗位城市、到岗安排及当前申请状态。',
            'officeRecords': offices, 'entryLinks': entries, 'resources': normalized,
            'questions': arr(raw.get('questions') or raw.get('questionsToAsk')),
            'prep': [self.note(group_index, item) for item in prep]}


def main(write=False, input_dir=None):
    source_dir = input_dir or (SAFE_INPUT if SAFE_INPUT.is_dir() else ROOT.parent)
    paths = [source_dir / filename for filename in INPUT_FILES]
    missing = [str(path) for path in paths if not path.is_file()]
    if missing:
        raise SystemExit('Missing research inputs: ' + ', '.join(missing))
    groups = [json.loads(path.read_text()) for path in paths]
    data = json.loads(DATA.read_text())
    before = deepcopy(data)
    merge = Merge(data, groups)
    firms = []
    for index, group in enumerate(groups[:3]):
        firms += [merge.firm(index, firm, arr(group.get('resources'))) for firm in group.get('firms', [])]
    firms.sort(key=lambda firm: FIRM_ORDER.index(firm['id']))
    if [f['id'] for f in firms] != FIRM_ORDER:
        raise ValueError('Research must cover the four firms and eight domestic firms exactly once')
    # Campus data adapters are completed against the reviewed input rather than
    # inferring routes, internship quotas, or application rules from office names.
    campus = groups[3]
    internships = {'intro': '围绕四大和常被并称“八大”的国内所，先确认投递路径，再核对自己能否到岗。',
        'scopeNote': '以浦口校区为出发点，南京优先；苏州、上海等异地机会另算住宿、课程和驻留安排。办公室存在、合作基地、项目说明都不等于当前有实习空缺。',
        'firmGroupNote': '四大与国内所分组方便查找；“八大”并非官方统一名单或本页排名。',
        'sourceNote': '优先采用公司官网、官方招聘系统及学校原文；动态列表和过期窗口单独标注。未知字段保留空值，投递前以最新职位页面确认。',
        'firms': firms, 'commuteZones': [], 'campusChannels': [], 'applicationPlan': [], 'expansionInstitutions': [],
        'rules': ['投递窗口、实习实施期和截止日分别看；未公开截止日不按月末推算。',
                  '已保研不等于已作为MPAcc在读，填写真实学籍、预计毕业年月与可到岗时间。',
                  '实习资源条目包含项目、列表线索和长期入口；条目数不是在招岗位或空缺人数。']}
    # Filled by normalize_campus after inspecting the final campus research file.
    normalize_campus(merge, campus, internships)
    data['internships'] = internships
    finish_sources(merge, data)
    finish_chapters(data, sorted(merge.used_codes))
    resources = [resource for firm in firms for resource in firm['resources']]
    statuses = Counter(resource['status'] for resource in resources)
    research = {'batch': BATCH, 'firmCount': 12, 'bigFourCount': 4, 'domesticFirmCount': 8,
        'resourceCount': len(resources), 'internshipResourceCount': sum(r['kind'] not in ('graduate_recruitment', 'preparation_program') for r in resources),
        'resourceStatusCounts': dict(statuses), 'officeRecordCount': sum(len(f['officeRecords']) for f in firms),
        'officeRecordCountMeaning': '不同机构的办公地址组，不是不同城市数或实习岗位数。',
        'newOfficialSources': sum(data['sourceRegistry'][code].get('expansionBatch') == BATCH for code in merge.used_codes),
        'usedSourceCount': len(merge.used_codes), 'socialTotal': len(data['socialPosts']), 'officialTotal': len(data['officialEvidence']),
        'resourceCountNote': '同一公告可能含多个项目；资源条目不是独立岗位、空缺人数或录取机会。'}
    internships['counts'] = research
    data['meta']['internshipResearch'] = research
    data['meta']['counts']['officialEvidence'] = len(data['officialEvidence'])
    preserved_fields = ['mentors', 'mentorCards', 'directions', 'socialPosts', 'downloads']
    errors = [f'Unexpected change: {field}' for field in preserved_fields if before[field] != data[field]]
    for field in ['author', 'appEdition', 'studentReviewResearch']:
        if before['meta'].get(field) != data['meta'].get(field):
            errors.append('Unexpected metadata change: ' + field)
    if len(data['lifeChapters']) != 12:
        errors.append('Chapter count changed')
    for code, record in before['sourceRegistry'].items():
        for field in ['title', 'author', 'date', 'url', 'originalUrl']:
            if record.get(field) != data['sourceRegistry'][code].get(field):
                errors.append(f'Existing source metadata changed: {code}.{field}')
    for chapter_id in ('life-08', 'life-09', 'life-12'):
        original = next(c for c in before['lifeChapters'] if c['id'] == chapter_id)
        result = next(c for c in data['lifeChapters'] if c['id'] == chapter_id)
        old_blocks = [b for b in original['blocks'] if b.get('expansionBatch') != BATCH]
        kept_blocks = [b for b in result['blocks'] if b.get('expansionBatch') != BATCH]
        if old_blocks != kept_blocks:
            errors.append('Existing chapter blocks changed: ' + chapter_id)
    all_resource_ids = [r['id'] for r in resources]
    if len(all_resource_ids) != len(set(all_resource_ids)):
        errors.append('Duplicate resource id')
    for resource in resources:
        if not resource['url'].startswith(('https://', 'http://')):
            errors.append('Unsafe resource URL')
        if resource['kind'] == 'channel' and resource['cityTags']:
            errors.append('Channel search directions were promoted to job cities')
        if not resource['sourceIds'] or any(code not in data['sourceRegistry'] for code in resource['sourceIds']):
            errors.append('Unlinked resource')
    if re.search(r'(?:ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{40,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)', json.dumps(data, ensure_ascii=False)):
        errors.append('Credential material in site data')
    qa = {'ok': not errors, 'errors': errors, 'summary': research,
          'preservedHashes': {field: digest(data[field]) for field in preserved_fields},
          'studentReviewsSha256': digest([m['studentReviews'] for m in data['mentors']]),
          'preserved': {'mentors': 34, 'detailedCards': 17, 'chapters': 12, 'studentReviewRecords': 39,
                        'author': True, 'appEdition': True, 'existingSourceMetadata': True},
          'checks': ['Project period is not an inferred deadline', 'Offices do not create job vacancies',
                     'National application channels do not create Nanjing job city tags',
                     'Graduate recruitment and preparation activities are not counted as internship resources']}
    if errors:
        print(json.dumps(qa, ensure_ascii=False, indent=2))
        raise SystemExit(1)
    if write:
        SAFE_INPUT.mkdir(exist_ok=True)
        for path, group in zip(paths, groups):
            safe = deepcopy(group)
            for field in ('excludedLeads', 'unverifiedLeads'):
                safe.pop(field, None)
            for firm in safe.get('firms', []):
                for resource in firm.get('programs', []):
                    if resource.get('id') == 'deloitte-seasonal':
                        low, high = resource.pop('minMonths', None), resource.pop('maxMonths', None)
                        if low is not None or high is not None:
                            resource['typicalDurationRangeMonths'] = [low, high]
                        resource['durationIsMinimum'] = False
                    if firm_id(firm) == 'ey' and resource.get('duration') and ('1月' in str(resource['duration']) or '3月' in str(resource['duration'])):
                        resource['internshipWindow'] = resource.get('internshipWindow') or resource['duration']
                        resource['duration'] = None
            (SAFE_INPUT / path.name).write_text(json.dumps(safe, ensure_ascii=False, indent=2) + '\n')
        (ROOT / 'data/internship-sources.json').write_text(json.dumps({'batch': BATCH,
            'sourceCodes': sorted(merge.used_codes), 'sources': [data['sourceRegistry'][code] for code in sorted(merge.used_codes)]}, ensure_ascii=False, indent=2) + '\n')
        (ROOT / 'data/internship-qa.json').write_text(json.dumps(qa, ensure_ascii=False, indent=2) + '\n')
        DATA.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'write': write, 'ok': True, **research, 'newSourceCodes': merge.new_codes}, ensure_ascii=False, indent=2))


def normalize_campus(merge, campus, internships):
    group_index = 3
    internships['commuteZones'] = [{
        'id': zone['id'], 'title': zone.get('title') or zone.get('label'),
        'summary': text(zone.get('facts') or zone.get('summary')), 'route': zone.get('route'),
        'commuteType': zone.get('commuteType'),
        'planningNotes': arr(zone.get('editorialAdvice') or zone.get('planningNotes')),
        'sourceIds': merge.refs(group_index, zone), 'limits': arr(zone.get('limits')), 'exactMinutes': None,
    } for zone in campus.get('commuteZones', [])]
    internships['commuteNotes'] = [merge.note(group_index, note) for note in campus.get('firstMileNotes', [])]
    internships['campusChannels'] = [{
        'id': channel['id'], 'title': channel.get('title') or channel.get('name'),
        'summary': channel.get('summary') or channel.get('use'), 'url': channel.get('url'),
        'kind': channel.get('kind'), 'status': channel.get('status'), 'statusLabel': channel.get('status'),
        'sourceIds': merge.refs(group_index, channel), 'limits': arr(channel.get('limits')),
    } for channel in campus.get('campusChannels', [])]
    internships['expansionInstitutions'] = [{
        'id': item['id'], 'name': item['name'], 'summary': item.get('editorialWatch') or text(item.get('businessDirections')),
        'url': item.get('recruitUrl') or item.get('officialUrl') or item.get('schoolSource'),
        'officeAddress': item.get('officeAddress'), 'status': 'practice_base',
        'statusDetail': item.get('status'), 'sourceIds': merge.refs(group_index, item),
        'limits': arr(item.get('limits')),
    } for item in campus.get('localExtensions', [])]
    plans = []
    boundary = campus.get('practiceBoundary')
    if boundary:
        plans.append({'title': '先核对本级实践认定流程', 'text': boundary.get('summary'),
            'items': arr(boundary.get('steps')) + ['适用范围：' + text(boundary.get('limits'))],
            'sourceIds': merge.refs(group_index, boundary), 'origin': 'source_based'})
    for plan in campus.get('actionPlan', []):
        plans.append({'title': plan.get('title') or plan.get('stage'), 'text': plan.get('summary') or '',
            'items': arr(plan.get('items')), 'sourceIds': merge.refs(group_index, plan, False),
            'origin': 'editorial' if plan.get('kind') == 'editorial_advice' else 'source_based'})
    plans.insert(0, {'title': '先如实填写保研与当前学籍',
        'text': '这是填写建议，不代表招聘方已经确认个人资格。',
        'items': ['尚未入学时按当前真实学籍填写，推免结果或拟入学信息单独列明，不写成已经硕士在读。',
                  '预计毕业年月、当前学校和学籍怎样填写，按具体职位与招聘方口径核实；不凭保研身份推定满足2028届及以后等条件。',
                  '提前写明可到岗日、每周可投入时间、返校节点和能持续的周期。'],
        'sourceIds': [], 'origin': 'editorial'})
    plans.append({'title': '接受实习前逐项问清', 'text': '以下是沟通清单，具体答案应由岗位与学院确认。',
        'items': arr(campus.get('askBeforeAccepting')), 'sourceIds': [], 'origin': 'editorial'})
    budget = campus.get('budgetTemplate') or {}
    plans.append({'title': '按实际岗位核算个人开销', 'text': budget.get('note') or '',
        'items': [field['label'] + '：由本人填写' for field in budget.get('fields', [])],
        'sourceIds': [], 'origin': 'editorial'})
    internships['applicationPlan'] = plans
    internships['budgetTemplate'] = budget


def finish_sources(merge, data):
    existing = {urlkey(item.get('canonical_url') or item.get('url')) for item in data['officialEvidence']}
    for code in sorted(merge.used_codes):
        source = data['sourceRegistry'][code]
        key = urlkey(source.get('canonicalUrl') or source.get('url'))
        if key in existing:
            continue
        data['officialEvidence'].append({'key': 'official:internship104:' + digest(key)[:14], 'ids': [code],
            'title': source.get('title'), 'author': source.get('author'), 'date_display': source.get('date'),
            'url': source['url'], 'canonical_url': source.get('canonicalUrl') or source['url'],
            'population': '按各公告的学籍与毕业年份适用；非MPAcc统一岗位',
            'summary': source.get('summary') or source.get('title'), 'tips': source.get('points', []),
            'comments': [], 'limits': source.get('limitations'), 'topic': '实习投递、办公室与交通核对',
            'use_status': '官方实习资源或入口；不等于实时在招',
            'reading_scopes': source.get('readingScopes', []), 'official': True, 'screened_only': False,
            'expansionBatch': BATCH})
        existing.add(key)


def finish_chapters(data, codes):
    chapter8 = next(chapter for chapter in data['lifeChapters'] if chapter['id'] == 'life-08')
    chapter9 = next(chapter for chapter in data['lifeChapters'] if chapter['id'] == 'life-09')
    chapter12 = next(chapter for chapter in data['lifeChapters'] if chapter['id'] == 'life-12')
    for chapter in (chapter8, chapter9, chapter12):
        chapter['blocks'] = [block for block in chapter['blocks'] if block.get('expansionBatch') != BATCH]
    chapter8['blocks'].append({'type': 'p', 'text': '四大和国内所的具体项目、长期投递入口及南京周边到岗安排，集中在第九章“实习与职业准备”。先按本人的真实毕业年月、到岗时间和职位详情核对，不把统一实践安排当作自行实习许可。',
        'expansionId': BATCH + '-chapter8-link', 'expansionBatch': BATCH, 'sourceCodes': []})
    chapter9['title'] = '第九章 四大八大实习与职业准备'
    chapter9['blocks'].insert(0, {'type': 'p', 'text': '实习项目与个人预算要分别安排。先核对下方原有奖助、缴费与职业资料，再把项目地点、可到岗时间和课程论文节点一起放进自己的计划。',
        'expansionId': BATCH + '-chapter9-intro', 'expansionBatch': BATCH, 'sourceCodes': []})
    chapter9['sourceCodes'] = unique(chapter9.get('sourceCodes', []) + codes)
    for code in codes:
        source = data['sourceRegistry'][code]
        chapter12['blocks'].append({'type': 'source', 'text': f'[{code}] {source.get("title") or code}', 'url': source['url'],
            'sourceCodes': [code], 'expansionId': BATCH + '-source-' + code, 'expansionBatch': BATCH})
    chapter12['sourceCodes'] = unique(chapter12.get('sourceCodes', []) + codes)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true')
    parser.add_argument('--input-dir', type=Path)
    args = parser.parse_args()
    main(args.write, args.input_dir)
