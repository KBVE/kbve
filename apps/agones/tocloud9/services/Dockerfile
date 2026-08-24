# All ToCloud9 Go microservices in one image.
#
# Upstream ships a Dockerfile per service, but every one of them is the same
# three lines against the same Go module:
#
#   go build apps/<svc>/cmd/<svc>/main.go   ->   static CGO_ENABLED=0 binary
#   COPY into alpine, ENTRYPOINT the binary
#
# Publishing thirteen near-identical images would mean thirteen manifest
# entries, thirteen version.toml files and thirteen `go mod download` passes in
# CI. Instead this builds every binary in a single pass -- one module download,
# one shared build cache -- and each Kubernetes Deployment selects its service
# with an explicit `command:`, e.g. command: ["/app/gateway"].
#
# The binaries are static, so there is nothing to configure per service beyond
# the entrypoint; behaviour is driven entirely by environment variables.
#
# Sources come from the KBVE fork rather than walkline's, because the
# playerbots integration it carries adds RPCs the upstream services do not implement
# (guild creation in cluster mode, the guild bank). The additions are wire
# compatible -- both proto changes are purely additive, +238/-0 and +71/-0 --
# so a mixed stack degrades rather than breaks, but the worldserver does call
# CreateGuild, which upstream would answer UNIMPLEMENTED.
#
# Keep this ref in lockstep with gameserver/Dockerfile's TOCLOUD9_REF: libsidecar
# is compiled into the worldserver from the same tree that produces these
# services, and the two speak the gRPC contract defined in api/proto.

ARG TOCLOUD9_REPO=https://github.com/KBVE/ToCloud9.git
ARG TOCLOUD9_REF=b594332501af67d7504d35ded9ef736bd78645a1

FROM --platform=${BUILDPLATFORM} golang:1.23-alpine AS build

ARG TOCLOUD9_REPO
ARG TOCLOUD9_REF
ARG TARGETOS
ARG TARGETARCH

RUN apk add --no-cache git ca-certificates

WORKDIR /src
RUN git init . && \
    git remote add origin "${TOCLOUD9_REPO}" && \
    git fetch --depth 1 origin "${TOCLOUD9_REF}" && \
    git checkout FETCH_HEAD

RUN go mod download

# Built with an explicit -o because `go build main.go` names the output after
# the file, and servers-registry's hyphen would not survive the default naming.
#
# apps/perun is deliberately absent: it carries its own go.mod, so it is a
# separate module and the root build cannot resolve its internal packages
# ("no required module provides package .../apps/perun/internal/config").
# It is not part of this stack; add a dedicated build stage if that changes.
RUN set -eux; \
    mkdir -p /out; \
    for svc in \
        auctionhouse \
        authserver \
        charserver \
        chatserver \
        gateway \
        groupserver \
        guidserver \
        guildserver \
        mailserver \
        matchmakingserver \
        mysqlreverseproxy \
        servers-registry \
    ; do \
        echo "building ${svc}"; \
        CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} \
            go build -ldflags="-w -s" -o "/out/${svc}" "./apps/${svc}/cmd/${svc}/main.go"; \
    done; \
    ls -la /out

FROM alpine:3.19

# The Go services dial gRPC and NATS over TLS in some deployments, and a
# scratch alpine has no root store.
RUN apk add --no-cache ca-certificates

WORKDIR /app
COPY --from=build /out/ /app/

# No ENTRYPOINT on purpose: this image carries thirteen services and the
# Deployment picks one, e.g.
#   command: ["/app/gateway"]
# Left without a default so a manifest that forgets to choose fails loudly
# instead of silently starting the wrong service.
CMD ["/bin/sh", "-c", "echo 'tocloud9-services: set command: to one of' >&2; ls /app >&2; exit 1"]
