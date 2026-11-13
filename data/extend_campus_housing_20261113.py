#!/usr/bin/env python3
"""Add a source-backed campus and housing overview, with real source photos."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import re
import shutil
from extend_student_life_20261113 import canonical, joined, read, write

ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / 'data/campus_housing_20261113'
SITE = ROOT / 'dist/data/site-data.json'
BATCH = 'campus-housing-20261113'


def main():
    data = read(SITE)
    protected_keys = ['mentors', 'mentorCards', 'directions', 'downloads', 'musicPlaylist', 'internships', 'socialPosts']
    protected = {key: deepcopy(data[key]) for key in protected_keys}
    author = deepcopy(data['meta']['author'])
    original_images = {entry['id']: deepcopy(entry) for entry in data['lifeImageIndex']['entries'] if entry.get('expansionBatch') != BATCH}
    source_files = [read(INPUT / (name + '.json')) for name in ['dorm-sources', 'campus-intro']]
    sources = [source for source_file in source_files for source in source_file['sources']]
    codes = {}
    for item in sources:
        key = canonical(item['url'])
        code = next((c for c, source in data['sourceRegistry'].items() if key in [canonical(source.get(f)) for f in ['url', 'canonicalUrl', 'originalUrl']]), None)
        if not code:
            number = 974
            while 'U' + str(number) in data['sourceRegistry']:
                number += 1
            code = 'U' + str(number)
            summary, limits, scope = joined(item['facts']), joined(item['limits']), joined(item['reading_scope'])
            data['sourceRegistry'][code] = {'code': code, 'title': item['title'], 'label': item['title'],
                'url': item['url'], 'canonicalUrl': item['url'], 'originalUrl': item['url'], 'date': item['date'],
                'summary': summary, 'kind': '校园与住宿官方资料', 'population': item['population'],
                'readingScope': scope, 'limitations': limits, 'expansionBatch': BATCH}
            data['officialEvidence'].append({'key': 'official:' + BATCH + ':' + code, 'ids': [code],
                'title': item['title'], 'date_display': item['date'], 'url': item['url'], 'canonical_url': item['url'],
                'summary': summary, 'population': item['population'], 'tips': item['facts'], 'comments': [],
                'limits': limits, 'topic': '校园与住宿官方资料', 'use_status': '校园与住宿官方资料',
                'reading_scopes': [scope], 'official': True, 'screened_only': False})
        codes[item['id']] = code
        if data['sourceRegistry'][code].get('expansionBatch') == BATCH:
            data['sourceRegistry'][code].update(population=item['population'], summary=joined(item['facts']),
                limitations=joined(item['limits']), readingScope=joined(item['reading_scope']))
            evidence = next(entry for entry in data['officialEvidence'] if entry['key'] == 'official:' + BATCH + ':' + code)
            evidence.update(population=item['population'], summary=joined(item['facts']), tips=item['facts'],
                limits=joined(item['limits']), reading_scopes=[joined(item['reading_scope'])])

    def refs(*ids):
        return ''.join('[' + code + ']' for code in dict.fromkeys(codes.get(i, i) for i in ids))

    def p(text):
        return {'type': 'p', 'text': text}

    def heading(text):
        return {'type': 'heading', 'level': 2, 'text': text}

    def table(headers, rows):
        return {'type': 'table', 'headers': headers, 'rows': rows}

    def callout(title, text, tone='note', label='认识校园'):
        return {'type': 'callout', 'title': title, 'text': text, 'tone': tone, 'label': label}

    chapters = {c['id']: c for c in data['lifeChapters']}
    for chapter in chapters.values():
        chapter['blocks'] = [block for block in chapter['blocks'] if block.get('campusHousingBatch') != BATCH]

    def install(chapter_id, blocks, title=None, number=None):
        if chapter_id not in chapters:
            chapters[chapter_id] = {'id': chapter_id, 'number': number, 'title': title, 'blocks': [], 'sourceCodes': []}
            data['lifeChapters'].append(chapters[chapter_id])
        for block in blocks:
            block['campusHousingBatch'] = BATCH
        chapters[chapter_id]['blocks'] = blocks + chapters[chapter_id]['blocks']

    install('life-03', [
        heading('宿舍环境先览：先看真实空间，再看入住清单'),
        p('本章图片区可以对照两类实际记录：沁园南向宿舍的上下铺与联排书桌，以及澄园2024年内务活动中的上床下桌。它们展示的是来源当时拍到的房间局部；同一园区也可能有不同楼栋、朝向和改造阶段。先形成空间印象，再用自己的分配通知找对应房间。' + refs('L01', 'DH05')),
        table(['想了解的环境', '目前能看到或确认的情况'], [
            ['床、书桌和收纳', '沁园原帖两张照片可见上下铺、竖排衣柜、联排书桌，另有飘窗版本；澄园2024官方图可见上床下桌、梯子和局部通道。图片并未拍全所有房间，不凭照片估床宽或总人数。' + refs('L01', 'DH05')],
            ['新宿舍是否只是规划', '校方2026年基建回顾明确：浦口新建学生宿舍项目于2025年9月建成，新增床位2600余个。它证明新楼已有建成，未公布MPAcc女生具体分楼，也不代表全部老楼都改为同一标准。' + refs('DH01')],
            ['房间之外有没有公共空间', '2026年4月活动报道明确使用了沁园新宿舍二栋109活动室；澄园2023社区介绍也有书屋、服务与活动空间。实际开放对象、用途和预约按当前安排确认。' + refs('DH03', 'CI05')],
            ['浴室与套间怎么看', '既有泽园资料有多个小寝共用客厅、卫生间和淋浴的记录；卧室人数与套间总人数要分开看。2026沁园11—15栋淋浴房改造公告是工程范围，不能改写成每间寝室独卫。' + refs('L02', 'L101', 'U931')],
            ['空调、洗衣与热水', '沁园一张原图可见壁挂空调外观；本楼是否可用、怎样付费与报修仍需确认。现有资料没有覆盖全校的洗衣、卫浴实拍，设备操作见本章后文。' + refs('L01', 'U933')],
        ]),
        callout('照片里的布置，和现在允许使用的东西分开看', '澄园图来自2024级新生军训内务活动，未确认MPAcc，可以观察床桌与通道。图中床帘属于当时布置，2026公寓规定禁止另拉床帘，不能照图采购安装。照片也不是下一届MPAcc的分房承诺。' + refs('DH05', 'F12'), label='看图时留意'),
        heading('如果想进一步问清一间宿舍'),
        table(['先拿到的信息', '再问到实际生活'], [
            ['园区、楼栋、楼层、朝向与分配床位', '是一间小寝还是套间？本卧室和共用卫浴分别有多少人？'],
            ['同楼、同类型房间近期的完整照片', '床桌形式、柜内空间、走道、窗边与晾晒点；照片是否在最近一次改造之后？'],
            ['实际洗浴、洗衣、饮水和报修点', '从房间走过去是否方便、怎样支付、故障联系谁；不只问“有没有独卫／空调”。'],
        ]),
    ])
    chapters['life-03']['title'] = '第三章 宿舍环境、用品与室友生活'

    # The library's two undated official pages have different room-status information.
    for block in chapters['life-07']['blocks']:
        if block.get('type') == 'p' and block.get('text', '').startswith('浦口图书馆常规表列总服务台'):
            block['text'] = '浦口图书馆常规表列总服务台7:30—22:00、三楼信息共享空间8:30—21:00；另一官方资源目录则将“研究生阅览室”标为“功能调整”。两页均未标独立更新时间，不能只按四楼时刻认定该室当前开放。选座页面另列服务与预约时段：开馆、馆室用途和预约是不同口径，出发前看当前公告、可预约座位并向馆内确认。也不要把某借阅室“全天”解释为全馆通宵。' + refs('F17', 'F18', 'CI02')

    install('life-16', [
        callout('先认识你每天会用到的南审', '学校简介列浦口、莫愁两个校区，以及润园、泽园、澄园、沁园四个书院。对准备来浦口读MPAcc的你，先认校区、园区和具体楼名，能帮助你把每天会用到的地方串起来。下面的官方照片保留拍摄或发布年份，用来认识建筑与公共空间。' + refs('CI01'), label='来之前先看看'),
        heading('校区、学院、书院和宿舍园区，分别是什么'),
        table(['你会看到的名称', '怎样理解更实用'], [
            ['南京审计大学／金审学院', '本指南对应南京审计大学。检索寝室、通知和地图时核对官网学校全称；不能把金审学院住宿照片当作本校MPAcc分配。' + refs('CI01', 'C15')],
            ['浦口／莫愁', '学校有两个校区。2026级MPAcc按研究生通知在浦口报到；未来一届读本人通知，莫愁的住宿和服务不直接套到浦口。' + refs('CI01', 'F06', 'F10')],
            ['会计学院／MPAcc', '这是专业培养和相关研究生事务的入口；审计专硕MAud与会计专硕MPAcc是不同项目，经验帖先核身份。' + refs('F39')],
            ['润园／泽园／澄园／沁园', '这些名字出现在书院、住宿、食堂与校园地理中。学院名不能自动推出你住哪个园区；拿到分配后再查园区、楼栋和本楼设施。' + refs('CI01')],
        ]),
        heading('从校园照片，先建立一点空间印象'),
        p('敏知楼的官方照片能帮助认识临水楼体外观，MPAcc办事地点仍按当前学院信息核对；道路夜景可以看到道路、绿地与校园灯光，照片的长曝光亮度不代表每晚的实际照明；澄典书屋展示的是书院公共阅读空间，也不是寝室内景。' + refs('CI03', 'CI04', 'CI05', 'F39')),
        heading('新楼与既有宿舍，怎样对照着看'),
        p('南审已有新楼，也保留不同年代、类型和改造阶段的住宿空间。2025年项目介绍过新建三栋宿舍，后续校方回顾确认该项目在2025年9月建成；现有历史寝室图还能看到上下铺配联排桌、上床下桌等不同形式。了解环境时，把楼栋、房型与照片年份一起看；第三章集中放了实际房间对照。' + refs('DH01', 'DH02', 'L01', 'DH05')),
        table(['想先了解', '本指南可直接看什么'], [
            ['室内住起来是什么样', '第三章的沁园与澄园真实房间图、床桌收纳与卫浴结构说明。'],
            ['吃饭与周末换口味', '第五章的食堂窗口、江浦商圈和湘味餐饮；与自己的上课、回寝路线一起安排。'],
            ['学费、住宿和日常支出', '第十三章分年度列费用、奖助申请和生活预算，不用从宿舍照片猜费用。'],
            ['天气和衣物', '第十五章按开学、四季与梅雨安排衣物和晾晒。'],
        ]),
        heading('自习、阅读与公共生活，可以慢慢找自己的位置'),
        p('图书馆不仅是自习座位：官方资源目录有专业图书、财经类馆藏分区、外文资料和工具书；信息共享空间提供数据库查询等服务，信息咨询部有数据库利用辅导。想找会计、金融相关资料时，用索书号与馆藏目录可以更快找到所需资料。资源目录将研究生阅览室标为“功能调整”，具体可用空间先向馆内确认。' + refs('CI02')),
        p('书院生活也不只是一间寝室。澄园2023介绍记录过书屋、学生服务、沟通与活动空间；2026沁园新宿舍已有公共活动室开展活动。它们可以帮助你认识校园生活的可能性，但要先查当前用途、开放对象和预约，不默认研究生可随时进入或占作线上面试房。' + refs('CI05', 'DH03')),
        heading('第一次逛校园，可以走一条小环线'),
        table(['从自己住处出发', '现场顺手确认'], [
            ['本楼值班点 → 食堂', '入口、就餐层和回寝方向；选择自己愿意经常吃的一顿饭。'],
            ['食堂 → 本人课表上的教学楼', '楼名、门牌和教室；不把有“敏”字的楼当成同一幢。'],
            ['教学楼 → 图书馆或获准使用的学习空间', '当前座位、预约、饮水与安静要求；讨论和阅览分开。'],
            ['快递点／生活服务 → 宿舍', '取件、重件搬运、洗衣和维修入口；校园地势起伏，第一次留点步行余量。' + refs('F13', 'U929')],
        ]),
        p('先走通自己的日常路线，之后再按兴趣逛书屋、运动场或校园风景。照片帮助想象环境，课表、住宿分配与当期服务通知决定你实际怎样使用这里。'),
        {'type': 'source', 'text': '查看浦口校区中文校园示意图（官网2022年历史标注）', 'url': next(entry['sourceUrl'] for entry in data['lifeImageIndex']['entries'] if entry['sourceCode'] == 'MAP03')},
    ], title='第十六章 先认识南审的校园生活', number=16)

    install('life-12', [heading('学校概况与住宿环境来源')] + [
        {'type': 'source', 'text': '[' + codes[item['id']] + '] ' + item['title'], 'url': item['url']} for item in sources
    ])

    # Publish only the selected room photo; all original bytes remain unchanged.
    room = next(image for image in source_files[0]['image_candidates'] if image['id'] == 'DHI05')
    room_target = ROOT / 'dist/evidence/life/nau-chengyuan-dorm-2024-layout.jpg'
    if not room_target.exists():
        shutil.copy2(room['localImagePath'], room_target)
    assert hashlib.sha256(room_target.read_bytes()).hexdigest() == room['sha256']
    entries = data['lifeImageIndex']['entries']
    entries[:] = [entry for entry in entries if entry.get('expansionBatch') != BATCH]
    entries.append({'id': 'life-housing-chengyuan-2024', 'title': '澄园历史房间 · 上床下桌与通道',
        'chapterIds': ['life-03'], 'sourceCode': codes['DH05'], 'sourceUrl': next(s['url'] for s in sources if s['id'] == 'DH05'),
        'sourceTitle': '澄园2024级新生内务风采秀', 'sourceAuthor': '南京审计大学澄园书院；图片：各新生宿舍',
        'sourceDate': '2024-09-20', 'kind': 'housing', 'primary': True, 'expansionBatch': BATCH,
        'scopeNote': '2024级新生军训内务活动中的历史房间局部，未确认MPAcc。可见床桌、梯子、床栏与通道；不推总人数和床宽。图中床帘不代表现行允许，2026公寓规定禁止另拉床帘。',
        'images': [{'src': './evidence/life/' + room_target.name, 'width': room['width'], 'height': room['height'],
            'bytes': room['bytes'], 'sha256': room['sha256'], 'kind': 'official-source-image', 'originalImageUrl': room['url'],
            'alt': '澄园2024历史寝室上床下桌、梯子与局部通道实拍',
            'caption': '澄园2024历史实拍：上床下桌、梯子与局部通道。照片中的床帘不适用于现行公寓规则，请勿照搬安装。',
            'visualReview': '已直接查看原图，无人物及清晰私人信息；可见床桌、梯子与通道。原始字节未修改。'}]})
    for image_entry in source_files[1]['images']:
        source = next(s for s in sources if s['id'] == image_entry['source_id'])
        entries.append({'id': image_entry['id'], 'title': image_entry['title'], 'chapterIds': image_entry['chapterIds'],
            'sourceCode': codes[image_entry['source_id']], 'sourceUrl': source['url'], 'sourceTitle': image_entry['sourceTitle'],
            'sourceAuthor': source['publisher'] + ('；摄影：张玉优、澄园书院' if source['id'] == 'CI05' else ''),
            'sourceDate': image_entry['date'], 'kind': 'campus', 'scopeNote': image_entry['limits'],
            'images': image_entry['images'], 'expansionBatch': BATCH})
    for entry in entries:
        for image in entry['images']:
            file = ROOT / 'dist' / image['src'].removeprefix('./')
            assert file.exists(), str(file)
            assert hashlib.sha256(file.read_bytes()).hexdigest() == image['sha256'], str(file)
    for entry_id, original in original_images.items():
        assert next(e for e in entries if e['id'] == entry_id) == original
    image_count = len({image['src'] for entry in entries for image in entry['images']})
    source_count = len({canonical(entry.get('sourceUrl')) or entry['sourceCode'] for entry in entries})
    screenshots = sum(image.get('kind') == 'browser-screenshot' for entry in entries for image in entry['images'])
    # Existing screenshot kinds vary; preserve the already audited total of five.
    screenshots = max(screenshots, data['lifeImageIndex']['counts']['reusedBrowserScreenshots'])
    data['lifeImageIndex']['counts'].update(entries=len(entries), images=image_count, sources=source_count,
        reusedBrowserScreenshots=screenshots, newSourceOriginalImages=image_count - screenshots,
        chaptersWithImages=len({chapter_id for entry in entries for chapter_id in entry['chapterIds']}))
    data['lifeImageIndex']['limits'][0] = '来源原图与浏览器截图分别标注；同一来源的多张照片只计一个来源，不以图片张数增加学生评价或体验条数。图片的年份、学段与空间用途见各图注。'
    write(ROOT / 'data/life-image-index.json', data['lifeImageIndex'])

    links = data['studentStart']['quickLinks']
    links[:] = [{'label': '先认识校园', 'chapterId': 'life-16'}, {'label': '宿舍环境与实拍', 'chapterId': 'life-03'}] + [link for link in links if link['chapterId'] not in ['life-16', 'life-03']]
    def sync(block):
        for child in block.get('blocks', []):
            sync(child)
        block['sourceCodes'] = list(dict.fromkeys(re.findall(r'\[([A-Z]+\d+)\]', json.dumps({k: v for k, v in block.items() if k != 'sourceCodes'}, ensure_ascii=False))))
        assert all(code in data['sourceRegistry'] for code in block['sourceCodes'])
    for chapter in data['lifeChapters']:
        for block in chapter['blocks']:
            sync(block)
        chapter['sourceCodes'] = list(dict.fromkeys(re.findall(r'\[([A-Z]+\d+)\]', json.dumps(chapter['blocks'], ensure_ascii=False))))
    data['meta']['counts'].update(lifeChapters=len(data['lifeChapters']), officialEvidence=len(data['officialEvidence']))
    for key in protected_keys:
        assert data[key] == protected[key], key
    assert data['meta']['author'] == author
    write(SITE, data)
    report = {'batch': BATCH, 'sourceMap': codes, 'reviewedSources': len(sources),
        'newSources': sum(s.get('expansionBatch') == BATCH for s in data['sourceRegistry'].values()),
        'lifeChapters': len(data['lifeChapters']), 'sourceRegistry': len(data['sourceRegistry']),
        'imageIndex': data['lifeImageIndex']['counts'], 'newImages': 4,
        'boundaries': ['新增1张真实历史寝室图和3张官方校园环境图，不是四张MPAcc宿舍实拍。',
                       '新宿舍建成不等于MPAcc女生入住分配，未核到当前卫浴和洗衣全景。',
                       '原图字节、来源日期和可见空间保留；未生成或重绘实景。',
                       '网页与图集更新，Word、Excel和APK未重建。']}
    write(INPUT / 'merge-report.json', report)
    print(json.dumps({key: value for key, value in report.items() if key not in ['sourceMap', 'boundaries']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
