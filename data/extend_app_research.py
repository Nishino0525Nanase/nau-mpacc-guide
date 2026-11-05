#!/usr/bin/env python3
"""Deterministic app-research merge. Default prints a short dry-run summary.

Only --write changes site-data.json and writes app-research-sources.json plus
app-research-qa.json. Public research snapshots are preferred over scratch files.
"""
from __future__ import annotations
import argparse
import collections
import copy
import json
import pathlib
import re
import extend_research_round3 as h  # Only generic helpers; no batch editorial data.

ROOT, WORKSPACE = pathlib.Path(__file__).resolve().parents[1], pathlib.Path(__file__).resolve().parents[2]
BATCH = "app-research"

# URL fragment, concise facts, adjacent boundary, scope/role classification.
PUBLIC = [
    ("a156709", "2026年4月，2025级MPAcc将财务管理、管理会计、数据资产与数据处理三门课连接到南钢生产与财务现场，观察数据、成本及智能调度。",
     "一次现场教学不保证每届相同或企业录用；课程负责人、带队不等于学位导师关系。", "课程实例",
     {"马德林": "2025级MPAcc三课程赴南钢现场教学中担任课程负责人。",
      "凌华": "参与2025级MPAcc三课程赴南钢现场教学带队。"}),
    ("a163064", "2026年10月的行政事业单位财务讲座覆盖核算、预决算、资产、绩效及内控，提示通过实习了解职责和岗位匹配，可据此整理实习观察清单。",
     "学院研究生听众未单列MPAcc；主讲人为柴小莺，凌华仅主持，不推定岗位数量或就业保障。", "就业学习背景", {}),
    ("a150102", "2025年第十一届案例赛的2024级MPAcc“熬肿一队是一队”，由王永妍、崔秀梅、温素彬共同指导，第二阶段开展企业调研与专题研讨，最终获全国三等奖。",
     "与既有09为同队同届事件，仅补过程和转载链接；不算新独立案例，不推断论文导师或日常风格。", "既有案例补充",
     {name: "共同指导2025年案例赛的2024级MPAcc团队开展企业调研和案例专题研讨；属既有获奖事件的过程补充。" for name in ["王永妍", "崔秀梅", "温素彬"]}),
    ("a129421", "王敬勇指导MPAcc华雨倩的企业数据合规案例论文获2023年度优秀论文奖，题目研究交易所问询函、企业数据合规及经济后果，以华大基因为例。",
     "只读获奖新闻，未取得论文全文，不声称掌握其数据、方法或结论；不推断当前名额与全部学生体验。", "历史论文个案",
     {"王敬勇": "指导MPAcc华雨倩以华大基因为例研究问询函、企业数据合规及经济后果，论文获2023年度奖项。"}),
    ("917bf89f", "进一步阅读：2018年文号的开题历史文本，提示专硕从实践提出问题，并检查资料、方法、可行性及进度。开题前可先问本级报告模板和改题审批流程。",
     "准确发布日期未知，date保留null；不把旧字数、文献数、学期节点宣布为2027现行要求。", "历史规则阅读", {}),
    ("730a7e8f", "进一步阅读：2024年文号的答辩与学位申请文本，将预答辩、检测、评阅及答辩区分为阶段。安排毕业写作时应分别预留时间并核对当年通知。",
     "准确发布日期未知，date保留null；不把旧评阅规则、人数或程序当作2027现行安排，不推算通过率。", "历史规则阅读", {}),
    ("98137a50", "进一步阅读：2024年创新计划历史文本区分学硕科研创新与专硕实践创新，提示申报需方案、实践基础、预算和导师支持，成果须按项目要求标注。",
     "date保留null；当前资格、名额、资助及截止日均须核本级公告，不宣称个人已符合条件。", "历史规则阅读", {}),
]


def input_path(name):
    bundled = ROOT / "data/research_app" / name
    return bundled if bundled.exists() else WORKSPACE / name


def text(value):
    return "；".join(str(x) for x in value) if isinstance(value, list) else value


def code_for(registry):
    for number in range(401, 500):
        code = f"A{number}"
        if code not in registry:
            return code
    raise ValueError("A401—A499已用满")


def paragraph(data, identity, content, code, chapter="life-08", url=None):
    target = next(row for row in data["lifeChapters"] if row["id"] == chapter)
    if any(row.get("expansionId") == identity for row in target["blocks"]):
        return
    block = {"type": "source" if url else "p", "text": content + ("" if url else f" [{code}]"),
             "sourceCodes": [code], "expansionId": identity, "expansionBatch": BATCH}
    if url:
        block["url"] = url
    target["blocks"].append(block)
    target["sourceCodes"] = h.unique(target.get("sourceCodes", []) + [code])


def mentor_evidence(data, name, identity, record, detail, category):
    mentor = next((row for row in data["mentors"] if row["name"] == name), None)
    if mentor is None:
        return False
    evidence = mentor.setdefault("evidence", [])
    if any(row.get("id") == identity for row in evidence):
        return False
    evidence.append({
        "id": identity, "kind": "firsthand" if record["kind"] == "student" else "official",
        "category": category, "statusLabel": category, "population": record["population"],
        "date": record["date"], "author": record.get("author"), "text": detail + f" [{record['code']}]",
        "limitations": record["limits"] + " 阅读范围：" + record["readingScope"],
        "url": record["url"], "sourceIds": [record["code"]], "expansionBatch": BATCH,
    })
    return True


def record(code, row, summary, points, limits, kind, change):
    return {key: value for key, value in {
        "code": code, "kind": kind, "title": row.get("title"), "url": row.get("url"), "date": row.get("date"),
        "author": row.get("author"), "population": row.get("population"), "summary": summary, "points": points,
        "limits": limits, "readingScope": "；".join(h.scopes(row)), "changeType": change,
    }.items()}


def merge(data, public, xhs):
    data = copy.deepcopy(data)
    protected = [{key: copy.deepcopy(value) for key, value in row.items() if key != "evidence"} for row in data["mentors"]]
    cards, author = copy.deepcopy(data["mentorCards"]), copy.deepcopy(data["meta"].get("author"))
    registry, exported = data["sourceRegistry"], []
    qa = {"before": {"socialPosts": len(data["socialPosts"]), "officialEvidence": len(data["officialEvidence"])},
          "newOfficialSources": 0, "newSocialPosts": 0, "updatedSocialPosts": 0, "mentorEvidenceAdded": 0,
          "supplementedExistingEvents": [], "duplicates": [], "skipped": [], "unread": [], "decisions": []}
    selected = {}
    known = {h.urlkey(row.get("url")): code for code, row in registry.items() if h.urlkey(row.get("url"))}
    for row in public.get("accepted", []):
        if row.get("read") is not True or not h.scopes(row) or not h.canonical(row.get("url")):
            qa["skipped"].append({"url": row.get("url"), "reason": "未明确正文已读或URL缺失"})
            continue
        editorial = next((item for item in PUBLIC if item[0] in row["url"]), None)
        if not editorial:
            qa["skipped"].append({"url": row["url"], "reason": "未人工审定的新候选"})
            continue
        key, summary, limits, category, roles = editorial
        assert h.within_budget(summary, limits), key
        code = "09" if key == "a150102" and "09" in registry else known.get(h.urlkey(row["url"]))
        change = "supplement" if key == "a150102" else "new"
        if key == "a150102" and not code:
            qa["skipped"].append({"url": row["url"], "reason": "缺少既有2025案例事件，拒绝静默视为新事件"})
            continue
        if code and key != "a150102" and registry[code].get("expansionBatch") != BATCH:
            qa["duplicates"].append({"code": code, "url": row["url"], "reason": "既有来源，不新增"})
            continue
        code = code or code_for(registry)
        output = record(code, row, summary, [summary], limits, "official", change)
        if key == "a150102":
            registry[code]["additionalUrls"] = h.unique(registry[code].get("additionalUrls", []) + [row["url"]])
            additions = registry[code].setdefault("appResearchSupplements", [])
            if not any(item.get("url") == row["url"] for item in additions):
                additions.append(output)
            qa["supplementedExistingEvents"].append({"code": code, "url": row["url"], "independentSourceIncrement": 0})
        elif code not in registry:
            registry[code] = {**output, "label": row.get("title"), "originalUrl": row["url"],
                              "canonicalUrl": h.canonical(row["url"]), "platform": row.get("platform"), "expansionBatch": BATCH}
            data["officialEvidence"].append({
                "key": "official:app:" + key, "ids": [code], "title": row.get("title"), "author": row.get("author"),
                "date_display": row.get("date"), "url": row["url"], "canonical_url": h.canonical(row["url"]),
                "population": row.get("population"), "summary": summary, "tips": [], "comments": [], "limits": limits,
                "topic": category, "use_status": category, "reading_scopes": h.scopes(row), "official": True,
                "screened_only": False, "campus": row.get("campus"), "expansionBatch": BATCH,
            })
            qa["newOfficialSources"] += 1
            known[h.urlkey(row["url"])] = code
        exported.append(output)
        selected[key] = code
        qa["decisions"].append({"code": code, "category": category, "changeType": change, "url": row["url"]})
        paragraph(data, "app-public-" + key, summary + " " + limits, code,
                  chapter="life-09" if key == "a163064" else "life-08")
        paragraph(data, "app-source-" + key, f"[{code}] {row['title']}｜{row.get('date') or '准确发布日期未知'}",
                  code, "life-12", url=row["url"])
        for name, detail in roles.items():
            qa["mentorEvidenceAdded"] += mentor_evidence(data, name, f"app-{key}-{name}", output, detail, category + "（对象年份限定）")

    existing = {h.post_id(row): row for row in data["socialPosts"]}
    updated_ids = set()
    for change, candidates in [("new", xhs.get("accepted", [])), ("updated", xhs.get("updates", []))]:
        for candidate in candidates:
            candidate["topic"] = candidate.get("topic") or "课程学习与培养"
            pid = h.post_id(candidate)
            required = ["title", "author", "date", "population", "summary", "points", "limits"]
            if (not pid or any(key not in candidate for key in required) or candidate.get("read") is not True
                    or not h.scopes(candidate) or candidate.get("promotionStatus") != "none_observed"):
                qa["skipped"].append({"id": pid, "reason": "XHS缺必要字段、明确已读或非推广判断"})
                continue
            prior = existing.get(pid)
            if change == "updated" and prior is None:
                qa["skipped"].append({"id": pid, "reason": "updates没有命中旧帖，不能增加帖子数"})
                continue
            if change == "new" and prior:
                if prior.get("expansionBatch") == BATCH:
                    retained_code = next((value for value in prior.get("sourceIds", []) if value in registry), None)
                    if retained_code:
                        selected[pid] = retained_code
                        exported.append(record(retained_code, candidate, candidate["summary"], candidate["points"],
                                               text(candidate["limits"]), "student", "new"))
                qa["duplicates"].append({"id": pid, "reason": "accepted命中已有ID，不重复增帖"})
                continue
            limits = text(candidate["limits"])
            if not isinstance(limits, str) or not isinstance(candidate["points"], list):
                qa["skipped"].append({"id": pid, "reason": "边界或points类型不符"})
                continue
            code = (next((value for value in prior.get("sourceIds", []) if value in registry), None)
                    if prior else code_for(registry))
            if not code:
                qa["skipped"].append({"id": pid, "reason": "旧帖缺有效来源编号"})
                continue
            output = record(code, candidate, candidate["summary"], candidate["points"], limits, "student", change)
            if prior is None:
                prior = {
                    "id": pid, "key": "xhs:" + pid, "sourceIds": [code, pid], "url": candidate["url"],
                    "canonicalUrl": "https://www.xiaohongshu.com/explore/" + pid, "platform": "小红书",
                    "title": candidate["title"], "author": candidate["author"], "date": candidate["date"],
                    "population": candidate["population"], "summary": candidate["summary"], "tips": candidate["points"],
                    "limitations": limits, "readingScopes": h.scopes(candidate), "comments": [],
                    "category": candidate.get("category") or "背景或待核实材料", "topic": candidate.get("topic"),
                    "campus": candidate.get("campus"), "screenedOnly": False, "needsVerification": True,
                    "verificationStatus": "可见正文已读，按身份与阅读范围限定", "promotion": "可见范围未见收费售课",
                    "expansionBatch": BATCH,
                }
                data["socialPosts"].append(prior)
                existing[pid] = prior
                registry[code] = {**output, "label": output["title"], "originalUrl": candidate["url"],
                                  "canonicalUrl": prior["canonicalUrl"], "expansionBatch": BATCH}
                qa["newSocialPosts"] += 1
            else:
                updates = prior.setdefault("appResearchUpdates", [])
                if any(item.get("readingScope") == output["readingScope"] for item in updates):
                    exported.append(output)
                    selected[pid] = code
                    qa["duplicates"].append({"id": pid, "reason": "该阅读补充已合并"})
                    continue
                updates.append(output)
                prior["tips"] = h.unique(prior.get("tips", []) + candidate["points"])
                prior["readingScopes"] = h.unique(prior.get("readingScopes", []) + ["本轮补充：" + output["readingScope"]])
                prior.setdefault("courseFeedback", []).append({
                    "id": "app-course-" + pid, "text": candidate["summary"], "population": candidate["population"],
                    "limits": limits, "readingScope": output["readingScope"],
                })
                registry[code].setdefault("appResearchUpdates", []).append(output)
                updated_ids.add(pid)
                qa["updatedSocialPosts"] += 1
            exported.append(output)
            selected[pid] = code
            for i, point in enumerate(candidate["points"]):
                tip_id = f"{pid}:app-{change}-{i}"
                if not any(item.get("id") == tip_id for item in data["tipsIndex"]):
                    data["tipsIndex"].append({
                        "id": tip_id, "topic": candidate.get("topic"), "point": point, "context": candidate["summary"],
                        "scope": candidate["population"], "limits": limits, "author": candidate["author"],
                        "date_display": candidate["date"], "url": candidate["url"], "post_title": candidate["title"],
                        "status": "同帖新读回复" if change == "updated" else "正文可读背景",
                        "source_ids": code + "／" + pid, "source_key": prior["key"], "expansionBatch": BATCH,
                    })
            if pid == "67aef89b0000000029009825" and change == "updated":
                course = dict(output, author="小鱼鱼鱼", date="08-26（评论年份未显示）")
                qa["mentorEvidenceAdded"] += mentor_evidence(
                    data, "程博", "app-course-chengbo", course,
                    "评论者小鱼鱼鱼回访自述公司治理课程为一次汇报和一篇研究设计，专业年级未独立核验。",
                    "课程考核个案，非导师日常指导")
            paragraph(data, "app-xhs-" + pid, candidate["summary"] + " " + limits, code)
            paragraph(data, "app-source-xhs-" + pid, f"[{code}] {candidate['title']}（{'同帖补充，不增帖子' if change == 'updated' else '课程核实线索'}）",
                      code, "life-12", url=candidate["url"])

    for origin, source in [("public", public), ("xhs", xhs)]:
        for field, target in [("screened", "skipped"), ("unread", "unread"), ("duplicates", "duplicates")]:
            qa[target].extend({"input": origin, **row} for row in source.get(field, []) if isinstance(row, dict))
    assert [{key: value for key, value in row.items() if key != "evidence"} for row in data["mentors"]] == protected
    assert data["mentorCards"] == cards and data["meta"].get("author") == author and len(data["mentors"]) == 34
    meta = data["meta"]
    meta["counts"]["socialPosts"], meta["counts"]["officialEvidence"] = len(data["socialPosts"]), len(data["officialEvidence"])
    meta["socialPostCategories"] = dict(collections.Counter(row.get("category") for row in data["socialPosts"]))
    meta["platformNote"] = f"社交来源索引实际{len(data['socialPosts'])}条，官网证据{len(data['officialEvidence'])}条；同帖回复补充不增加帖子数，同届同队转载不增加独立事件。课程反馈与导师日常指导分开，保留年份、对象和阅读范围。"
    highlights = []
    for title, content, keys in [
        ("MPAcc现场课程", "2025级三门课程连接到南钢业务与财务现场，一次教学实例保留届别。", ["a156709"]),
        ("论文与岗位问题", "新增数据合规论文个案和行政事业财务实务入口，区分论文指导与讲座主持。", ["a129421", "a163064"]),
        ("选课回复更具体", "原帖补读公司治理与会计研究方法考核回复，课程个案不转写导师日常风格。", ["67aef89b0000000029009825", "6a8edcec000000001f000035"]),
        ("历史规则进一步阅读", "开题、答辩、创新计划只作有年份范围的参考，本级执行另核通知。", ["917bf89f", "730a7e8f", "98137a50"]),
    ]:
        codes = [selected[key] for key in keys if key in selected]
        if codes:
            highlights.append({"title": title, "text": content, "sourceCodes": codes})
    meta["appResearch"] = {
        "newOfficialSources": sum(row.get("expansionBatch") == BATCH for row in data["officialEvidence"]),
        "newSocialPosts": sum(row.get("expansionBatch") == BATCH for row in data["socialPosts"]),
        "updatedSocialPosts": sum(bool(row.get("appResearchUpdates")) for row in data["socialPosts"]), "highlights": highlights,
    }
    qa["after"] = {"socialPosts": len(data["socialPosts"]), "officialEvidence": len(data["officialEvidence"])}
    qa["checks"] = {"rosterAndCoreCardsUnchanged": True, "unknownDatesKeptNull": True,
                    "updatedPostsNotCountedAsNew": True, "same2025CaseNotCountedAsNew": True}
    return data, qa, exported


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--data", type=pathlib.Path, default=ROOT / "dist/data/site-data.json")
    parser.add_argument("--public", type=pathlib.Path, default=input_path("research_app_public.json"))
    parser.add_argument("--xhs", type=pathlib.Path, default=input_path("research_app_xhs.json"))
    args = parser.parse_args()
    data, qa, exported = merge(h.read(args.data), h.read(args.public), h.read(args.xhs) if args.xhs.exists() else {})
    if args.write:
        h.write_atomic(args.data, data)
        h.write_atomic(ROOT / "data/app-research-sources.json", exported)
        h.write_atomic(ROOT / "data/app-research-qa.json", qa)
    print(json.dumps({**qa["after"], "newOfficialSources": qa["newOfficialSources"], "newSocialPosts": qa["newSocialPosts"],
                      "updatedSocialPosts": qa["updatedSocialPosts"], "exportedRecords": len(exported),
                      "mode": "written" if args.write else "dry-run"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
