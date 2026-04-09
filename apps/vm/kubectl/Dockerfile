# ============================================================================
# kbve/kubectl — Alpine-based kubectl image with a proper shell.
#
# Replaces registry.k8s.io/kubectl (distroless, no /bin/sh) for use in
# Kubernetes Jobs that need shell scripts (autologon, runner install, etc.).
#
# Features:
#   - /bin/sh (busybox), curl, wget, jq, sed, grep
#   - Non-root user (uid 65534 / nobody)
#   - Read-only rootfs compatible
#   - seccompProfile / drop ALL capabilities safe
#
# Build:
#   docker build -t ghcr.io/kbve/kubectl:latest apps/vm/kubectl/
# ============================================================================

FROM alpine:3.21

ARG KUBECTL_VERSION=1.33.2

RUN apk add --no-cache \
        curl \
        wget \
        jq \
        ca-certificates && \
    curl -fSL "https://dl.k8s.io/release/v${KUBECTL_VERSION}/bin/linux/amd64/kubectl" \
        -o /usr/local/bin/kubectl && \
    chmod +x /usr/local/bin/kubectl && \
    kubectl version --client

USER 65534:65534

ENTRYPOINT ["kubectl"]
