# Mock stack

The docker-compose stack behind `moon run discordsh-web-e2e:e2e-mock`, which runs
[`../e2e/mock-api.spec.ts`](../e2e/mock-api.spec.ts) against it.

```
docker-compose.yaml
├── mockoon-github  (port 4010) — mockoon/cli serving mockoon/github-mock.json
└── discordsh       (port 4321) — the axum service, GITHUB_API_BASE_URL → the mock
```

## Running it

```bash
moon run discordsh-web-e2e:e2e-mock
```

The task builds `kbve/discordsh:<Cargo version>`, passes the tag through
`DISCORDSH_IMAGE`, and tears the stack down afterwards. To bring it up by hand:

```bash
docker compose -f apps/discordsh/web/e2e/mock/docker-compose.yaml up --build
```

Mockoon comes up first (healthchecked); the service starts once it is healthy.

## What the GitHub mock serves

`mockoon/github-mock.json` answers `KBVE/kbve` issue and pull routes with canned
payloads shaped like the real API, plus three error owners for negative paths:

```bash
curl http://localhost:4010/repos/KBVE/kbve/issues | jq .

curl http://localhost:4010/repos/unauthorized/test/issues  # -> 401
curl http://localhost:4010/repos/forbidden/test/issues     # -> 403
curl http://localhost:4010/repos/notfound/test/issues      # -> 404
```

Logs:

```bash
docker compose -f apps/discordsh/web/e2e/mock/docker-compose.yaml logs -f mockoon-github
```

## Limitations

`GITHUB_API_BASE_URL` is read by the **bot** (`apps/discordsh/bot/src/discord/`),
not by the API this stack runs, so the redirect is wired but inert here. Running
the bot image instead needs a real `DISCORD_TOKEN` — serenity accepts no mock for
the gateway, and the bot process exits when the gateway fails, which takes the
whole stack down under `--abort-on-container-exit`.

The canned responses are static. Dynamic scenarios mean editing the Mockoon JSON
or reaching for Mockoon's templating.
