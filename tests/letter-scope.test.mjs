import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('personal letter details stay out of the guide shell and published data',()=>{
  const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
  const letter=html.match(/<template id="short-letter-template">([\s\S]*?)<\/template>/)?.[1];
  assert(letter,'the small letter remains available');
  const name=letter.match(/<p>([^，<]+)，恭喜/)?.[1];
  const school=letter.match(/从([^，。<]+大学)到南京读书/)?.[1];
  assert(name&&school,'the personal greeting belongs inside the letter');
  const shell=html.replace(/<template id="(?:short|quiet)-letter-template">[\s\S]*?<\/template>/g,'');
  const data=readFileSync(new URL('../dist/data/site-data.json',import.meta.url),'utf8');
  for(const detail of [name,school]) {
    assert(!shell.includes(detail),'no personal detail in the public shell');
    assert(!data.includes(detail),'no personal detail in the guide dataset');
  }
  assert.doesNotMatch(shell,/journey-note-card/,'the repeated personal greeting card is removed');
  assert.match(shell,/data-action="short-letter"/,'keep a usable letter entry');
  assert.doesNotMatch(shell,/<a\b[^>]*href=["'][^"']*(?:#\/?(?:admin|dashboard)|\/admin(?:[/?#.]|$))/i);
});
