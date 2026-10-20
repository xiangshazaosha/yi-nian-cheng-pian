"""Copy a NEW draft and append one catalog entry, with backup and race checks."""
import argparse
import csv
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]


def catalog_entry(meta, target, size):
    now = time.time_ns() // 1000
    return {**meta, "draft_fold_path": str(target), "draft_root_path": str(target.parent),
            "draft_json_file": str(target / "draft_content.json"),
            "tm_draft_create": now, "tm_draft_modified": now, "tm_draft_removed": 0,
            "draft_timeline_materials_size": size}


def append_entry(catalog, entry):
    if not isinstance(catalog.get("all_draft_store"), list):
        raise ValueError("Unknown catalog layout")
    if any(x.get("draft_id") == entry["draft_id"] or
           x.get("draft_name") == entry["draft_name"] or
           x.get("draft_fold_path") == entry["draft_fold_path"] for x in catalog["all_draft_store"]):
        raise ValueError("Existing draft ID/name/path; refusing replacement")
    # Leave counters and all other opaque application state unchanged.
    return {**catalog, "all_draft_store": [entry, *catalog["all_draft_store"]]}


def ensure_closed():
    process = subprocess.run(["tasklist", "/FI", "IMAGENAME eq JianyingPro.exe", "/FO", "CSV", "/NH"],
                             capture_output=True, check=True, creationflags=0x08000000)
    rows = csv.reader(io.StringIO(process.stdout.decode("utf-8", errors="replace")))
    if any(row and row[0].lower() == "jianyingpro.exe" for row in rows):
        raise RuntimeError("Close Jianying before catalog registration; no process will be killed")


def install(draft, target_root, index):
    ensure_closed()
    draft, target_root, index = Path(draft).resolve(), Path(target_root).resolve(), Path(index).resolve()
    draft.relative_to(ROOT)
    if not target_root.is_dir() or not index.is_file():
        raise ValueError("Use the actual existing draft root and catalog")
    target = target_root / draft.name
    if target.exists():
        raise FileExistsError("Draft destination already exists")
    original = index.read_bytes()
    catalog = json.loads(original.decode("utf-8-sig"))
    meta = json.loads((draft / "draft_meta_info.json").read_text(encoding="utf-8"))
    content = json.loads((draft / "draft_content.json").read_text(encoding="utf-8"))
    if meta["draft_id"] != content["id"]:
        raise ValueError("Draft ID mismatch")
    entry = catalog_entry(meta, target, (draft / "draft_content.json").stat().st_size)
    merged = append_entry(catalog, entry)
    backup = ROOT / "tools/jianying-draft/backups" / str(time.time_ns())
    backup.mkdir(parents=True)
    (backup / "root_meta_info.before.json").write_bytes(original)
    shutil.copytree(draft, target)  # Fails if a concurrent process creates it.
    (target / "draft_meta_info.json").write_text(json.dumps(entry, ensure_ascii=False, indent=2), encoding="utf-8")
    if hashlib.sha256((target / "draft_content.json").read_bytes()).digest() != hashlib.sha256((draft / "draft_content.json").read_bytes()).digest():
        raise ValueError("Copied content differs")
    ensure_closed()
    if index.read_bytes() != original:
        raise RuntimeError("Catalog changed; draft copy preserved but registration stopped")
    pending = index.parent / ("codex-new-draft-" + content["id"] + ".tmp")
    with pending.open("x", encoding="utf-8") as stream:
        json.dump(merged, stream, ensure_ascii=False, indent=2)
        stream.flush()
        os.fsync(stream.fileno())
    if index.read_bytes() != original:
        raise RuntimeError("Catalog changed before replacement; temporary file preserved")
    os.replace(pending, index)
    actual = json.loads(index.read_text(encoding="utf-8"))
    if actual["all_draft_store"][1:] != catalog["all_draft_store"]:
        raise RuntimeError("Existing catalog entries did not survive unchanged")
    result = {"draftPath": str(target), "backup": str(backup),
              "previousEntries": len(catalog["all_draft_store"]), "currentEntries": len(actual["all_draft_store"]),
              "existingEntriesPreserved": True, "applicationOpenVerified": False}
    (backup / "installation.local.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--draft", required=True)
    parser.add_argument("--draft-root", required=True)
    parser.add_argument("--index", required=True)
    a = parser.parse_args()
    print(json.dumps(install(a.draft, a.draft_root, a.index), ensure_ascii=True))
