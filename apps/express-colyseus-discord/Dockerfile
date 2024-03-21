FROM ghcr.io/kbve/kbve:main as kbve

SHELL ["/bin/bash", "-c"]

RUN pnpm nx build express-colyseus-discord --export

COPY . .

# Final

#FROM ubuntu:22.04
FROM node:20-slim

WORKDIR /usr/src/app

COPY --from=kbve /usr/src/app/dist/apps/express-colyseus-discord/ ./

RUN npm install -g pnpm

RUN pnpm install --frozen-lockfile

EXPOSE 3000
CMD ["node", "main.js"]