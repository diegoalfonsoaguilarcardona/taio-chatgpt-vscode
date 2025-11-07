# Unified Diff Patcher Helpers

This folder contains small utilities to make “almost unified” diffs (often produced by LLMs or copy/paste) reliably patchable against your project. They normalize whitespace, strip Markdown fences, fix hunk headers, and then apply the patch.

## Contents

- `normalize-diff.awk`
    - POSIX-awk script that normalizes diffs:
    - Adds missing leading space to context lines inside hunks.
    - Rebuilds hunk headers with correct line counts.
    - Strips Markdown fences (```…```) and `### FILE:` headings.
    - Preserves the special `\ No newline at end of file` marker.
    - Strips CR characters from clipboard (Windows/Git Bash) copies.

- `patcher.sh`
    - Cross‑platform patch runner. Auto-detects clipboard tool (macOS pbpaste, Linux wl-paste/xclip, Git Bash /dev/clipboard).
    - Can read from clipboard, file, or stdin.
    - Uses `normalize-diff.awk` under the hood.

- OS-specific convenience wrappers (optional):
    - `patcher-macos.sh` (uses `pbpaste`)
    - `patcher-linux-x11.sh` (uses `xclip`)
    - `patcher-linux-wayland.sh` (uses `wl-paste`)
    - `patcher-windows-gitbash.sh` (uses `/dev/clipboard`)

You can use only `patcher.sh` if you prefer. The OS-specific scripts are just shortcuts.

## Requirements

- `patch` (GNU patch or BSD patch)
- `awk` (BSD awk or `gawk`; `gawk` is optional but not required)
- A clipboard tool (only if using clipboard mode):
    - macOS: `pbpaste` (built-in)
    - Linux (X11): `xclip`
    - Linux (Wayland): `wl-paste` (from `wl-clipboard`)
    - Windows (Git Bash): `/dev/clipboard`
- On Windows, run in Git Bash (or another POSIX-like shell).

## Installation

Place this folder in your project root, e.g.:

```
your-project/
    patcher/
    normalize-diff.awk
    patcher.sh
    patcher-macos.sh
    patcher-linux-x11.sh
    patcher-linux-wayland.sh
    patcher-windows-gitbash.sh
```

Make scripts executable:

```bash
chmod +x patcher/patcher.sh patcher/normalize-diff.awk
chmod +x patcher/patcher-*.sh  # optional wrappers
```

## Quick Start

- Copy a unified diff to your clipboard (starting with lines like `--- a/...`).
- From your project root, run:

```bash
./patcher/patcher.sh -p 1
```

`-p 1` is correct for diffs with `a/` and `b/` prefixes (typical git-style diffs and the ones most LLMs produce). If your diff paths have no prefixes, use `-p 0`.

## Usage

- From clipboard (auto-detect tool):
```bash
./patcher/patcher.sh -p 1
```

- From a patch file:
```bash
./patcher/patcher.sh -f my-changes.patch -p 1
```

- From stdin:
```bash
cat my-changes.patch | ./patcher/patcher.sh -p 1
```

- Dry-run (test without applying):
```bash
./patcher/patcher.sh -f my-changes.patch -p 1 | patch --dry-run -p1
# or:
./patcher/patcher.sh -f my-changes.patch -p 1
# then if you want dry-run only, replace the final 'patch -p1' in the script or pipe to 'patch --dry-run -p1'
```

- OS-specific wrappers (same behavior, fixed clipboard command):
```bash
# macOS
./patcher/patcher-macos.sh 1

# Linux (X11)
./patcher/patcher-linux-x11.sh 1

# Linux (Wayland)
./patcher/patcher-linux-wayland.sh 1

# Windows (Git Bash)
./patcher/patcher-windows-gitbash.sh 1
```

## What the normalizer fixes

- Missing context prefixes inside hunks:
    - Unchanged lines in a hunk MUST start with a single space (` `). If they don’t, the normalizer prefixes them.
- Hunk header lengths:
    - Recomputes `@@ -<start_old>,<len_old> +<start_new>,<len_new> @@` so counts match the actual hunk content.
- Markdown fences and headings:
    - Strips triple backticks and `### FILE: ...` headings that some generators add.
- Clipboard CR characters:
    - Removes trailing `\r` (CR) so `patch` isn’t confused.
- Preserves the canonical “no newline at EOF” marker.

## What it does not do

- It won’t invent missing file headers:
    - You still need lines like `--- a/path` and `+++ b/path` (or `/dev/null` for add/delete).
- It won’t reorder hunks or files.
- It won’t fix logically broken diffs (e.g., diffs that don’t match your current files at all).
- It won’t convert binary patches.

If your diff is missing `---/+++` file headers entirely, please regenerate a proper unified diff.

## Best Practices

- Run from the project root for `-p 1` to resolve `a/` and `b/` path prefixes correctly.
- If you see “Reversed (or previously applied) patch detected!” either:
    - You already applied it, or
    - Use the correct `-p` level (try `-p 0`), or
    - Use `patch -R` to reverse.
- Keep your repo clean or on a new branch before applying:
```bash
git checkout -b apply-patch
git status
```
- Review diffs before applying; the normalizer only fixes formatting, not logic.

## Troubleshooting

- “malformed patch”:
    - Ensure you copy only the diff blocks (starting with `--- a/...`). The normalizer strips fences/headings, but prose above the first headers may still confuse `patch`.
    - Try a dry run:
    ```bash
    patch --dry-run -p1 <( ./patcher/patcher.sh -f my.patch -p 1 >/dev/null )
    ```
    - Check your `-p` value: `-p 1` for `a/` and `b/` prefixes; otherwise `-p 0`.

- “No clipboard tool found”:
    - Linux: install one of `wl-clipboard` (Wayland) or `xclip` (X11).
    - Or use `-f file.patch` mode:
    ```bash
    ./patcher/patcher.sh -f file.patch -p 1
    ```

- Windows notes:
    - Use Git Bash; copy your diff, then:
    ```bash
    ./patcher/patcher-windows-gitbash.sh 1
    ```

- Still failing?
    - Share the first ~60 lines around the failing hunk and the exact error message.
    - Verify the target file exists and matches the expected original lines.

## FAQ

- “Do I need the per-OS scripts?”
    - No. `patcher.sh` is sufficient; the OS-specific scripts are convenience wrappers.

- “Can I store these in a subfolder (e.g., `patcher/`)?”
    - Yes—scripts resolve `normalize-diff.awk` relative to their own location.

- “Why `-p 1`?”
    - Most diffs use paths like `a/app.py` → `b/app.py`. Stripping one path component (`a/` or `b/`) makes them match files at the project root.

## Example session (clipboard)

```bash
# 1) Copy a diff starting from:
# --- a/app.py
# +++ b/app.py
# @@ -1,3 +1,5 @@
#  ...

# 2) Apply:
./patcher/patcher.sh -p 1

# 3) Verify:
git diff --staged
```

## License

MIT (or adapt to your project’s license).