#!/usr/bin/env bash
set -Eeuo pipefail

REPO="MilMit/chatdesk-linux"
VERSION="$(node -p "require('./package.json').version")"
TAG="v${VERSION}"

fail() { printf 'Error: %s\n' "$*" >&2; exit 1; }
command -v git >/dev/null || fail "git is required"
command -v gh >/dev/null || fail "GitHub CLI (gh) is required"
command -v npm >/dev/null || fail "npm is required"
[[ -f package.json ]] || fail "run this script from the ChatDesk project root"
[[ "$(git branch --show-current)" == "main" ]] || fail "switch to the main branch first"
gh auth status >/dev/null 2>&1 || fail "sign in first with: gh auth login --web"

printf '\n[1/7] Installing and validating dependencies\n'
npm install
[[ -f package-lock.json ]] || fail "npm did not create package-lock.json"
npm test
npm run check
npm audit --omit=dev

printf '\n[2/7] Building Linux release artifacts\n'
rm -rf dist
npm run dist:linux
shopt -s nullglob
artifacts=(dist/*.AppImage dist/*.deb)
(( ${#artifacts[@]} >= 2 )) || fail "AppImage and DEB were not both created"
(
  cd dist
  local_artifacts=(*.AppImage *.deb)
  sha256sum "${local_artifacts[@]}" > SHA256SUMS
)
npm sbom --sbom-format spdx > "dist/chatdesk-linux-${TAG}.spdx.json" || true

printf '\n[3/7] Committing source and lockfile\n'
git add -A
if ! git diff --cached --quiet; then
  git commit -m "release: ChatDesk Linux ${TAG}"
fi
git push -u origin main

printf '\n[4/7] Creating tag %s\n' "$TAG"
if git rev-parse "$TAG" >/dev/null 2>&1; then
  [[ "$(git rev-list -n1 "$TAG")" == "$(git rev-parse HEAD)" ]] || fail "$TAG already points to a different commit"
else
  git tag -a "$TAG" -m "ChatDesk Linux ${TAG}"
fi
git push origin "$TAG"

printf '\n[5/7] Waiting for GitHub Actions release build\n'
run_id=""
for _ in {1..30}; do
  run_id="$(gh run list --repo "$REPO" --workflow release.yml --limit 10 --json databaseId,headBranch,event --jq ".[] | select(.headBranch == \"$TAG\" or .headBranch == \"${TAG#v}\") | .databaseId" | head -n1)"
  [[ -n "$run_id" ]] && break
  sleep 4
done

workflow_ok=false
if [[ -n "$run_id" ]]; then
  if gh run watch "$run_id" --repo "$REPO" --exit-status; then workflow_ok=true; fi
fi

printf '\n[6/7] Ensuring release assets exist\n'
release_assets=(dist/*.AppImage dist/*.deb dist/SHA256SUMS)
sbom=(dist/*.spdx.json)
release_assets+=("${sbom[@]}")
if gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1; then
  gh release upload "$TAG" "${release_assets[@]}" --repo "$REPO" --clobber
else
  gh release create "$TAG" "${release_assets[@]}" \
    --repo "$REPO" --verify-tag --title "ChatDesk Linux ${TAG}" --notes-file RELEASE_NOTES.md
fi

printf '\n[7/7] Published assets\n'
gh release view "$TAG" --repo "$REPO" --json assets --jq '.assets[].name'
printf '\nRelease: https://github.com/%s/releases/tag/%s\n' "$REPO" "$TAG"
[[ "$workflow_ok" == true ]] || printf 'Note: local artifacts were uploaded because the Actions run was unavailable or failed.\n'
