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

v1.1.0  - Hello World base image deployment.
v1.2.0  - Discord Bot started.
v1.3.0  - Adding Sharding.
v1.4.0  - Adding Supabase Integration.
v1.5.0  - Granian/Rust HTTP added.
v1.6.0  - Fixing the shard mismatch.
v1.7.0  - Reverting to automatic shards.
v1.7.1  - Fixing the smaller issue of the status message.
v1.7.2  - Adjusting Auto Scaling / Distributed Sharding