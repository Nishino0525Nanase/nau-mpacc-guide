# 南审 MPAcc 指南网页数据

生成入口：`python data/build_site_data.py`（从工作区四份已核实的 JSON 转换）。
发布数据：`dist/data/site-data.json`，UTF-8，`schemaVersion: 1.0.0`。
本转换不补充检索事实；源文件中的官方、匿名、自述、转述和待核实边界均保留。

## 顶层字段

| 字段 | 数量 | 用途 |
|---|---:|---|
| `meta` | 1 | 标题、版本、日期、正确统计、导师名单来源和证据边界 |
| `directions` | 6 | `{id,label}`，G1—G6 导览分类，不是统一招生目录方向 |
| `mentors` | 34 | 研究生院 2026-01-08 会计 125300 导师名单；名单原顺序 |
| `mentorCards` | 17 | 详细卡片备援；正文优先使用 `mentors[].profileFields` |
| `lifeIntro`, `lifeChapters` | 12 章 | 完整生活攻略原文、表格和来源附录 |
| `mentorIntro`, `mentorGuideSections` | 5 部分 | 完整导师指南与邮件操作建议 |
| `targetProfiles` | 6 | A—E 五种学生目标及公共部门补充目标 |
| `socialPosts` | 82 | 社交原帖去重索引，含筛除、背景、课程体验等 |
| `officialEvidence` | 85 | 34 名导师、40 官方生活资料、8 服务、3 具名学生个案 |
| `feedbackIndex` | 21 | 原始去重反馈记录；一条可能关联多名教师 |
| `tipsIndex` | 283 | 原始学习生活细节索引 |
| `sourceRegistry` | 260 个引用别名 | 所有引文代码到链接及适用边界的映射；不是 260 个独立来源 |
| `downloads` | 3 | 两份 Word 和一份 Excel，含 bytes 和 sha256 |
| `rosterConflicts`, `rosterExclusions`, `generalLimits` | 不固定 | 名单冲突、排除说明及整体边界 |

## 导师

```json
{
  "id": "mentor-02",
  "name": "温素彬",
  "title": "教授",
  "qualification": "原官方资格表述",
  "directions": ["G1", "G2"],
  "research": "原官方研究方向",
  "summary": "有详细卡时为匹配理由，否则为公开研究方向",
  "email": "公开邮箱或未公开说明",
  "profileUrl": "https://...",
  "profileFields": [{"label": "主要研究方向", "value": "..."}],
  "hasDetailedCard": true,
  "evidence": [],
  "links": [{"label": "官方教师页", "url": "https://..."}],
  "feedbackStatus": "原反馈公开程度标签",
  "quotaStatus": "未公开/须向当年学院双选通知及导师本人核实",
  "rosterOrder": 2,
  "rosterSourceDate": "2026-01-08"
}
```

`evidence` 字段为 `{id,kind,category,statusLabel,population,date,text,url,limitations,sourceIds}`；匿名条目另保留 author/postId。`kind` 可为 official/firsthand/secondhand/uncertain。

**firsthand 只表示发言人自称直接接触；可能是本科课堂，不表示 MPAcc 指导亲历。** 页面必须同时显示 `population` 和 `statusLabel`，不能把匿名评价写成导师性格结论。官方具名学生个案也保留年份和特殊场景；名单内不表示当年有名额。历史邮箱在 `historicalContact` 中单独保留，不作为现行已核实邮箱。

`feedbackIndex` 为 21 条独立记录，因一条反馈可以提多位教师，分配到导师后的 evidence 条目数不能作为独立反馈条数。

## 生活章节与正文块

```json
{
  "id": "life-01",
  "number": 1,
  "title": "第一章 先确认校区和适用年级",
  "blocks": [
    {"type": "p", "text": "正文……[F06][F10]", "sourceCodes": ["F06", "F10"]},
    {"type": "table", "headers": ["项目", "说明"], "rows": [["A", "B"]], "sourceCodes": []},
    {"type": "source", "text": "来源标题", "url": "https://...", "sourceCodes": []}
  ],
  "sourceCodes": ["F06", "F10"]
}
```

块类型原样保留：p、heading（level）、table（headers/rows/widths）、source（text/url）、toc。表格单元可以是字符串或 `{label,url}`。章节 `sourceCodes` 是本章代码去重合集，正文参考代码也保留在原字符串中，便于交互链接和全文复制。不能把网页表格单元对象显示成 `[object Object]`。

## 按目标匹配

```json
{
  "id": "A",
  "title": "希望走智能会计与大数据加会计路线",
  "summary": "优先从温素彬、李慧了解……",
  "mentorIds": ["mentor-02", "mentor-08", "mentor-32", "mentor-34"],
  "directionIds": ["G1", "G2", "G6"],
  "blocks": [{"type": "p", "text": "完整操作建议", "sourceCodes": []}],
  "sourceCodes": ["X03"],
  "additionalNamedPeople": []
}
```

`additionalNamedPeople` 保留建议中提及但不在现 34 人名单的人员；不能因在正文提及而自动加入导师名单。

## 社交原帖与来源

`socialPosts` 保留 id/key/sourceIds/canonicalUrl/url/title/author/date/platform/topic/campus/population/summary/tips/comments/limitations/category/reviewReason/verificationStatus/needsVerification/screenedOnly/promotion/readingScopes/queries/inputFiles。

`category` 是资料审核用途标签：可用生活学习线索、有边界的导师课程反馈、背景或待核实材料、排除主要攻略选导依据、仅筛选记录。所有社交条目 `needsVerification: true`；筛除帖仍保留，供复核，不应当进入主要攻略推荐。

`sourceRegistry` 键包括 F/L/P/C/V、导师数字来源代码、X01—X03、ROSTER-姓名及原帖 ID 等别名。多个键可能指向同一 URL。代码应精确查表，不能把单个来源别名数量当独立证据量。这里共有 168 个不同的原 URL（含对应官方及社交链接）。源记录能提供时还保留 kind/date/population/limitations/category/postId/originalId/canonicalUrl 等。

## 下载文件

下载链接相对于 `dist/index.html`：

- `./downloads/mentor-guide.docx`
- `./downloads/life-guide.docx`
- `./downloads/evidence-index.xlsx`

三份文件通过逐字节复制生成；JSON 提供 `bytes`、`sha256` 便于检查与原交付文件一致。转换末尾断言 34/17/12/82 数量、帖子 ID 唯一、章节完整性、名单日期及原材料所有必要 URL 均保留。
