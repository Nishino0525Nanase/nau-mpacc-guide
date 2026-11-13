#!/usr/bin/env python3
"""Merge verified public sources and practical new-student reading paths."""
from collections import Counter
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / 'data/student_life_20261113'
SITE = ROOT / 'dist/data/site-data.json'
BATCH = 'student-life-20261113'


def read(path):
    return json.loads(path.read_text())


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def canonical(url):
    match = re.search(r'/c\d+a(\d+)/page\.(?:htm|psp)', url or '')
    return 'nau-article:' + match[1] if match and '.nau.edu.cn/' in url else url


def joined(value):
    return '；'.join(value) if isinstance(value, list) else value or ''


def main():
    data = read(SITE)
    protected_keys = ['mentors', 'mentorCards', 'directions', 'downloads', 'musicPlaylist', 'lifeImageIndex', 'internships']
    protected = {key: deepcopy(data[key]) for key in protected_keys}
    author = deepcopy(data['meta']['author'])
    batches = [('arrival-housing', 'sources'), ('study-finance', 'sources'),
               ('transport-health', 'items'), ('student-stories', 'adopted')]
    sources = [(name, item) for name, field in batches for item in read(INPUT / (name + '.json'))[field]]
    code_map = {}
    for name, item in sources:
        url_key = canonical(item['url'])
        existing = next((code for code, source in data['sourceRegistry'].items()
                         if url_key in [canonical(source.get(field)) for field in ['url', 'canonicalUrl', 'originalUrl']]), None)
        # The service directory supplements V05, rather than reusing its different URL.
        if existing is None:
            number = 929
            while 'U' + str(number) in data['sourceRegistry']:
                number += 1
            existing = 'U' + str(number)
            kind = '校方学生人物访谈（非MPAcc个案）' if name == 'student-stories' else '新生生活与培养官方资料'
            scope = joined(item.get('reading_scope'))
            summary = item.get('summary') or '；'.join(item['facts'][:2])
            limits = joined(item['limits'])
            data['sourceRegistry'][existing] = {
                'code': existing, 'title': item['title'], 'label': item['title'], 'url': item['url'],
                'canonicalUrl': item['url'], 'originalUrl': item['url'], 'date': item['date'],
                'summary': summary, 'kind': kind, 'population': item['population'], 'campus': item['campus'],
                'readingScope': scope, 'limitations': limits, 'expansionBatch': BATCH,
            }
            data['officialEvidence'].append({
                'key': 'official:' + BATCH + ':' + existing, 'ids': [existing], 'title': item['title'],
                'date_display': item['date'], 'url': item['url'], 'canonical_url': item['url'],
                'summary': summary, 'population': item['population'], 'tips': item['facts'], 'comments': [],
                'limits': limits, 'topic': kind, 'use_status': kind, 'reading_scopes': [scope],
                'official': True, 'screened_only': False,
            })
        code_map[item['id']] = existing
        if name == 'student-stories' and not any(p['id'] == item['id'] for p in data['socialPosts']):
            data['socialPosts'].append({
                'id': item['id'], 'key': '南京审计大学新闻网:' + item['id'], 'sourceIds': [existing],
                'canonicalUrl': item['url'], 'url': item['url'], 'title': item['title'], 'author': item['author'],
                'date': item['date'], 'platform': item['platform'], 'category': '校园人物访谈',
                'topic': '入学适应、室友相处与学习选择', 'population': item['population'], 'campus': item['campus'],
                'summary': item['summary'], 'tips': item['facts'] + item['tips'], 'comments': [],
                'limitations': joined(item['limits']), 'reviewReason': '校方选择的具名个案；保留原学段，编辑建议另标。',
                'verificationStatus': '公开正文已核读；不是MPAcc女生在读体验', 'screenedOnly': False,
                'needsVerification': True, 'readingScopes': [joined(item['reading_scope'])], 'expansionBatch': BATCH,
            })

    def refs(*ids):
        return ''.join('[' + code + ']' for code in dict.fromkeys(code_map.get(item, item) for item in ids))

    def p(text):
        return {'type': 'p', 'text': text}

    def heading(text):
        return {'type': 'heading', 'text': text, 'level': 2}

    def callout(title, text, items=None, tone='action', label='给自己的安排'):
        return {'type': 'callout', 'label': label, 'title': title, 'text': text, 'items': items or [], 'tone': tone}

    def checklist(title, *items):
        return {'type': 'checklist', 'title': title, 'items': list(items)}

    def table(headers, rows):
        return {'type': 'table', 'headers': headers, 'rows': rows}

    def details(title, blocks):
        return {'type': 'details', 'text': title, 'blocks': blocks}

    chapters = {chapter['id']: chapter for chapter in data['lifeChapters']}
    # Remove only this script's additions; earlier material and source identities stay intact.
    for chapter in chapters.values():
        chapter['blocks'] = [b for b in chapter['blocks'] if b.get('studentLifeBatch') != BATCH]

    def install(chapter_id, blocks, title=None, number=None):
        if chapter_id not in chapters:
            chapter = {'id': chapter_id, 'number': number, 'title': title, 'blocks': [], 'sourceCodes': []}
            chapters[chapter_id] = chapter
            data['lifeChapters'].append(chapter)
        for block in blocks:
            block['studentLifeBatch'] = BATCH
        chapters[chapter_id]['blocks'] = blocks + chapters[chapter_id]['blocks']

    install('life-01', [
        callout('不用在开学前把一切都准备完', '先把第一晚住下、第二天能去办事这两件事安排好。下面的清单是编辑建议；校区、缴费、培养和住宿规定分别附原始依据。遇到自己这一届尚未发布的事项，留下问题比照搬往年答案更有用。', tone='note', label='从即将入学的自己出发'),
        table(['我现在最关心', '先看哪里'], [
            ['带着箱子一个人到校', '第二、三、四章：报到、首晚、重件搬运。'],
            ['钱够不够，奖助什么时候能用', '第十三章：先列应缴账单，再列尚未到账的收入。'],
            ['室友、洗浴、身体不舒服和求助', '第三、十、十四章：先解决具体事情，保留自己的边界。'],
            ['跨专业能否跟上、导师和实习怎么选', '第八、九章：本级培养方案、沟通提纲、岗位条件逐项核对。'],
        ]),
    ])

    install('life-02', [
        heading('把到校当天拆成几件小事'),
        checklist('出发前随手核对',
            '按本人当届通知核对证件、录取材料、档案与组织关系要求；原件放随身包，电子备份与证件照片分开保管。' + refs('F04'),
            '保存学院报到联络方式、实际报到点和住宿确认信息；早到、晚到或需要请假，先联系学院。2026年的9月5日不能当作下一届日期。' + refs('SL26H01'),
            '第一晚包：一套床品、洗漱品、拖鞋、换洗衣物、充电器，以及自己平常需要的卫生用品；不依赖尚未到站的快递。',
            '重箱分批寄送前确认收件格式、暂存与取件时间；返程票和陪同人住宿分别安排，不默认家长能在寝室留宿。' + refs('F12')),
        table(['到校环节', '现场先问清'], [
            ['进校与报到', '新生如何核验身份、哪个窗口先办、通行权限何时启用；2026年9月7日是该届校园通行启用日，不是所有年份的宿舍门禁。' + refs('F14')],
            ['领钥匙与找宿舍', '确认园区、楼栋、床位和本楼值班室；搬大件的登记、推车或迎新帮助在哪里。' + refs('F12', 'SL26H04')],
            ['银行和缴费', '只通过正式入口核对项目和收款方，保留凭证。2026须知称配发银行卡开学后发放并用于奖助，不必因尚未拿到卡误以为报到失败。' + refs('SL26H01')],
            ['当天太累或下雨', '先入住、吃饭、洗漱；拍照打卡和集中采购可留到之后。行动困难或临时身体不适时向现场工作人员说明需要。'],
        ]),
        callout('如果我只能晚上到南京', '订行程前问学院能否当晚办理报到或入住，并核对可进入的校门、联系人和备用住宿。交通和校门分别确认，不用一张往年“末班车截图”决定整段行程。', tone='confirm', label='出发前确认'),
    ])

    install('life-03', [
        heading('住进自己的那一间，再决定买什么'),
        callout('床垫先缓一缓，禁用品直接划掉', '2026公寓规定明确列出电吹风、卷发棒、电热毯、电水壶、暖手宝、加热杯垫等禁用物品，也不许另拉床帘。不能靠“低功率”判断可用。公共吹风设备和保暖设施请问本楼。' + refs('F12'), label='采购前先看'),
        table(['先做', '为什么'], [
            ['量床板净长宽、护栏、梯子、柜内与桌面', '2026年采购出现“两人位组合床”，不等于两人间，也没有公布MPAcc的床宽；别拿旧帖尺寸直接下单。' + refs('SL26H07')],
            ['检查门锁、漏水、插座、下水与家具', '拍下入住现状。宿舍室内故障先找本楼值班室；一般维修目录电话不能替代本楼受理。' + refs('SL26H09', 'F12')],
            ['问清本楼浴室而不是只问“南审有独卫吗”', '2026沁园部分楼栋有独立淋浴房改造中标资料；它不是全部完工证明，也不是每间寝室独卫或MPAcc女生分楼通知。' + refs('SL26H06')],
            ['看清床位与家具分配', '调床位、调宿和换锁有管理要求；需要照顾身体状况时向辅导员和宿管说明申请，不自行调换。' + refs('F12')],
        ]),
        checklist('第一次洗澡和洗衣，现场问这几句',
            '浴室在哪，隔间如何使用，有没有放衣物和洗浴包的位置；热水时段、计费、支付入口、故障联系谁？目前未核实全校统一参数。',
            '洗衣机与烘干机是否分别收费，单次费用、充值余额和退款规则怎么看？以本楼机身与现场公示核对应用，先小额试一次。' + refs('SL26H08'),
            '衣物如何晾晒，公共空间怎样轮流使用？衣架和洗衣篮按实际空间买，洗法按个人习惯与衣物洗标决定。',
            '房间钥匙不转借；陌生人维修进屋先核身份与报修事项，拍室友和房间照片先征得同意。' + refs('F12')),
        details('和室友第一次商量，可以从具体场景说起', [
            p('这些是相处建议，不是学校规定：先聊闹钟与关灯、耳机与通话、空调温度和费用、清洁分工、临时借用物品、访客、视频会议或线上面试。外来人员不留宿属于公寓规则，不是室友投票可以豁免的事项。' + refs('F12')),
            p('可以这样开口：“我周三晚有个线上面试，想提前确认半小时安静时间；你那会儿方便吗？如果不方便我去找能使用的讨论空间。”说清事情、时段和备选方案，不要求所有人同作息。'),
            p('本科女生室友访谈里有资料共享、模拟面试与共同活动，也有磨合；它只说明这些互助方式可以尝试，不保证研究生室友一定亲密。安静独处与友好相处可以同时存在。' + refs('ST20261113-02')),
        ]),
    ])

    install('life-04', [
        heading('先把网络和取件走通，再集中下单'),
        table(['问题', '可用信息与下一步'], [
            ['沁园的重包裹怎么搬', '2026年3月启用的沁园快递中心公告有免费手推车，以及过重、过大快件免费预约送货服务。预约入口、送达终点与服务时间未公布，先问站点；不能理解成所有园区免费送到房门。' + refs('SL26H04')],
            ['是否必须换手机号码', '2026迎新有移动、联通、电信专点，不等于必须新办号码。先问月费、优惠期、到期恢复价、合约与注销条件，再确认校园网是否另开账户。' + refs('SL26H05')],
            ['超市线上买完能直接送寝室吗', '2026公告明确的是澄园超市、澄园审咖企业微信“扫贝”线上下单、到店取货；不扩成全校送寝室。' + refs('SL26H05')],
        ]),
        callout('给自己的收件约定', '证件、第一晚用品和急用电脑随身带。大件尽量选能亲自处理的到货日期；准备请假离校时先处理快递和退款。陌生短信的取件链接、代缴费和验证码请求先通过正式入口核实。', tone='note'),
    ])

    install('life-05', [
        heading('先找到能经常吃的一顿饭'),
        p('初到校的前三天，可以只试走宿舍到常上课楼之间的食堂或餐饮点，记下自己的课程前后哪一段能从容吃饭。口味、排队、预算和饮食需要由自己判断，不用照着探店清单每天跨校园。新生访谈里从独自吃饭到认识同伴是一个过程；暂时一个人吃饭也很正常。' + refs('ST20261113-01')),
        table(['采购场景', '更省心的做法（编辑建议）'], [
            ['刚报到缺盆桶或洗护', '2026迎新公告有校内超市补货保障；先补第一周必需品，再比较价格与空间，不把宣传当作全年最低价。' + refs('SL26H05')],
            ['找轻食或见同学的地方', '2026公告提到润园书院、澄园书院、竞秀楼的审咖；竞秀楼店当时提供面包、酸奶等。到店确认营业与价格，不当作免费长时间自习位。' + refs('SL26H05')],
            ['有过敏、忌口或明确饮食需求', '直接向实际窗口询问配料和当日供应；一位同学的口味体验不能替自己确认。'],
            ['怕开学花超预算', '把餐饮、饮品、日用品分开记一周；按自己的实际开销改预算，不设“女生应该花多少”的标准。第十三章有可照填的表。'],
        ]),
    ])

    # Replace the stale route guidance rather than leaving it as a recommended alternative.
    for block in chapters['life-06']['blocks']:
        if block.get('type') == 'p' and '2025到校路线帖使用文德路地铁站、613外环' in block.get('text', ''):
            block['text'] = '旧帖的“613外环”不能继续照走：南京交通部门公告自2026年1月14日起取消613内外圈环线，调整为省人民医院浦口分院至花莲路·海峡大道，并撤销雨山路地铁站相关站点；同次新辟614路，首末站为雨山路地铁站南至花莲路·海峡大道。614不等于在每个校门停靠。请从实际可走的校门查当日站点，不再按旧帖找“外环”。' + refs('nau-transit-613-20260114', 'P08')
    install('life-06', [
        callout('拖着箱子时，把最后一段也查完', '确认实际可进的校门、下车点到宿舍的步行段、是否需要搬楼梯，以及入住窗口是否仍有人。到达南京南站或机场，还不等于已经能入住。', label='出发前确认'),
        p('机场交通已有变化：2026年9月29日地铁6号线与S1贯通运营，已坐在贯通列车上的乘客到南京南站无需下车换乘；从高铁站厅、1号线等抵达的人仍须按自己的路线进站或换乘。公告还调整了S1末班，保存旧表的人应重新查询。不要将始发站末班写成学校附近站点的末班。' + refs('nanjing-metro-airport-20260929')),
        checklist('一次独立往返，留好这几项',
            '核对车次或航班、到站日期、当日整段线路、换乘和实际校门；节假日留出道路与安检余量。',
            '电量、充电线、必要证件与应急支付放随身；给自己留一个可执行的晚到备选，不依赖临时拼陌生人的行程。',
            '网约车核对车辆与订单，上下车点选可辨认的正规位置；可按自己意愿把行程分享给信任的人。',
            '晚到或无法进楼时，先找已确认的学院或本楼值班联系点；不猜开门时间，也不跟陌生人绕行进入。'),
    ])

    install('life-07', [
        heading('给学习之外留一个固定位置'),
        p('第一周先实走两处适合自己的学习地点：一处便于日常自习，一处适合已经获准使用的小组讨论或线上面试。看开放与预约、插座、饮水和返回宿舍的路线，不把咖啡店、空教室或本科帖子里的座位自动当作长期可占的位置。'),
        p('2026—2027第一学期的浦口教学场地目录列有体育健身中心主附馆、沁园体育馆、润园健美操房及部分球场；这是教学使用表，不是个人开放或预约授权。先问当期入场、预约、费用和研究生可参与项目。' + refs('nau-pukou-sports-current-term-directory')),
        details('不必为了融入，把每个活动都报上', [
            p('女生武术队报道展示了从接触项目到训练参赛的不同路径；本科新生成长访谈也记录了紧张、试着表达和调整节奏。它们不是MPAcc课程与社团准入承诺。可以先询问一次、体验一次，再决定是否长期参加；休息、独处和持续做一件小事都合理。' + refs('ST20261113-05', 'ST20261113-06')),
            p('把兴趣活动放进自己的时间表：本周是否有课业截止、每次交通多久、是否有额外花费。忙的时候减少次数，目标由自己定，不拿获奖或认识多少人判断是否适应。'),
        ]),
    ])

    install('life-08', [
        heading('如果我是刚入学的自己，第一月先做这些'),
        table(['阶段', '留下一个具体结果'], [
            ['第一周：看清培养安排', '保存本人MPAcc培养方案和课表，列必修、选修、考核、学术活动及实践节点；不按本科或学硕经验凑学分。2026排课通知面向学院，其中报送日不是学生选课截止日。' + refs('SLF02', 'SLF06')],
            ['第二周：摸清自己的基础', '从在修课程挑一个案例，梳理财报、准则、统计或工具的缺口。先补影响当周作业的一项；跨专业不等于必须开学前考完所有证书。'],
            ['入学前后：尽早准备导师沟通', '按本级互选节点准备，不必等到第三周。带一页自我说明：已有基础、感兴趣问题、时间约束、想了解的培养方式。2026师生见面会有研究方向、项目、论文与实践交流；它不公布下一届名额或导师口碑。' + refs('SLF01')],
            ['第四周：把课业与职业探索放在一起', '选一两类岗位了解任务与能力要求，做一份能说明过程的课程成果；为休息与临时通知留空，不同时承诺多个出勤冲突的项目。' + refs('SLF04')],
        ]),
        details('第一次找导师，可以带着这些问题', [
            p('“我对这个问题感兴趣，但现在只学过这些课程。您通常建议先看哪类资料？本级学生能参与什么任务，日常沟通怎样约，论文选题和实习冲突时应怎样安排？”'),
            p('分别确认：当届互选流程和名额、选题与数据获取、反馈方式、组内任务与工作量、实践离校要求。得到具体回答后再判断适配，不把“某导师对女生好”之类无法核实的印象当事实。'),
            p('本科访谈中有主动找老师讨论方向、从真实财报学案例、项目反复修改的经历；可借鉴提问与复盘方式，不能用其录取或竞赛结果推断MPAcc统一要求。' + refs('ST20261113-03', 'ST20261113-04')),
        ]),
        callout('从第一份作业开始保留来源', '论文、报告和案例记录原文出处、数据授权、版本与自己做的工作。2026科研诚信教育涉及伦理与学术规范，但没有给出统一AI比例或检测阈值；具体课程与学位论文要求分别问清。不得把单位客户数据或个人资料直接放进公开工具。' + refs('SLF03'), tone='note', label='学习习惯'),
        p('2026年11月11日学院为2025级研究生组织实践动员，说明流程、分组、考核与材料，并强调请假、离返校、保密和沟通。这是该届学院研究生安排，不是“所有MPAcc每年11月统一去某单位”。接受岗位前先确认本人当届实践认定及审批。' + refs('SLF05')),
    ])

    install('life-09', [
        heading('先判断这份实习能不能真正做下去'),
        checklist('投递和接受岗位前，逐项问清',
            '我是哪一级、哪种学制？单位与任务是否能被本级实践认定，离校和住宿手续由谁审批？' + refs('SLF05', 'F14'),
            '实际项目在哪个城市、办公室还是客户现场？每周出勤、连续时长、忙季和临时出差怎样安排，能否覆盖我的课与考试？',
            '报酬按天还是按月、何时结算；加班、餐费、交通、住宿和出差费用分别由谁承担？未写的条件留待确认，不自己补成承诺。',
            '有无正式协议、实习证明和评价人，保密与设备要求是什么？岗位和联络入口能否从单位官方渠道核对？',
            '晚间返校或外地项目有没有可执行的交通与住宿方案？把实际成本算进预算，不能只看日薪。'),
        callout('面试中不舒服的问题，可以先问它与岗位的关系', '可以把回答带回可出勤时间、工作任务和职业计划；私密身体、感情或家庭细节是否回答由自己决定。若沟通让你不安，保留招聘信息、暂停决定，向学院就业老师核对。这里提供处理思路，不替你作就业选择。', tone='note', label='保留自己的边界'),
    ])
    for block in chapters['life-09']['blocks']:
        if block.get('studentLifeBatch') == BATCH:
            block['placement'] = 'before-internships'

    install('life-10', [
        heading('身体不舒服时，把问诊、参保和报销分开办'),
        table(['现在遇到的事', '先做什么'], [
            ['想在校内就诊', '先向浦口医疗门急诊025-58318767确认当日地点和接待；不把旧网页时段当现行安排。' + refs('V01')],
            ['想找妇科服务', '南京市浦口人民医院官网有妇科与门诊入口；看当日排班并按需要预约，不因科室介绍就推定费用、医生或医保资格。也可以选择自己信任的正规医疗机构。' + refs('pukou-hospital-womens-care-entry')],
            ['有卡但不知道能不能结算', '卡片、参保记录和待遇生效是不同事项。学校2026办卡通知的现场活动已经结束，已有第三代卡不必照旧通知重复换卡。' + refs('nau-social-security-card-20260521')],
            ['去外省实习或回家就医', '先问医保经办窗口本人备案类别、普通门诊与住院如何结算及材料；短期实习不直接等于连续六个月及以上的长期异地居住。' + refs('nanjing-cross-region-medical-2025', 'V03')],
        ]),
        callout('医保预算看清生效日', '南京公布的2027筹资通知列大学生基本医保280元/年、长护险10元/年，大学生标准自2027年9月1日起执行。不是2026年11月所有在校生立刻补缴290元，也不能据此推断南审一次收几年。个人缴费与参保按本届学校通知核对。' + refs('nanjing-student-insurance-2027'), tone='confirm', label='政策日期'),
        p('课程压力、独处不适应或室友关系也可以成为咨询时想谈的问题。校方心理预约页强调自愿，025-58318627所列工作日9:00—12:00、14:00—17:00是预约时段；咨询形式、地点和空余名额预约时确认。2026会计学院确实组织过新生资源导览，但活动报道不能替代个人预约。' + refs('V04', 'nau-accounting-grad-mental-orientation-2026')),
    ])

    install('life-11', [
        checklist('第一周，只要把这条小路线走通',
            '从自己的宿舍走到一处常上课楼，确认课表对应校区、楼栋和教室；再找食堂、取件与饮水点。',
            '试一次本楼热水、洗衣和网络；发现故障记录现象与受理入口，不只收藏别人的App名称。',
            '存学院、本楼值班室、医疗和保卫联系；问清离校、夜间不在寝和临时身体不适如何报备。' + refs('F14', 'F12'),
            '建个人日历：课业截止、选课、导师沟通、缴费与申请节点；未发布的日期先写“待学院通知”。',
            '留半天不排采购与活动，整理东西、睡觉或给信任的人报平安；未完成的可移到下一周。'),
        callout('问问题时，带齐能让对方处理的信息', '说明本人年级和专业、具体事项、已看过的通知、现在卡住哪一步、希望确认什么。发截图时遮住不必要的身份证号、银行卡号、病历和他人信息；私人证明只交到实际办理部门要求的渠道。', tone='note'),
    ])

    install('life-12', [
        callout('读别人的故事时，先看她是哪一段学程', '本页新增的女生访谈来自校方选取的本科生或校队个案。它们能帮助想象独自到校、和室友磨合、开口求助与找兴趣的过程；没有把她们写成MPAcc在读女生，也没有从成功结果推断人人都该这样生活。人物条目保留日期、身份、阅读范围与限制。', tone='note', label='怎样使用经历'),
    ] + [
        {'type': 'source', 'text': '[' + code_map[item['id']] + '] ' + item['title'] + '｜' + item['population'], 'url': item['url']}
        for _, item in sources if data['sourceRegistry'][code_map[item['id']]].get('expansionBatch') == BATCH
    ])

    install('life-13', [
        callout('先留出能完成报到的现金，再安排后续收入', '学费、住宿、日常开销、奖助学金和实习收入分开写。已经具备资格、正在申请、公示和实际到账是四个阶段；不靠尚未收到的钱承担眼前账单。以下金额保留各自适用年度。', label='给自己的预算'),
        heading('固定项目：金额和适用年级一起看'),
        table(['项目', '公开依据', '我需要确认'], [
            ['MPAcc学费', '2027全日制会计硕士全程90000元（最终以批复为准）；2026—2027学年收费公示为每年30000元。' + refs('F03', 'F11'), '本人录取类别、缴费期数、正式账单与支付入口；不自行承诺延期或减免。'],
            ['住宿', '既有公示分1000、1200、1500元/年等档次，2026入学须知注明具体以报到公布为准；非全日制不安排住宿。' + refs('F11', 'SL26H01'), '本人是否安排床位、实际房型和当届收费；不据旧档次预定宿舍。'],
            ['体检和保险', '2026新生资料列体检78元、医保270元/年等该届项目。2027新筹资标准大学生基本医保280元加长护险10元/年，自2027年9月1日起执行。' + refs('F08', 'nanjing-student-insurance-2027'), '每项对应年度、实际收几年、何时缴费及本人参保记录；不把两套年度金额相加。'],
            ['教材、生活用品与交通', '按课程和自己的采购、票据填写；没有可靠统一的“女生生活费”标准。', '已有物品可继续用；床品尺寸、大件寄送和实习驻地确认后再预算。'],
        ]),
        heading('奖助：把申请和到账写成两行'),
        table(['政策', '可了解的范围', '不要提前当作可支出余额'], [
            ['学业奖学金', '2026办法列12500、9500、6500元/年三档及10%、30%、60%比例；具体资格和评定按办法及本年通知。' + refs('F22'), '比例不是个人获奖保证。一年级与高年级考察不同，课程不合格等情形影响资格。'],
            ['申请材料与程序', '秋学期每学年评审；申请有成绩、成果、导师意见等材料，学院与学校分别至少公示5个工作日。' + refs('SLF08'), '学院权重、实际截止日、公示结果与到账时间分别记录；不把公示天数当放款天数。'],
            ['国家助学金', '新办法对符合条件、无固定工资收入的2027级及以后研究生按每生每年6000元、每年10个月发放，7、8月不发；2026级及以前仍按原办法执行。完整资格按文件核对。' + refs('F24'), '不能写成全体在校生已统一改标，也不推定开学首日到账。'],
            ['困难补助', '既有办法列特殊困难2000—3000元、临时困难1000—2000元等，并有条件、材料和审核要求。' + refs('F05', 'F25', 'SLF09'), '并非预算紧张自动获批，同一困难原因在校限获一次；不要为了申请公开病历或家庭隐私。'],
            ['助学贷款回执', '2026秋通知启用学工系统助学贷款模块，可从PC或企业微信进入；该次9月办理期限已过。' + refs('SLF07'), '下一届的入口权限、额度、办理期限和放款时间看新通知，不把旧日期当当前待办。'],
        ]),
        p('暂时筹不齐费用时，不要只看预算表就放弃报到。2026入学须知对家庭经济困难研究生设绿色通道，可先办理入学手续；需要的申请、认定材料和后续安排向录取学院核对。下一届看本人当年通知，不能据此自动免缴费用。' + refs('F05')),
        details('毕业去向涉及的补偿，只当作有条件的政策阅读', [
            p('2026年11月通知涉及赴规定西部审计机关就业的学费补偿。修订办法有服务不少于3年等条件，每学年最高12000元且不超实缴学费，按规定学制及阶段办理；不等于MPAcc每年30000元全额返还，也不是新生现可领取的收入。该届11月13日申请节点不能套到未来毕业年。' + refs('SLF10')),
        ]),
        heading('给自己留一张可以修改的预算表'),
        table(['费用或收入', '我填什么', '什么时候复核'], [
            ['报到前必须支付', '本次应缴学费＋已确认住宿及其他项目＋来校交通。', '拿到正式账单时。'],
            ['首周一次性采购', '已有物品记0；床品、洗护、搬运逐项按实际填写。', '入住量尺寸、确认现场服务后。'],
            ['每月固定与弹性支出', '餐饮、手机网络、交通、日用品、个人护理、兴趣和往返家乡分别列。', '记录第一周或第一个月后调整。'],
            ['备用资金', '按自己的支付能力与家庭安排留一笔，写清可从哪里获得支持。', '遇到临时返家、就医或必要设备维修前。'],
            ['尚未到账的收入', '奖助、岗位津贴、实习报酬分别标“未申请／审核／公示／到账”。', '实际到账后才移入可支配余额。'],
            ['实习新增成本', '通勤、异地住宿、押金、餐食与回校考试费用；扣除单位明确承担部分。', '确定项目驻地与书面条件后。'],
        ]),
        p('编辑建议：每月只用“当前可用余额＋确定能在账单前到账的钱－同期必须支付”看短期是否有缺口。若有缺口，尽早向家人、学院资助负责老师或实际贷款经办核对可行安排；贷款、补助、分期都不预设一定获批。'),
    ], title='第十三章 学费、奖助与日常预算', number=13)

    install('life-14', [
        callout('把自己的舒服和选择，也写进开学准备', '如果我是即将来读MPAcc的一名女生，我会先让自己能睡好、吃饭、洗漱、出行和求助，再逐渐安排成绩、实习与社交。这里是情境化的编辑建议；不用把它当成对每位女生的生活要求。', tone='note', label='独立生活'),
        heading('身体照顾不必等到耽误所有事情才安排'),
        table(['日常场景', '可以提前准备'], [
            ['经期或临时身体不适', '按自己的习惯留少量卫生用品、换洗衣物和洗漱包，了解厕所、浴室和就医位置；状态不好时调整采购、运动与行程，不照搬别人的药物或处理方法。'],
            ['想找正规妇科门诊', '保存官方科室和挂号入口，按当日排班预约。校外浦口人民医院有妇科服务页，但不代表学校卫生所具备同样服务，也不保证全部费用报销。' + refs('pukou-hospital-womens-care-entry', 'V03')],
            ['看诊影响课程或实践', '按要求向实际办理者说明请假时段和需要的证明；医学细节是否向室友、同学分享由自己决定，不把病历发公共群。' + refs('F14')],
            ['担心个人隐私', '预约、付款和接收检查结果使用本人账户与正规渠道；办理报销或请假只提供正式要求的材料。'],
        ]),
        heading('能亲近，也能说清边界'),
        table(['场景', '一句可直接调整的话（编辑示例）'], [
            ['室友想发合照或寝室视频', '“发之前让我看看吧，我不想露床位、定位和私人东西。”'],
            ['临时借物或进入自己的床位', '“先问我一下，我的这部分物品想自己保管；公共用品我们可以另商量。”'],
            ['聚会、拼车或不想参加的活动', '“这次我先不参加，明天还有安排。谢谢你叫我。”无需用隐私换取合理的拒绝。'],
            ['导师或实习任务时间不清', '“我想确认交付内容和截止时间，这段有课程／考试；我可以在这个时间完成这些部分。”'],
            ['自己不舒服却怕麻烦别人', '“我现在需要你陪我去一下／帮我联系值班老师，之后我再处理其他事情。”'],
        ]),
        p('这些表达可以温和，也可以直接。对方是否尊重界限，是需要观察的具体行为；不按性别、籍贯或内外向预判别人。遇到持续冲突，记清事情与希望的处理结果，向辅导员或对应管理者求助；遇到威胁或强迫时，优先离开当下场景并联系能实际帮助的人。'),
        heading('外出与求助，留一条可以执行的退路'),
        checklist('独自出门前的小检查',
            '目的地、返程、校门和本楼晚归报备分别确认；深夜到站前先落实能否入住，不靠陌生人的口头保证。',
            '实际车辆与订单核对；是否分享行程由自己决定。陌生链接、验证码、代办证件或垫付款先通过正式渠道核实。',
            '见面或面试先核单位、地点和对接人，留意工作条件；不因“老师推荐”“学姐同款”省略核实。',
            '保存本楼值班联系与校园保卫025-58318110、025-58318119；校内报案地点为致明楼一楼警务室。官方安全提示还要求熟悉宿舍和教学楼疏散路线。' + refs('V06')),
        heading('不急着拥有一群很熟的人'),
        p('先认识一个上课能互相确认通知的同学，试一次愿意参加的活动，约一顿时间合适的饭，已经足够成为开始。有人很快融入，有人需要多一点独处。校方女生访谈里既有独自长途来校，也有室友互助和反复练习表达；都是不同学段的个案，不是适应的进度表。' + refs('ST20261113-01', 'ST20261113-02', 'ST20261113-06')),
        callout('需要支持时，从一个具体问题开始说', '可以先谈“最近睡不好”“不知道怎样与室友商量”“课程和实践排不开”。学校心理咨询按自愿原则预约：025-58318627，页面列工作日9:00—12:00、14:00—17:00为预约时段，具体接待另行确认。学业问题找学院，设备问题找本楼，就医与报销走各自入口；不要求自己一个人解决全部。' + refs('V04'), tone='note', label='把入口存好'),
    ], title='第十四章 女生的独立生活与求助', number=14)

    data['studentStart'] = {
        'title': '先把眼前的几件事安顿好',
        'intro': '按自己所在的阶段看。生活用品、课程和关系都可以慢慢调整；清单是编辑建议，制度与金额请看旁边的来源和适用年份。',
        'phases': [
            {'id': 'before', 'label': '到校前', 'summary': '确认本人通知，给第一晚留出余量。', 'tasks': [
                {'title': '材料随身，报到点核对', 'text': '当届日期、证件、档案和早晚到联络分别确认。', 'chapterId': 'life-02'},
                {'title': '第一晚用品先带够', 'text': '床垫先等尺寸，禁用电器和床帘划掉。', 'chapterId': 'life-03'},
                {'title': '把眼前账单列清', 'text': '学费、住宿和交通先算，未到账奖助另列。', 'chapterId': 'life-13'},
                {'title': '到南京之后怎么入住', 'text': '完整交通、实际校门和晚到备选一起确认。', 'chapterId': 'life-06'},
            ]},
            {'id': 'night', 'label': '入住当天', 'summary': '先能休息、洗漱和联系到值班人员。', 'tasks': [
                {'title': '认床位，检查房间', 'text': '门锁、漏水和家具留记录，找到本楼报修入口。', 'chapterId': 'life-03'},
                {'title': '重包裹先问搬运', 'text': '沁园公告有推车和大件预约，实际范围问站点。', 'chapterId': 'life-04'},
                {'title': '找一顿方便的饭', 'text': '先补第一晚必需品，大采购可以留到以后。', 'chapterId': 'life-05'},
                {'title': '留一点自己的空间', 'text': '照片、借物、安静与独处需要都可以说清楚。', 'chapterId': 'life-14'},
            ]},
            {'id': 'week', 'label': '第一周', 'summary': '让自己的课表和生活路线真正走通。', 'tasks': [
                {'title': '实走上课与生活路线', 'text': '试一次网络、洗衣和取件，存必要联系人。', 'chapterId': 'life-11'},
                {'title': '知道身体不舒服找谁', 'text': '问诊、参保和报销是不同步骤，提前存入口。', 'chapterId': 'life-10'},
                {'title': '和室友商量具体场景', 'text': '灯光、闹钟、通话、面试与清洁逐项聊。', 'chapterId': 'life-03'},
                {'title': '给兴趣和休息留时间', 'text': '先体验一种活动，开放与预约按当期确认。', 'chapterId': 'life-07'},
            ]},
            {'id': 'year', 'label': '研一', 'summary': '用本级培养安排串起学习、导师与实践。', 'tasks': [
                {'title': '把培养要求落进日历', 'text': '选课、考核、论文和实践分别核对，先补眼前缺口。', 'chapterId': 'life-08'},
                {'title': '带问题去见导师', 'text': '基础、兴趣、沟通与工作量说具体，不靠印象选。', 'chapterId': 'life-08'},
                {'title': '先算实习是否可持续', 'text': '认定、请假、出勤、驻地、报酬和成本逐项问清。', 'chapterId': 'life-09'},
                {'title': '按通知申请奖助', 'text': '材料、公示和到账分开记，每月按实际开销调整。', 'chapterId': 'life-13'},
            ]},
        ],
        'quickLinks': [{'label': '学费与预算', 'chapterId': 'life-13'}, {'label': '独立生活与求助', 'chapterId': 'life-14'},
                       {'label': '就医与医保', 'chapterId': 'life-10'}, {'label': '常用联系人', 'chapterId': 'life-11'}],
    }
    for chapter in data['lifeChapters']:
        def sync_codes(block):
            for child in block.get('blocks', []):
                sync_codes(child)
            block['sourceCodes'] = list(dict.fromkeys(re.findall(r'\[([A-Z]+\d+)\]', json.dumps({k: v for k, v in block.items() if k != 'sourceCodes'}, ensure_ascii=False))))
        for block in chapter['blocks']:
            sync_codes(block)
        text = json.dumps(chapter['blocks'], ensure_ascii=False)
        chapter['sourceCodes'] = list(dict.fromkeys(re.findall(r'\[([A-Z]+\d+)\]', text)))
        assert all(code in data['sourceRegistry'] for code in chapter['sourceCodes'])
    data['meta']['counts'].update(lifeChapters=len(data['lifeChapters']), socialPosts=len(data['socialPosts']), officialEvidence=len(data['officialEvidence']))
    data['meta']['socialPostCategories'] = dict(Counter(post['category'] for post in data['socialPosts']))
    for key in protected_keys:
        assert data[key] == protected[key], key
    assert data['meta']['author'] == author
    write(SITE, data)
    report = {'batch': BATCH, 'researchedRecords': len(sources), 'sourceMap': code_map,
              'newDistinctSources': sum(s.get('expansionBatch') == BATCH for s in data['sourceRegistry'].values()),
              'newVisibleInterviews': sum(s.get('expansionBatch') == BATCH for s in data['socialPosts']),
              'counts': {'lifeChapters': len(data['lifeChapters']), 'sourceRegistry': len(data['sourceRegistry']),
                         'officialEvidence': len(data['officialEvidence']), 'rawSocialPosts': len(data['socialPosts']),
                         'visibleSources': sum(not p.get('screenedOnly') and '排除' not in p['category'] and p['category'] != '仅筛选记录' for p in data['socialPosts'])},
              'protectedSha256': {key: hashlib.sha256(json.dumps(data[key], ensure_ascii=False, sort_keys=True).encode()).hexdigest() for key in protected_keys},
              'limits': ['六篇新增人物访谈不是MPAcc女生体验帖；不将登录墙、搜索摘要或旧活动计作新经历。',
                         '2027分楼、床宽、热水参数及门禁未获现行公开确认；改造与采购不是交付、分配证明。',
                         '网页与下载附件分别维护；本轮未重建Word、Excel和APK。']}
    write(INPUT / 'merge-report.json', report)
    print(json.dumps({k: v for k, v in report.items() if k not in ['sourceMap', 'protectedSha256']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
