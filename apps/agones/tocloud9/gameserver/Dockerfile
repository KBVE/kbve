# AzerothCore worldserver with ToCloud9 clustering AND mod-playerbots.
#
# No published image carries both, so we build it. Sources come from 3kynox's
# three-repo integration rather than the parent projects, because simply putting
# the module and the cluster core in one tree does not produce working bots:
# upstream mod-playerbots targets a standalone worldserver by design. Making
# bots cluster-aware (per-shard bot pool, cross-shard handoff, group invite
# accept, follow-when-grouped) is ~81 commits of module work plus matching core
# changes, and that is what these branches carry.
#
# Note on the base: the module branch sits on mod-playerbots'
# feature/new_rpg_and_nav_5_bash navigation/RPG overhaul (bash/hermensbas, not
# upstream yet) and the AC branch carries the matching mmaps core changes
# (PR #204). That pairing is load-bearing -- the mmaps format and the core that
# reads it must come from the same set, so do not bump one ref without the other.
#
# libsidecar is built from 3kynox's ToCloud9 fork, not walkline's, because their
# integration changes api/proto and shared/events. That is a wire-protocol
# change, so the Go microservices must be built from the same fork -- the
# published ghcr.io/walkline/* images will not interoperate with this worldserver.
#
# Separately, ToCloud9's own azerothcore Dockerfile still COPYs a patches/
# directory deleted in 530fe627, so it cannot build as-is. That is why
# gameserver-ac:master on ghcr is frozen at 2026-04-29 while every other
# ToCloud9 image is from 2026-08-15.

# All three pinned to the 20260728 snapshot of 3kynox's integration, which is a
# strict superset of the nav5 set named in their README (behind: 0 on all three).
# Pinned by SHA rather than branch: these are personal integration branches that
# get rebased and deleted as work is upstreamed, so a branch ref would silently
# change what we build -- or vanish.
ARG TOCLOUD9_REPO=https://github.com/3kynox/ToCloud9.git
ARG TOCLOUD9_REF=f878465721200739eaae27633f70f378ac280411
ARG AC_REPO=https://github.com/3kynox/azerothcore-wotlk.git
ARG AC_REF=35a34b6aaf1cd662c8ac164532a0d8ff1cbbf0cb
ARG PLAYERBOTS_REPO=https://github.com/3kynox/mod-playerbots.git
ARG PLAYERBOTS_REF=d9c80b3b27fcf09919c0e31c886bbaa70ef8193c

FROM ubuntu:22.04 AS source

ARG TOCLOUD9_REPO
ARG TOCLOUD9_REF
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && \
    apt-get install -y --no-install-recommends git ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /src
RUN git init tocloud9 && cd tocloud9 && \
    git remote add origin "${TOCLOUD9_REPO}" && \
    git fetch --depth 1 origin "${TOCLOUD9_REF}" && \
    git checkout FETCH_HEAD

FROM ubuntu:22.04 AS build-sidecar

ENV DEBIAN_FRONTEND=noninteractive

WORKDIR /build

RUN apt-get update && \
    apt-get install -y \
        git \
        cmake \
        make \
        gcc \
        g++ \
        build-essential \
        libssl-dev \
        zlib1g-dev \
        ca-certificates \
        pkg-config && \
    rm -rf /var/lib/apt/lists/*

# CMake resolves the proto path as an absolute /api/proto, not relative to the
# source tree, so this has to land at the filesystem root.
COPY --from=source /src/tocloud9/api/proto /api/proto
COPY --from=source /src/tocloud9/game-server/libsidecar-cpp /build/libsidecar-cpp

WORKDIR /build/libsidecar-cpp
RUN rm -rf build && mkdir build && cd build && \
    cmake .. \
        -DCMAKE_BUILD_TYPE=Release \
        -DBUILD_TESTS=OFF \
        -DUSE_SYSTEM_GRPC=OFF \
        -DUSE_SYSTEM_PROTOBUF=OFF && \
    cmake --build . --config Release -j $(nproc)

FROM ubuntu:22.04 AS build-core

ARG AC_REPO
ARG AC_REF
ARG PLAYERBOTS_REPO
ARG PLAYERBOTS_REF
ENV DEBIAN_FRONTEND=noninteractive

WORKDIR /

RUN apt-get update || true && \
    apt-get install -y --reinstall ubuntu-keyring && \
    apt-get update

RUN apt-get install -yq git clang cmake make gcc g++ libmysqlclient-dev libssl-dev libbz2-dev libreadline-dev libncurses-dev libboost-all-dev mysql-server p7zip
RUN update-alternatives --install /usr/bin/cc cc /usr/bin/clang 100
RUN update-alternatives --install /usr/bin/c++ c++ /usr/bin/clang 100

# Playerbots carries ~577 commits of core changes, so a shallow branch fetch is
# used rather than a pinned SHA. Pin AC_REF to a commit for a reproducible build.
RUN mkdir repo && cd repo && git init && \
    git remote add origin "${AC_REPO}" && \
    git fetch --depth 1 origin "${AC_REF}" && \
    git checkout FETCH_HEAD

# AzerothCore auto-detects anything under modules/ at cmake time.
RUN git clone --depth 1 --branch "${PLAYERBOTS_REF}" \
        "${PLAYERBOTS_REPO}" /repo/modules/mod-playerbots

COPY --from=build-sidecar /build/libsidecar-cpp/build/libsidecar.so ./repo/deps/libsidecar/libsidecar.so

# tc9_version.h is generated at libsidecar build time and is not vendored in the
# core tree, so it has to come from the same build as the .so or the ABI check
# in TC9GetVersion compares against the wrong version.
COPY --from=build-sidecar /build/libsidecar-cpp/build/generated/include/tc9_version.h ./repo/deps/libsidecar/include/tc9_version.h

WORKDIR /repo

RUN cd bin && \
    cmake .. -DUSE_REAL_LIBSIDECAR=ON \
        -DBoost_USE_STATIC_LIBS=ON \
        -DWITH_WARNINGS=1 \
        -DWITH_COREDEBUG=0 \
        -DUSE_COREPCH=1 \
        -DUSE_SCRIPTPCH=1 \
        -DTOOLS_BUILD=db-only \
        -DSCRIPTS=static \
        -DMODULES=static \
        -DSERVERS=1 \
        -DCMAKE_BUILD_TYPE=RelWithDebInfo \
        -DCMAKE_INSTALL_PREFIX=/repo/bin \
        -DBUILD_TESTING=0

RUN cp deps/libsidecar/libsidecar.so /usr/lib/libsidecar.so

WORKDIR /repo/bin

RUN cmake --build . --config "RelWithDebInfo" -j $(($(nproc) + 1))
RUN cmake --install . --config "RelWithDebInfo"

FROM ubuntu:22.04 AS db-import

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      libmysqlclient21 libreadline8 \
      gettext-base default-mysql-client && \
    rm -rf /var/lib/apt/lists/*

COPY --from=build-sidecar /build/libsidecar-cpp/build/libsidecar.so /usr/lib/libsidecar.so

# The binary hardcodes these paths.
COPY --from=build-core /repo/data /repo/data
COPY --from=build-core /repo/bin/bin/dbimport /repo/bin/dbimport
COPY --from=build-core /repo/bin/etc/dbimport.conf.dist /repo/bin/etc/dbimport.conf

COPY --from=source /src/tocloud9/sql/auth/mysql/ /repo/data/sql/custom/db_auth/
COPY --from=source /src/tocloud9/sql/characters/mysql/ /repo/data/sql/custom/db_characters/

# Unlike upstream's db-import image, this one is built from a tree containing
# mod-playerbots, so its dbimport knows about PlayerbotsDatabase and will apply
# modules/mod-playerbots/data/sql/playerbots into acore_playerbots.
COPY --from=build-core /repo/modules/mod-playerbots/data/sql /repo/modules/mod-playerbots/data/sql

WORKDIR /repo/bin

ENTRYPOINT ["./dbimport"]

FROM ubuntu:22.04 AS gameserver

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      libmysqlclient21 libreadline8 \
      gettext-base default-mysql-client && \
    rm -rf /var/lib/apt/lists/*

COPY --from=build-sidecar /build/libsidecar-cpp/build/libsidecar.so /usr/lib/libsidecar.so

COPY --from=build-core /repo/bin/etc/worldserver.conf.dist /repo/bin/etc/worldserver.conf

# 2699 lines of tuning, so it ships as a file rather than env overrides. Mount
# over /repo/bin/etc/playerbots.conf to change it without a rebuild.
COPY --from=build-core /repo/modules/mod-playerbots/conf/playerbots.conf.dist /repo/bin/etc/playerbots.conf

COPY --from=build-core /repo/bin/bin/worldserver /repo/bin/worldserver

WORKDIR /repo/bin

ENTRYPOINT ["./worldserver"]
