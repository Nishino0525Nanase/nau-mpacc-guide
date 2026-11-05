"""Check the built APK against dist; apksigner/aapt checks run separately in CI."""
from pathlib import Path
from zipfile import ZipFile
import hashlib
import json
import re
import sys


def verify_student_reviews(data):
    """Reject partial or unlinked review dossiers before distributing offline data."""
    mentors = data.get("mentors", [])
    assert len(mentors) == 34, "Offline guide must retain all 34 mentors"
    assert len({m["id"] for m in mentors}) == 34, "Duplicate mentor ids"
    registry = data["sourceRegistry"]
    statuses = {"mpacc_guidance", "non_mpacc_guidance", "guidance_unspecified",
                "course_only", "weak_mentions", "not_found"}
    all_review_ids = set()
    for mentor in mentors:
        dossier = mentor.get("studentReviews")
        assert isinstance(dossier, dict), "Missing mentor student-review dossier"
        assert dossier.get("coverageStatus") in statuses, "Invalid review coverage status"
        assert isinstance(dossier.get("verificationQuestions"), list), "Missing verification questions"
        reviews = dossier.get("reviews")
        assert isinstance(reviews, list), "Missing review records"
        review_ids = set()
        for review in reviews:
            review_id = review.get("id")
            assert review_id and review_id not in all_review_ids, "Missing or duplicate review id"
            all_review_ids.add(review_id)
            review_ids.add(review_id)
            assert review.get("attribution", {}).get("status") == "confirmed", "Unconfirmed attribution in named dossier"
            sources = review.get("sourceIds")
            assert sources and all(code in registry for code in sources), "Review has unknown or missing source"
            assert review.get("sourceUrl", "").startswith("https://"), "Review lacks HTTPS source link"
            assert review.get("firsthand") in (True, False, None), "Invalid firsthand status"
        for field in ("recommendationPoints", "concerns"):
            points = dossier.get(field)
            assert isinstance(points, list), "Missing recommendation or concern list"
            for point in points:
                refs = point.get("reviewIds")
                assert refs and set(refs).issubset(review_ids), "Editorial point lacks supporting mentor review"
                sources = point.get("sourceIds")
                assert sources and all(code in registry for code in sources), "Editorial point lacks registered sources"
        if dossier["coverageStatus"] == "not_found":
            assert not reviews and not dossier["recommendationPoints"] and not dossier["concerns"], "Missing evidence cannot create a recommendation or caution"
    serialized = json.dumps(data, ensure_ascii=False)
    assert not re.search(r"(?:ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{40,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)", serialized), "Credential material in reading data"


def verify_apk(apk, project):
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
        verify_student_reviews(json.loads(package.read("assets/guide/data/site-data.json")))


if __name__ == "__main__":
    verify_apk(Path(sys.argv[1]).resolve(), Path(__file__).resolve().parent.parent)
    print("PASS: APK structure, every dist reading asset and all 34 student-review dossiers match (installers excluded)")
