"""Refresh download hashes and cache-safe links after rebuilding the three attachments."""
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'dist/data/site-data.json'
REPORT = ROOT / 'data/downloads_refresh_20261113/download-manifest.json'


def main():
    data = json.loads(TARGET.read_text())
    descriptions = {
        'mentor-guide': f"{len(data['mentors'])}位导师，含学生评价、缩写对照与公开学生去向，保留来源链接",
        'life-guide': f"{len(data['lifeChapters'])}章生活资料，含校园宿舍、南京气候、湘味餐饮与实习资源",
        'evidence-index': '来源、导师评价、缩写、学生去向和实习索引，可筛选并点击原始链接',
    }
    report = []
    assert {item['id'] for item in data['downloads']} == set(descriptions)
    for item in data['downloads']:
        path = ROOT / 'dist/downloads' / item['filename']
        content = path.read_bytes()
        with ZipFile(path) as package:
            assert package.testzip() is None
            assert '[Content_Types].xml' in package.namelist()
        digest = hashlib.sha256(content).hexdigest()
        item.update(bytes=len(content), sha256=digest,
                    url=f"./downloads/{item['filename']}?v={digest[:12]}",
                    description=descriptions[item['id']])
        report.append({key: item[key] for key in ['id', 'filename', 'url', 'bytes', 'sha256']})
    TARGET.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps({'files': report}, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()
