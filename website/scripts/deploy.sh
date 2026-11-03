#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node build.mjs
node scripts/check.mjs
rsync -az --delete --exclude='.well-known' dist/ myvps:/www/wwwroot/reader.qiaomu.ai/
ssh myvps 'chmod -R a+rX /www/wwwroot/reader.qiaomu.ai'
node scripts/check.mjs --live
