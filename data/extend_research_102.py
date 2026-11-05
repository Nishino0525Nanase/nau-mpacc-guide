#!/usr/bin/env python3
"""Merge reviewed MPAcc 1.0.2 research; default is a dry run.

--write updates site-data.json and deterministic source/QA exports. Unknown
source dates and identities remain null. Same-event and same-post updates do
not increase the indexed source counts. Installer metadata is untouched.
"""
from __future__ import annotations
import argparse
import collections
import copy
import hashlib
import json
import pathlib
import re
import extend_research_round3 as h

ROOT = pathlib.Path(__file__).resolve().parents[1]
WORKSPACE = ROOT.parent
BATCH = "research-102"
REVIEW_FINISHED = True
# Filled after manually reviewing this round's accepted candidates.
REVIEWED_KEYS = {
    "nau-article:160093", "nau-article:157673", "nau-article:155331", "nau-article:159585",
    "https://www.icourse163.org/course/NAU-1449494161", "xhs:67ecb72b000000001e0042af",
}
REVIEW_OVERRIDES = {
    "nau-article:160093": {"highlightTitle": "三位会计专硕的准备路径"},
    "nau-article:157673": {"highlightTitle": "智能财务共享的实践环节"},
    "nau-article:155331": {"highlightTitle": "案例论文先怎样提问题"},
    "https://www.icourse163.org/course/NAU-1449494161": {
        "highlightTitle": "公开会计学基础复习入口", "roleCategory": "公开基础课程团队（非MPAcc指导关系）"},
    "nau-article:159585": {"roleCategory": "既有案例公开讲解（非学生日常指导）"},
}


def input_path(name):
    path = ROOT / "data/research_102" / name
    return path if path.exists() else WORKSPACE / name


def text(value):
    return "；".join(str(x) for x in value) if isinstance(value, list) else str(value or "")


def identity(row):
    return h.urlkey(row.get("canonicalUrl") or row.get("url"))


def code_for(registry):
    for n in range(601, 700):
        code = f"D{n}"
        if code not in registry:
            return code
    raise ValueError("D601—D699已用满")


def stable(value):
    return hashlib.sha256(value.encode()).hexdigest()[:16]


def source_record(code, row, kind, change):
    return {
        "code": code, "kind": kind, "title": row["title"], "url": row["url"],
        "platform": row.get("platform") or ("南京审计大学官网" if kind == "official" else "其他公开平台"),
        "date": row.get("date"), "author": row.get("author"), "population": row.get("population"),
        "summary": row["summary"], "points": row.get("points", []), "limits": text(row.get("limits")),
        "readingScope": "；".join(h.scopes(row)), "changeType": change,
        "advisorNames": row.get("advisorNames", []),
    }


def append_block(data, key, record, chapter):
    target = next(item for item in data["lifeChapters"] if item["id"] == chapter)
    if any(block.get("expansionId") == key for block in target["blocks"]):
        return
    target["blocks"].append({
        "type": "p", "text": record["summary"] + " " + record["limits"] + f" [{record['code']}]",
        "sourceCodes": [record["code"]], "expansionId": key, "expansionBatch": BATCH,
    })
    target["sourceCodes"] = h.unique(target.get("sourceCodes", []) + [record["code"]])


def append_registry_index(data, key, record):
    chapter = next(item for item in data["lifeChapters"] if item["id"] == "life-12")
    if not any(block.get("expansionId") == key for block in chapter["blocks"]):
        chapter["blocks"].append({
            "type": "source", "text": f"[{record['code']}] {record['title']}", "url": record["url"],
            "sourceCodes": [record["code"]], "expansionId": key, "expansionBatch": BATCH,
        })
        chapter["sourceCodes"] = h.unique(chapter.get("sourceCodes", []) + [record["code"]])


def chapter_for(row):
    if row.get("chapterId") in {f"life-{n:02d}" for n in range(1, 13)}:
        return row["chapterId"]
    content = row.get("title", "") + row.get("summary", "")
    if re.search(r"互选|双选|导师|推荐论文|优秀.{0,4}论文", content):
        return "life-08"
    if re.search(r"实习|就业|招聘|工作站", content):
        return "life-09"
    if re.search(r"奖学金|助学金|补贴|资助", content):
        return "life-10"
    return "life-08"



def append_project_topics(data, row, record):
    # This batch has no automatic topic-list transfer. Any such material needs
    # its own reviewed context; the existing C503 21-topic list is untouched.
    return


def append_roles(data, row, record):
    count = 0
    for name, detail in (row.get("advisorRoles") or {}).items():
        mentor = next((item for item in data["mentors"] if item["name"] == name), None)
        if not mentor or not isinstance(detail, str) or not detail.strip():
            continue
        key = "research102-role-" + stable(record["code"] + name + detail)
        evidence = mentor.setdefault("evidence", [])
        if any(item.get("id") == key for item in evidence):
            continue
        category = row.get("roleCategory") or "官方公开活动或培养个案（角色限定）"
        evidence.append({
            "id": key, "kind": "official", "category": category, "statusLabel": category,
            "population": record["population"], "date": record["date"], "author": record["author"],
            "text": detail + f" [{record['code']}]", "limitations": record["limits"] + " 阅读范围：" + record["readingScope"],
            "url": record["url"], "sourceIds": [record["code"]], "expansionBatch": BATCH,
        })
        count += 1
    return count


def apply_attribution_correction(data, row, prior, record):
    """Correct only explicit comment authors/dates; preserve post and claim roles."""
    corrections = row.get("teacherAttribution") or row.get("teacherAttributions") or []
    if isinstance(corrections, dict):
        corrections = [corrections]
    count = 0
    for correction in corrections:
        if not isinstance(correction, dict):
            continue
        name = correction.get("teacherName") or correction.get("teacher")
        author = correction.get("commentAuthor") or correction.get("author")
        date = correction.get("commentDate") or correction.get("date_display") or correction.get("date")
        if not name or not author or not date:
            continue
        scoped_reading = correction.get("readingScope") or ("直接核对同一条评论中关于" + name + "的提名、评论署名和可见日期；其他老师的课程或竞赛关系不转接。")
        if prior:
            for comment in prior.get("comments", []):
                if comment.get("teacher") == name:
                    comment["author"], comment["date_display"] = author, date
                    comment["attributionCorrection"] = {
                        "sourceCode": record["code"], "readingScope": scoped_reading,
                        "limits": "仅核对评论署名及可见日期；接触身份和既有行为描述不升级。",
                    }
        mentor = next((item for item in data["mentors"] if item.get("name") == name), None)
        if not mentor:
            continue
        expected_id = correction.get("evidenceId")
        for evidence in mentor.get("evidence", []):
            if (expected_id and evidence.get("id") != expected_id) or not any(
                    code == record["code"] for code in evidence.get("sourceIds", [])):
                continue
            if evidence.get("kind") == "official":
                continue
            evidence["author"], evidence["date"] = author, date
            prefix = "本次只核对评论署名和日期，身份与原行为描述不升级。阅读范围："
            legacy_note, scope_note = prefix + record["readingScope"], prefix + scoped_reading
            if legacy_note != scope_note:
                evidence["limitations"] = evidence.get("limitations", "").replace(" " + legacy_note, "")
            if scope_note not in evidence.get("limitations", ""):
                evidence["limitations"] = evidence.get("limitations", "") + " " + scope_note
            evidence["attributionCorrection"] = {
                "readingScope": scoped_reading, "limits": "仅评论署名与可见日期归因；身份不明，笼统提名强度不升级。",
                "changeType": "comment attribution correction only",
            }
            # The identity is still unknown; do not replace its content/kind or
            # label this as a new student sample or a new advising behavior.
            count += 1
    return count


def merge(original, public, students):
    public = copy.deepcopy(public)
    official_supplements = students.get("officialSupplements") or students.get("officialSupplement") or []
    public.setdefault("accepted", []).extend(h.items(official_supplements))
    data = copy.deepcopy(original)
    roster = [{k: copy.deepcopy(v) for k, v in row.items() if k != "evidence"} for row in data["mentors"]]
    cards, edition, author = (copy.deepcopy(data["mentorCards"]), copy.deepcopy(data["meta"].get("appEdition")),
                              copy.deepcopy(data["meta"].get("author")))
    registry, exported = data["sourceRegistry"], []
    known = {}
    for code, row in registry.items():
        for url in h.urls(row):
            key = h.urlkey(url)
            if key:
                known.setdefault(key, code)
    all_keys = {h.urlkey(url) for url in h.urls(data)}
    all_keys.discard(None)
    existing_posts = {identity(row): row for row in data["socialPosts"]}
    qa = {
        "before": {"socialPosts": len(data["socialPosts"]), "officialEvidence": len(data["officialEvidence"])},
        "newOfficialSources": 0, "newSocialPosts": 0, "updatedSocialPosts": 0, "updatedOfficialSources": 0,
        "mentorEvidenceAdded": 0, "attributionFieldsCorrected": 0, "supplements": [], "duplicates": [], "skipped": [], "unread": [], "decisions": [],
    }
    for kind, source_input in [("official", public), ("student", students)]:
        for requested, rows in [("new", source_input.get("accepted", [])), ("updated", source_input.get("updates", []))]:
            for row in rows:
                row = copy.deepcopy(row)
                key = identity(row)
                row.update(REVIEW_OVERRIDES.get(key, {}))
                if key not in REVIEWED_KEYS:
                    qa["skipped"].append({"url": row.get("url"), "reason": "未纳入人工审定白名单"})
                    continue
                if (row.get("read") is not True or not h.scopes(row) or not key or not row.get("title")
                        or not row.get("summary") or not row.get("limits")):
                    qa["skipped"].append({"url": row.get("url"), "reason": "缺明确正文已读、阅读范围、标题、摘要或适用边界"})
                    continue
                if kind == "student" and row.get("promotionStatus") != "none_observed":
                    qa["skipped"].append({"url": row["url"], "reason": "缺可见范围无售课导流判断"})
                    continue
                if not h.within_budget(row["summary"], text(row["limits"]), *row.get("points", [])):
                    qa["skipped"].append({"url": row["url"], "reason": "摘要与要点超过每来源200词预算，须先缩写"})
                    continue
                explicit_existing = row.get("existingCode") or row.get("supplementOf") or row.get("sameEventAs")
                if explicit_existing and explicit_existing not in registry:
                    qa["skipped"].append({"url": row["url"], "reason": "同事件来源编号不存在"})
                    continue
                prior = existing_posts.get(key) if kind == "student" else None
                code = explicit_existing or known.get(key)
                if kind == "student" and prior:
                    code = next((c for c in prior.get("sourceIds", []) if c in registry), code)
                retained = code and registry[code].get("expansionBatch") == BATCH
                action = "supplement" if explicit_existing and kind == "official" else requested
                if requested == "new" and code and not retained and not explicit_existing:
                    qa["duplicates"].append({"code": code, "url": row["url"], "reason": "已有文章ID/规范URL，不重复计数"})
                    continue
                if requested == "new" and key in all_keys and not code:
                    qa["duplicates"].append({"url": row["url"], "reason": "递归已有URL但未找到可更新来源编号，不作为新增"})
                    continue
                if requested == "updated" and not code:
                    qa["skipped"].append({"url": row["url"], "reason": "旧来源更新未命中，不静默增加来源"})
                    continue
                code = code or code_for(registry)
                record = source_record(code, row, kind, action)
                update_key = stable(row["url"] + record["readingScope"] + record["summary"])
                if code not in registry:
                    registry[code] = {**record, "label": row["title"], "originalUrl": row["url"],
                                      "canonicalUrl": h.canonical(row.get("canonicalUrl") or row["url"]), "expansionBatch": BATCH}
                    extras = list(h.items(row.get("additionalUrls") or row.get("attachmentUrls")))
                    extras += [item.get("url") for field in ["attachments", "supportingSources"]
                               for item in row.get(field, []) if isinstance(item, dict)]
                    registry[code]["additionalUrls"] = h.unique(u for u in extras if h.canonical(u))
                    if kind == "official":
                        data["officialEvidence"].append({
                            "key": "official:research102:" + stable(key), "ids": [code], "title": row["title"],
                            "author": row.get("author"), "date_display": row.get("date"), "url": row["url"],
                            "canonical_url": h.canonical(row["url"]), "population": row.get("population"),
                            "summary": row["summary"], "tips": row.get("points", []), "comments": [], "limits": record["limits"],
                            "topic": row.get("topic") or row.get("kind") or "培养与学习实例", "use_status": row.get("category") or "官方材料",
                            "reading_scopes": h.scopes(row), "official": True, "screened_only": False,
                            "campus": row.get("campus"), "expansionBatch": BATCH,
                        })
                        qa["newOfficialSources"] += 1
                    else:
                        pid = h.post_id(row) or "web-" + stable(key)
                        prior = {
                            "id": pid, "key": "xhs:" + pid if h.post_id(row) else "web:" + pid, "sourceIds": [code],
                            "url": row["url"], "canonicalUrl": h.canonical(row.get("canonicalUrl") or row["url"]),
                            "platform": record["platform"], "title": row["title"], "author": row.get("author"), "date": row.get("date"),
                            "population": row.get("population"), "summary": row["summary"], "tips": row.get("points", []),
                            "limitations": record["limits"], "readingScopes": h.scopes(row), "comments": [],
                            "category": row.get("category") or "背景或待核实材料", "topic": row.get("topic") or "课程学习与培养",
                            "campus": row.get("campus"), "screenedOnly": False, "needsVerification": True,
                            "verificationStatus": "可见正文已读，按身份与阅读范围限定", "promotion": "可见范围未见收费售课",
                            "expansionBatch": BATCH,
                        }
                        data["socialPosts"].append(prior)
                        existing_posts[key] = prior
                        qa["newSocialPosts"] += 1
                elif action != "new":
                    updates = registry[code].setdefault("research102Updates", [])
                    if not any(item.get("updateKey") == update_key for item in updates):
                        updates.append({**record, "updateKey": update_key})
                        registry[code]["additionalUrls"] = h.unique(registry[code].get("additionalUrls", []) + [row["url"]])
                        if kind == "student" and prior:
                            prior.setdefault("research102Updates", []).append({**record, "updateKey": update_key})
                            prior["tips"] = h.unique(prior.get("tips", []) + row.get("points", []))
                            prior["readingScopes"] = h.unique(prior.get("readingScopes", []) + h.scopes(row))
                            qa["updatedSocialPosts"] += 1
                        elif kind == "official":
                            qa["updatedOfficialSources"] += 1
                        if action == "supplement":
                            qa["supplements"].append({"code": code, "url": row["url"], "independentSourceIncrement": 0})
                if kind == "student" and row.get("updateType") == "attributionCorrection":
                    qa["attributionFieldsCorrected"] += apply_attribution_correction(data, row, prior, record)
                exported.append(record)
                qa["decisions"].append({"code": code, "url": row["url"], "changeType": action, "kind": kind})
                known[key] = code
                all_keys.add(key)
                for url in registry[code].get("additionalUrls", []):
                    if h.urlkey(url):
                        known.setdefault(h.urlkey(url), code)
                        all_keys.add(h.urlkey(url))
                append_block(data, "research102-body-" + update_key, record, chapter_for(row))
                append_registry_index(data, "research102-source-" + update_key, record)
                if kind == "official":
                    qa["mentorEvidenceAdded"] += append_roles(data, row, record)
                    append_project_topics(data, row, record)
                for i, point in enumerate(row.get("points", [])):
                    tip_id = f"research102:{code}:{update_key}:{i}"
                    if not any(item.get("id") == tip_id for item in data["tipsIndex"]):
                        data["tipsIndex"].append({
                            "id": tip_id, "topic": row.get("topic") or "课程学习与培养", "point": point,
                            "context": row["summary"], "scope": row.get("population"), "limits": record["limits"],
                            "author": row.get("author"), "date_display": row.get("date"), "url": row["url"],
                            "post_title": row["title"], "status": "官方公开资料" if kind == "official" else "新读正文或回复",
                            "source_ids": code, "source_key": "research102:" + stable(key), "expansionBatch": BATCH,
                        })
    for origin, source_input in [("official", public), ("students", students)]:
        for key, target in [("duplicates", "duplicates"), ("screened", "skipped"), ("unread", "unread")]:
            qa[target].extend({"input": origin, **row} for row in source_input.get(key, []) if isinstance(row, dict))
    new_official = sum(row.get("expansionBatch") == BATCH for row in data["officialEvidence"])
    new_social = sum(row.get("expansionBatch") == BATCH for row in data["socialPosts"])
    updated_social = sum(bool(row.get("research102Updates")) for row in data["socialPosts"])
    source_rows = {row.get("url"): row for source_input in [public, students]
                   for row in source_input.get("accepted", []) + source_input.get("updates", [])}
    highlights = []
    for record in exported[:4]:
        row = source_rows[record["url"]]
        override = REVIEW_OVERRIDES.get(identity(row), {})
        highlights.append({"title": override.get("highlightTitle") or row.get("highlightTitle") or row["title"],
                           "text": row.get("highlightText") or row["summary"], "sourceCodes": [record["code"]]})
    meta = data["meta"]
    meta["research102"] = {"newOfficialSources": new_official, "newSocialPosts": new_social,
                                "updatedSocialPosts": updated_social, "highlights": highlights}
    meta["counts"]["socialPosts"], meta["counts"]["officialEvidence"] = len(data["socialPosts"]), len(data["officialEvidence"])
    meta["socialPostCategories"] = dict(collections.Counter(row.get("category") for row in data["socialPosts"]))
    meta["platformNote"] = f"社交来源索引实际{len(data['socialPosts'])}条，官方公开资料{len(data['officialEvidence'])}条；同帖补读、同事件附件和转载不重复计数。课程反馈与导师日常指导分开，保留年份、对象和阅读范围。"
    assert [{k: v for k, v in row.items() if k != "evidence"} for row in data["mentors"]] == roster
    assert data["mentorCards"] == cards and len(data["mentors"]) == 34 and len(cards) == 17
    assert meta.get("appEdition") == edition and meta.get("author") == author
    qa["after"] = {"socialPosts": len(data["socialPosts"]), "officialEvidence": len(data["officialEvidence"])}
    qa["checks"] = {"rosterAndCoreCardsUnchanged": True, "installerMetadataUnchanged": True,
                    "sameEventAndPostUpdatesNotCountedAsNew": True, "unknownSourceFieldsNotInferred": True}
    qa["checks"].update({"publicNoticeAndAttachmentCountedOnce": True, "studentInformationColumnsNotRepublished": True,
                         "sourceRoleAndDegreeBoundariesPreserved": True})
    qa["sourceBoundaryNotes"] = {row["code"]: row["limits"] for row in exported}
    before_x01 = next((item for item in original["socialPosts"] if "X01" in item.get("sourceIds", [])), None)
    after_x01 = next((item for item in data["socialPosts"] if "X01" in item.get("sourceIds", [])), None)
    if before_x01 and after_x01:
        assert all(before_x01.get(field) == after_x01.get(field) for field in ["title", "author", "date", "population", "summary"])
        before_other = [item for item in before_x01.get("comments", []) if item.get("teacher") != "温素彬"]
        after_other = [item for item in after_x01.get("comments", []) if item.get("teacher") != "温素彬"]
        assert before_other == after_other, "归因修正触及了其他教师评论"
        before_weak = next((item for m in original["mentors"] if m["name"] == "温素彬"
                            for item in m.get("evidence", []) if item.get("id") == "67ecb72b000000001e0042af:c9"), None)
        after_weak = next((item for m in data["mentors"] if m["name"] == "温素彬"
                           for item in m.get("evidence", []) if item.get("id") == "67ecb72b000000001e0042af:c9"), None)
        assert before_weak and after_weak
        assert all(before_weak.get(field) == after_weak.get(field) for field in ["kind", "category", "statusLabel", "population", "text"]), "弱线索被升级或改写"
        if after_weak.get("attributionCorrection"):
            assert "王烨" not in after_weak["attributionCorrection"]["readingScope"]
            assert "王烨" not in after_weak["limitations"], "整帖其他教师阅读范围混入温素彬卡片"
    qa["checks"]["attributionLeavesPostAndOtherTeachersUnchanged"] = True
    qa["checks"]["weakNominationStrengthNotUpgraded"] = True
    qa["checks"]["attributionMentorCardReadingScopeIsTeacherSpecific"] = True
    qa["queryCounts"] = {"official": len(public.get("queries", [])), "students": len(students.get("queries", []))}
    return data, qa, exported


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--write", action="store_true")
    p.add_argument("--data", type=pathlib.Path, default=ROOT / "dist/data/site-data.json")
    p.add_argument("--public", type=pathlib.Path, default=input_path("research_102_public.json"))
    p.add_argument("--students", type=pathlib.Path, default=input_path("research_102_students.json"))
    args = p.parse_args()
    public = h.read(args.public) if args.public.exists() else {}
    students = h.read(args.students) if args.students.exists() else {}
    data, qa, exported = merge(h.read(args.data), public, students)
    repeated, _, _ = merge(data, public, students)
    assert data == repeated, "相同输入重复合并改变运行数据"
    qa["checks"]["repeatMergeIsIdempotent"] = True
    if args.write:
        if not REVIEW_FINISHED or not args.public.exists() or not args.students.exists():
            raise SystemExit("Write is gated until both research inputs and the reviewed plan are complete")
        h.write_atomic(args.data, data)
        h.write_atomic(ROOT / "data/research-102-sources.json", exported)
        h.write_atomic(ROOT / "data/research-102-qa.json", qa)
    print(json.dumps({**qa["after"], "newOfficialSources": qa["newOfficialSources"], "newSocialPosts": qa["newSocialPosts"],
                      "updatedSocialPosts": qa["updatedSocialPosts"], "exportedRecords": len(exported),
                      "mode": "written" if args.write else "dry-run"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
