# Stage 1: Bake version.toml into a TypeScript module.
# Worker isolates run in a sandbox that blocks Deno.readTextFile outside
# the service path, so the manifest must be an importable module.
FROM alpine:3.21 AS baker

COPY ./version.toml /tmp/version.toml

RUN set -eu; \
    TOML="/tmp/version.toml"; \
    OUT="/tmp/manifest.ts"; \
    VERSION=$(grep '^version' "$TOML" | head -1 | sed 's/.*"\(.*\)"/\1/'); \
    FUNCS="["; FIRST=true; NAME=""; LABEL=""; DESC=""; \
    while IFS= read -r line; do \
      case "$line" in \
        "[[functions]]") \
          if [ -n "$NAME" ]; then \
            $FIRST || FUNCS="${FUNCS},"; \
            FUNCS="${FUNCS}{\"name\":\"${NAME}\",\"label\":\"${LABEL}\",\"description\":\"${DESC}\"}"; \
            FIRST=false; \
          fi; \
          NAME=""; LABEL=""; DESC=""; ;; \
        name\ =\ *)   NAME=$(echo "$line" | sed 's/.*"\(.*\)"/\1/') ;; \
        label\ =\ *)  LABEL=$(echo "$line" | sed 's/.*"\(.*\)"/\1/') ;; \
        description\ =\ *) DESC=$(echo "$line" | sed 's/.*"\(.*\)"/\1/') ;; \
      esac; \
    done < "$TOML"; \
    if [ -n "$NAME" ]; then \
      $FIRST || FUNCS="${FUNCS},"; \
      FUNCS="${FUNCS}{\"name\":\"${NAME}\",\"label\":\"${LABEL}\",\"description\":\"${DESC}\"}"; \
    fi; \
    FUNCS="${FUNCS}]"; \
    printf '// Auto-generated from version.toml — do not edit.\nexport const VERSION = "%s";\nexport const FUNCTIONS: { name: string; label: string; description: string }[] = %s;\n' \
      "$VERSION" "$FUNCS" > "$OUT"

# Stage 2: Production edge-runtime image.
FROM supabase/edge-runtime:v1.70.5

COPY ./version.toml /home/deno/version.toml
COPY ./functions /home/deno/functions
COPY --from=baker /tmp/manifest.ts /home/deno/functions/_shared/manifest.ts
