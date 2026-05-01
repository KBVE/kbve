# ============================================================================
# steamcmd-ubuntu — Ubuntu 24.04 + steamcmd preinstalled
#
# Used for:
#   1. Local: generate Linux-flavored steamcmd config.vdf via interactive
#      `+login` once, capture for the GitHub secret. Image is throwaway —
#      no credentials baked in.
#   2. CI: ci-unity.yml `deploy_steam` step pulls this image to upload
#      builds via SteamPipe.
#
# Published as:
#   ghcr.io/kbve/steamcmd-ubuntu:24.04.X
#   ghcr.io/kbve/steamcmd-ubuntu:latest
# ============================================================================

FROM --platform=linux/amd64 ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# Steam runtime deps:
#   lib32gcc-s1   — steamcmd is a 32-bit binary on Linux, needs 32-bit gcc libs
#   ca-certificates — TLS for the Steam CDN
#   curl, tar      — fetch + extract the steamcmd self-update tarball
#   locales       — steamcmd misbehaves under POSIX-only locales on certain
#                   first-run paths
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        tar \
        lib32gcc-s1 \
        locales && \
    locale-gen en_US.UTF-8 && \
    rm -rf /var/lib/apt/lists/*

ENV LANG=en_US.UTF-8 \
    LC_ALL=en_US.UTF-8

# Install steamcmd into /opt/steamcmd. Run once with +quit so it pulls
# down its self-update bundle at image build time, not on first user run.
RUN mkdir -p /opt/steamcmd && \
    cd /opt/steamcmd && \
    curl -sL https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz \
        | tar -xzf - && \
    ./steamcmd.sh +quit || true

# Wrapper on PATH so callers can run `steamcmd` directly.
RUN ln -s /opt/steamcmd/steamcmd.sh /usr/local/bin/steamcmd

# Default working dir is /export — local users mount a host dir here to
# capture config.vdf:
#   docker run -it --rm -v ~/steam-export:/export ghcr.io/kbve/steamcmd-ubuntu \
#     bash -c 'steamcmd +login <user> +quit && cp /root/Steam/config/config.vdf /export/'
WORKDIR /export

ENTRYPOINT []
CMD ["steamcmd", "+quit"]
