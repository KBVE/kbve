# ============================================================================
# kbve/aria2-proxy — Alpine download proxy for KubeVirt VM provisioning.
#
# Bakes aria2 + python3 into a self-contained image so the VM's download
# proxy deployment does not have to `apk add aria2` on every pod start.
# That pattern adds a 30+ second cold-start penalty and makes the proxy
# dependent on upstream Alpine mirror availability exactly when it's
# needed (during CI build stages).
#
# The image is used by BOTH containers in the download-proxy Deployment:
#   - `aria2`       runs `aria2c --enable-rpc ...`
#   - `file-server` runs `python3 -m http.server 8080`
# Both bind into the same shared PVC mounted at /downloads and share the
# pod network namespace, so this single image serves both roles.
#
# Build:
#   docker build -t ghcr.io/kbve/aria2-proxy:latest apps/vm/aria2-proxy/
# ============================================================================

FROM --platform=linux/amd64 alpine:3.21 AS runtime

# aria2: the downloader itself. Includes resume + multi-connection + RPC.
# python3: for the http.server side-container. No extra packages needed.
# ca-certificates: aria2 validates HTTPS cert chains for upstream sources.
# tini: PID 1 reaper so kubelet's SIGTERM cleanly stops a long download.
RUN apk add --no-cache \
        aria2 \
        python3 \
        ca-certificates \
        tini \
    && addgroup -g 1000 appgroup \
    && adduser -D -u 1000 -G appgroup -s /sbin/nologin appuser \
    && mkdir -p /downloads \
    && chown appuser:appgroup /downloads

# Non-root by default. The downloads volume is chowned at image build
# so a mounted emptyDir scratch volume works without an init container;
# a PVC mounted here will use its own fsGroup (1000 in the Deployment).
USER 1000:1000
WORKDIR /downloads

# RPC (6800) for aria2 JSON-RPC callers; HTTP (8080) for the file-server.
EXPOSE 6800 8080

# tini forwards SIGTERM so kubelet's graceful shutdown actually stops
# whatever process the container is running.
ENTRYPOINT ["/sbin/tini", "--"]

# No default CMD — the Deployment sets `command:` per container
# (aria2c for one, `python3 -m http.server 8080` for the other).
