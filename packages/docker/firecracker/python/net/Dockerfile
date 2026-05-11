# ============================================================================
# firecracker-python-net — network-capable Python rootfs for Firecracker
#
# Alpine 3.21 + Python 3.12 + py3-requests/httpx/urllib3/certifi + ca-certs.
# Output: /rootfs.ext4 (~50 MB) for the firecracker-ctl-net deployment.
#
# Bakes:
#   - python3, py3-pip, py3-requests, py3-httpx, py3-urllib3, py3-certifi
#   - ca-certificates-bundle
#   - /etc/resolv.conf with 1.1.1.1 + 8.8.8.8
#   - init that mounts proc/sys/dev, brings up lo + eth0, then exec /entrypoint
#
# Pairs with: firecracker-ctl-net (FC_PERSISTENT_ENDPOINTS_ENABLED=true).
# Sandbox quick-mode VMs use the no-network alpine-python image.
#
# Final image is a tiny alpine layer with /rootfs.ext4 + a `cp` entrypoint so
# the in-cluster stage Job (apps/kube/firecracker/manifests/firecracker-net-
# rootfs-stage.yaml) can run the image directly:
#   image: ghcr.io/kbve/firecracker-python-net:<version>
#   args:  ["/rootfs.ext4", "/dest/firecracker-python-net.ext4"]
# ============================================================================

FROM --platform=linux/amd64 alpine:3.21 AS rootfs-builder

RUN apk add --no-cache e2fsprogs e2fsprogs-extra

COPY init.sh /tmp/init.sh

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
        python3 \
        py3-pip \
        py3-requests \
        py3-httpx \
        py3-urllib3 \
        py3-certifi && \
    mkdir -p /rootfs/{dev,proc,sys,tmp,run,var/log,etc,mnt} && \
    printf 'nameserver 1.1.1.1\nnameserver 8.8.8.8\n' > /rootfs/etc/resolv.conf && \
    cp /tmp/init.sh /rootfs/init && \
    chmod +x /rootfs/init && \
    dd if=/dev/zero of=/rootfs.ext4 bs=1M count=0 seek=192 && \
    mkfs.ext4 -F -d /rootfs /rootfs.ext4 && \
    resize2fs -M /rootfs.ext4

FROM --platform=linux/amd64 alpine:3.21
COPY --from=rootfs-builder /rootfs.ext4 /rootfs.ext4
ENTRYPOINT ["/bin/cp"]
CMD ["/rootfs.ext4", "/dest/firecracker-python-net.ext4"]
