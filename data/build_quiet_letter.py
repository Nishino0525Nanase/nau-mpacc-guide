#!/usr/bin/env python3
"""Render the requested afterword into an inert, explicitly opened template."""
import html
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def build():
    letter = json.loads((ROOT / 'data/quiet-letter.json').read_text())
    esc = html.escape
    lines = [f'    <h2 id="dialog-title">{esc(letter["title"])}</h2>',
             f'    <p class="quiet-letter-salutation">{esc(letter["salutation"])}</p>']
    lines.extend(f'    <p>{esc(paragraph)}</p>' for paragraph in letter['paragraphs'])
    lines.append(f'    <p class="quiet-letter-closing">{esc(letter["closing"])}</p>')
    template = '<template id="quiet-letter-template">\n' + '\n'.join(lines) + '\n  </template>'
    path = ROOT / 'dist/index.html'
    source = path.read_text()
    result, count = re.subn(r'<template id="quiet-letter-template">[\s\S]*?</template>', lambda _: template, source)
    assert count == 1, 'Expected one afterword template'
    path.write_text(result)
    print(json.dumps({'paragraphs': len(letter['paragraphs']), 'characters': sum(map(len, letter['paragraphs']))}, ensure_ascii=False))


if __name__ == '__main__':
    build()
