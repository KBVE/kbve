# ============================================================================
# firecracker-python-web — FastAPI-ready Python rootfs for Firecracker
#
# Alpine 3.21 + Python 3.12 + pip-installed FastAPI + uvicorn + Starlette.
# Output: /rootfs.ext4 (~120 MB) for the firecracker-ctl-net deployment.
#
# Bakes on top of the net image's stack:
#   - python3, py3-pip
#   - py3-requests, py3-httpx, py3-urllib3, py3-certifi (apk)
#   - fastapi, uvicorn, starlette, python-multipart, email-validator,
#     websockets, anyio, sniffio, h11, click (pip, musllinux wheels)
#   - ca-certificates-bundle, ca-certificates, iproute2
#   - /etc/resolv.conf with 1.1.1.1 + 8.8.8.8
#   - init that mounts proc/sys/dev, brings up lo + eth0, exec /entrypoint
#
# Pairs with: firecracker-ctl-net (FC_PERSISTENT_ENDPOINTS_ENABLED=true).
# Use this image for long-lived FastAPI deploys submitted through the
# dashboard IDE. Quick one-shot VMs keep the smaller alpine-python or
# pip-cache-driven flow.
#
# Final image is a tiny alpine layer with /rootfs.ext4 + a `cp` entrypoint so
# the in-cluster stage Job (apps/kube/firecracker/manifests/firecracker-
# web-rootfs-stage.yaml) can run the image directly:
#   image: ghcr.io/kbve/firecracker-python-web:<version>
#   args:  ["/rootfs.ext4", "/dest/firecracker-python-web.ext4"]
# ============================================================================

FROM --platform=linux/amd64 alpine:3.21 AS rootfs-builder

RUN apk add --no-cache e2fsprogs e2fsprogs-extra python3 py3-pip

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
        python3 \
        py3-pip \
        py3-requests \
        py3-httpx \
        py3-urllib3 \
        py3-certifi && \
    mkdir -p /rootfs/{dev,proc,sys,tmp,run,var/log,etc,mnt,app}

# Layer FastAPI stack on top via pip (--target so we don't depend on the
# guest having writable site-packages or pip at runtime).
RUN pip3 install --no-cache-dir \
        --target /rootfs/usr/lib/python3.12/site-packages \
        --platform musllinux_1_2_x86_64 \
        --platform musllinux_1_1_x86_64 \
        --platform any \
        --python-version 3.12 \
        --only-binary=:all: \
        --upgrade \
        fastapi \
        uvicorn \
        starlette \
        python-multipart \
        email-validator \
        websockets \
        anyio \
        sniffio \
        h11 \
        click

RUN printf 'nameserver 1.1.1.1\nnameserver 8.8.8.8\n' > /rootfs/etc/resolv.conf && \
    cp /tmp/init.sh /rootfs/init && \
    chmod +x /rootfs/init && \
    dd if=/dev/zero of=/rootfs.ext4 bs=1M count=0 seek=256 && \
    mkfs.ext4 -F -d /rootfs /rootfs.ext4 && \
    resize2fs -M /rootfs.ext4

FROM --platform=linux/amd64 alpine:3.21
COPY --from=rootfs-builder /rootfs.ext4 /rootfs.ext4
ENTRYPOINT ["/bin/cp"]
CMD ["/rootfs.ext4", "/dest/firecracker-python-web.ext4"]
