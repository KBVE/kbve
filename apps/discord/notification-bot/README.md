## Notification Bot

## Dev

Adding a dependency.
```shell
pnpm nx run notification-bot:add --name psutil
```

Removing a dependency.
```shell
pnpm nx run notification-bot:remove --name uvicorn
```

Starting an Orb/Local Container.
```shell
./kbve.sh -nx notification-bot:orb
```


## Version

v1.1 - Hello World base image deployment.
v1.2 - Discord Bot started.
v1.3 - Adding Sharding.
v1.4 - Adding Supabase Integration.
v1.5 - Granian/Rust HTTP added.
v1.6 - Fixing the shard mismatch.