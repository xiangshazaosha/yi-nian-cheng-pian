"""Deterministic allowlisted source export. No deletion, installation or push."""
import argparse
import hashlib
import io
import json
import posixpath
import re
import subprocess
import unicodedata
import zipfile
from pathlib import Path, PurePosixPath
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[2]
POLICY = "release/export-policy.json"
MANIFEST = "release/export-manifest.json"
LINK = re.compile(r"!?\[([^\]\n]*)\]\(([^)\n]+)\)")
SECRETS = {
    "private-key": rb"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----",
    "github-token": rb"\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b",
    "aws-key": rb"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b",
    "openai-key": rb"\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{40,}\b",
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode()


def safe(name):
    p = PurePosixPath(name)
    if not name or p.is_absolute() or ".." in p.parts or "\\" in name or ":" in name:
        raise ValueError("Unsafe relative path")
    return p


def selected(name, policy):
    return name in policy["files"] or any(name.startswith(p) for p in policy["prefixes"])


def snapshot(ref, root=ROOT):
    commit = subprocess.check_output(["git", "rev-parse", "--verify", ref + "^{commit}"], cwd=root).decode().strip()
    data = subprocess.check_output(["git", "-c", "core.autocrlf=false", "archive", "--format=zip", commit], cwd=root)
    files = {}
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        for item in z.infolist():
            if item.is_dir():
                continue
            safe(item.filename)
            if ((item.external_attr >> 16) & 0o170000) == 0o120000:
                raise ValueError("Symlinks are not accepted")
            files[item.filename] = z.read(item)
    return commit, files


def target(file, link):
    path, _, anchor = unquote(link).partition("#")
    if not path or re.match(r"[a-zA-Z][a-zA-Z0-9+.-]*:", path) or path.startswith("//"):
        return None, anchor
    resolved = posixpath.normpath(posixpath.join(str(PurePosixPath(file).parent), path))
    safe(resolved)
    return resolved, anchor


def headings(body):
    seen, ids = {}, set()
    for line in body.splitlines():
        if not re.match(r"^#{1,6} ", line):
            continue
        title = re.sub(r"^#+\s+", "", line).strip().lower().replace(chr(96), "")
        title = "".join(c for c in title if c in "-_ " or unicodedata.category(c)[0] in "LN")
        slug = title.replace(" ", "-")
        i = seen.get(slug, 0)
        seen[slug] = i + 1
        ids.add(slug + ("-" + str(i) if i else ""))
    return ids


def transform(source, policy):
    files = {n: b for n, b in source.items() if selected(n, policy) and n != MANIFEST}
    for dest, template in policy["overrides"].items():
        safe(dest)
        files[dest] = source[template]
        if dest.endswith(".md"):
            def rebase(m):
                resolved, anchor = target(template, m[2])
                if resolved is None:
                    return m[0]
                relative = posixpath.relpath(resolved, str(PurePosixPath(dest).parent))
                return "[" + m[1] + "](" + relative + ("#" + anchor if anchor else "") + ")"
            files[dest] = LINK.sub(rebase, files[dest].decode("utf-8-sig")).encode()
    package = json.loads(files["package.json"])
    package.update(name="yi-nian-cheng-pian", version=policy["version"], license="SEE LICENSE IN LICENSE")
    package["scripts"].pop("render:full", None)
    package["scripts"]["release:check"] = "python scripts/release/release.py check --root ."
    package["scripts"]["release:test"] = "python -m unittest discover -s scripts/release -p test_*.py"
    files["package.json"] = encoded(package)
    remotion = json.loads(files["remotion-clone/package.json"])
    remotion["license"] = "SEE LICENSE IN ../LICENSE"
    for n in ["render:full", "render:full:raw", "stylecheck:duotone"]:
        remotion["scripts"].pop(n, None)
    files["remotion-clone/package.json"] = encoded(remotion)
    text = files["remotion-clone/src/lib/theme.ts"].decode("utf-8-sig")
    files["remotion-clone/src/lib/theme.ts"] = re.sub(r"// 源素材：.*?(?=// 字号体系)", "", text, flags=re.S).encode()
    files["AGENTS.md"] = files["AGENTS.md"].replace(
        "视频产出机：项目边界".encode(), "一念成片：项目边界".encode())
    if b"# Private production data in public clones" not in files[".gitignore"]:
        files[".gitignore"] += ("\n# Private production data in public clones\n"
            "/remotion-clone/review/workflow-flash/*\n!/remotion-clone/review/workflow-flash/README.md\n"
            "/remotion-clone/public/*\n!/remotion-clone/public/README.md\n"
            "!/remotion-clone/public/sfx/\n/remotion-clone/public/sfx/*\n"
            "!/remotion-clone/public/sfx/catalog.json\n").encode()
    for name, data in list(files.items()):
        if not name.endswith(".md"):
            continue
        text = data.decode("utf-8-sig").replace("E:" + "/剪影导出/...mp4", "remotion-clone/public/example.mp4")
        if name == "docs/03-remotion-production.md":
            text = re.sub(r"### 旧 FullVideo.*?(?=每次 .npx remotion render.)",
                          "### 当前渲染入口\n\n公开版不分发历史 FullVideo 快捷入口。"
                          "使用 render:review 显式选择当前片 Composition；PublicSmoke 仅为技术演示。\n\n",
                          text, flags=re.S)
        if name == "docs/workflows/local-whisper-setup.md":
            text = text.replace("当前主机采用官方", "当前接入路线采用官方")
        if name == "docs/packaging-library/sfx-rules.md":
            text = re.sub(r"## 段实例.*?(?=## 触发时机)", "", text, flags=re.S)
            warning = "> 公开版不附送音效；下列旧文件名及默认增益只是历史预设，不是本机已有素材或新素材的验收结论。\n\n"
            if warning not in text:
                first, rest = text.split("\n", 1)
                text = first + "\n\n" + warning + rest
        def rewrite(m):
            dest, anchor = target(name, m[2])
            if dest is None or dest in files or any(n.startswith(dest + "/") for n in files):
                return m[0]
            if not any(dest.startswith(p) for p in policy["omitted_link_prefixes"]):
                raise ValueError("Necessary link missing: " + name + " -> " + dest)
            fallback = posixpath.relpath("docs/public-release-scope.md", str(PurePosixPath(name).parent))
            return "[" + m[1] + "（未随公开版分发）](" + fallback + ")"
        files[name] = LINK.sub(rewrite, text).encode()
    return files


def inventory(files):
    return {n: {"bytes": len(b), "sha256": sha(b)} for n, b in sorted(files.items()) if n != MANIFEST}


def export(ref, dest, root=ROOT):
    dest, scope = Path(dest).resolve(), (root / "tools/releases").resolve()
    if not dest.is_relative_to(scope) or dest == scope:
        raise ValueError("Output must be a NEW child of tools/releases")
    if dest.exists():
        raise FileExistsError("Preserve previous export; choose a new output directory")
    commit, source = snapshot(ref, root)
    policy = json.loads(source[POLICY])
    files = transform(source, policy)
    listed = inventory(files)
    manifest = {"schemaVersion": 1, "version": policy["version"], "sourceCommit": commit,
                "policySha256": sha(source[POLICY]), "contentSha256": sha(encoded(listed)), "files": listed}
    files[MANIFEST] = encoded(manifest)
    dest.mkdir(parents=True, exist_ok=False)
    for name, data in files.items():
        p = dest.joinpath(*safe(name).parts)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)
    check(dest)
    return manifest


def check(root):
    root = Path(root).resolve()
    policy = json.loads((root / POLICY).read_text(encoding="utf-8"))
    manifest = json.loads((root / MANIFEST).read_text(encoding="utf-8"))
    names, files, errors = set(manifest["files"]) | {MANIFEST}, {}, []
    for name in sorted(names):
        safe(name)
        p = root / name
        if not p.is_file() or p.is_symlink() or not p.resolve().is_relative_to(root):
            errors.append("missing/unsafe: " + name)
            continue
        data = p.read_bytes()
        files[name] = data
        if name != MANIFEST and not (selected(name, policy) or name in policy["overrides"]):
            errors.append("not allowlisted: " + name)
        if b"\x00" in data:
            errors.append("binary: " + name)
        for label, pattern in SECRETS.items():
            if re.search(pattern, data):
                errors.append(label + ": " + name)
        text = data.decode("utf-8-sig")
        if re.search(r"[A-Z]:[\\/](?:视频产出机|剪影导出|htmlppt|Users[\\/]Admin)", text):
            errors.append("machine-specific path: " + name)
        if name.endswith(".md"):
            for label, link in LINK.findall(text):
                dest, anchor = target(name, link)
                if dest is None:
                    if link.startswith("#") and anchor not in headings(text):
                        errors.append("heading: " + name + " -> " + link)
                    continue
                p = root / dest
                if not p.exists():
                    errors.append("link: " + name + " -> " + dest)
                elif anchor and p.is_file() and p.suffix == ".md" and anchor not in headings(p.read_text(encoding="utf-8-sig")):
                    errors.append("heading: " + name + " -> " + link)
        if (name.startswith("remotion-clone/review/") and name != "remotion-clone/review/workflow-flash/README.md"
                or name.startswith(("archive/", "docs/history/"))
                or "prepare_chatcut_helper" in name
                or PurePosixPath(name).suffix.lower() in {".exe", ".dll", ".msi", ".mp4", ".wav", ".srt", ".bin", ".onnx"}):
            errors.append("private/disallowed file: " + name)
    if inventory(files) != manifest["files"]:
        errors.append("manifest drift: rebuild from committed source")
    if sha(encoded(manifest["files"])) != manifest["contentSha256"]:
        errors.append("content digest mismatch")
    if sha((root / POLICY).read_bytes()) != manifest["policySha256"]:
        errors.append("policy digest mismatch")
    if sha((root / "LICENSE").read_bytes()) != policy["licenseSha256"]:
        errors.append("license changed without policy review")
    p = subprocess.run(["git", "rev-parse", "--show-toplevel"], cwd=root, capture_output=True, text=True)
    if p.returncode == 0 and Path(p.stdout.strip()).resolve() == root:
        tracked = subprocess.check_output(
            ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"], cwd=root).decode().split("\0")
        errors += ["tracked/unignored outside manifest: " + n for n in tracked if n and n not in names]
    if errors:
        raise ValueError("\n".join(sorted(set(errors))))
    result = {"ok": True, "version": manifest["version"], "files": len(manifest["files"]),
              "contentSha256": manifest["contentSha256"]}
    print(json.dumps(result))
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    actions = parser.add_subparsers(dest="action", required=True)
    build = actions.add_parser("export")
    build.add_argument("--ref", required=True)
    build.add_argument("--output", required=True, type=Path)
    verify = actions.add_parser("check")
    verify.add_argument("--root", required=True, type=Path)
    args = parser.parse_args()
    if args.action == "export":
        export(args.ref, args.output)
    else:
        check(args.root)
