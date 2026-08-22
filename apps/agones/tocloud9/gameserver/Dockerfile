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

RUN mkdir repo && cd repo && git init && \
    git remote add origin "${AC_REPO}" && \
    git fetch --depth 1 origin "${AC_REF}" && \
    git checkout FETCH_HEAD

# AzerothCore auto-detects anything under modules/ at cmake time.
# init+fetch rather than `clone --branch`: --branch only resolves branch and tag
# names, so it rejects the pinned commit SHA outright.
RUN mkdir -p /repo/modules/mod-playerbots && cd /repo/modules/mod-playerbots && \
    git init && \
    git remote add origin "${PLAYERBOTS_REPO}" && \
    git fetch --depth 1 origin "${PLAYERBOTS_REF}" && \
    git checkout FETCH_HEAD

# Vendored rather than cloned: this one lives in the monorepo, so it arrives as
# a named build context instead of a git fetch. Must land before cmake runs --
# AzerothCore enumerates modules/ at configure time, not build time.
COPY --from=modules mod-underbarrel-bootlegger /repo/modules/mod-underbarrel-bootlegger
COPY --from=modules mod-rent-a-mount /repo/modules/mod-rent-a-mount
COPY --from=modules mod-group-xp /repo/modules/mod-group-xp

COPY --from=build-sidecar /build/libsidecar-cpp/build/libsidecar.so ./repo/deps/libsidecar/libsidecar.so

# Header set matches ToCloud9 as of the pinned commit. Deliberately NO
# tc9_version.h: that header is generated by walkline's ABI-versioning work
# (cc31fa84, 2026-08-01), which lands AFTER the 2026-07-28 pin, so copying it
# fails the build outright. Add it only if TOCLOUD9_REF moves past that commit.
COPY --from=build-sidecar /build/libsidecar-cpp/include/libsidecar.h ./repo/deps/libsidecar/include/libsidecar.h
COPY --from=build-sidecar /build/libsidecar-cpp/include/events-guild.h ./repo/deps/libsidecar/include/events-guild.h
COPY --from=build-sidecar /build/libsidecar-cpp/include/events-group.h ./repo/deps/libsidecar/include/events-group.h
COPY --from=build-sidecar /build/libsidecar-cpp/include/events-servers-registry.h ./repo/deps/libsidecar/include/events-servers-registry.h
COPY --from=build-sidecar /build/libsidecar-cpp/include/player-items-api.h ./repo/deps/libsidecar/include/player-items-api.h
COPY --from=build-sidecar /build/libsidecar-cpp/include/player-money-api.h ./repo/deps/libsidecar/include/player-money-api.h
COPY --from=build-sidecar /build/libsidecar-cpp/include/player-interactions-api.h ./repo/deps/libsidecar/include/player-interactions-api.h
COPY --from=build-sidecar /build/libsidecar-cpp/include/battleground-api.h ./repo/deps/libsidecar/include/battleground-api.h
COPY --from=build-sidecar /build/libsidecar-cpp/include/monitoring.h ./repo/deps/libsidecar/include/monitoring.h

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

COPY --from=build-sidecar /build/libsidecar-cpp/build/libsidecar.so* /usr/lib/

# The binary hardcodes these paths.
COPY --from=build-core /repo/data /repo/data

# Drop two migrations that cannot apply to a fresh database. Both re-key
# petition_sign onto (petition_id, playerguid) and then DROP INDEX
# `idx_petition_id_player`, but the base dump already ships the
# post-migration schema and never creates that index, so the final statement
# always fails with
#   ERROR 1091: Can't DROP 'idx_petition_id_player'
# They are duplicates of each other (identical body, different parent
# revision) left behind when the base was regenerated -- a clean install of
# this branch cannot get past them.
#
# Removed rather than moved to archive/: dbimport replays archive/ on a fresh
# setup too, so relocating only changes the path in the error message.
# Both directories are cleaned, and the loop is guarded so this becomes a
# no-op once the upstream branch fixes it.
RUN for d in updates archive; do \
        for f in 2026_07_17_00.sql 2026_07_18_00.sql; do \
            if [ -f "/repo/data/sql/$d/db_characters/$f" ]; then \
                rm "/repo/data/sql/$d/db_characters/$f"; \
                echo "removed $d/db_characters/$f"; \
            fi; \
        done; \
    done
COPY --from=build-core /repo/bin/bin/dbimport /repo/bin/dbimport
COPY --from=build-core /repo/bin/etc/dbimport.conf.dist /repo/bin/etc/dbimport.conf

# NOTE: ToCloud9's own SQL deltas are deliberately NOT baked in here, unlike
# their upstream Dockerfile. This compose stack applies them in a separate
# tc9-sql step, so shipping them as custom updates too applies them twice --
# which fails on 000001_create_admin_account.sql with
# "Duplicate entry '1' for key 'account.PRIMARY'".

# Unlike upstream's db-import image, this one is built from a tree containing
# mod-playerbots, so its dbimport knows about PlayerbotsDatabase and will apply
# modules/mod-playerbots/data/sql/playerbots into acore_playerbots.
COPY --from=build-core /repo/modules/mod-playerbots/data/sql /repo/modules/mod-playerbots/data/sql

# mod-rent-a-mount's world SQL is applied HERE and nowhere else. It is
# deliberately absent from the gameserver stage: that fleet can surge to two
# pods during a rollout and DBUpdater carries no lock of any kind, so a
# worldserver able to see this SQL could race another applying it. This Job is
# an ArgoCD Sync hook in wave 1, ahead of the fleet, leaving a single writer.
COPY --from=build-core /repo/modules/mod-rent-a-mount/data/sql /repo/modules/mod-rent-a-mount/data/sql

WORKDIR /repo/bin

ENTRYPOINT ["./dbimport"]

FROM ubuntu:22.04 AS gameserver

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      libmysqlclient21 libreadline8 \
      gettext-base default-mysql-client && \
    rm -rf /var/lib/apt/lists/*

COPY --from=build-sidecar /build/libsidecar-cpp/build/libsidecar.so* /usr/lib/

COPY --from=build-core /repo/bin/etc/worldserver.conf.dist /repo/bin/etc/worldserver.conf

# AzerothCore loads module configs from etc/modules/, NOT etc/ -- a conf in
# etc/ is silently ignored and the module falls back to compiled-in defaults.
# 2699 lines of tuning, so it ships as a file rather than env overrides. Mount
# over /repo/bin/etc/modules/playerbots.conf to change it without a rebuild.
COPY --from=build-core /repo/modules/mod-playerbots/conf/playerbots.conf.dist /repo/bin/etc/modules/playerbots.conf

# worldserver -- not dbimport -- creates and migrates acore_playerbots, and it
# reads the SQL from this path at runtime, so the module's data/sql has to be
# present in the runtime image or startup fails with
#   Directory ".../data/sql/playerbots/base/" not exist
COPY --from=build-core /repo/modules/mod-playerbots/data/sql /repo/modules/mod-playerbots/data/sql

COPY --from=modules mod-underbarrel-bootlegger/kbve/mod_bootlegger.conf /repo/bin/etc/modules/mod_bootlegger.conf

# Conf only. This module's data/sql must NOT be copied here -- see the db-import
# stage for why.
COPY --from=modules mod-rent-a-mount/conf/mod_rent_a_mount.conf.dist /repo/bin/etc/modules/mod_rent_a_mount.conf

# Same reason cmake's install is not enough: module confs land in the build
# stage only, and an option absent from a loaded conf is not env-overridable, so
# AC_GROUP_XP_* would bind to nothing.
COPY --from=modules mod-group-xp/conf/mod_group_xp.conf.dist /repo/bin/etc/modules/mod_group_xp.conf

COPY --from=build-core /repo/bin/bin/worldserver /repo/bin/worldserver

WORKDIR /repo/bin

ENTRYPOINT ["./worldserver"]
