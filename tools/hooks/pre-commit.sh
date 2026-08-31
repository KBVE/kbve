#!/usr/bin/env bash
# Commit-time guards.
#
# Runs from .husky/pre-commit, before lint-staged. Both guards are about things
# that reach main by accident rather than by a mistake in the code, which is the
# class of problem a linter cannot see.
set -euo pipefail

fail=0

# `git commit -- <paths>` builds a temporary index and leaves the real one
# alone, so there is nothing staged to look at and the guards below see an
# empty list. That is a hole rather than a quiet pass -- it is the form a coding
# agent reaches for, and the form that most needs the guard -- so say so.
# Additions and modifications only. A commit that deletes a dot-directory is
# the fix for the thing this guards against, not an instance of it.
staged=$(git diff --cached --name-only --diff-filter=ACMR || true)
if [ -z "$staged" ]; then
	# Distinguish "a commit that only removes things", which is fine and
	# silent, from "the index is empty", which means the guards were skipped.
	if [ -z "$(git diff --cached --name-only || true)" ]; then
		echo "pre-commit: nothing staged, so the repository guards did not run" >&2
		echo "  (a pathspec commit bypasses them; stage with 'git add' to be checked)" >&2
	fi
	exit 0
fi

# --- Refuse a new top-level dot-directory that is not allowlisted.
#
# Editors and coding agents write per-machine state into a dot-directory at the
# repository root, and a `git add -A` sweeps it into a commit that was about
# something else. A .gitignore entry only stops the tools that already exist;
# the next one invents a directory nobody has listed.
#
# Allowlisted below is everything this repository genuinely keeps at the root.
# Adding to it should be a deliberate line in a diff.
allowed='^\.(cargo|clangd|dockerignore|editorconfig|gitattributes|github|gitignore|husky|lfsconfig|moon|npmrc|prettierignore|prettierrc\.mjs|prototools|vscode)'
while IFS= read -r file; do
	case "$file" in
	.*) ;;
	*) continue ;;
	esac
	top=${file%%/*}
	if ! printf '%s' "$top" | grep -Eq "$allowed"; then
		if [ "$fail" -eq 0 ]; then
			echo "pre-commit: a new top-level dot-entry is staged" >&2
			echo "  This is usually per-machine state a tool wrote, swept in by 'git add -A'." >&2
			echo "  If it belongs in the repository, add it to the allowlist in" >&2
			echo "  tools/hooks/pre-commit.sh and commit that in the same change." >&2
		fi
		echo "    $file" >&2
		fail=1
	fi
done <<EOF
$staged
EOF

# --- Refuse a generated file whose generator was not run.
#
# tools/commit/scopes.lock.json is built from the project graph. A commit that
# adds or renames a project without regenerating it leaves the lock behind, and
# the symptom is somebody else's correct commit being rejected by the hook.
if printf '%s' "$staged" | grep -Eq '(^|/)moon\.yml$|^\.moon/workspace\.yml$'; then
	if ! node tools/commit/sync.mjs --check >/dev/null 2>&1; then
		echo "pre-commit: the project graph changed but tools/commit/scopes.lock.json did not" >&2
		echo "  Run: moon run commit:sync   and stage the result." >&2
		fail=1
	fi
fi

exit "$fail"
