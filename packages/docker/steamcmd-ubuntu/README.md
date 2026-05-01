# steamcmd-ubuntu

Ubuntu 24.04 base image with `steamcmd` preinstalled at `/opt/steamcmd/`.

Used for:

1. **Local**: generate a Linux-flavored `steamcmd` `config.vdf` once (via interactive `+login` + Steam Guard mobile confirm), capture it for the `STEAM_CONFIG_VDF` GitHub secret. Image is throwaway — no credentials baked in.
2. **CI**: `ci-unity.yml`'s `deploy_steam` step uses this image to upload SteamPipe build artifacts.

## Local: capture config.vdf for the GitHub secret

```bash
mkdir -p ~/steam-export
docker run -it --rm \
    -v ~/steam-export:/export \
    ghcr.io/kbve/steamcmd-ubuntu:24.04 \
    bash
```

Inside the container:

```bash
steamcmd +login h0lybyte
# password prompt; then Steam Guard mobile confirm on phone
# wait for "OK", then:
quit

cp /root/Steam/config/config.vdf /export/
exit
```

Back on host:

```bash
ls -la ~/steam-export/config.vdf
base64 -i ~/steam-export/config.vdf -o /tmp/steam_config.b64
gh secret set STEAM_CONFIG_VDF --repo kbve/kbve < /tmp/steam_config.b64
rm -rf /tmp/steam_config.b64 ~/steam-export
```

## Image hygiene

- No credentials embedded — every consumer mounts its own `config.vdf` (via secret restore in CI, via volume mount locally).
- Self-update at build time so CI runs don't pay the bootstrap cost on first invocation.

## License

KBVE
