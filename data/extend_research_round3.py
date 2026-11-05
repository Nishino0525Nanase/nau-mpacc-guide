#!/usr/bin/env python3
"""Merge reviewed research in memory; --write commits the data and two QA outputs.

Default: print QA only. --write updates dist/data/site-data.json and writes
data/round3-merge-qa.json plus data/round3-merged-sources.json.
No dates/timestamps are generated. Unknown author/date/campus values remain null.
"""
from __future__ import annotations

import argparse
import collections
import copy
import json
import pathlib
import re
import tempfile
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parents[1]
WORKSPACE = ROOT.parent
BATCH = "research-round3"


def research_path(filename):
    """Prefer the repository's reproducible public research snapshot."""
    bundled = ROOT / "data/research_round3" / filename
    return bundled if bundled.exists() else WORKSPACE / filename

# Explicit review of all nine mentor candidates; never infer a mentor from title.
MENTOR_DECISIONS = {
    "MENTOR-NEW-01": ("adopt", "2021级具名MPAcc共同备赛过程，限定2022竞赛"),
    "MENTOR-NEW-02": ("adopt", "2022级具名MPAcc案例过程，与03合为同一事件"),
    "MENTOR-NEW-03": ("merge", "仅补02的身份和结果；同队同届不另计事件"),
    "MENTOR-NEW-04": ("adopt", "2024晋级团队调研部署，不推断论文导师关系"),
    "MENTOR-NEW-05": ("adopt", "2023级全体MPAcc集体指导，不称个人日常指导"),
    "MENTOR-NEW-06": ("adopt", "历史导师安排及陈茜MPAcc实习论文个案，保留年级冲突"),
    "MENTOR-NEW-07": ("adopt_background", "研究生公开教学，专业未分，不算MPAcc个人指导"),
    "MENTOR-NEW-08": ("skip", "师生模型沙龙无MPAcc身份或具体学生训练过程"),
    "MENTOR-NEW-09": ("skip", "课程层次未明且李慧为主持，不归因企业嘉宾讲授"),
}
LIFE_DECISIONS = {
    "LNEW01": ("adopt", "历史实践手册，分清MPAcc/学硕并索取本级新版"),
    "LNEW02": ("adopt", "2023暑期初步互选，不当现行正式互选规则"),
    "LNEW03": ("adopt", "2025见面会与互选先后，不作个人导师风格证据"),
    "LNEW04": ("adopt", "2024材料流程，只作本级节点核实提示"),
    "LNEW05": ("adopt", "已截止项目，用来比较条件，不作当前机会"),
    "LNEW06": ("adopt_background", "工作站背景，不认定所有MPAcc符合资格"),
    "LNEW07": ("skip", "已有2026迎新，避免叠加旧2025接站与报到安排"),
    "LNEW08": ("skip", "已有2027目录，不增加旧计划人数作为当前招生信息"),
    "LNEW09": ("adopt", "评奖流程，保留2026标题与引用2025通知的冲突"),
    "LNEW10": ("adopt", "座谈议题及公开建议，不推导硬性毕业条件"),
    "LNEW11": ("adopt", "本级实践动员，不推定历届统一起始月"),
}

# Each row: primary ID, event key, brief factual paraphrase, adjacent boundary,
# chapter section, mentor role map. 02+03 deliberately share one event/source.
OFFICIAL = [
    ("MENTOR-NEW-01", "2022-national-mpacc-case-team",
     "2022年崔秀梅、王永妍共同指导2021级具名MPAcc团队，每日线上讨论并细改报告，曾讨论至深夜，后晋级第二阶段。准备案例赛可进一步确认本级分工和报告反馈方式。",
     "仅当次共同备赛，不能拆分个人贡献；深夜备赛不代表日常强制要求或回复承诺。",
     "导师选择",
     {"崔秀梅": "与王永妍共同指导2021级MPAcc团队，通过讨论、启发和细改完成竞赛报告。",
      "王永妍": "与崔秀梅共同指导2021级MPAcc团队，通过讨论、启发和细改完成竞赛报告。"}),
    ("MENTOR-NEW-02", "2023-national-mpacc-happy-team",
     "2023年崔秀梅、赵娜、温素彬共同指导2022级MPAcc“快乐小子队”，以徐工为案例，队员五一期间分析与写作；外请北航教师据学生汇报提出框架修改方向。队伍最终获全国三等奖。",
     "过程与结果两篇算一个事件；外部教师的建议不转归某位南审导师，假期备赛不代表日常要求。",
     "导师选择",
     {"崔秀梅": "与赵娜、温素彬共同指导2022级MPAcc团队开展企业案例写作；北航教师另就框架提出修改方向。",
      "温素彬": "与崔秀梅、赵娜共同指导2022级MPAcc团队开展企业案例写作；北航教师另就框架提出修改方向。"}),
    ("MENTOR-NEW-04", "2024-national-mpacc-book-team",
     "2024年朱明秀指导的晋级团队召开企业调研启动会：温素彬提出创新与体系要求，黄中生、朱明秀、崔秀梅提出调研建议，会议落实指导团队和调研公司。参赛前可询问选企、资料获取及节点安排。",
     "其余教师是启动会参与和提建议角色，不据此认定每人的分工或学位导师关系。",
     "导师选择",
     {"温素彬": "在2024年晋级团队启动会上提出案例创新和体系构建要求。",
      "黄中生": "在2024年晋级团队启动会上对下一阶段企业调研提出建议。",
      "崔秀梅": "在2024年晋级团队启动会上对下一阶段企业调研提出建议。"}),
    ("MENTOR-NEW-05", "2024-mpacc-case-mobilization",
     "2024年面向2023级全体MPAcc，潘俊说明案例赛的分析表达及沟通协作目标；崔秀梅讲解赛制、题名、框架、表达和排版，提示疏漏与时间安排。可向学院核对本级选拔和备赛支持。",
     "面向全年级的公开指导，不是个人导师组任务或日常反馈评价。",
     "导师选择",
     {"潘俊": "面向2023级全体MPAcc讲解案例赛的分析表达、沟通协作等能力目标。",
      "崔秀梅": "面向2023级全体MPAcc讲解赛制、报告框架表达和时间安排。"}),
    ("MENTOR-NEW-06", "2020-xu-mentoring-profile",
     "2020年许汉友事迹记载学期科研规划、师生与同门研讨；陈茜把服装企业实习、创新实践课题和获奖会计专硕论文衔接。选择实习时，可先讨论能否获得合规资料并形成论文问题。",
     "整体安排混合硕士类型且为历史评优报道，不套用当前MPAcc；陈茜年级官网有2016/2017级不一致。",
     "导师选择",
     {"许汉友": "历史事迹记载科研规划和研讨；具名MPAcc陈茜将服装企业实习、实践课题和论文衔接。"}),
    ("MENTOR-NEW-07", "2026-fu-data-assets-lecture",
     "2026年傅祥斐向会计学院研究生讲解数据资产计量、披露及企业案例，师生讨论确认条件与分录，并交流研究选题和方法，可作相关研究主题入口。",
     "公开教学听众未分学硕、MPAcc等专业；不是具名MPAcc师生关系或个人日常评价。",
     "导师选择",
     {"傅祥斐": "在2026年公开研究生讲座讲解数据资产实务，并交流选题和方法。"}),
    ("LNEW01", "2024-accounting-practice-handbook",
     "2024年11月版实践手册入口标2023级，其中MPAcc为六个月且183天以上，可连续或分段；计划须导师与学院认可，实践期间保留原宿舍，异地住宿另安排，返校需材料和考核。",
     "历史版本不直接宣布适用2026/2027级；出发前领取本级最新版，核对天数、换单位审批、住宿及材料。",
     "实习先", {}),
    ("LNEW02", "2023-accounting-summer-guidance",
     "2023级暑期指南把了解导师方向、文献研讨和学习任务与初步确定导师衔接。初联系时可准备研究兴趣、可投入时间，并询问当前阅读或练习任务。",
     "仅历史暑期预互选，初步确定不等于正式互选；旧书单不称最新必读目录。",
     "导师选择", {}),
    ("LNEW03", "2025-accounting-new-student-meeting",
     "2025级学院研究生见面会在正式互选前交流研究领域、在研课题与培养期待。可在见面时核对课题、课程和个人规划。",
     "非MPAcc专属，报道未公布名额、志愿和截止规则；不把讲座主讲身份当导师关系或风格。",
     "导师选择", {}),
    ("LNEW04", "2024-graduate-midterm-proposal-notice",
     "2024年通知曾要求专硕中期及开题材料经校内、校外实践导师同意，中期通过后方可开题，导师须参加，签章材料扫描提交。安排本级节点时，应核对审核人、签字、参会与上传流程。",
     "旧截止日期不作现行日历；新版办法正文受限，不能认定程序未变，须按本级通知确认。",
     "论文进度", {}),
    ("LNEW05", "2025-central-enterprise-audit-internship",
     "2025年度一项央企审计实习通知列工作期、地点、审计助理任务和指导，出差补贴不低于90元/天，按项目规定提供出差住宿及差旅。比较实习时应逐项问清这些条件。",
     "项目已截止；补贴限出差期间，不是MPAcc统一收入、当前机会或学分认定承诺。",
     "实习先", {}),
    ("LNEW06", "2025-water-workstation-selection",
     "2025年南水北调工作站公告要求相关背景及至少六个月驻站，列硕士每月1000元补贴、工作餐和住宿，工作地包括北京、武汉。工作站需另核专业资格、驻站和生活条件。",
     "报名已截止，未明确所有会计MPAcc符合审计、水利或计算机背景要求，不保证城市、留用或学分。",
     "实习先", {}),
    ("LNEW09", "2026-accounting-scholarship-publicity",
     "2026年10月国家奖学金公示展示申请、学院评审审核和公示流程，区分会计专硕与学硕，未给实际到账日。预算不把推荐公示当作已经到账。",
     "标题落款2026而首句引用2025年度通知，保留该不一致；不复刻学号名单，不推算获奖率。",
     "奖助金额", {}),
    ("LNEW10", "2026-accounting-student-meeting",
     "2026年10月，2024—2026级会计学与会计专业代表在座谈中谈到体美劳认定、中期、成果、预答辩、就业及住宿，可列入本级核实表。论文前置规划、带问题实习和核验AI内容是公开建议。",
     "新闻未公开问题答案或制度修订，不能从议题推出毕业硬要求；会议发言不作个人导师日常评价。",
     "论文进度", {}),
    ("LNEW11", "2025-2024-cohort-practice-meeting",
     "2024级在2025年11月的实践动员讲解流程、考核、分组与单位，并提示请假、离返校手续。实习中仍需保持学院联系，可讨论如何从企业实践积累论文问题。",
     "学院学硕与专硕共同参加；未列岗位和起止期，不推定每届统一11月开始。",
     "实习先", {}),
]

# Short, reviewed paraphrases of the four fully read XHS inputs. Actual reading
# scopes are always copied from the input, including unread pictures/replies.
XHS_EDITORIAL = {
    "64e1bfff000000000c034a90": (
        "2023年第三方课表汇总称，研一上尚未加入选修课时六方向课程基本一致，排课时间有差别。",
        ["可用于理解当时方向课表的共同基础，当前课程、学分和选修安排仍看本级课表。"],
        "历史第三方资料，不证明2026课表或方向转换规则；两张课表图未逐张审读，不抄录时段学分。"),
    "6a8edcec000000001f000035": (
        "MPAcc/MAud选课互助帖的评论提到软件实操、小组作业、课堂汇报和结课论文，评论者年级与专业未全部核验。",
        ["商业智能分析评论提到频繁实操及Power BI，软件仍需问任课教师。",
         "国家治理与国家审计专题被描述为小组作业、可选汇报和结课论文；司法会计频繁pre来自作者转述。"],
        "仅月日，年份不猜；未具名教师，不能映射导师或承诺评分，图片与部分回复未读全。"),
    "67aef89b0000000029009825": (
        "2025年转述一位不具名MPAcc研二学生的选修课心得，涉及读书报告、研究设计、案例论文、汇报和小组论文。",
        ["政府及非营利组织会计理论与实务被描述为中期读书报告、课程研究设计。",
         "司法会计被描述为案例论文与频繁pre，数据资产与数据治理为小组论文。"],
        "第三方历史转述，选课记录未核验；压力与给分是个人感受，不保证新学期相同，程博课程评论不作导师评价。"),
    "6a16a3fb0000000007023990": (
        "标签明确MPAcc的作者亲述赴汕头听学术会议，并提到此前忙于案例大赛，可见课堂外活动可能占用课余精力。",
        ["可提前为赛事与学术交流预留时间；向学院另问报名、指导、费用及是否需要汇报。"],
        "仅月日，届别、会议名、费用和导师未公开；报名问题无可见答复，六图未逐张审读，不视为人人固定机会。"),
}


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def items(value):
    return value if isinstance(value, list) else ([] if value is None else [value])


def unique(values):
    return list(dict.fromkeys(value for value in values if value is not None))


def canonical(url):
    if not isinstance(url, str):
        return None
    p = urllib.parse.urlsplit(url)
    if p.scheme not in {"http", "https"} or not p.netloc:
        return None
    return urllib.parse.urlunsplit((p.scheme.lower(), p.netloc.lower(), p.path.rstrip("/"), "", ""))


def post_id(row):
    for key in ["post_id", "postId", "id", "note_id"]:
        value = row.get(key)
        if isinstance(value, str) and re.fullmatch(r"[0-9a-fA-F]{24}", value):
            return value.lower()
    match = re.search(r"/(?:explore|discovery/item)/([0-9a-fA-F]{24})(?:[/?#]|$)", str(row.get("url", "")))
    return match.group(1).lower() if match else None


def urlkey(url):
    value = canonical(url)
    if value is None:
        return None
    p = urllib.parse.urlsplit(value)
    if p.netloc == "xiaohongshu.com" or p.netloc.endswith(".xiaohongshu.com"):
        pid = post_id({"url": value})
        if pid:
            return "xhs:" + pid
    # Exact article ID, not a digit substring from a PDF UUID.
    match = re.search(r"/c\d+a(\d+)/page\.(?:htm|html|psp)$", p.path)
    if (p.netloc == "nau.edu.cn" or p.netloc.endswith(".nau.edu.cn")) and match:
        return "nau-article:" + match.group(1)
    return value


def urls(value):
    if isinstance(value, dict):
        for child in value.values():
            yield from urls(child)
    elif isinstance(value, list):
        for child in value:
            yield from urls(child)
    elif isinstance(value, str):
        yield from re.findall(r'https?://[^\s"<>\]\[，。；）]+', value)


def scopes(row):
    for key in ["readingScope", "reading_scope", "readingScopes", "reading_scopes"]:
        if key in row:
            return [x for x in items(row[key]) if isinstance(x, str) and x.strip()]
    return []


def body_read(row, explicit=False):
    if row.get("read") is False or row.get("screenedOnly") is True or row.get("screened_only") is True:
        return False
    if explicit and row.get("read") is not True:
        return False
    text = " ".join(scopes(row))
    if re.search(r"正文未读|未读正文|仅列表|正文不可读|未取得正文|仅.{0,5}标题", text):
        return False
    return bool(re.search(r"正文.{0,14}(?:可读|全读|已读|完整)|已读PDF|网页全文|全文.{0,12}(?:已读|可读)", text))


def within_budget(*parts):
    text = " ".join(part for part in parts if isinstance(part, str))
    cjk = len(re.findall(r"[\u3400-\u9fff]", text))
    words = len(re.findall(r"[A-Za-z]+(?:['’-][A-Za-z]+)*", text))
    return cjk / 2 + words <= 200


def code_for(registry):
    # UI recognizes a letter and 2-3 digits; R301..R399 is intentional.
    for number in range(1, 100):
        code = f"R3{number:02d}"
        if code not in registry:
            return code
    raise ValueError("R301—R399已满，需先扩展前端编号识别")


def add_block(data, chapter_id, identity, text, codes, section=None, url=None):
    chapter = next(row for row in data["lifeChapters"] if row["id"] == chapter_id)
    if any(block.get("expansionId") == identity for block in chapter["blocks"]):
        return False
    block = {"type": "source" if url else "p", "text": text,
             "sourceCodes": codes, "expansionId": identity, "expansionBatch": BATCH}
    if url:
        block["url"] = url
    else:
        block["text"] += " " + "".join(f"[{code}]" for code in codes)
    position = len(chapter["blocks"])
    if section:
        start = next((i for i, item in enumerate(chapter["blocks"])
                      if item.get("type") == "heading" and section in item.get("text", "")), None)
        if start is not None:
            position = next((i for i in range(start + 1, len(chapter["blocks"]))
                             if chapter["blocks"][i].get("type") == "heading"), position)
    chapter["blocks"].insert(position, block)
    chapter["sourceCodes"] = unique(chapter.get("sourceCodes", []) + codes)
    return True


def add_source_links(data, record, source_urls):
    for i, url in enumerate(source_urls):
        suffix = "（同一事件补充报道，不另计来源）" if i else ""
        add_block(data, "life-12", f"round3-source-{record['code']}-{i}",
                  f"[{record['code']}] {record['title']}{suffix}｜{record['date'] or '日期未公开'}",
                  [record["code"]], url=url)


def normalize_xhs(row):
    reasons = []
    pid = post_id(row)
    if not pid:
        reasons.append("缺少24位原帖ID")
    parsed = urllib.parse.urlsplit(row.get("url") or "")
    if not parsed.netloc or not (parsed.netloc == "xiaohongshu.com" or parsed.netloc.endswith(".xiaohongshu.com")):
        reasons.append("缺少小红书完整原帖URL")
    for key in ["title", "author", "date", "population", "summary"]:
        if key not in row or (key not in {"author", "date"} and not isinstance(row[key], str)):
            reasons.append("必要字段缺失：" + key)
    if not isinstance(row.get("limits", row.get("limitations")), str):
        reasons.append("缺少适用边界")
    if not body_read(row, explicit=True):
        reasons.append("缺少read:true和正文已读范围")
    status = row.get("promotionStatus", row.get("promotion_status"))
    if status not in {"none_observed", "non_promotional"} and row.get("promotion") is not False:
        reasons.append("缺少明确非推广判断，或有推广因素")
    if any(row.get(key) is True for key in ["commercial", "advertisement", "softAd", "isPromotion"]):
        reasons.append("推广或软文排除")
    if not isinstance(row.get("tips", row.get("points")), list) or not row.get("tips", row.get("points")):
        reasons.append("缺少具体帮助信息")
    if reasons:
        return None, reasons
    summary, points, limits = XHS_EDITORIAL.get(
        pid, (row["summary"], row.get("tips", row.get("points")), row.get("limits", row.get("limitations"))))
    if not within_budget(summary, *points, limits):
        return None, ["转述超每来源200英文词等量预算，须人工压缩"]
    category = row.get("category")
    if category not in {"可用生活学习线索", "背景或待核实材料", "有边界的导师课程反馈"}:
        category = "背景或待核实材料" if pid == "64e1bfff000000000c034a90" else "可用生活学习线索"
    return {
        "id": pid, "key": "xhs:" + pid, "url": row["url"],
        "canonicalUrl": "https://www.xiaohongshu.com/explore/" + pid,
        "title": row["title"], "author": row["author"], "date": row["date"],
        "platform": "小红书", "topic": row.get("topic") or ("学术交流与案例赛" if pid == "6a16a3fb0000000007023990" else "课程与论文"), "campus": row.get("campus"),
        "population": row["population"], "summary": summary, "tips": points, "comments": [],
        "limitations": limits, "category": category,
        "reviewReason": "保留作者自述或第三方转述身份，不将MAud、本科或未明评论改称MPAcc亲历。",
        "verificationStatus": "可见正文已读；身份按来源自述，现行适用性待核实",
        "needsVerification": True, "screenedOnly": False, "promotion": "可见范围未见明显推广",
        "readingScopes": scopes(row), "queries": row.get("queries", []),
        "evidenceIdentity": row.get("evidenceIdentity", row.get("evidence_identity")),
        "expansionBatch": BATCH,
    }, []


def merge(data, research, optional):
    data = copy.deepcopy(data)
    roster_before = [{k: copy.deepcopy(v) for k, v in row.items() if k != "evidence"} for row in data["mentors"]]
    cards_before, author_before = copy.deepcopy(data.get("mentorCards")), copy.deepcopy(data["meta"].get("author"))
    before = {"socialPosts": len(data["socialPosts"]), "officialEvidence": len(data["officialEvidence"]),
              "sourceRegistry": len(data["sourceRegistry"])}
    qa = {"batch": BATCH, "mode": "in-memory", "before": before, "decisions": [], "duplicates": [],
          "skipped": [], "unread": [], "inputDuplicateReports": [], "optionalFilesMissing": [],
          "newSources": [], "mentorEvidence": [], "warnings": []}
    registry = data["sourceRegistry"]
    known_urls = {urlkey(url) for url in urls(data) if urlkey(url)}
    known_posts = {post_id(row) for row in data["socialPosts"] if post_id(row)}
    batch_events = {row.get("eventKey"): code for code, row in registry.items()
                    if row.get("expansionBatch") == BATCH and row.get("eventKey")}
    batch_posts = {row["id"]: row for row in data["socialPosts"] if row.get("expansionBatch") == BATCH}
    rows, selected, records, used_files = {}, {}, [], []
    for origin, (path, source) in research.items():
        if not isinstance(source.get("accepted"), list):
            raise ValueError(str(path) + "缺少accepted数组")
        decisions = MENTOR_DECISIONS if origin == "mentor" else LIFE_DECISIONS
        for row in source["accepted"]:
            identity = row.get("id")
            if identity in rows:
                qa["duplicates"].append({"id": identity, "reason": "研究accepted内ID重复"})
                continue
            rows[identity] = row
            action, reason = decisions.get(identity, ("skip", "新增候选尚未人工审定"))
            qa["decisions"].append({"id": identity, "action": action, "reason": reason})
            if action == "skip":
                qa["skipped"].append({"id": identity, "url": row.get("url"), "reason": reason})
        qa["unread"].extend({"inputFile": path.name, **item} for item in source.get("unread", []))
        qa["inputDuplicateReports"].extend({"inputFile": path.name, **item} for item in source.get("duplicates", []))

    mentors = {row["name"]: row for row in data["mentors"]}
    for identity, event, summary, limits, section, roles in OFFICIAL:
        origin = "mentor" if identity.startswith("MENTOR") else "life"
        ids = [identity, "MENTOR-NEW-03"] if identity == "MENTOR-NEW-02" else [identity]
        members = [rows[item] for item in ids if item in rows]
        if len(members) != len(ids) or not all(body_read(row) for row in members):
            qa["skipped"].append({"ids": ids, "reason": "缺少所需正文记录或明确已读范围，不补猜事实"})
            continue
        source_urls = unique(row.get("url") for row in members)
        if not all(canonical(url) for url in source_urls):
            qa["skipped"].append({"ids": ids, "reason": "URL缺失或无效"})
            continue
        assert within_budget(summary, limits), "官方转述超预算：" + identity
        code = batch_events.get(event)
        if not code and any(urlkey(url) in known_urls for url in source_urls):
            qa["duplicates"].append({"ids": ids, "urls": source_urls, "reason": "既有URL或同一官网文章ID，未新增事件"})
            continue
        primary = members[0]
        population = primary.get("population")
        if identity == "MENTOR-NEW-02":
            population = "2022级MPAcc顾明捷、肖祎宁、龙思玥、马欣、汪仁文、李冠男；过程与结果报道交叉确认"
        code = code or code_for(registry)
        record = {
            "code": code, "title": primary.get("title"), "url": primary.get("url"), "platform": primary.get("platform"),
            "date": primary.get("date"), "population": population,
            "advisorNames": unique(name for row in members for name in items(row.get("advisorNames"))),
            "summary": summary, "points": [summary], "limits": limits,
            "readingScope": "；".join(scope for row in members for scope in scopes(row)), "kind": "official",
        }
        if event not in batch_events:
            registry[code] = {
                **record, "label": record["title"], "original_id": identity, "originalUrl": primary.get("url"),
                "canonicalUrl": canonical(primary.get("url")), "sourceUrls": source_urls,
                "additionalUrls": source_urls[1:], "dateVariants": unique(row.get("date") for row in members),
                "eventKey": event, "expansionBatch": BATCH,
            }
            data["officialEvidence"].append({
                "key": "official:round3:" + event, "note_id": None, "ids": [code], "sourceIds": [code],
                "topic": "公开教学背景，专业未分" if identity == "MENTOR-NEW-07" else "有年份和对象边界的培养记录",
                "title": primary.get("title"), "author": primary.get("author"), "date_display": primary.get("date"),
                "url": primary.get("url"), "canonical_url": canonical(primary.get("url")), "campus": primary.get("campus"),
                "population": population, "summary": summary, "tips": [], "comments": [], "limits": limits,
                "use_status": "公开背景；不是MPAcc个人日常评价" if identity == "MENTOR-NEW-07" else "保留对象、年份和事件范围",
                "promotion": None, "queries": [], "reading_scopes": [scope for row in members for scope in scopes(row)],
                "files": [research[origin][0].name], "official": True, "screened_only": False,
                "advisorNames": record["advisorNames"], "sourceUrls": source_urls, "eventKey": event,
                "webRefs": unique(ref for row in members for ref in items(row.get("webRefs"))), "expansionBatch": BATCH,
            })
            batch_events[event] = code
            known_urls.update(urlkey(url) for url in source_urls)
            qa["newSources"].append({"code": code, "kind": "official", "eventKey": event, "urls": source_urls})
        else:
            qa["duplicates"].append({"ids": ids, "code": code, "reason": "本批事件已入库，复用编号保持幂等"})
        if len(members) > 1:
            qa["duplicates"].append({"ids": ids, "code": code, "reason": "同届同队过程与结果合并，只计一次"})
        records.append(record)
        selected[identity] = code
        used_files.append(research[origin][0].name)
        add_source_links(data, record, source_urls)
        chapter = "life-09" if identity == "LNEW09" else "life-08"
        add_block(data, chapter, "round3-life-" + identity, summary + " " + limits, [code], section)
        for name, detail in roles.items():
            if name not in mentors:
                qa["warnings"].append({"name": name, "code": code, "reason": "不在34人名录，未新建导师"})
                continue
            evidence_id = code + "-mentor-" + mentors[name]["id"]
            evidence = mentors[name].setdefault("evidence", [])
            if any(row.get("id") == evidence_id for row in evidence):
                continue
            evidence.append({
                "id": evidence_id, "kind": "official",
                "category": "研究生公开教学（专业未分）" if identity == "MENTOR-NEW-07" else "官方历史或竞赛培养记录",
                "statusLabel": "对象与年份限定的公开记录", "population": population, "date": primary.get("date"),
                "author": primary.get("author"), "text": detail + f" [{code}]",
                "limitations": limits + " 阅读范围：" + record["readingScope"],
                "url": primary.get("url"), "sourceIds": [code], "eventKey": event, "expansionBatch": BATCH,
            })
            qa["mentorEvidence"].append({
                "name": name, "code": code, "eventKey": event,
                "concretePersonalTraining": identity in {"MENTOR-NEW-01", "MENTOR-NEW-02", "MENTOR-NEW-06"},
                "publicTeachingBackground": identity == "MENTOR-NEW-07",
            })
        outside = {"MENTOR-NEW-02": ["赵娜"], "MENTOR-NEW-04": ["朱明秀"], "MENTOR-NEW-05": ["毕超"]}.get(identity, [])
        for name in outside:
            if name not in mentors:
                qa["warnings"].append({"name": name, "code": code, "reason": "原文角色保留，不在34人名录，不创建卡片"})

    for path, source in optional:
        if source is None:
            qa["optionalFilesMissing"].append(path.name)
            continue
        if not isinstance(source.get("accepted"), list):
            qa["skipped"].append({"inputFile": path.name, "reason": "缺少accepted数组"})
            continue
        qa["unread"].extend({"inputFile": path.name, **row} for row in source.get("unread", []) if isinstance(row, dict))
        for field in ["screened", "excluded", "screened_out", "skipped"]:
            qa["skipped"].extend({"inputFile": path.name, **row} for row in source.get(field, []) if isinstance(row, dict))
        qa["inputDuplicateReports"].extend({"inputFile": path.name, **row} for row in source.get("duplicates", []) if isinstance(row, dict))
        for candidate in source["accepted"]:
            row, reasons = normalize_xhs(candidate)
            if reasons:
                qa["skipped"].append({"id": post_id(candidate), "url": candidate.get("url"), "inputFile": path.name,
                                      "reason": "；".join(reasons)})
                continue
            pid = row["id"]
            existing = batch_posts.get(pid)
            if existing:
                row = existing
                code = next((value for value in items(row.get("sourceIds")) if re.fullmatch(r"R3\d{2}", str(value))), None)
                if not code:
                    qa["skipped"].append({"id": pid, "reason": "本批既有条目缺R3编号，须人工核对"})
                    continue
                qa["duplicates"].append({"id": pid, "code": code, "reason": "本批帖子已入库，复用编号"})
            elif pid in known_posts or urlkey(row["url"]) in known_urls:
                qa["duplicates"].append({"id": pid, "reason": "小红书ID或URL已在既有索引"})
                continue
            else:
                code = code_for(registry)
                row["sourceIds"], row["inputFiles"] = [code, pid], [path.name]
                data["socialPosts"].append(row)
                known_posts.add(pid)
                known_urls.add(urlkey(row["url"]))
                batch_posts[pid] = row
                registry[code] = {
                    "code": code, "original_id": pid, "title": row["title"], "label": row["title"],
                    "url": row["url"], "originalUrl": row["url"], "canonicalUrl": row["canonicalUrl"],
                    "date": row["date"], "kind": "student", "platform": "小红书", "population": row["population"],
                    "author": row["author"], "status": row["verificationStatus"],
                    "readingScope": "；".join(row["readingScopes"]),
                    "limitations": row["limitations"], "expansionBatch": BATCH,
                }
                for i, point in enumerate(row["tips"], 1):
                    data["tipsIndex"].append({
                        "id": f"{pid}:round3-tip-{i}", "topic": row["topic"], "point": point, "context": row["summary"],
                        "scope": row["population"], "limits": row["limitations"], "author": row["author"],
                        "date_display": row["date"], "url": row["url"], "post_title": row["title"],
                        "status": row["verificationStatus"], "promotion": row["promotion"],
                        "source_ids": code + "／" + pid, "source_key": row["key"], "expansionBatch": BATCH,
                    })
                qa["newSources"].append({"code": code, "kind": "student", "id": pid, "urls": [row["url"]]})
            record = {
                "code": code, "title": row["title"], "url": row["url"], "platform": "小红书", "date": row["date"],
                "population": row["population"], "advisorNames": [], "summary": row["summary"], "points": row["tips"],
                "limits": row["limitations"], "readingScope": "；".join(row["readingScopes"]), "kind": "student",
            }
            if not any(item["code"] == code for item in records):
                records.append(record)
            selected[pid] = code
            used_files.append(path.name)
            add_source_links(data, record, [row["url"]])
            add_block(data, "life-08", "round3-xhs-" + pid,
                      row["summary"] + " " + " ".join(row["tips"]) + " " + row["limitations"], [code],
                      "研一期末")

    assert [{k: v for k, v in row.items() if k != "evidence"} for row in data["mentors"]] == roster_before
    assert len(data["mentors"]) == 34
    assert data.get("mentorCards") == cards_before
    assert data["meta"].get("author") == author_before
    meta = data["meta"]
    meta.setdefault("counts", {})["socialPosts"] = len(data["socialPosts"])
    meta["counts"]["officialEvidence"] = len(data["officialEvidence"])
    meta["socialPostCategories"] = dict(collections.Counter(row.get("category") for row in data["socialPosts"]))
    meta["platformNote"] = (
        f"{len(data['socialPosts'])}条为实际去重后的社交来源索引，包含既有背景与筛选记录；"
        f"官网证据现有{len(data['officialEvidence'])}条。官网同一事件的过程与结果不按网址数重复计数；"
        "保留对象、年份、转述身份和阅读范围。来源数量不等于独立MPAcc学生或导师个人评价数量。"
    )
    meta["sourceInputFiles"] = unique(meta.get("sourceInputFiles", []) + used_files)
    old = meta.get("round3Research")
    old = old if isinstance(old, dict) else {}
    highlights = []
    for title, text, wanted in [
        ("实习认定与住宿", "历史手册补足MPAcc实践天数、审批、返校材料与保留宿舍，当前执行先核本级版本。", ["LNEW01", "LNEW11"]),
        ("互选前怎样沟通", "暑期初步联系与入学正式互选分开，带着课题、学习任务和培养期待去交流。", ["LNEW02", "LNEW03"]),
        ("案例训练具体过程", "新增两届具名MPAcc队伍的讨论、写作与修改过程，密集备赛仅适用于相应竞赛。", ["MENTOR-NEW-01", "MENTOR-NEW-02"]),
        ("选课任务与课外投入", "新增历史课程心得与MPAcc会议、案例赛日常；第三方转述、年份未明和未读范围均保留。",
         ["6a8edcec000000001f000035", "67aef89b0000000029009825", "6a16a3fb0000000007023990"]),
    ]:
        codes = [selected[identity] for identity in wanted if identity in selected]
        if codes:
            highlights.append({"title": title, "text": text, "sourceCodes": codes})
    meta["round3Research"] = {
        "batch": BATCH, "baseline": old.get("baseline", before),
        "officialIndependentEvents": sum(row["kind"] == "official" for row in records),
        "studentPosts": sum(row["kind"] == "student" for row in records),
        "sourceCodes": [row["code"] for row in records], "highlights": highlights,
        "newDailyPersonalFeedback": 0,
        "independenceNote": "同届同队过程与结果合并；竞赛指导不等于论文导师，公开集体教学不等于个人日常评价。",
    }
    qa["after"] = {"socialPosts": len(data["socialPosts"]), "officialEvidence": len(data["officialEvidence"]),
                   "sourceRegistry": len(registry)}
    qa["counts"] = {
        "newSourcesThisRun": len(qa["newSources"]),
        "newOfficialIndependentEvents": sum(row["kind"] == "official" for row in qa["newSources"]),
        "newStudentPosts": sum(row["kind"] == "student" for row in qa["newSources"]),
        "retainedRound3Sources": len(records), "newMentorEvidenceEntries": len(qa["mentorEvidence"]),
        "newConcretePersonalTrainingEntries": sum(row["concretePersonalTraining"] for row in qa["mentorEvidence"]),
        "newPublicTeachingBackgroundEntries": sum(row["publicTeachingBackground"] for row in qa["mentorEvidence"]),
        "newDistinctMentorsWithEvidence": len({row["name"] for row in qa["mentorEvidence"]}),
        "newDailyPersonalFeedback": 0, "duplicateReports": len(qa["duplicates"]),
        "unreadNotAccepted": len(qa["unread"]), "skippedNotAccepted": len(qa["skipped"]),
    }
    qa["checks"] = {
        "rosterUnchanged": True, "mentorCardsUnchanged": True, "authorUnchanged": True,
        "socialCountExact": meta["counts"]["socialPosts"] == len(data["socialPosts"]),
        "officialCountExact": meta["counts"]["officialEvidence"] == len(data["officialEvidence"]),
        "noGeneratedTimestamp": True, "officialParaphrasesWithinBudget": True,
    }
    if qa["counts"]["newStudentPosts"]:
        qa["warnings"].append({"reason": "app.js下载介绍可能硬编码108条，需上游核对；本脚本仅改数据。"})
    qa["limitations"] = [
        "未读、排除、推广及缺字段XHS仅进QA，不计新增有效来源。",
        "每来源简短转述，不复制全文，不猜名额；未知字段保持null。",
        "不把历史竞赛/集体教学升级为当前个人日常口碑，不把本科或MAud改成MPAcc。",
    ]
    return data, qa, records


def write_atomic(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
        temporary = pathlib.Path(handle.name)
    temporary.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--data", type=pathlib.Path, default=ROOT / "dist/data/site-data.json")
    parser.add_argument("--mentor-research", type=pathlib.Path, default=research_path("research_mentor_new.json"))
    parser.add_argument("--life-research", type=pathlib.Path, default=research_path("research_life_new.json"))
    parser.add_argument("--xhs", type=pathlib.Path, action="append", help="替代默认可选XHS输入，可重复")
    parser.add_argument("--qa-output", type=pathlib.Path, default=ROOT / "data/round3-merge-qa.json")
    parser.add_argument("--sources-output", type=pathlib.Path, default=ROOT / "data/round3-merged-sources.json")
    args = parser.parse_args()
    research = {
        "mentor": (args.mentor_research, read(args.mentor_research)),
        "life": (args.life_research, read(args.life_research)),
    }
    paths = args.xhs if args.xhs is not None else [
        research_path("research_xhs_browser_new.json"), research_path("research_xhs_root_new.json")]
    optional = [(path, read(path) if path.exists() else None) for path in paths]
    data, qa, records = merge(read(args.data), research, optional)
    if args.write:
        qa["mode"] = "written"
        write_atomic(args.data, data)
        write_atomic(args.qa_output, qa)
        write_atomic(args.sources_output, records)
    print(json.dumps(qa, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
