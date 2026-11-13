#!/usr/bin/env python3
"""Add dated climate evidence and address-specific dining suggestions."""
from copy import deepcopy
import json
from pathlib import Path
import re
from extend_student_life_20261113 import canonical, joined, read, write

ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / 'data/food_climate_20261113'
SITE = ROOT / 'dist/data/site-data.json'
BATCH = 'food-climate-20261113'


def main():
    data = read(SITE)
    protected_keys = ['mentors', 'mentorCards', 'directions', 'downloads', 'musicPlaylist', 'lifeImageIndex', 'internships', 'socialPosts']
    protected = {key: deepcopy(data[key]) for key in protected_keys}
    author = deepcopy(data['meta']['author'])
    inputs = [(name, item) for name in ['climate', 'hunan-food', 'nearby-food'] for item in read(INPUT / (name + '.json'))['sources']]
    codes = {}
    for name, item in inputs:
        key = canonical(item['url'])
        code = next((c for c, source in data['sourceRegistry'].items() if key in [canonical(source.get(f)) for f in ['url', 'canonicalUrl', 'originalUrl']]), None)
        if not code:
            number = 959
            while 'U' + str(number) in data['sourceRegistry']:
                number += 1
            code = 'U' + str(number)
            kind = '南京气候与生活官方资料' if name == 'climate' else item['sourceType']
            summary, limits, scope = joined(item['facts']), joined(item['limits']), joined(item['reading_scope'])
            population = item.get('population', '面向南审浦口校区学生的江浦商圈餐饮参考；非在读经历')
            data['sourceRegistry'][code] = {'code': code, 'title': item['title'], 'label': item['title'],
                'url': item['url'], 'canonicalUrl': item['url'], 'originalUrl': item['url'], 'date': item['date'],
                'summary': summary, 'kind': kind, 'population': population, 'readingScope': scope,
                'limitations': limits, 'expansionBatch': BATCH}
            data['officialEvidence'].append({'key': 'official:' + BATCH + ':' + code, 'ids': [code],
                'title': item['title'], 'date_display': item['date'], 'url': item['url'], 'canonical_url': item['url'],
                'summary': summary, 'population': population, 'tips': item['facts'], 'comments': [], 'limits': limits,
                'topic': kind, 'use_status': kind, 'reading_scopes': [scope],
                'official': name == 'climate' or '品牌' in kind or '街道' in kind,
                'screened_only': False})
        codes[item['id']] = code

    def refs(*ids):
        return ''.join('[' + code + ']' for code in dict.fromkeys(codes.get(i, i) for i in ids))

    def heading(text):
        return {'type': 'heading', 'level': 2, 'text': text}

    def p(text):
        return {'type': 'p', 'text': text}

    def table(headers, rows):
        return {'type': 'table', 'headers': headers, 'rows': rows}

    def callout(title, text, tone='note', label='生活提示'):
        return {'type': 'callout', 'title': title, 'text': text, 'tone': tone, 'label': label}

    def checklist(title, *items):
        return {'type': 'checklist', 'title': title, 'items': list(items)}

    chapters = {c['id']: c for c in data['lifeChapters']}
    for chapter in chapters.values():
        chapter['blocks'] = [b for b in chapter['blocks'] if b.get('foodClimateBatch') != BATCH]

    def install(chapter_id, blocks, title=None, number=None):
        if chapter_id not in chapters:
            chapters[chapter_id] = {'id': chapter_id, 'number': number, 'title': title, 'blocks': [], 'sourceCodes': []}
            data['lifeChapters'].append(chapters[chapter_id])
        for block in blocks:
            block['foodClimateBatch'] = BATCH
        chapters[chapter_id]['blocks'] = blocks + chapters[chapter_id]['blocks']

    install('life-05', [
        heading('想吃一点湖南味，可以先从这三家试起'),
        callout('先说清喜欢哪种辣，比只说“湖南口味”更有用', '如果你想吃鲜辣、剁椒、酸辣或下饭小炒，下面三家可以作为尝试清单。点餐时可以问“想要鲜辣、少花椒、少糖，能调整吗？”湖南不同地方、不同人的口味也不一样，最终按自己喜欢的来。店铺按公开分店资料与菜单线索整理，可先选一两家试试。', label='按口味选一顿饭'),
        table(['湘味候选', '具体分店位置', '先看什么菜／适合怎样吃'], [
            ['桃花源记·山野湖南菜（浦口虹悦城店）', '龙华路1号江北虹悦城4F17号；平台也使用“桃花源记（江北虹悦城店）”名称。' + refs('HNF01', 'HNF02'), '可约同学分着点。平台菜品有小炒黄牛肉、湖南小炒肉、长沙臭豆腐；先核当天菜单和能否调整辣度。' + refs('HNF02')],
            ['费大厨辣椒炒肉（江北虹悦城店）', '龙华路1号江北虹悦城5楼。按具体分店查询。' + refs('HNF03', 'HNF04', 'HNF05'), '特别想吃辣椒炒肉时可优先看这家。报道还提到皮蛋青椒擂茄子、香芋蒸排骨，可对照当日菜单搭配蔬菜与米饭。' + refs('HNF04')],
            ['霸碗盖码饭（南京龙湖雨山天街店）', '光明路59号雨山龙湖天街4幢123室，按官网地址找；“4幢”不是“4楼”。目前依据品牌门店目录，出发前再确认。' + refs('HNF06'), '适合一个人想吃湘味盖饭时作备选。品牌菜单有坛子辣椒炒肉、柴火香干腊肉、外婆菜炒鸡蛋盖码饭；具体到本店先问当天供应。' + refs('HNF07')],
        ]),
        p('这些是出校去江浦商圈吃饭的选择，不写成校门口几步即到。口味与辣度有个人差异；出发前看分店当日营业、排号与现菜单，点菜时确认米饭、茶位、打包等实际收费。平台旧人均不作为本次预算，品牌菜单也需对照本店可售菜。' + refs('HNF01', 'HNF02', 'HNF04', 'HNF06')),
        heading('偶尔想换个口味，也留两个备选'),
        table(['换口味的店', '位置依据', '怎么选更方便（编辑建议）'], [
            ['小菜园南京浦口雨山龙湖店', '光明路59号南京雨山天街A-5F-26号，品牌官网门店目录可检索。' + refs('FD01'), '和同学约家常菜时可作备选；先看实际菜品与辣度，不默认所有菜清淡。'],
            ['米村拌饭（龙湖雨山天街店）', '龙湖雨山天街负一楼A-B1-25号，地图条目标注近商场6号门。' + refs('FD02'), '已在商场、想一人吃份饭时可看；旧评价提到的菜品和续饭不当作当前菜单与权益。'],
        ]),
        table(['今天想怎样吃', '可以先这样安排'], [
            ['一个人想吃湘味', '先查霸碗本店可售盖码饭；不用为了尝一顿饭等大家都有空。'],
            ['两三个人想吃小炒', '可比较江北虹悦城的桃花源记与费大厨当日菜单和排号。按人数先少量点，想吃的主菜搭配蔬菜即可。'],
            ['天气差、赶课或只想省心', '先选自己常走路线上的食堂，湘味可以留到天气和时间合适时再试。'],
        ]),
        p('导航要分清商圈：江北虹悦城在龙华路1号，龙湖南京雨山天街在光明路59号；后者地图标注雨山路站6号口。它们都不是别处同名“虹悦城／天街”。从本人实际能通行的校门查当日完整路线，不沿用旧“613外环”或固定车程。' + refs('HNF05', 'FD03', 'U945')),
    ])

    install('life-03', [
        callout('衣服和被褥，按学期分批准备', '9月来校时仍留夏装和薄外套；秋冬厚衣可按降温与自己的取件安排分批补。梅雨晾晒、冬季体感和强天气出行，放在第十五章“南京四季、穿衣与晾晒”集中看。本楼的空调、供暖和烘干条件仍要现场问，不凭城市气候推定。' + refs('CL01', 'CL02')),
    ])

    install('life-15', [
        callout('不用一次把一年四季塞进行李箱', '南京属北亚热带湿润气候，冬夏差别明显，春秋相对较短。气候资料帮助准备大方向，临出发仍看短期预报：9月未必已经凉快，也不能用某年的入秋、入梅日期推算下一届开学。下面的衣物和行李安排是编辑建议。' + refs('CL01', 'CL02'), label='从开学行李开始'),
        heading('按一个学年的生活来准备'),
        table(['阶段', '可能遇到的情况', '衣物与生活安排（编辑建议）'], [
            ['9月报到', '仍可能偏热，年份转换差异大。' + refs('CL01'), '夏装和透气换洗衣物继续带，另留薄外套；证件与电脑防雨。别只带秋冬衣，也不为一次迎新把全部厚被褥背来。'],
            ['秋季到初冬', '天气转换时冷暖变化，需要结合当天温度、风和降雨判断。' + refs('CL01', 'CL05'), '用短袖／长袖、薄针织或卫衣、外套分层，早晚和室内外方便增减。备一双适合校园步行、雨后不易打滑的鞋。'],
            ['冬季', '冬冷，通常比夏季少雨；阴雨和风会改变体感，不等于整个冬季每天都湿冷。' + refs('CL02', 'CL05'), '准备自己的保暖外套、长裤、袜子与合适被褥；围巾、手套按实际需要选。本楼供暖或空调方式、费用与报修先问清，厚床品按床宽与收纳空间购买。'],
            ['春季', '春秋相对较短，不宜只按日历换季。' + refs('CL01'), '保留可叠穿的衣服和雨具；看近几天预报再寄走厚衣。外出聚餐或活动留一个下雨时的替代安排。'],
            ['初夏梅雨', '锋面雨带影响时降水增多，闷热潮湿；入梅和出梅每年变化。' + refs('CL02', 'CL03'), '多留一套能轮换的贴身和外穿衣物，洗衣错开连续阴雨；湿衣不要马上塞柜子，食品和收纳物品注意防潮。'],
            ['盛夏或暑期留校', '梅雨后可能进入晴热时段，也需留意暴雨、强对流等天气。' + refs('CL02'), '带轻便换洗衣物，出门准备饮水、遮阳与雨具；把长距离步行、采购和聚餐安排到更合适的天气和时间。暑期住宿权限另看通知。'],
        ]),
        heading('梅雨天，最容易影响的是洗衣和收纳'),
        checklist('雨季寝室小清单',
            '天气允许再集中洗大件；衣物充分干透后收进柜子，被褥也确认干燥再装袋。不要把湿衣堆在床边、行李箱或密闭柜里。',
            '先看本楼有没有可用烘干设施、收费和衣物洗标；没有时减少一次洗衣量，给衣物留开间距，不把晾衣架和挂钩买得超过房间空间。',
            '是否开窗结合外面下雨、湿度和本楼通风条件；不要把通风理解成阴雨天也一直开窗。空调滤网或设备有问题先问物业处理，不自行拆装。' + refs('CL03'),
            '除湿盒等按产品说明稳妥摆放并及时更换，避免液体接触衣物和电子设备；不要把它们当成必然解决所有返潮的办法。',
            '湿伞先沥水，鞋子尽量轮换；雨具、洗衣袋和晾衣夹先买够用的小量，不挤占通道。'),
        callout('保暖和烘衣，也要按公寓规则', '电热毯、电吹风、暖手宝、烘鞋器等已在公寓禁用列表中，不能因为天冷或衣服没干就作为“神器”带进寝室。购买或使用其他电器前按本楼规定核对；需要公共设施或身体状况有特殊需求时向宿管、辅导员说明。' + refs('F12'), tone='confirm', label='购买前核对'),
        heading('大雨、大风和强对流时，先调整行程'),
        p('南京气候背景包含暴雨、台风影响、强对流、高温和寒潮等天气。出发前看南京气象及官方预警，学校停课、出入与活动安排按当次通知，不把历史台风提醒当作当前预警。' + refs('CL02', 'CL04')),
        p('官方既往避险提示建议强风强雨时减少外出，远离大树、广告牌及高空构筑物，不在低洼地下通道、涵洞等位置躲雨，不冒险涉积水。对学生来说，可提前取回必要物品、调整聚餐或到站时间；不因外卖仍能下单，就判断路上适合出门。' + refs('CL04')),
        heading('一份够用的开学天气包'),
        table(['先随身或首批带', '确认后再补'], [
            ['夏装、薄外套、换洗衣物、便于行走的鞋、雨具、电脑证件防水袋。', '冬季厚衣与被褥按降温、床位尺寸、收纳和本人取件能力分批寄。'],
            ['够第一晚使用的床品与洗漱用品。', '本楼烘干、空调或供暖方式、费用和故障入口；不预先充值未知设备应用。'],
        ]),
        p('气候资料不等于个人体感，也不说明具体寝室有没有暖气、是否朝阳或一定会返潮。刚来的一周，记录自己的房间与上课路线，再调整衣物和洗衣节奏即可。'),
    ], title='第十五章 南京四季、穿衣与晾晒', number=15)

    install('life-12', [
        heading('气候与周边餐饮来源'),
        p('气候资料为城市背景，历史强天气提醒只取一般出行建议；餐饮条目依据品牌目录、地图与餐饮平台资料整理。商户介绍、全国品牌菜单、旧点评与当前可售菜分别使用，营业与价格请在出发前核对。'),
    ] + [{'type': 'source', 'text': '[' + codes[item['id']] + '] ' + item['title'], 'url': item['url']} for _, item in inputs])
    links = data['studentStart']['quickLinks']
    for label, chapter_id in [('湘味与周边吃饭', 'life-05'), ('南京四季与晾晒', 'life-15')]:
        if not any(link['chapterId'] == chapter_id for link in links):
            links.append({'label': label, 'chapterId': chapter_id})

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
    write(INPUT / 'merge-report.json', {'batch': BATCH, 'sourceMap': codes, 'reviewedSources': len(inputs),
        'newSources': sum(s.get('expansionBatch') == BATCH for s in data['sourceRegistry'].values()),
        'lifeChapters': len(data['lifeChapters']), 'sourceRegistry': len(data['sourceRegistry']),
        'restaurantCandidates': 5, 'limits': ['三家湘味、两家换口味备选，不假定当天营业和价格。', 'Word、Excel和APK附件未重建。']})
    print(json.dumps({'chapters': len(data['lifeChapters']), 'registeredSources': len(data['sourceRegistry']), 'restaurants': 5}, ensure_ascii=False))


if __name__ == '__main__':
    main()
