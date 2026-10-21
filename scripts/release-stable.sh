#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if command -v cygpath >/dev/null 2>&1; then
  ROOT_DIR="$(cygpath -w "$ROOT_DIR")"
fi
VERSION_FILE="$ROOT_DIR/VERSION"
CHANGELOG_FILE="$ROOT_DIR/CHANGELOG.md"

usage() {
  cat <<'EOF'
Usage:
  scripts/release-stable.sh [--dry-run] [--allow-dirty]

Workflow:
  1. Verify clean git state
  2. Read VERSION
  3. Validate CHANGELOG entry exists
  4. Print or run release commands for tag vX.Y.Z
EOF
}

DRY_RUN="false"
ALLOW_DIRTY="false"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    --allow-dirty)
      ALLOW_DIRTY="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ "$ALLOW_DIRTY" == "true" && "$DRY_RUN" != "true" ]]; then
  echo "--allow-dirty may only be used with --dry-run" >&2
  exit 1
fi

VERSION="$(tr -d '[:space:]' < "$VERSION_FILE")"
TAG="v$VERSION"

if [[ "$ALLOW_DIRTY" != "true" && -n "$(git -C "$ROOT_DIR" status --short)" ]]; then
  echo "git worktree is not clean; commit or stash changes before release" >&2
  exit 1
fi

node "$ROOT_DIR/scripts/materialize-release-local-outputs.mjs" >/dev/null

if [[ "$ALLOW_DIRTY" != "true" && -n "$(git -C "$ROOT_DIR" status --short)" ]]; then
  echo "git worktree changed while preparing local release outputs; review changes before release" >&2
  exit 1
fi

# 中文注释：preflight 的输出一律先落盘。旧写法 `>/dev/null` 把失败证据全丢掉了：
# 实测本机一次 v6.8.0 发布在这里失败，只留下一行 "root release test suite failed"，
# 重跑又是绿的，于是既无法定位也无法判断是不是偶发——一个发布门把它能拦住的原因
# 自己吃掉，比不过门还糟。现在失败会把日志尾部直接喷到 stderr，完整路径也告诉你。
LOG_DIR="${AIOS_RELEASE_PREFLIGHT_LOG_DIR:-$ROOT_DIR/.aios/artifacts}"
mkdir -p "$LOG_DIR" 2>/dev/null || LOG_DIR="${TMPDIR:-/tmp}"
PREFLIGHT_LOG="$LOG_DIR/release-preflight-${TAG}-$(date +%Y%m%d-%H%M%S).log"
echo "[release] preflight log: $PREFLIGHT_LOG"

if ! bash "$ROOT_DIR/scripts/release-preflight.sh" --tag "$TAG" >"$PREFLIGHT_LOG" 2>&1; then
  echo "[release] preflight FAILED — last 40 lines of $PREFLIGHT_LOG:" >&2
  tail -n 40 "$PREFLIGHT_LOG" >&2
  echo "[release] full log kept at: $PREFLIGHT_LOG" >&2
  exit 1
fi
echo "[release] preflight passed (full log: $PREFLIGHT_LOG)"

echo "Version: $VERSION"
echo "Tag:     $TAG"
echo ""
echo "Commands:"
echo "  git tag -a $TAG -m \"AIOS $TAG\""
echo "  git push origin main"
echo "  git push origin $TAG"

if [[ "$DRY_RUN" == "true" ]]; then
  echo ""
  echo "Dry run only. No tag created."
  exit 0
fi

# 中文注释：打 annotated tag。release-preflight 要求 tag 本身携带说明（training
# evidence 随 tag 发布），轻量 tag 没有 message 可满足该审计要求。
git -C "$ROOT_DIR" tag -a "$TAG" -m "AIOS $TAG"
echo "+ git push origin main"
git -C "$ROOT_DIR" push origin main
echo "+ git push origin $TAG"
git -C "$ROOT_DIR" push origin "$TAG"
