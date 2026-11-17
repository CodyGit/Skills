# date: 2026-11-16 22:40
# author: cody
# description: 遍历仓库顶层目录，把每个含 SKILL.md 的 skill 打包成 dist/<skill>.zip
import shutil
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
EXCLUDE_DIRS = {"__pycache__", "node_modules", ".git"}
EXCLUDE_SUFFIXES = {".pyc", ".log", ".tmp", ".bak"}


def iter_files(skill_dir: Path):
    for p in sorted(skill_dir.rglob("*")):
        if not p.is_file():
            continue
        if EXCLUDE_DIRS & set(p.relative_to(skill_dir).parts):
            continue
        if p.suffix in EXCLUDE_SUFFIXES:
            continue
        # INSTALL.md 不进 zip，单独作为产物发布
        if p == skill_dir / "INSTALL.md":
            continue
        yield p


def package(skill_dir: Path) -> Path:
    out = DIST / f"{skill_dir.name}.zip"
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        for p in iter_files(skill_dir):
            # zip 内顶层目录为 skill 名，路径统一用正斜杠
            zf.write(p, p.relative_to(ROOT).as_posix())
    return out


def main() -> int:
    DIST.mkdir(exist_ok=True)
    skills = [d for d in sorted(ROOT.iterdir()) if d.is_dir() and (d / "SKILL.md").is_file()]
    if not skills:
        print("未找到任何 skill（顶层目录下需含 SKILL.md）", file=sys.stderr)
        return 1
    for d in skills:
        print(f"{d.name} -> {package(d).relative_to(ROOT)}")
        install = d / "INSTALL.md"
        if install.is_file():
            out = DIST / f"{d.name}-INSTALL.md"
            shutil.copyfile(install, out)
            print(f"{d.name} -> {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
