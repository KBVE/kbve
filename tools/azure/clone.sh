#!/usr/bin/env bash
# Clones an Azure DevOps repo that hosts its own LFS.
#
# Three copies of this existed -- two in ci-unity, one in ci-blender-flow --
# and they disagreed on depth, on ref, and on whether LFS came down at all.
# None of them masked the PAT or removed it from the clone afterwards, so it
# stayed in .git/config on runners that outlive the job.
#
# Reads:
#   AZURE_REPO_URL  required, host and path with no scheme, e.g. dev.azure.com/x/y/_git/z
#   AZURE_DEST      required, directory to clone into
#   AZURE_REF       optional, branch or tag; default is the repo's default branch
#   AZURE_DEPTH     optional, e.g. 1 for a shallow clone; default is a full clone
#   AZURE_LFS       optional, set to 1 to pull LFS objects after cloning
#   AZURE_PAT       required
set -euo pipefail

die() { echo "::error::$*" >&2; exit 1; }

url="${AZURE_REPO_URL:?AZURE_REPO_URL is not set}"
dest="${AZURE_DEST:?AZURE_DEST is not set}"
[ -n "${AZURE_PAT:-}" ] || die "AZURE_PAT is not set — required for the Azure DevOps checkout."

# The token ends up in the clone URL, which git echoes back in some failure
# messages. Masking is the difference between a failed clone and a leaked
# credential in a public log.
echo "::add-mask::$AZURE_PAT"

# The scheme is added here rather than taken from the caller: every call site
# passed a bare host/path, and a caller that included https:// would otherwise
# build https://kbve:pat@https://...
case "$url" in
https://* | http://*) die "AZURE_REPO_URL must have no scheme; got '$url'." ;;
esac

rm -rf "$dest"

args=(clone)
[ -n "${AZURE_DEPTH:-}" ] && args+=(--depth "$AZURE_DEPTH")
[ -n "${AZURE_REF:-}" ] && args+=(--branch "$AZURE_REF")

git "${args[@]}" "https://kbve:${AZURE_PAT}@${url}" "$dest"

# Strip the credential back out. `git clone` writes the URL it was given into
# .git/config verbatim, and these runners are self-hosted: the token would
# otherwise sit on disk for whatever runs next.
git -C "$dest" remote set-url origin "https://${url}"

if [ "${AZURE_LFS:-}" = "1" ]; then
	# Azure hosts this repo's LFS itself, so the objects come over the same
	# authenticated remote rather than through Forgejo -- which is why this
	# is not tools/lfs/ensure.sh. The credential goes on the command line
	# for the pull alone, so it stays out of .git/config.
	git -C "$dest" lfs install --local
	git -C "$dest" -c "credential.helper=!f() { echo username=kbve; echo password=$AZURE_PAT; }; f" lfs pull
fi

echo "::notice::Cloned $url into $dest"
