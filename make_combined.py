#!/usr/bin/env python3
"""
make_combined.py

Clone the source repository (CM-UOC/lionrenderwebproject) and produce a single
text document named `lionrenderwebproject-all.txt` in the current working
directory. The output contains every text file inline with a header and a
list of binary assets with their git blob SHA at the end.

Usage: run this script from the repository root where you want the combined
file to appear (e.g. the root of CM-UOC/LR2 after pulling this commit).

Requires: git, Python 3.8+.
"""

import subprocess
import sys
import os
import tempfile
import shutil
from pathlib import Path

SOURCE_REPO = "https://github.com/CM-UOC/lionrenderwebproject.git"
OUT_FILENAME = "lionrenderwebproject-all.txt"


def git_ls_tree(repo_dir):
    proc = subprocess.run(["git", "ls-tree", "-r", "HEAD"], cwd=repo_dir, capture_output=True, text=True, check=True)
    lines = proc.stdout.splitlines()
    mapping = {}
    for line in lines:
        if "\t" not in line:
            continue
        left, path = line.split("\t", 1)
        parts = left.split()
        sha = parts[2]
        mapping[path] = sha
    return mapping


def is_text_bytes(b):
    # heuristic: allow utf-8 decode, and reject large binary sequences
    try:
        b.decode("utf-8")
        return True
    except Exception:
        return False


def collect_files(repo_dir):
    files = []
    for root, dirs, filenames in os.walk(repo_dir):
        # skip .git
        if ".git" in root.split(os.sep):
            continue
        for fn in filenames:
            p = Path(root) / fn
            rel = str(p.relative_to(repo_dir)).replace(os.sep, "/")
            files.append(rel)
    files.sort()
    return files


def main():
    tempdir = tempfile.mkdtemp(prefix="lr_src_")
    try:
        print(f"Cloning {SOURCE_REPO} into {tempdir} ...")
        subprocess.run(["git", "clone", "--depth", "1", SOURCE_REPO, tempdir], check=True)

        mapping = git_ls_tree(tempdir)
        files = collect_files(tempdir)

        out_path = Path.cwd() / OUT_FILENAME
        with open(out_path, "w", encoding="utf-8") as out:
            out.write("=== Combined repository text dump ===\n")
            out.write(f"Source repository: {SOURCE_REPO}\n")
            out.write("Note: binaries are listed at the end by path + git blob SHA. Text files are included inline.\n\n")

            binary_list = []

            for rel in files:
                full = Path(tempdir) / rel
                try:
                    data = full.read_bytes()
                except Exception as e:
                    out.write(f"\n--- FILE: {rel} ---\n")
                    out.write(f"[ERROR reading file: {e}]\n")
                    continue

                if is_text_bytes(data):
                    out.write(f"\n--- FILE: {rel} ---\n")
                    try:
                        text = data.decode("utf-8")
                    except Exception:
                        text = data.decode("latin1")
                    out.write(text)
                    if not text.endswith("\n"):
                        out.write("\n")
                else:
                    sha = mapping.get(rel, "UNKNOWN-SHA")
                    binary_list.append((rel, sha))

            out.write("\n\n=== Binary assets (listed by path and git blob SHA) ===\n")
            out.write("These are not embedded. Use the path and SHA to fetch or inspect separately.\n\n")
            for rel, sha in binary_list:
                out.write(f"{rel}    {sha}\n")

        print(f"Wrote combined document to {out_path} ({len(files)} files, {len(binary_list)} binaries).")
        print("You can now commit and push this file in this repository:")
        print(f"  git add {OUT_FILENAME} && git commit -m 'Add combined repo dump' && git push")

    finally:
        shutil.rmtree(tempdir)


if __name__ == "__main__":
    main()
