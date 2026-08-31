#!/usr/bin/env bash
# Materializes the LFS objects under a path, and proves they materialized.
#
# One implementation, because there were six, and they disagreed on every
# failure this script exists to catch:
#
#   ci-godot.yml (x3)     listed with `ls-files -n | grep -q`, no retry
#   ci-godot-tests.yml    listed into a file, no retry
#   ci-unity.yml (x2)     no listing, no stub check at all
#   ci-blender-flow.yml   no listing, no stub check
#   ci-unreal-build.yml   auth preflight and retries, no stub check
#
# The disagreements were not style. Each copy caught a different failure and
# shipped the others, and every one of those failures presents as something
# else -- a pointer stub reaches Godot as ERR_FILE_CORRUPT or a signal, reads
# as a broken test, and the export that produced it still "succeeds".
#
# Reads:
#   LFS_REMOTE      optional, a game name from remotes.tsv; supplies both the
#                   endpoint and, unless LFS_INCLUDE says otherwise, the prefix
#   LFS_INCLUDE     path prefix to pull, e.g. apps/x/godot-x; required unless
#                   LFS_REMOTE supplies one
#   LFS_ENDPOINT    optional, the lfs.url to pull from; see the note below
#   LFS_STORAGE     optional, shared object cache dir (git lfs.storage)
#   LFS_RETRIES     optional, attempts against a Forgejo remote (default 4)
#   LFS_REQUIRED    optional, set to 1 to fail when the prefix tracks nothing
#   LFS_DRY_RUN     optional, set to 1 to resolve and report, pulling nothing
#   FORGEJO_USER    required when .lfsconfig points at a kbve-hosted remote
#   FORGEJO_TOKEN   likewise
set -euo pipefail

die() { echo "::error::$*" >&2; exit 1; }

# '.' and '**' both mean the whole checkout, which is how the external-clone
# path asks for a repo with no subdirectory. Kept distinct from a path prefix
# because "$include/**" on an empty prefix is "/**", which matches nothing and
# pulls nothing while exiting 0.
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# A game name resolves to both halves of the answer: which endpoint holds its
# blobs, and which paths it owns. LFS_INCLUDE still wins when given, so a
# caller can pull a subtree of a game without restating the endpoint.
if [ -n "${LFS_REMOTE:-}" ]; then
	: "${LFS_ENDPOINT:=$("$here/remotes.sh" url "$LFS_REMOTE")}"
	: "${LFS_INCLUDE:=$("$here/remotes.sh" path "$LFS_REMOTE")}"
	export LFS_ENDPOINT LFS_INCLUDE
fi

include="${LFS_INCLUDE:?LFS_INCLUDE is not set (set it, or LFS_REMOTE)}"
include="${include%/}"
if [ "$include" = "." ] || [ "$include" = "**" ]; then
	include=""
	pathspec="**"
	label="the whole checkout"
else
	pathspec="$include/**"
	label="$include"
fi
retries="${LFS_RETRIES:-4}"

dry="${LFS_DRY_RUN:-}"

if [ "$dry" != "1" ] && ! command -v git-lfs >/dev/null 2>&1; then
	# The Ubuntu build containers ship git without git-lfs. The lock timeout
	# and retries are for a concurrent apt on the same node. The macOS
	# runners have it already, and telling them to apt-get would replace a
	# missing-dependency error with a confusing one.
	command -v apt-get >/dev/null 2>&1 ||
		die "git-lfs is not installed and this is not an apt host. Install git-lfs on the runner."
	apt-get -o DPkg::Lock::Timeout=120 -o Acquire::Retries=3 update -qq
	apt-get -o DPkg::Lock::Timeout=120 -o Acquire::Retries=3 install -y -qq --no-install-recommends git-lfs
fi

# actions/checkout writes its safe.directory entry under a HOME it then
# restores, so inside a container git does not trust the workspace and git-lfs
# exits 128 "Not in a Git repository". Checked before adding because --add
# appends unconditionally, and this runs against the same tree repeatedly.
git config --global --get-all safe.directory 2>/dev/null | grep -qxF "$PWD" ||
	git config --global --add safe.directory "$PWD"

if [ -n "${LFS_STORAGE:-}" ]; then
	mkdir -p "$LFS_STORAGE"
	git config --local lfs.storage "$LFS_STORAGE"
fi

# Listed once into a file rather than piped. `git lfs ls-files | grep -q` is a
# trap under pipefail: grep leaves on its first match, git-lfs dies of SIGPIPE
# part way through a listing of every LFS file in the monorepo, and the
# pipeline reports 141 -- read as "nothing tracked here" for a project with 268
# files, so the pull was skipped and the suite met pointer stubs.
listing="$(mktemp)"
trap 'rm -f "$listing"' EXIT
git lfs ls-files -n > "$listing"

if ! grep -q "^$include" "$listing"; then
	# Not an error by default: most projects that run this track nothing, and
	# the pull would be a no-op. LFS_REQUIRED=1 is for the ones where an empty
	# listing means .gitattributes or the filter is broken, not that the
	# project is asset-free.
	[ "${LFS_REQUIRED:-}" = "1" ] && die "$label tracks no LFS files, but LFS_REQUIRED=1."
	echo "::notice::No LFS-tracked files under $label — skipping"
	exit 0
fi

# Where the objects live decides how they are authenticated. A url pointing at
# a kbve host means Forgejo, which needs credentials GitHub's checkout never
# supplied; anything else is GitHub-native and already authenticated.
#
# Resolution is LFS_ENDPOINT, then the repo-root .lfsconfig -- deliberately NOT
# the .lfsconfig sitting inside the project. Seven of those exist, each naming
# a different Forgejo repo, and stock git-lfs ignores every one of them: it
# reads lfs.url from the repo root only. They document intent and route no
# traffic, so honouring one here would silently change which endpoint a pull
# goes to. The root file names KBVE/rareicon, which is why a project whose
# blobs live elsewhere has to pass LFS_ENDPOINT (ci-unreal-build reads the
# project's own file and does exactly that).
raw_url="${LFS_ENDPOINT:-}"
if [ -z "$raw_url" ] && [ -f .lfsconfig ]; then
	raw_url=$(git config -f .lfsconfig lfs.url 2>/dev/null || true)
fi

case "$raw_url" in
*forgejo.kbve.com* | *git.kbve.com* | *mc.kbve.com*)
	[ -n "${FORGEJO_USER:-}" ] && [ -n "${FORGEJO_TOKEN:-}" ] ||
		die "FORGEJO_USER / FORGEJO_TOKEN missing — the LFS assets would ship as pointer stubs."
	echo "::add-mask::$FORGEJO_TOKEN"

	# Normalize whatever form .lfsconfig holds into an API endpoint: the
	# repos carry a mix of ssh://, https:// and bare paths, with and
	# without the /info/lfs suffix git-lfs actually talks to.
	#
	# Case is preserved through all of it -- Forgejo's LFS routing is
	# case-sensitive, and KBVE/chuck vs kbve/chuck is a 401 vs a 302.
	#
	# The host is forced to git.kbve.com rather than carried over: that is
	# the HTTPS ingress (.74), and the ssh/Cilium route (.71) 522s on the
	# batch endpoint.
	path="${raw_url#ssh://}"
	path="${path#https://}"
	path="${path#http://}"
	path="${path#*@}"
	path="${path#*/}"
	path="${path%/}"
	case "$path" in
	*/info/lfs) ;;
	*.git) path="$path/info/lfs" ;;
	*) path="${path%.git}.git/info/lfs" ;;
	esac
	auth_url="https://${FORGEJO_USER}:${FORGEJO_TOKEN}@git.kbve.com/${path}"

	if [ "$dry" = "1" ]; then
		echo "dry run: would pull $label from git.kbve.com/$path (forgejo)"
		exit 0
	fi

	# Preflight with an empty batch. A bad token otherwise surfaces at the
	# end of a multi-gigabyte pull as a generic git-lfs error, and the two
	# causes -- expired credentials and a Forgejo hiccup -- want opposite
	# responses: rotate the secret, or re-run.
	code=$(curl -s -o /dev/null -w '%{http_code}' \
		-X POST -H 'Accept: application/vnd.git-lfs+json' -H 'Content-Type: application/vnd.git-lfs+json' \
		-d '{"operation":"download","transfers":["basic"],"objects":[]}' \
		--max-time 20 "$auth_url/objects/batch" || echo 000)
	case "$code" in
	401 | 403) die "Forgejo LFS auth failed (HTTP $code) at git.kbve.com/$path — FORGEJO_TOKEN invalid or expired. Rotate it via kube (forgejo namespace: forgejo-deploy-keys / forgejo-admin) and re-sync the FORGEJO_TOKEN GitHub secret." ;;
	esac
	echo "::notice::Forgejo LFS auth OK (HTTP $code) — pulling $label from git.kbve.com/$path"

	git -c lfs.url="$auth_url" lfs install --local
	git config --local lfs.transfer.maxretries 10

	# Forgejo is single-replica, so a rollout or an LFS-store IO stall
	# during the pull is a transient 503 rather than a real failure.
	n=0
	until git -c lfs.url="$auth_url" lfs pull --include="$pathspec"; do
		n=$((n + 1))
		[ "$n" -ge "$retries" ] &&
			die "LFS pull from git.kbve.com failed after $n tries (transient 503/ingress hiccup — single-replica Forgejo rolled, or the LFS store stalled). Re-run the job."
		echo "::warning::LFS pull attempt $n hit a transient git.kbve.com error; retrying in $((n * 15))s"
		sleep $((n * 15))
	done
	;;
*)
	if [ "$dry" = "1" ]; then
		echo "dry run: would pull $label from origin (github-native)"
		exit 0
	fi
	echo "::notice::Pulling $label from origin (GitHub-native)"
	git lfs install --local
	git lfs pull --include="$pathspec"
	;;
esac

# Assert the pull resolved. A leftover pointer is a small text file whose first
# line is the LFS spec URL -- the one shape that is cheap to detect and that
# every consumer downstream mistakes for a corrupt asset instead of a missing
# one.
stubs=$(grep "^$include" "$listing" | xargs -r grep -l "^version https://git-lfs" 2>/dev/null || true)
if [ -n "$stubs" ]; then
	echo "::error::LFS pointers unresolved after pull:"
	printf '%s\n' "$stubs" | head -5
	exit 1
fi

# The shared object cache is the reason a rebuilt runner is not a cold pull,
# and it grows without bound, so its size is worth a line in the log.
if [ -n "${LFS_STORAGE:-}" ]; then
	echo "::notice::LFS object cache: $(du -sh "$LFS_STORAGE" 2>/dev/null | cut -f1)"
fi

echo "::notice::LFS objects under $label resolved"
