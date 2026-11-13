import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const root=new URL('../dist/',import.meta.url);
const data=JSON.parse(readFileSync(new URL('data/site-data.json',root),'utf8'));

test('download links, sizes and hashes identify the actual current attachments',()=>{
  assert.deepEqual(data.downloads.map(item=>item.filename).sort(),['evidence-index.xlsx','life-guide.docx','mentor-guide.docx']);
  for(const item of data.downloads){
    const content=readFileSync(new URL('downloads/'+item.filename,root));
    const digest=createHash('sha256').update(content).digest('hex');
    assert.equal(item.bytes,content.length,item.id);
    assert.equal(item.sha256,digest,item.id);
    const url=new URL(item.url,'https://example.com/nau-mpacc-guide/');
    assert.equal(url.origin,'https://example.com');
    assert.equal(url.pathname,'/nau-mpacc-guide/downloads/'+item.filename);
    assert.equal(url.searchParams.get('v'),digest.slice(0,12),'changed files must bypass an older cached download');
    assert.equal(content.subarray(0,2).toString(),'PK','attachments are Office packages');
  }
});

test('download descriptions cover the current guide without the older chapter count',()=>{
  const mentor=data.downloads.find(item=>item.id==='mentor-guide');
  const life=data.downloads.find(item=>item.id==='life-guide');
  assert(mentor.description.includes(String(data.mentors.length)));
  assert.match(mentor.description,/学生去向/);
  assert(life.description.includes(data.lifeChapters.length+'章'));
  assert.match(life.description,/宿舍|气候/);
  const app=readFileSync(new URL('app.js',root),'utf8');
  assert.doesNotMatch(app,/Word 保留基础正文和导师卡片/);
  assert.match(app,/esc\(d.description\)/,'cards use the descriptions belonging to each actual file');
});
