## Fudster

A python library that helps with mL application development through using REST/WebSockets.


## Dev

These are notes for the development of the Fudster package.
The docker image is released under `kbve/fudster`.

### Packages

Here is the shell command to add a new package to the fudster package within the nx monorepo.

```shell

pnpm nx run fudster:add --name aiohttp
pnpm nx run fudster:add --name signalrcore

```

## Docker 

To build the base docker image and then run it:

```shell

./kbve.sh -nx fudster:orb

```

or to run them isolated:

```shell

pnpm nx container fudster
docker run -p 3000:3000 -p 3001:3001 -p 8086:8086 kbve/fudster:1.03

```


```json

    {
            "channel": "default",
            "content": {
                "command": "execute",
                "packageName": "net.runelite.client.plugins.microbot.kbve",
                "className": "KBVEScripts",
                "method": "AcceptEULA",
                "args": [300, 301],
                "priority": 1
            }
    },

    {
            "channel": "default",
            "content": {
                "command": "execute",
                "packageName": "net.runelite.client.plugins.microbot.util.security",
                "className": "Login",
                "method": "setWorld",
                "args": [308],
                "priority": 1
            }
    },

    {
        "channel": "default",
        "content": {
                "command": "execute",
                "packageName": "net.runelite.client.plugins.microbot.kbve",
                "className": "KBVEScripts",
                "method": "SafeLogin",
                "args": ["myUsername", "myPassword", "0000", 301],
                "priority": 1
            }
    },

    {
        "channel": "default",
        "content": {
                "command": "login",
                "username": "myUsername",
                "password": "myPassword",
                "bankpin": "0000",
                "world": "301"
            }
    }

```