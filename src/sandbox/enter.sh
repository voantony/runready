#!/bin/bash
# RunReady sandbox entrypoint.
# Invoked inside `unshare` (user, mount, pid, and optionally net namespaces).
# Arguments after `--` are exec'd directly. They are never interpolated into a shell string.
set -u

if [ "$#" -lt 6 ]; then
  echo "usage: enter.sh WORKDIR RUNTIME NODE_PREFIX TIMEOUT CWD -- CMD..." >&2
  exit 2
fi

WORKDIR=$1
RUNTIME=$2
NODE_PREFIX=$3
TIMEOUT=$4
CWD=$5
shift 5

if [ "${1:-}" != "--" ]; then
  echo "missing -- before command" >&2
  exit 2
fi
shift

if [ "$#" -lt 1 ]; then
  echo "missing command" >&2
  exit 2
fi

case "$TIMEOUT" in
  ''|*[!0-9]*)
    echo "bad timeout" >&2
    exit 2
    ;;
esac

if [ ! -d "$WORKDIR" ]; then
  echo "workdir missing: $WORKDIR" >&2
  exit 2
fi

case "$CWD" in
  ""|.)
    CWD="."
    ;;
  /*|*..*)
    echo "refusing cwd: $CWD" >&2
    exit 2
    ;;
esac

export PATH="/usr/sbin:/usr/bin:/sbin:/bin"

# Anchor the checkout on /mnt before /tmp and /home are covered. Workdirs often
# live under /tmp, and the Node toolchain often lives under /home.
if ! mount -t tmpfs tmpfs /mnt; then
  echo "failed to mount sandbox anchor" >&2
  exit 3
fi
mkdir -p /mnt/work /mnt/node /mnt/runtime
if ! mount --bind "$WORKDIR" /mnt/work; then
  echo "failed to bind workdir" >&2
  exit 3
fi
# Keep the caller's runtime dir argument available when it is not the anchor.
if [ -d "$RUNTIME" ]; then
  mount --bind "$RUNTIME" /mnt/runtime >/dev/null 2>&1 || true
fi

if [ -n "$NODE_PREFIX" ]; then
  if ! mount --bind "$NODE_PREFIX" /mnt/node; then
    echo "failed to bind node toolchain" >&2
    exit 3
  fi
  export PATH="/mnt/node/bin:$PATH"
fi

# Hide the host home and root so agent commands cannot read developer secrets.
if ! mount -t tmpfs tmpfs /home; then
  echo "failed to mask /home" >&2
  exit 3
fi
mount -t tmpfs tmpfs /root >/dev/null 2>&1 || true

if ! mount -t tmpfs -o mode=1777 tmpfs /tmp; then
  echo "failed to mount private /tmp" >&2
  exit 3
fi

mkdir -p /tmp/home /tmp/tmp /tmp/npm-cache
export HOME=/tmp/home
export TMPDIR=/tmp/tmp
export npm_config_cache=/tmp/npm-cache
export npm_config_update_notifier=false
export npm_config_fund=false
export CI="${CI:-1}"
export NO_UPDATE_NOTIFIER=1

cd -- /mnt/work || {
  echo "cannot enter workdir" >&2
  exit 2
}
if [ "$CWD" != "." ]; then
  cd -- "$CWD" || {
    echo "cwd not found: $CWD" >&2
    exit 2
  }
fi

# Drop capabilities inside the user namespace so the command cannot unmount the masks.
exec setpriv --no-new-privs --inh-caps -all --ambient-caps -all --bounding-set -all \
  timeout --foreground -k 5s "$TIMEOUT" "$@"
