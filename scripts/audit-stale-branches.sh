#!/usr/bin/env bash
#
# Stale-branch audit. Prints a Markdown report of every remote branch, sorted
# into what is safe to delete now and what needs a decision.
#
# The monthly job in .github/workflows/branch-hygiene.yml pipes this into the
# run summary; run it locally the same way for the same report:
#
#   git fetch --prune origin && bash scripts/audit-stale-branches.sh
#
# Nothing is deleted here. The report prints the `git push origin --delete`
# lines and a human runs them — an automated branch delete is unrecoverable if
# the "merged" test is ever wrong.
#
# STALE_AFTER_DAYS matches the PR gate's MAX_BRANCH_AGE_DAYS. Keep them equal:
# a branch that is stale enough to report is stale enough to block.
set -euo pipefail

STALE_AFTER_DAYS="${STALE_AFTER_DAYS:-30}"
BASE_BRANCH="${BASE_BRANCH:-main}"
remote_base="origin/${BASE_BRANCH}"

if ! git rev-parse --verify --quiet "$remote_base" >/dev/null; then
  echo "## Stale branch audit"
  echo
  echo "\`${remote_base}\` not found — run \`git fetch origin ${BASE_BRANCH}\` first."
  exit 1
fi

now="$(date -u +%s)"
merged_rows=""
stale_rows=""
active_rows=""
merged_deletes=""
merged_n=0
stale_n=0
active_n=0

# %(committerdate:unix) rather than authordate: a rebased branch is live work
# even when its commits carry old author dates.
while IFS=$'\t' read -r ref epoch author; do
  branch="${ref#origin/}"
  [ "$branch" = "$BASE_BRANCH" ] && continue
  [ "$branch" = "HEAD" ] && continue

  age_days=$(( (now - epoch) / 86400 ))
  last="$(date -u -d "@${epoch}" +%Y-%m-%d 2>/dev/null || date -u -r "${epoch}" +%Y-%m-%d)"

  if git merge-base --is-ancestor "$ref" "$remote_base" 2>/dev/null; then
    merged_rows+="| \`${branch}\` | ${last} | ${age_days}d | ${author} |"$'\n'
    merged_deletes+="git push origin --delete ${branch}"$'\n'
    merged_n=$(( merged_n + 1 ))
  elif [ "$age_days" -gt "$STALE_AFTER_DAYS" ]; then
    ahead="$(git rev-list --count "${remote_base}..${ref}" 2>/dev/null || echo '?')"
    stale_rows+="| \`${branch}\` | ${last} | ${age_days}d | ${ahead} | ${author} |"$'\n'
    stale_n=$(( stale_n + 1 ))
  else
    active_rows+="| \`${branch}\` | ${last} | ${age_days}d | ${author} |"$'\n'
    active_n=$(( active_n + 1 ))
  fi
done < <(git for-each-ref --format='%(refname:short)%09%(committerdate:unix)%09%(authorname)' refs/remotes/origin)

echo "## Stale branch audit"
echo
echo "Base: \`${BASE_BRANCH}\` · stale after ${STALE_AFTER_DAYS} days · $(date -u +%Y-%m-%d)"
echo
echo "**${merged_n} merged**, **${stale_n} stale and unmerged**, **${active_n} active**."
echo

if [ "$merged_n" -gt 0 ]; then
  echo "### Merged — safe to delete"
  echo
  echo "Fully contained in \`${BASE_BRANCH}\`. Deleting these loses nothing."
  echo
  echo "| Branch | Last commit | Age | Author |"
  echo "|---|---|---|---|"
  printf '%s' "$merged_rows"
  echo
  echo '```sh'
  printf '%s' "$merged_deletes"
  echo '```'
  echo
fi

if [ "$stale_n" -gt 0 ]; then
  echo "### Stale and unmerged — needs a decision"
  echo
  echo "Untouched for over ${STALE_AFTER_DAYS} days and carrying commits \`${BASE_BRANCH}\` does not have."
  echo "Each is either work to finish (merge \`${BASE_BRANCH}\` in and open a PR) or"
  echo "work that was abandoned (delete it). Leaving it is the one option that isn't a choice."
  echo
  echo "| Branch | Last commit | Age | Commits ahead | Author |"
  echo "|---|---|---|---|---|"
  printf '%s' "$stale_rows"
  echo
fi

if [ "$active_n" -gt 0 ]; then
  echo "### Active"
  echo
  echo "| Branch | Last commit | Age | Author |"
  echo "|---|---|---|---|"
  printf '%s' "$active_rows"
  echo
fi

if [ "$merged_n" -eq 0 ] && [ "$stale_n" -eq 0 ]; then
  echo "Nothing to clean up. ✅"
fi
