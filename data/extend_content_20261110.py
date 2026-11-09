#!/usr/bin/env python3
"""Merge source-backed practice stories and employer resources into the guide."""
from collections import Counter
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
RESEARCH = ROOT / 'data/content_refresh_20261110'
SITE = ROOT / 'dist/data/site-data.json'


def read(path):
    return json.loads(path.read_text())


def save(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def identity(url):
    article = re.search(r'/c\d+a(\d+)/page\.(?:htm|psp)', url or '')
    return 'nau-article:' + article[1] if article and '.nau.edu.cn/' in url else (url or '').rstrip('/')


def merge():
    data = read(SITE)
    protected = {key: deepcopy(data[key]) for key in ('mentors', 'mentorCards', 'musicPlaylist', 'downloads')}
    before = {key: len(data[key]) for key in ('socialPosts', 'officialEvidence', 'sourceRegistry')}
    before['firms'] = len(data['internships']['firms'])
    before['resources'] = sum(len(f['resources']) for f in data['internships']['firms'])
    previous_report = RESEARCH / 'merge-report.json'
    if previous_report.exists():
        before = read(previous_report)['baseline']
    old_post_ids = {post['id'] for post in data['socialPosts']}
    stories = read(RESEARCH / 'posts-research.json')
    officials = read(RESEARCH / 'official-research.json')['sources']
    employers = read(RESEARCH / 'internship-firm-drafts.json')
    source_map = {}

    def register(url, title, date=None, summary='', kind='官方资料', population='', scope='', limits=''):
        key = identity(url)
        for code, entry in data['sourceRegistry'].items():
            if key and any(identity(entry.get(field)) == key for field in ('url', 'canonicalUrl', 'originalUrl')):
                return code
        n = 901
        while f'U{n}' in data['sourceRegistry']:
            n += 1
        code = f'U{n}'
        data['sourceRegistry'][code] = {
            'code': code, 'title': title, 'label': title, 'url': url,
            'originalUrl': url, 'canonicalUrl': url, 'date': date,
            'platform': '官方原始发布', 'kind': kind, 'population': population,
            'summary': summary, 'readingScope': scope, 'limitations': limits,
            'expansionBatch': 'web-content-20261110',
        }
        return code

    def add_official(code, summary, topic, tips=(), population='', limits=''):
        source = data['sourceRegistry'][code]
        if any(identity(row.get('canonical_url') or row.get('url')) == identity(source['url']) for row in data['officialEvidence']):
            return
        data['officialEvidence'].append({
            'key': f'official:content-refresh:{code}', 'ids': [code], 'title': source['title'],
            'author': None, 'date_display': source.get('date'), 'url': source['url'],
            'canonical_url': source['url'], 'population': population, 'summary': summary,
            'tips': list(tips), 'comments': [], 'limits': limits, 'topic': topic,
            'use_status': source['kind'], 'reading_scopes': [source.get('readingScope', '')],
            'official': True, 'screened_only': False,
        })

    new_posts = []

    def add_post(post_id, title, url, codes, date, platform, population, summary, tips, limits,
                 topic='就业与实习', category='可用生活学习线索', status='原文可核对'):
        if post_id in old_post_ids:
            return
        new_posts.append({
            'id': post_id, 'key': platform + ':' + post_id, 'sourceIds': codes,
            'canonicalUrl': url, 'url': url, 'title': title, 'author': platform,
            'date': date, 'platform': platform, 'topic': topic, 'campus': '按原文具体项目所在地',
            'population': population, 'summary': summary, 'tips': list(tips), 'comments': [],
            'limitations': limits, 'category': category, 'reviewReason': '用于理解具体任务和准备方向，不作为导师口碑或在招名额依据。',
            'verificationStatus': status, 'needsVerification': True, 'screenedOnly': False,
            'promotion': None, 'readingScopes': [], 'expansionBatch': 'web-content-20261110',
        })
        old_post_ids.add(post_id)

    story_codes = []
    for item in stories['adopted']:
        population = '；'.join(item['identities'])
        code = register(item['url'], item['title'], item['published_date'], item['summary'],
                        item['source_type'], population, item['reading_scope'], item['limits'])
        source_map[item['id']] = code
        story_codes.append(code)
        add_post(item['id'], item['title'], item['url'], [code], item['published_date'], item['source'],
                 population, item['summary'], item['evidence'], item['limits'])
        add_official(code, item['summary'], '学生实习任务与能力准备', item['evidence'], population, item['limits'])

    directory = stories['directory']
    directory_summary = '按地区浏览国家审计学院发布的2026年审计专硕实习文章，含安徽、无锡、云南、扬州、南京、上海等地。目录用于寻找原文，历史经历不等于当前招聘。'
    directory_limits = 'MAud经验目录，非MPAcc统一实习安排。这里只整理目录标题与日期，不对各篇未核读正文归纳结论。'
    code = register(directory['url'], directory['title'], summary=directory_summary, kind='官方学生实践目录',
                    population='审计专业硕士；不能直接套用MPAcc', scope='官网两页目录标题与日期', limits=directory_limits)
    source_map['directory'] = code
    add_post(directory['id'], directory['title'], directory['url'], [code], None, directory['source'],
             '审计专业硕士MAud的历史实践目录', directory_summary,
             [entry['directory_date'] + '｜' + entry['title'] for entry in directory['entries']],
             directory_limits, status='官方目录；各篇正文需另行核对')
    add_official(code, directory_summary, '官方学生实践目录', population='审计专业硕士MAud', limits=directory_limits)

    official_codes = []
    for item in officials:
        code = register(item['url'], item['title'], item['published_date'], item['summary'], '行业实务讲座报道',
                        '会计学院研究生及相关师生；不等于学生实习经历', item['reading_scope'], item['limitations'])
        official_codes.append(code)
        add_post('nau-practice-seminar-' + re.search(r'a(\d+)', item['url'])[1], item['title'], item['url'], [code],
                 item['published_date'], item['publisher'], '会计学院研究生；行业专家分享，非学生个人评价',
                 item['summary'], [], item['limitations'], topic='财会实务与能力准备', category='实务学习资料')
        add_official(code, item['summary'], '财会实务与能力准备', limits=item['limitations'])

    for key, item in employers['sources'].items():
        if item.get('existingSourceId'):
            code = item['existingSourceId']
            assert code in data['sourceRegistry']
        else:
            code = register(item['url'], item['title'], item.get('date'), kind='单位官方入口或校方、雇主公告',
                            scope=item['readScope'], limits='单位入口和历史活动不等于当前在招实习岗位；资格及名额以具体公告为准。')
        source_map[key] = code
        add_official(code, item['title'], '实习单位与申请渠道', limits='具体岗位、期限、资格和余量须按原文核对。')

    def map_sources(value):
        if isinstance(value, list):
            return [map_sources(item) for item in value]
        if isinstance(value, dict):
            return {key: [source_map.get(code, code) for code in item] if key == 'sourceIds'
                    else map_sources(item) for key, item in value.items()}
        return value

    for firm in map_sources(employers['firms']):
        for resource in firm['resources']:
            if resource['id'] == 'db-getein-official':
                resource['kind'] = 'organization_reference'
                resource['statusLabel'] = '企业资料 · 非招聘公告'
            if resource['id'].endswith('-nau-fair') or resource['id'] == 'db-zmgc-nau-selection':
                resource['cityTags'] = []
                resource['geographyNote'] = '南京是招聘会举办地，不能据此确认岗位城市；实际项目与驻地须单独核对。'
        if firm['id'] == 'tianheng':
            firm['summary'] += ' [I859]'
        existing = next((index for index, row in enumerate(data['internships']['firms']) if row['id'] == firm['id']), None)
        if existing is None:
            data['internships']['firms'].append(firm)
        else:
            data['internships']['firms'][existing] = firm

    data['internships']['expansionInstitutions'] = [row for row in data['internships']['expansionInstitutions'] if row['id'] != 'local-tianheng']
    data['internships']['firmGroupNote'] = '按四大、国内所和企业财务与内审分组查找；“八大”不是官方统一名单或本页排名。'
    for row in map_sources(employers['expansionInstitutions']):
        if row['id'] not in {entry['id'] for entry in data['internships']['expansionInstitutions']}:
            data['internships']['expansionInstitutions'].append(row)

    zmgc = source_map['zmgc-nankai-intern']
    add_post('zmgc-audit-internship-20261103', '中名国成审计实习生：上海等地雇主公告', employers['sources']['zmgc-nankai-intern']['url'],
             [zmgc], '2026-11-03', '南开大学就业网（雇主发布）', '公告学历栏列本科；MPAcc研究生是否可报需向招聘方确认',
             '11月发布的审计实习公告，工作地域含上海。页面列10人，尚未公布申请截止、周出勤与最低周期，申请前应核对项目实际驻地和剩余名额。',
             ['工作地域：上海、北京、天津、重庆、河北。', '薪资数字未标明结算周期，不能直接理解为月薪或日薪。'],
             '是近期雇主公告，不保证当前仍有空缺；不把本科栏自动改成硕士均可申请。', category='实习申请资料')
    rail = source_map['nau-railway-base']
    add_post('nau-jiangsu-railway-base-163076', '江苏省铁路集团审计实践基地：合作范围与申请边界', employers['sources']['nau-railway-base']['url'],
             [rail], '2026-10-23', '南京审计大学新闻网', '校级产教合作；未限定MPAcc或公布学生名额',
             '省审计厅、南审与省铁路集团共建实践基地，提供企业内审、国资监管及风险防控的实践与研究场景。学生批次与申请安排需由学院确认。',
             ['合作活动发生于2026年10月21日，官方报道发布于10月23日。'],
             '基地揭牌不是实习招聘公告；没有公开学生报名入口、实习周期或当前名额。', category='校内合作资料')
    fair = source_map['nau-fair-preview']
    add_post('nau-accounting-employer-fair-162709', '南审招聘会中的事务所、企业财务与内审方向', employers['sources']['nau-fair-preview']['url'],
             [fair, source_map['nau-fair-review']], '2026-10-13', '南京审计大学社会审计学院', '2027届毕业生招聘活动；实习和正式校招须逐项区分',
             '招聘会名单可帮助比较事务所审计、咨询和企业财务、内审方向。回顾记载中名国成安排了实习项目选拔；其他岗位是否属于实习要分别确认。',
             ['大信、中汇、天衡列有审计或咨询方向。', '基蛋生物列财务核算与内部审计，特变电工列财务、内控与资金管理方向。'],
             '2026年10月14日活动已举行，不是当前报名页，也不代表全部岗位面向普通在校生。', category='历史职业参考')

    data['socialPosts'] = new_posts + data['socialPosts']
    life8 = next(row for row in data['lifeChapters'] if row['id'] == 'life-08')
    marker = '从具体任务理解实习'
    if not any(row.get('text') == marker for row in life8['blocks']):
        life8['blocks'].extend([
            {'type': 'heading', 'text': marker},
            {'type': 'p', 'text': '单位名称之外，更值得提前了解的是实际任务。下面材料来自其他审计专硕的具名经历或小组汇报，可用于认识工作内容；MPAcc的派出安排、认定手续与学分仍按本级要求。'},
            {'type': 'table', 'headers': ['实践场景', '原文中的具体任务', '可以怎样准备'], 'rows': [
                ['企业财务共享与审计轮岗', '南钢报销审核、费用标准核对、差旅对比和整改跟踪。[' + story_codes[0] + ']', '熟悉凭证附件检查，练习Excel分类汇总和差异比对。'],
                ['城建项目账务', '浦口城乡建设集团按项目梳理序时账与项目收支。[' + story_codes[0] + ']', '练习把账务记录转成项目表，保留分类口径与勾稽关系。'],
                ['工程与数智审计', '数据治理、模型筛查、合同审查与现场核验。[' + story_codes[1] + ']', '把数据分析结果与原始证据核对，了解业务后再解释异常。'],
                ['企业内部审计', '内控优化、风险识别与审计信息系统建设。[' + story_codes[2] + ']', '梳理业务流程、控制点与证据链，用具体任务说明能力。'],
            ], 'sourceCodes': story_codes[:3]},
            {'type': 'p', 'text': '准备企业财务岗位时，可同时了解行政事业单位核算、预决算和绩效管理，以及国企数字化财务的业务场景。讲座资料用于补充岗位认识，不代表讲者所在单位正在招收实习生。[' + ']['.join(official_codes) + ']', 'sourceCodes': official_codes},
        ])
        life8['sourceCodes'] = list(dict.fromkeys(life8.get('sourceCodes', []) + story_codes[:3] + official_codes))
    life9 = next(row for row in data['lifeChapters'] if row['id'] == 'life-09')
    life9['title'] = '第九章 事务所与企业实习准备'
    life12 = next(row for row in data['lifeChapters'] if row['id'] == 'life-12')
    if not any(row.get('url') == directory['url'] for row in life12['blocks']):
        life12['blocks'].append({'type': 'source', 'text': '按地区浏览国家审计学院学生实习经验目录（MAud历史经历）', 'url': directory['url']})

    manifest = read(RESEARCH / 'screenshot-manifest.json')
    shots = manifest['images']
    for shot in shots:
        path = ROOT / shot['file']
        assert path.exists() and hashlib.sha256(path.read_bytes()).hexdigest() == shot['sha256']
    for post in data['socialPosts']:
        urls = {identity(post.get('url'))}
        urls.update(identity(data['sourceRegistry'].get(code, {}).get('url')) for code in post.get('sourceIds', []))
        matching = [deepcopy(shot) for shot in shots if identity(shot['sourceUrl']) in urls
                    or post['id'] == directory['id'] and shot['sourceUrl'].startswith('https://sga.nau.edu.cn/2044/')]
        if matching:
            existing_shots = {shot['src']: shot for shot in post.get('screenshots', [])}
            existing_shots.update({shot['src']: shot for shot in matching})
            post['screenshots'] = list(existing_shots.values())
    for code, entry in data['sourceRegistry'].items():
        matching = [deepcopy(shot) for shot in shots if identity(shot['sourceUrl']) == identity(entry.get('url'))
                    or code == source_map['directory'] and shot['sourceUrl'].startswith('https://sga.nau.edu.cn/2044/')]
        if matching:
            entry['screenshots'] = matching
    enterprise_shots = [shot for shot in shots if '156017' in shot['sourceUrl']]
    if enterprise_shots and not any(block.get('type') == 'screenshots' and block.get('sourceUrl') == stories['adopted'][0]['url'] for block in life8['blocks']):
        life8['blocks'].append({'type': 'screenshots', 'items': enterprise_shots, 'sourceUrl': stories['adopted'][0]['url']})
    for firm in data['internships']['firms']:
        for resource in firm['resources']:
            if resource['id'] in ('db-daxin-nau-fair', 'db-zmgc-nau-selection'):
                resource['screenshots'] = [shot for shot in shots if identity(shot['sourceUrl']) == identity(resource['url'])]

    counts = data['meta']['counts']
    counts.update(socialPosts=len(data['socialPosts']), officialEvidence=len(data['officialEvidence']))
    data['meta']['socialPostCategories'] = dict(Counter(row['category'] for row in data['socialPosts']))
    firms = data['internships']['firms']
    resources = [row for firm in firms for row in firm['resources']]
    data['internships']['counts'].update({
        'firmCount': len(firms), 'bigFourCount': sum(f['group'] == 'big_four' for f in firms),
        'domesticFirmCount': sum(f['group'] == 'domestic' for f in firms),
        'enterpriseCount': sum(f['group'] == 'enterprise' for f in firms),
        'resourceCount': len(resources),
        'internshipResourceCount': sum(row['kind'] not in ('graduate_recruitment', 'preparation_program', 'organization_reference') for row in resources),
        'resourceStatusCounts': dict(Counter(row['status'] for row in resources)),
        'officeRecordCount': sum(len(f.get('officeRecords', [])) for f in firms),
        'socialTotal': len(data['socialPosts']), 'officialTotal': len(data['officialEvidence']),
    })
    referenced_sources = set()
    def collect_source_ids(value):
        if isinstance(value, dict):
            for key, item in value.items():
                if key == 'sourceIds':
                    referenced_sources.update(item)
                else:
                    collect_source_ids(item)
        elif isinstance(value, list):
            for item in value:
                collect_source_ids(item)
    collect_source_ids(data['internships'])
    assert referenced_sources <= data['sourceRegistry'].keys()
    data['internships']['counts']['usedSourceCount'] = len(referenced_sources)
    for key, value in protected.items():
        assert data[key] == value, key
    assert len({row['id'] for row in data['socialPosts']}) == len(data['socialPosts'])
    assert len({row['id'] for row in firms}) == len(firms)
    assert len({row['id'] for row in resources}) == len(resources)
    for row in new_posts:
        assert all(code in data['sourceRegistry'] for code in row['sourceIds'])
    for firm in firms:
        for row in firm['resources']:
            assert all(code in data['sourceRegistry'] for code in row.get('sourceIds', []))
    save(SITE, data)
    report = {'baseline': before, 'after': {key: len(data[key]) for key in ('socialPosts', 'officialEvidence', 'sourceRegistry')},
              'newPostIds': [row['id'] for row in data['socialPosts'] if row.get('expansionBatch') == 'web-content-20261110'], 'sourceMap': source_map,
              'firms': len(firms), 'resources': len(resources), 'newScreenshots': len(shots),
              'visibleSources': sum(not row.get('screenedOnly') and '排除' not in row['category'] and row['category'] != '仅筛选记录' for row in data['socialPosts']),
              'protectedSectionsUnchanged': True}
    save(RESEARCH / 'merge-report.json', report)
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    merge()
