# Atlas

Atlas is a basic machine learning library that is designed to help provide a building block or base for more abstract applications.
The goal of this package is to be extendable and provide future hackathons a quick proof of concept, no longer worrying about setting up the python poetry or auth integrations.

## Packages

To add a dependency into the `Atlas` project, we can utilize the nx monorepo tooling to help streamline it.
Here is the shell command to add a new package:

```shell

pnpm nx run atlas:add --name aiohttp
pnpm nx run atlas:add --name signalrcore

```

## Docker 

To build the docker image and then run it:

```shell

pnpm nx container atlas
docker run -p 3000:3000 -p 3001:3001 -p 8086:8086 kbve/atlas:1.42

```

```json
    {
        "channel": "default",
        "content": {
                "command": "execute",
                "packageName": "net.runelite.client.plugins.microbot.util.security",
                "className": "Login",
                "method": "Login",
                "args": ["myUsername", "myPassword", 301],
                "priority": 1
            }
    }
```