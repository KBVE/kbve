# ============================================================================
# firecracker-node-web — Fastify-ready Node rootfs for Firecracker
#
# Alpine 3.21 + Node.js 22 LTS + npm-installed Fastify stack baked into
# /usr/lib/node_modules so `require('fastify')` resolves at boot without
# the runtime needing to mount the npm-cache drive.
#
# Bakes:
#   - nodejs, npm (apk)
#   - fastify, @fastify/cors, @fastify/helmet, @fastify/static, undici,
#     zod, pino, pino-pretty, dotenv, nanoid, date-fns, commander, chalk
#   - ca-certificates-bundle, ca-certificates, iproute2
#   - /etc/resolv.conf with 1.1.1.1 + 8.8.8.8
#   - init that mounts proc/sys/dev, brings up lo + eth0, exec /entrypoint
#
# Pairs with: firecracker-ctl-net (FC_PERSISTENT_ENDPOINTS_ENABLED=true).
# Use this image for long-lived Fastify deploys submitted through the
# dashboard IDE. Short-lived Node VMs keep the smaller alpine-node rootfs
# and pull from the shared npm-cache.ext4 at boot.
#
# Final image is a tiny alpine layer with /rootfs.ext4 + a `cp` entrypoint so
# the in-cluster stage Job (apps/kube/firecracker/manifests/firecracker-
# node-web-rootfs-stage.yaml) can run the image directly:
#   image: ghcr.io/kbve/firecracker-node-web:<version>
#   args:  ["/rootfs.ext4", "/dest/firecracker-node-web.ext4"]
# ============================================================================

FROM --platform=linux/amd64 alpine:3.21 AS rootfs-builder

RUN apk add --no-cache e2fsprogs e2fsprogs-extra nodejs npm

COPY init.sh /tmp/init.sh

# Stage apk-managed system layer into /rootfs.
RUN mkdir -p /rootfs/etc/apk && \
    cp /etc/apk/repositories /rootfs/etc/apk/repositories && \
    cp -a /etc/apk/keys /rootfs/etc/apk/ && \
    apk add --root /rootfs --initdb --no-cache \
        alpine-baselayout \
        busybox \
        musl \
        ca-certificates-bundle \
        ca-certificates \
        iproute2 \
        nodejs \
        npm && \
    mkdir -p /rootfs/{dev,proc,sys,tmp,run,var/log,etc,mnt,app,usr/lib/node_modules}

# Resolve the Fastify stack into /usr/lib/node_modules so `require()`
# inside the guest works without any /mnt/packages mount step.
RUN cd /tmp && npm init -y > /dev/null && \
    npm install --no-audit --no-fund --omit=dev --prefer-online \
        fastify \
        @fastify/cors \
        @fastify/helmet \
        @fastify/static \
        undici \
        zod \
        pino \
        pino-pretty \
        dotenv \
        nanoid \
        date-fns \
        commander \
        chalk && \
    cp -a /tmp/node_modules/. /rootfs/usr/lib/node_modules/ && \
    rm -rf /tmp/node_modules /tmp/package.json /tmp/package-lock.json

RUN printf 'nameserver 1.1.1.1\nnameserver 8.8.8.8\n' > /rootfs/etc/resolv.conf && \
    cp /tmp/init.sh /rootfs/init && \
    chmod +x /rootfs/init && \
    dd if=/dev/zero of=/rootfs.ext4 bs=1M count=0 seek=384 && \
    mkfs.ext4 -F -d /rootfs /rootfs.ext4 && \
    resize2fs -M /rootfs.ext4

FROM --platform=linux/amd64 alpine:3.21
COPY --from=rootfs-builder /rootfs.ext4 /rootfs.ext4
ENTRYPOINT ["/bin/cp"]
CMD ["/rootfs.ext4", "/dest/firecracker-node-web.ext4"]
