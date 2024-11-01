## Fudster

A python library that helps with mL application development through using REST/WebSockets.


## Dev

These are notes for the development of the Fudster package.

### Packages

Here is the shell command to add a new package to the fudster package within the nx monorepo.

```shell

pnpm nx run fudster:add --name aiohttp
pnpm nx run fudster:add --name signalrcore

```

## Docker 

To build the base docker image and then run it:

```shell

pnpm nx container fudster
docker run -p 3000:3000 -p 3001:3001 -p 8086:8086 kbve/fudster:1.03

```