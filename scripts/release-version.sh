#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION_FILE="$ROOT_DIR/VERSION"
CHANGELOG_FILE="$ROOT_DIR/CHANGELOG.md"

usage() {
  cat <<'EOF'
Usage:
  scripts/release-version.sh [--dry-run] <patch|minor|major> [summary text]

Examples:
  scripts/release-version.sh patch "fix: wrapper empty args crash"
  scripts/release-version.sh minor "feat: add i18n docs"
  scripts/release-version.sh --dry-run major "breaking runtime changes"
EOF
}

DRY_RUN="false"
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN="true"
  shift
fi

BUMP_KIND="${1:-}"
if [[ -z "$BUMP_KIND" ]]; then
  usage
  exit 1
fi
shift || true

if [[ "$BUMP_KIND" != "patch" && "$BUMP_KIND" != "minor" && "$BUMP_KIND" != "major" ]]; then
  echo "bump kind must be one of: patch, minor, major"
  exit 1
fi

if [[ ! -f "$VERSION_FILE" ]]; then
  echo "missing VERSION file: $VERSION_FILE"
  exit 1
fi

CURRENT_VERSION="$(tr -d '[:space:]' < "$VERSION_FILE")"
if [[ ! "$CURRENT_VERSION" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
  echo "invalid VERSION format: $CURRENT_VERSION (expected x.y.z)"
  exit 1
fi

MAJOR="${BASH_REMATCH[1]}"
MINOR="${BASH_REMATCH[2]}"
PATCH="${BASH_REMATCH[3]}"

case "$BUMP_KIND" in
  patch)
    PATCH=$((PATCH + 1))
    ;;
  minor)
    MINOR=$((MINOR + 1))
    PATCH=0
    ;;
  major)
    MAJOR=$((MAJOR + 1))
    MINOR=0
    PATCH=0
    ;;
esac

NEW_VERSION="${MAJOR}.${MINOR}.${PATCH}"
DATE_UTC="$(date -u +%Y-%m-%d)"
SUMMARY="${*:-version bump (${BUMP_KIND})}"

echo "Current version: $CURRENT_VERSION"
echo "Next version:    $NEW_VERSION"
echo "Summary:         $SUMMARY"

if [[ "$DRY_RUN" == "true" ]]; then
  echo "Dry run mode enabled. No files changed."
  exit 0
fi

printf '%s\n' "$NEW_VERSION" > "$VERSION_FILE"

if [[ ! -f "$CHANGELOG_FILE" ]]; then
  cat > "$CHANGELOG_FILE" <<'EOF'
# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog and this project follows Semantic Versioning.

## [Unreleased]
EOF
fi

if grep -q "^## \\[$NEW_VERSION\\]" "$CHANGELOG_FILE"; then
  echo "changelog already contains version $NEW_VERSION"
  exit 1
fi

TMP_FILE="$(mktemp)"
# 中文注释：本仓 CHANGELOG 是“最新在上”。旧写法只认 `## [Unreleased]`，而它要么不存在
# （于是走 END 分支把新条目追到文件最底部），要么残留在中段（于是新条目插在 5.x 附近）。
# 两种错位今天各咬过一次。现在直接以“第一个 `## [` 标题”为锺：有 Unreleased 就插在它下面，
# 没有就插在当前最新条目上面。END 分支只留给“整个文件还没有任何条目”的真空情形。
awk -v ver="$NEW_VERSION" -v d="$DATE_UTC" -v s="$SUMMARY" '
  BEGIN { inserted=0; saw_heading=0 }
  {
    if (!inserted && $0 ~ /^## \[/) {
      saw_heading=1
      if ($0 ~ /^## \[Unreleased\]/) {
        print
        print ""
        print "## [" ver "] - " d
        print ""
        print "- " s
        inserted=1
        next
      }
      print ""
      print "## [" ver "] - " d
      print ""
      print "- " s
      print ""
      inserted=1
    }
    print
  }
  END {
    if (!inserted && !saw_heading) {
      print ""
      print "## [" ver "] - " d
      print ""
      print "- " s
    }
  }
' "$CHANGELOG_FILE" > "$TMP_FILE"
mv "$TMP_FILE" "$CHANGELOG_FILE"

echo "Updated:"
echo "- $VERSION_FILE"
echo "- $CHANGELOG_FILE"
