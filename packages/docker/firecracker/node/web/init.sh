#!/bin/sh
mount -t proc proc /proc 2>/dev/null
mount -t sysfs sys /sys 2>/dev/null
mount -t devtmpfs dev /dev 2>/dev/null
mount -t tmpfs tmpfs /tmp 2>/dev/null

ip link set lo up 2>/dev/null
ip link set eth0 up 2>/dev/null

# Baked node_modules live in /usr/lib/node_modules; expose them to
# `require()` so user code can `require('fastify')` without any extra
# mount or copy step.
export NODE_PATH=/usr/lib/node_modules

ENTRYPOINT="/bin/sh"
for param in $(cat /proc/cmdline); do
  case "$param" in
    fc_entrypoint=*) ENTRYPOINT="${param#fc_entrypoint=}" ;;
  esac
done

if [ -b /dev/vdc ] && [ -b /dev/vdd ]; then
  dd if=/dev/vdc of=/tmp/packages.raw bs=4096 2>/dev/null
  tr -d '\0' < /tmp/packages.raw > /tmp/packages.txt

  mkdir -p /mnt/packages
  mount -o ro /dev/vdd /mnt/packages 2>/dev/null

  if [ -d /mnt/packages/pip ] && command -v pip3 >/dev/null 2>&1; then
    pip3 install --no-index --find-links /mnt/packages/pip \
      $(cat /tmp/packages.txt) 2>/tmp/pkg-install.log || true
  elif [ -d /mnt/packages/node_modules ] && command -v node >/dev/null 2>&1; then
    cp -r /mnt/packages/node_modules/. /usr/lib/node_modules/ 2>/tmp/pkg-install.log || true
  fi

  umount /mnt/packages 2>/dev/null
fi

if [ -b /dev/vdb ]; then
  dd if=/dev/vdb of=/tmp/code.raw bs=4096 2>/dev/null
  tr -d '\0' < /tmp/code.raw > /tmp/code
  echo "---FC_OUTPUT_START---"
  "$ENTRYPOINT" /tmp/code
  EC=$?
  echo "---FC_OUTPUT_END---"
  exit $EC
fi
exec /bin/sh
