#!/usr/bin/env bash
# =============================================================
# cockpit-deploy.sh — D4 驾驶舱受限部署脚本 (宥初指定路径 /usr/local/bin)
# 唯一职责：驾驶舱部署挂网。只动 cockpit 相关目录 + nginx 校验 reload。
# 禁止：放开 root、写其他路径、执行任意命令、读敏感凭据。
# 用法：cockpit-deploy.sh <SRC_DIR>
#   SRC_DIR  待同步的 d4-spa 包目录（默认 /tmp/cockpit-deploy-latest）
# 状态码：0=成功 1=参数错 2=源目录无效 3=备份失败 4=同步失败 5=nginx校验失败
# =============================================================
set -u

LOCK_SELF="$(readlink -f "$0")"
SRC="${1:-/tmp/cockpit-deploy-latest}"
DEST="/opt/cockpit"
STAMP="$(date +%Y%m%d_%H%M%S)"

log(){ printf '[cockpit-deploy %s] %s\n' "$STAMP" "$*" >&2; }

# ---- 0. 路径白名单校验（只允许 cockpit 相关） ----
case "$DEST" in
  /opt/cockpit|/opt/cockpit/*) : ;;
  *) log "ERR dest not allowed: $DEST"; exit 1 ;;
esac
[ -d "$SRC" ] || { log "ERR src dir missing: $SRC"; exit 2; }

# ---- 1. 整目录备份（可回滚） ----
BK="/opt/cockpit-archive/deploy_${STAMP}"
if ! mkdir -p "/opt/cockpit-archive"; then log "ERR backup root"; exit 3; fi
if ! cp -a "$DEST/." "$BK/." ; then log "ERR backup copy"; exit 3; fi
log "backup ok -> $BK"

# ---- 2. 同步 d4-spa 到 /opt/cockpit（保留 V0.7 等与 cockpit 无关目录由上层保证不触碰） ----
sync_ok=1
for f in "$SRC"/index.html "$SRC"/app.js "$SRC"/galaxy3d.js "$SRC"/graph-force.js "$SRC"/stars-bg.js; do
  [ -f "$f" ] || { log "ERR missing required file: $f"; sync_ok=0; break; }
  cp -f "$f" "$DEST/" || { sync_ok=0; break; }
done
[ "$sync_ok" = 1 ] || { log "ERR sync"; exit 4; }
# 可选准同步 assets/vendor/avatars（存在才拷贝）
[ -d "$SRC/assets" ] && cp -a "$SRC/assets/." "$DEST/assets/."
[ -d "$SRC/vendor" ] && cp -a "$SRC/vendor/." "$DEST/vendor/."
[ -d "$SRC/avatars" ] && cp -a "$SRC/avatars/." "$DEST/avatars/."
log "sync ok -> $DEST"

# ---- 3. nginx 配置校验并 reload ----
if ! docker exec docker-nginx-1 nginx -t; then log "ERR nginx -t"; exit 5; fi
if ! docker exec docker-nginx-1 nginx -s reload; then log "ERR nginx reload"; exit 5; fi
log "nginx ok"

log "DEPLOY_DONE backup=$BK"
exit 0
