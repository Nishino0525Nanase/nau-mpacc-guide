// Pure data preparation for the existing download workbook.
const list = value => Array.isArray(value) ? value : value == null ? [] : [value];
const text = value => value == null ? '' : Array.isArray(value) ? value.map(text).filter(Boolean).join('\n') : typeof value === 'object' ? text(value.text ?? value.label ?? value.summary ?? value.name ?? '') : String(value);
const distinctPeople = records => new Set(records.map(row => row.studentName).filter(Boolean)).size;
const firmGroups = {big4:'四大',domestic8:'国内八大',history:'瑞华（历史）'};
export const isFirmEmployment = record => record.outcome?.type === 'employment' && Boolean(firmGroups[record.outcome.firmGroup]) && Boolean(record.outcome.firmName);

export function studentOutcomeSheet(site, sourceLinks) {
  const records = list(site.studentOutcomes?.records);
  const ordered = records.map((record,index) => ({record,index})).sort((a,b) => Number(isFirmEmployment(b.record)) - Number(isFirmEmployment(a.record)) || a.index - b.index).map(item => item.record);
  const rows = [], links = [];
  for (const record of ordered) {
    const outcome = record.outcome || {}, source = sourceLinks(record.sourceIds)[0], rowIndex = rows.length;
    rows.push([record.studentName,record.degreeLabel || record.degree,record.cohort || '',record.graduationYear ?? null,record.mentorName || '未公开',record.relationship?.text || '未公开',outcome.type === 'phd' ? '读博' : outcome.type === 'employment' ? '就业' : '其他升学',firmGroups[outcome.firmGroup] || '',outcome.firmName || '',outcome.organization || '',outcome.program || '',outcome.year ?? null,outcome.statusLabel || '',outcome.asOf || '',text(record.limits),text(record.sourceIds),source?.url || '',record.id]);
    if (source) links.push({rowIndex,colIndex:16,url:source.url,label:source.code + ' 原文'});
  }
  const mpacc = records.filter(record => record.degree === 'MPAcc');
  const firms = records.filter(isFirmEmployment);
  return {name:'学生公开去向',title:'学生公开去向',headerRow:6,
    note:`${records.length}条时间点记录涉及${distinctPeople(records)}人。事务所就业${firms.length}条优先列示。明确MPAcc为${distinctPeople(mpacc)}人${mpacc.length}条。签约、拟入职及历史任职按原文状态区分。`,
    headers:['学生','学位与专业','入学年级','毕业年份','导师','导师关系依据','去向类别','事务所组','规范所名','院校或单位','专业或岗位','去向年份','报道时状态','资料时点原样','适用边界','来源编号','原文','记录编号'],
    rows,links,widths:[18,44,20,16,18,62,20,22,24,38,50,16,58,32,92,32,32,36],tableName:'StudentOutcomes113',
    summary:{records:records.length,people:distinctPeople(records),mpaccRecords:mpacc.length,mpaccPeople:distinctPeople(mpacc),firmRecords:firms.length,firmPeople:distinctPeople(firms)},
    orderedRecordIds:ordered.map(record => record.id)};
}

export function studentOutcomeSections(site, mainSpec, sourceLinks) {
  const outcomes = site.studentOutcomes || {}, sections = [];
  let nextHeaderRow = mainSpec.headerRow + mainSpec.rows.length + 4;
  const add = (key,title,headers,rows,sourceRows,tableName) => {
    if (!rows.length) return;
    const links = [];
    sourceRows.forEach((record,rowIndex) => {const source = sourceLinks(record.sourceIds)[0];if(source)links.push({rowIndex,colIndex:headers.length-1,url:source.url,label:source.code + ' 原文'});});
    const section = {key,title,titleRow:nextHeaderRow-1,headerRow:nextHeaderRow,headers,rows,links,tableName,widths:mainSpec.widths.slice(0,headers.length)};
    sections.push(section);
    nextHeaderRow += rows.length + 5;
  };
  const stats = list(outcomes.statistics);
  add('statistics','学校公开统计（不计入具名人数）',['统计指标','数值','单位','适用届别','学位点','适用边界','原文'],stats.map(record => [record.label,record.value,record.unit || (/人数|人次/.test(record.label || '') ? '人' : '未注明'),record.cohort,record.scope,text(record.limits),sourceLinks(record.sourceIds)[0]?.url || '']),stats,'OutcomeStatistics113');
  const awards = list(outcomes.achievements);
  add('achievements','论文成果（不作为就业记录）',['学生','学位','导师','论文成果','适用边界','原文'],awards.map(record => [record.studentName,record.degreeLabel,record.mentorName,record.achievement?.text,text(record.limits),sourceLinks(record.sourceIds)[0]?.url || '']),awards,'ThesisAchievements113');
  const statements = list(outcomes.mentorCareerStatements);
  add('mentorCareerStatements','导师培养情况（未具名，不计入学生人数）',['导师','培养情况原文','学位范围','资料时点','适用边界','原文'],statements.map(record => [record.mentorName || list(site.mentors).find(mentor => mentor.id === record.mentorId)?.name || '未公开',text(record.text || record.statement),text(record.degreeScope || record.graduateDegreeLabel),record.date || record.year || '',[text(record.limits),'未具名培养情况，不可推算具体学生或就业人数。'].filter(Boolean).join('\n'),sourceLinks(record.sourceIds)[0]?.url || '']),statements,'MentorCareerStatements114');
  const employers = list(outcomes.employerSummaries);
  add('employerSummaries','学校公开事务所范围（无人数，不计入具名记录）',['公开范围','学校说明','适用范围','资料时点','适用边界','原文'],employers.map(record => [record.label,text(record.text),text(record.scope),record.date || record.year || '',[text(record.limits),'学校概括性就业范围，无具名学生或分单位人数。'].filter(Boolean).join('\n'),sourceLinks(record.sourceIds)[0]?.url || '']),employers,'EmployerSummaries114');
  return sections;
}
