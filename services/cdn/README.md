# services/cdn

Static assets that are read from outside the site that stores them.

Every Astro app already serves its own `public/` tree, and that stays the right
home for an asset only that app renders. This directory is for the other case:
an image the root `README.md`, a GitHub social card, or an external page needs,
where "which app owns it" has no answer and the asset would otherwise be pulled
out of some product's `public/` by a URL that product never agreed to keep.

Nothing is deployed from here yet. The assets are served straight off the
repository over raw HTTPS, which is why the tree is committed as ordinary git
objects rather than LFS pointers -- an LFS pointer served raw is a text file,
not an image.

## Base URL

```
https://raw.githubusercontent.com/KBVE/kbve/main/services/cdn/assets
```

Pinned to `main` rather than a commit: the README on `main` and the assets it
names move together, and a pinned SHA would strand every image the first time
one is replaced.

When a real origin lands (`cdn.kbve.com`, an R2 bucket, an nginx pod in
`apps/kube/`), it fronts this same tree and the swap is one base URL across the
consumers listed below. Do not reshuffle the directory layout before then --
the paths under `assets/` are the contract.

## Consumers

| Consumer         | Uses               |
| ---------------- | ------------------ |
| Root `README.md` | `assets/readme/**` |

## assets/readme/

What the root README renders: `hero.webp`, `logo.svg`, the `app-*.webp`
showcase and the `pkg-*.webp` section marks.

These are downscaled derivatives, not masters. The masters stay where they
already live (`apps/kbve/astro-kbve/public/assets/images/brand/**`, each
product's own tree) and are not deleted or moved -- a product's `public/`
serves its own site and is not this directory's to empty.

## Adding an asset

1. Derive it at the width it renders at, in `webp`, and keep it under 150 KB.
   A README image is displayed at 400-900 px; shipping a 3 MB Steam capsule to
   render it at 640 px costs every visitor the difference.

    ```sh
    magick <master> -resize 640x -quality 80 services/cdn/assets/<lane>/<name>.webp
    ```

    `svg` is exempt from the format rule and passes through unchanged.

2. Do not add it to `.gitattributes` LFS tracking. See above.

3. `moon run cdn:check` -- guards format and size, and runs in CI as
   `cdn:lint`.
