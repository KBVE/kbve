# Rust Profile Chisel by h0lybyte and special thanks to Fernando Silva for Chisel Go core.
FROM ubuntu:22.04 as OS_BUILDER

RUN apt-get update && apt-get update && apt-get install -y wget

WORKDIR /tmp

RUN wget https://go.dev/dl/go1.21.1.linux-amd64.tar.gz

RUN tar -xvf go1.21.1.linux-amd64.tar.gz
RUN mv go /usr/local
RUN GOBIN=/usr/local/bin/ /usr/local/go/bin/go install github.com/canonical/chisel/cmd/chisel@latest
WORKDIR /rootfs
RUN chisel cut --release ubuntu-22.04 --root /rootfs \
        base-files_base \
        base-files_release-info \
        ca-certificates_data \
        libgcc-s1_libs \
        libc6_libs \
        openssl_config

FROM kbve/rustprofile:latest as kbve

FROM scratch
COPY --from=OS_BUILDER /rootfs /
COPY --from=kbve /usr/src/app/rust_api_profile ./rust_api_profile
COPY --from=kbve /usr/lib/x86_64-linux-gnu/libmysqlclient.so.21 /usr/lib/x86_64-linux-gnu/libmysqlclient.so.21
COPY --from=kbve /usr/lib/x86_64-linux-gnu/libssl.so.3 /usr/lib/x86_64-linux-gnu/libssl.so.3
COPY --from=kbve /usr/lib/x86_64-linux-gnu/libcrypto.so.3 /usr/lib/x86_64-linux-gnu/libcrypto.so.3
COPY --from=kbve /usr/lib/x86_64-linux-gnu/libzstd.so.1 /usr/lib/x86_64-linux-gnu/libzstd.so.1
COPY --from=kbve /usr/lib/x86_64-linux-gnu/libstdc++.so.6 /usr/lib/x86_64-linux-gnu/libstdc++.so.6
EXPOSE 3000
ENTRYPOINT ["./rust_api_profile"]
