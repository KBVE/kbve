# Worker

The `@kbve/worker` npm library aims to provide core web worker integration and improvements.
The goal of this library is to provide a worker pool, remote wasm abstraction and several other unique features.


## SupaWorker


## Minion

A completely isolated web worker that can be called and managed by other more complex web workers, such as the Warden.

## Warden

The Warden is the holder of the minion pool and acts as the single instance of contact.
This gives the Warden the management of the minion, a reference to worker threads, and allows the developer and user to contain communications.
Our goal with the Warden system is to offload a large portion of tasks, key-value storage, edge functions, dynamic wasm integrations and so much more into a core set of libraries that can be accessed and utilized anywhere.
There would be costs with the edge functions but we want to make sure that it is all handled without any major problems.

The Warden package is currently a Work in Progress, as there are a couple deadlocks that get created and its a bit tough to resolve them.

## Install

To install the Worker, use npm, yarn or pnpm:

```bash

pnpm install @kbve/worker

```

## Building via Nx

Run `nx build worker` to build the library.

## Running unit tests via Nx

Run `nx test worker` to execute the unit tests via [Vitest](https://vitest.dev/).
