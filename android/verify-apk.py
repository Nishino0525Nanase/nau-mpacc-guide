"""Check the built APK against dist; apksigner/aapt checks run separately in CI."""
from pathlib import Path
from zipfile import ZipFile
import hashlib
import sys

apk = Path(sys.argv[1]).resolve()
project = Path(__file__).resolve().parent.parent
with ZipFile(apk) as package:
    names = set(package.namelist())
    for required in ("AndroidManifest.xml", "classes.dex", "resources.arsc"):
        assert required in names, f"Not an installable Android package: missing {required}"
    for source in sorted((project / "dist").rglob("*")):
        if not source.is_file() or source.name.endswith((".apk", ".apk.sha256")):
            continue
        target = "assets/guide/" + source.relative_to(project / "dist").as_posix()
        assert target in names, f"Missing offline asset: {target}"
        assert hashlib.sha256(package.read(target)).digest() == hashlib.sha256(source.read_bytes()).digest(), f"Stale offline asset: {target}"
print("PASS: APK structure and every current dist reading asset match (installers excluded)")
