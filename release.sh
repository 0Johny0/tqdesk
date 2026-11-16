#!/bin/bash
# TQ Desk 发版脚本：校验 → 提交 → 打 tag → 推送触发 GitHub Actions 云构建
set -euo pipefail

# ---- 参数校验 ----
V="${1:-}"
if [ -z "$V" ]; then
  echo "用法: ./release.sh <版本号>   例: ./release.sh 1.0.1" >&2
  exit 1
fi
V="${V#v}"                                   # 允许带 v 前缀输入，统一剥掉
if ! echo "$V" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "错误: 版本号须为 x.y.z 形式，例: 1.0.1" >&2
  exit 1
fi

cd "$(dirname "$0")"

# ---- 前置检查 ----
if [ "$(git rev-parse --abbrev-ref HEAD)" != "main" ]; then
  echo "错误: 请先切换到 main 分支" >&2
  exit 1
fi

if git rev-parse "v$V" >/dev/null 2>&1; then
  echo "错误: 标签 v$V 已存在" >&2
  exit 1
fi

# ---- 提交（有变更才提交）----
if [ -n "$(git status --porcelain)" ]; then
  git add -A

  # 敏感文件最后一道闸：绝不允许入库
  if git diff --cached --name-only | grep -qE '(^|/)(test_[^/]*\.py|\.env|\.venv)$|(^|/)\.venv/'; then
    echo "错误: 敏感文件被暂存（test_*.py / .env / .venv），请清理后再发版" >&2
    echo "执行: git restore --staged <文件>  并补全 .gitignore" >&2
    exit 1
  fi

  git commit -m "release: v$V"
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "错误: 提交后工作区仍不干净，请手动检查" >&2
  exit 1
fi

# ---- 打标签并推送 ----
git tag -a "v$V" -m "release v$V"
git push origin main "v$V"

# ---- 输出构建地址 ----
REMOTE=$(git remote get-url origin | sed -E 's#(git@github\.com:|https://github\.com/|ssh://git@github\.com/)##; s#\.git$##')
echo ""
echo "✓ v$V 已推送，云构建进行中："
echo "  https://github.com/$REMOTE/actions"
echo "构建完成（约 5-8 分钟）后到 NAS 执行: ./update.sh $V"