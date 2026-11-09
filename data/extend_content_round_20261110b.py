#!/usr/bin/env python3
from collections import Counter
from copy import deepcopy
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / 'data/content_round_20261110b'
SITE = ROOT / 'dist/data/site-data.json'
BATCH = 'content-round-20261110b'


def read(path):
    return json.loads(path.read_text())


def write(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')


def canonical(url):
    match = re.search(r'/c\d+a(\d+)/page\.(?:htm|psp)', url or '')
    return 'nau-article:' + match[1] if match and '.nau.edu.cn/' in url else url


def main():
    data = read(SITE)
    protected = {key: deepcopy(data[key]) for key in ['mentors', 'mentorCards', 'downloads', 'musicPlaylist', 'lifeImageIndex']}
    baseline = {'visibleSources': sum(not p.get('screenedOnly') and '排除' not in p['category'] and p['category'] != '仅筛选记录' for p in data['socialPosts']),
                'firms': len(data['internships']['firms']), 'resources': sum(len(f['resources']) for f in data['internships']['firms']),
                'sourceRegistry': len(data['sourceRegistry']), 'officialEvidence': len(data['officialEvidence'])}
    report_path = INPUT / 'merge-report.json'
    if report_path.exists():
        baseline = read(report_path)['baseline']
    source_map = {}
    additions = []

    def register(url, title, date, summary, kind, identity, scope, limits):
        key = canonical(url)
        for code, source in data['sourceRegistry'].items():
            if key in [canonical(source.get(field)) for field in ['url', 'canonicalUrl', 'originalUrl']]:
                return code
        number = 916
        while 'U' + str(number) in data['sourceRegistry']:
            number += 1
        code = 'U' + str(number)
        data['sourceRegistry'][code] = {'code': code, 'title': title, 'label': title, 'url': url, 'canonicalUrl': url,
            'originalUrl': url, 'date': date, 'summary': summary, 'kind': kind, 'population': identity,
            'readingScope': scope, 'limitations': limits, 'expansionBatch': BATCH}
        data['officialEvidence'].append({'key': 'official:' + BATCH + ':' + code, 'ids': [code], 'title': title,
            'date_display': date, 'url': url, 'canonical_url': url, 'summary': summary, 'population': identity,
            'tips': [], 'comments': [], 'limits': limits, 'topic': kind, 'use_status': kind,
            'reading_scopes': [scope], 'official': True, 'screened_only': False})
        return code

    def add_post(item, code, platform, category, topic, population, tips, limits, date):
        post = {'id': item['id'], 'key': platform + ':' + item['id'], 'sourceIds': [code],
            'canonicalUrl': item['url'], 'url': item['url'], 'title': item['title'], 'author': platform,
            'date': date, 'platform': platform, 'category': category, 'topic': topic, 'population': population,
            'campus': '按原文的学段与项目所在地', 'summary': item['summary'], 'tips': tips, 'comments': [],
            'limitations': limits, 'reviewReason': '保留原始身份和年份；用于理解学习与岗位，不推定当年名额或导师口碑。',
            'verificationStatus': '原始发布正文可核对；适用范围见说明', 'screenedOnly': False,
            'needsVerification': True, 'readingScopes': [], 'expansionBatch': BATCH}
        existing = next((entry for entry in data['socialPosts'] if entry['id'] == item['id']), None)
        if existing:
            if existing.get('expansionBatch') == BATCH:
                existing.update(post)
        else:
            additions.append(post)

    stories = read(INPUT / 'stories-research.json')['adopted']
    story_limits = {
        'nau-liang-siyuan-study-246821158': '2018年审计学硕个人访谈；可参考阅读和汇报方法，不能据此判断当前MPAcc课程考核或教师的统一要求。',
        'nau-mpacc-nantong-practice-50277': '2019年四位MPAcc学生的群体反馈，未公布姓名、具体岗位任务和现行申请名额；当年约三个月实习不是当前实践时长要求。',
        'nau-parttime-mpacc-thesis-sharing-50541': '2019年非全日制MPAcc群体交流，未给出逐人论文题目或学生原话；全日制及当前年级的培养节点以本级安排为准。',
        'nau-mpacc-case-team-50391': '记录为2019年案例赛阶段成绩，并非当前赛事规则或最终全国奖项；没有学生对导师指导的个人评价，文中的本科团队与MPAcc团队分别看待。',
        'nau-accounting-student-feedback-157425': '参会者包含会计学与会计专业研究生，未逐人具名。报道列出反馈问题类型，没有公布逐项处理结果，不能据此认定当前仍有同样问题。',
        'nau-yin-zhengxin-research-31456': '2017年MAud历史访谈；当时的学制与机关实习安排不代表现在MPAcc的制度或申请名额。',
        'nau-wang-nannan-thesis-31458': '2017年MAud个人自述；可参考文献整理和时间规划，当前MPAcc的学制、实践学分和实习安排应核对本级通知。',
        'nau-jiao-sheng-thesis-life-31464': '2017年MAud个案；约每两周交流仅为该学生当年的经历，不代表MPAcc统一组会频率或毕业要求。',
    }
    for item in stories:
        identity = '；'.join(item['identities'])
        code = register(item['url'], item['title'], item['published_date'], item['summary'], item['source_type'],
                        identity, item['reading_scope'], item['limits'])
        source_map[item['id']] = code
        tips = [point for point in item['evidence'] if not point.startswith('原文开头写')]
        category = '学习生活资料' if item['published_date'].startswith('2026') else '历史学习经验'
        add_post(item, code, item['source'], category, item['theme'], identity, tips, story_limits[item['id']], item['published_date'])

    jobs = read(INPUT / 'internships-research.json')['resources']
    clean_conditions = {
        'hutchmed': {'eligibility': '本科及以上在校生，正文要求财会相关专业（表格专业栏另写不限，投递前请核实）。', 'duration': '连续实习6个月及以上优先。'},
        'zeron': {'eligibility': '财务相关专业硕士在校生。', 'attendance': '每周出勤3天以上优先。', 'duration': '持续半年以上优先。'},
    }
    clean_limits = {
        'hutchmed': ['学校页面有效期不保证实际余缺；到岗及证明安排以招聘方确认为准。'],
        'zeron': ['招聘人数为原公告需求，当前余缺需向招聘方确认。'],
        'fosun-fssc': ['岗位要求至少3个月；满2个月可开证明不等于最短只需实习2个月。', '留用机会以应届身份和用人部门考核为条件。'],
        'suning': ['职位标题及导航属于实习，系统工作性质字段显示全职；在校生接受范围及周出勤须另核。', '优秀者直通管培生招录属于有条件机会，不保证转正。'],
        'shzhiming': ['周出勤、最短时长和申请截止未注明。', '原公告人数不等于当前余缺。'],
    }
    for job in jobs:
        date = job['date']
        if job.get('date_evidence'):
            date = date + '（来源路径与检索标注）'
        limits = list(clean_limits[job['firm_id']])
        conditions = {**job['conditions'], **clean_conditions.get(job['firm_id'], {})}
        salary = conditions.get('salary_raw')
        if salary and not conditions.get('salary_period'):
            limits = [item for item in limits if '薪资' not in item]
            limits.append('公告薪资栏为' + salary + '，未注明结算周期，需向招聘方确认。')
        elif salary:
            limits.append('原公告薪酬：' + salary + '；当前安排以招聘方确认为准。')
        limit_text = '；'.join(limits)
        code = register(job['source_urls'][0], job['firm_name'] + '｜' + job['title'], date,
            job['duties_summary'], '具体财务实习职位资料', conditions.get('eligibility'), job['read_scope'], limit_text)
        source_map[job['resource_id']] = code
        instructions = ['先核对公告有效期、当前余缺和实际项目地点。']
        if job['real_application_url'].startswith('mailto:'):
            instructions.append('原文招聘邮箱：' + job['real_application_url'][7:])
        if job['firm_id'] in ['hutchmed', 'fosun-fssc']:
            instructions.append(job['application_instructions'])
        elif job['firm_id'] == 'suning':
            instructions.append('从官方详情页的“我要申请”进入；页面提示最多申请1个职位，请先核对岗位。')
        if job['status'] == 'published_with_future_validity':
            label = '公告有效期内 · 余缺待核'
        else:
            label = '岗位资料 · 时效待核'
        status_detail = job['status_detail']
        if job['firm_id'] in ['fosun-fssc', 'suning']:
            status_detail = '页面未列发布日期或申请截止，当前余缺和适用届别需向招聘方确认。'
        resource = {'id': job['resource_id'], 'title': job['title'], 'kind': 'job_listing',
            'status': 'listing_seen', 'statusLabel': label, 'statusDetail': status_detail,
            'cityTags': job['city_tags'], 'searchCities': [], 'geographyNote': job['actual_location'],
            'eligibility': conditions.get('eligibility'), 'attendance': conditions.get('attendance'),
            'duration': conditions.get('duration'), 'applicationWindow': None, 'period': None,
            'deadline': job['deadline'] + '（平台公告有效期）' if job['deadline'] else None,
            'deadlineDate': job['deadline'], 'postedDate': date, 'url': job['source_urls'][0],
            'summary': job['duties_summary'], 'requirements': conditions.get('skills', []), 'steps': instructions,
            'roleDirections': ['企业财务'], 'limits': limits, 'sourceIds': [code]}
        firm = next((firm for firm in data['internships']['firms'] if firm['id'] == job['firm_id']), None)
        if firm is None:
            firm = {'id': job['firm_id'], 'name': job['firm_name'], 'officialName': job['firm_name'],
                'group': 'enterprise', 'summary': '根据具体职位核对学籍、可出勤时间与工作内容；不是南审专属名额。',
                'officeRecords': [], 'entryLinks': [{'label': '职位原文与申请方式', 'url': job['source_urls'][0],
                    'kind': 'internship', 'sourceIds': [code], 'note': '按职位原文核对当前是否仍接受申请。'}],
                'resources': [], 'questions': ['目前是否仍招募，是否接受自己的年级与预计毕业时间？',
                    '实际到岗地点、周出勤、连续时长与课程及论文安排能否协调？'], 'prep': []}
            data['internships']['firms'].append(firm)
        existing_resource = next((entry for entry in firm['resources'] if entry['id'] == resource['id']), None)
        if existing_resource:
            existing_resource.update(resource)
        else:
            firm['resources'].append(resource)
        post = {'id': 'job-' + job['resource_id'], 'title': job['title'], 'url': job['source_urls'][0],
                'summary': job['duties_summary'] + ' ' + status_detail}
        details = [str(value) for value in [conditions.get('eligibility'), conditions.get('attendance'), conditions.get('duration')] if value]
        add_post(post, code, '企业职位原文／高校就业网', '实习申请资料', '企业财务实习',
                 conditions.get('eligibility'), details, limit_text, date)

    fresh = [post for post in additions if post['category'] != '历史学习经验']
    historical = [post for post in additions if post['category'] == '历史学习经验']
    data['socialPosts'] = fresh + data['socialPosts'] + historical
    chapter = next(chapter for chapter in data['lifeChapters'] if chapter['id'] == 'life-08')
    marker = '把实习和论文准备连起来'
    if not any(block.get('text') == marker for block in chapter['blocks']):
        thesis = source_map['nau-mpacc-nantong-practice-50277']
        writing = source_map['nau-wang-nannan-thesis-31458']
        case = source_map['nau-mpacc-case-team-50391']
        feedback = source_map['nau-accounting-student-feedback-157425']
        chapter['blocks'].extend([
            {'type': 'heading', 'text': marker},
            {'type': 'p', 'text': '2019年MPAcc工作站走访记录把阶段实习汇报和论文选题讨论放在同一次交流中；2017年MAud访谈则分享了提前推进写作、用节点协调实习的方法。这些是历史参考，可以借来整理自己的材料，不是当前MPAcc时长或分配规定。[' + thesis + '][' + writing + ']', 'sourceCodes': [thesis, writing]},
            {'type': 'list', 'items': ['每阶段记下做过的任务、遇到的业务问题、已有证据与尚缺材料，再与导师讨论题目是否可开展。',
                '参加案例赛前先协调出勤、分工与提交节点。2019级别的团队报道可帮助认识这一过程，当前赛事要求另看当年通知。[' + case + ']',
                '课程学分、开题答辩、系统或住宿问题可通过学委和学院反馈；2026年5月座谈会记录了这些问题类型，未公开逐项处理结果。[' + feedback + ']'], 'sourceCodes': [case, feedback]},
        ])
        chapter['sourceCodes'] = list(dict.fromkeys(chapter.get('sourceCodes', []) + [thesis, writing, case, feedback]))

    data['meta']['counts'].update(socialPosts=len(data['socialPosts']), officialEvidence=len(data['officialEvidence']))
    data['meta']['socialPostCategories'] = dict(Counter(post['category'] for post in data['socialPosts']))
    firms = data['internships']['firms']; resources = [resource for firm in firms for resource in firm['resources']]
    data['internships']['counts'].update(firmCount=len(firms), enterpriseCount=sum(firm['group'] == 'enterprise' for firm in firms),
        resourceCount=len(resources), internshipResourceCount=sum(resource['kind'] not in ['graduate_recruitment','preparation_program','organization_reference'] for resource in resources),
        resourceStatusCounts=dict(Counter(resource['status'] for resource in resources)), socialTotal=len(data['socialPosts']), officialTotal=len(data['officialEvidence']))
    used_sources = set()
    def collect_sources(value):
        if isinstance(value, dict):
            for key, item in value.items():
                if key == 'sourceIds':
                    used_sources.update(item)
                else:
                    collect_sources(item)
        elif isinstance(value, list):
            for item in value:
                collect_sources(item)
    collect_sources(data['internships'])
    assert used_sources <= data['sourceRegistry'].keys()
    data['internships']['counts']['usedSourceCount'] = len(used_sources)
    visible = sum(not post.get('screenedOnly') and '排除' not in post['category'] and post['category'] != '仅筛选记录' for post in data['socialPosts'])
    assert len({post['id'] for post in data['socialPosts']}) == len(data['socialPosts'])
    assert len({resource['id'] for resource in resources}) == len(resources)
    for key, value in protected.items():
        assert data[key] == value, key
    for resource in resources:
        assert all(code in data['sourceRegistry'] for code in resource['sourceIds'])
    write(SITE, data)
    html = ROOT / 'dist/index.html'
    html.write_text(re.sub(r'(<strong>)\d+(</strong><span>条原帖与访谈</span>)', lambda match: match[1] + str(visible) + match[2], html.read_text()))
    report = {'baseline': baseline, 'after': {'visibleSources': visible, 'firms': len(firms), 'resources': len(resources),
        'sourceRegistry': len(data['sourceRegistry']), 'officialEvidence': len(data['officialEvidence'])},
        'sourceMap': source_map, 'addedPosts': [post['id'] for post in data['socialPosts'] if post.get('expansionBatch') == BATCH],
        'historicalSourcesKeepDatesAndDegrees': True, 'currentJobVacanciesNotGuaranteed': True}
    write(report_path, report)
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()
