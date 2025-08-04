####################
# Stage 1: Use Supabase's own Nix build system
####################
FROM nixos/nix:latest AS supabase-nix-builder

# Enable flakes and experimental features
RUN echo "experimental-features = nix-command flakes" >> /etc/nix/nix.conf

# Clone Supabase's PostgreSQL repository
WORKDIR /build
RUN nix-shell -p git --run "git clone https://github.com/supabase/postgres.git supabase-postgres"
WORKDIR /build/supabase-postgres

# Show what build targets are available
RUN nix flake show . | head -20

# Build PostgreSQL 17 with all Supabase extensions using their build system
RUN echo "=== Building PostgreSQL 17 with Supabase's Nix system ===" && \
    nix build .#psql_17/bin --out-link /supabase-postgresql && \
    echo "=== Build completed ===" && \
    ls -la /supabase-postgresql/ && \
    echo "=== PostgreSQL version ===" && \
    /supabase-postgresql/bin/pg_config --version && \
    echo "=== Library directory ===" && \
    echo $(/supabase-postgresql/bin/pg_config --pkglibdir) && \
    echo "=== Share directory ===" && \
    echo $(/supabase-postgresql/bin/pg_config --sharedir)

# Now let's add our kilobase extension to this build
COPY . /build/kilobase-source

# Install Rust in the Nix environment and build kilobase
RUN nix-shell -p rustc cargo pkg-config openssl --run " \
    cd /build/kilobase-source && \
    echo '=== Building kilobase extension with Supabase PostgreSQL ===' && \
    export PG_CONFIG=/supabase-postgresql/bin/pg_config && \
    \$PG_CONFIG --version && \
    cargo pgrx init --pg17 \$PG_CONFIG && \
    cargo pgrx package --pg-config \$PG_CONFIG --features pg17 --out-dir=./dist && \
    echo '=== Kilobase build verification ===' && \
    find ./dist -name '*.so' -o -name '*.control' -o -name '*.sql' | head -10 \
"

####################
# Stage 2: Create custom Nix derivation that includes kilobase
####################
FROM nixos/nix:latest AS custom-postgresql-builder

# Copy the Supabase PostgreSQL build
COPY --from=supabase-nix-builder /supabase-postgresql /supabase-postgresql
COPY --from=supabase-nix-builder /build/kilobase-source/dist /kilobase-dist

# Create a new Nix derivation that extends the Supabase PostgreSQL
RUN cat > /extend-supabase-postgresql.nix << 'EOF'
let
  pkgs = import <nixpkgs> {};
  
  # Reference the existing Supabase PostgreSQL build
  supabasePostgreSQL = /supabase-postgresql;
  
  # Create an extended version with kilobase
  extendedPostgreSQL = pkgs.stdenv.mkDerivation {
    name = "supabase-postgresql-with-kilobase";
    
    unpackPhase = "true";
    
    installPhase = ''
      # Start with the complete Supabase PostgreSQL installation
      cp -r ${supabasePostgreSQL} $out
      chmod -R +w $out
      
      # Add kilobase extension
      KILOBASE_LIB=$(find /kilobase-dist -name "kilobase.so")
      KILOBASE_CONTROL=$(find /kilobase-dist -name "kilobase.control")
      KILOBASE_SQL=$(find /kilobase-dist -name "kilobase*.sql")
      
      if [ -n "$KILOBASE_LIB" ]; then
        cp "$KILOBASE_LIB" $out/lib/
        echo "Copied kilobase.so"
      fi
      
      if [ -n "$KILOBASE_CONTROL" ]; then
        mkdir -p $out/share/postgresql/extension
        cp "$KILOBASE_CONTROL" $out/share/postgresql/extension/
        echo "Copied kilobase.control"
      fi
      
      if [ -n "$KILOBASE_SQL" ]; then
        cp $KILOBASE_SQL $out/share/postgresql/extension/
        echo "Copied kilobase SQL files"
      fi
      
      # Set proper permissions
      chmod 755 $out/lib/*.so 2>/dev/null || true
      chmod 644 $out/share/postgresql/extension/* 2>/dev/null || true
      

      echo "=== Extended PostgreSQL contents ==="
      ls -la $out/lib/ | grep kilobase || echo "No kilobase.so found"
      ls -la $out/share/postgresql/extension/ | grep kilobase || echo "No kilobase extension files found"
    '';
  };

in extendedPostgreSQL
EOF

# Build the extended PostgreSQL
RUN nix-build /extend-supabase-postgresql.nix --out-link /extended-postgresql && \
    echo "=== Extended PostgreSQL built ===" && \
    ls -la /extended-postgresql/ && \
    echo "=== Verification ===" && \
    ls -la /extended-postgresql/lib/ | grep kilobase || echo "kilobase.so not found" && \
    ls -la /extended-postgresql/share/postgresql/extension/ | grep kilobase || echo "kilobase extension files not found"

####################
# Stage 3: Final image based on Supabase but with our extensions
####################
FROM supabase/postgres:17.4.1.068

# Copy our extended PostgreSQL over the existing one
COPY --from=custom-postgresql-builder /extended-postgresql /nix/store/extended-postgresql

# Update the PATH to use our extended PostgreSQL
ENV PATH="/nix/store/extended-postgresql/bin:$PATH"

# Create symlinks to integrate with existing structure
RUN CURRENT_PG_STORE=$(readlink -f $(which pg_config) | sed 's|/bin/pg_config||') && \
    echo "=== Integrating extended PostgreSQL ===" && \
    echo "Current PostgreSQL: $CURRENT_PG_STORE" && \
    echo "Extended PostgreSQL: /nix/store/extended-postgresql" && \
    \
    # Backup current if needed and create links
    if [ -d "$CURRENT_PG_STORE/lib" ]; then \
        # Copy kilobase files to current location
        cp /nix/store/extended-postgresql/lib/kilobase.so "$CURRENT_PG_STORE/lib/" 2>/dev/null || \
        mkdir -p "$CURRENT_PG_STORE/lib" && cp /nix/store/extended-postgresql/lib/kilobase.so "$CURRENT_PG_STORE/lib/"; \
    fi && \
    \
    if [ -d "$CURRENT_PG_STORE/share" ]; then \
        # Copy kilobase extension files to current location
        cp /nix/store/extended-postgresql/share/postgresql/extension/kilobase* "$CURRENT_PG_STORE/share/postgresql/extension/" 2>/dev/null || \
        mkdir -p "$CURRENT_PG_STORE/share/postgresql/extension" && cp /nix/store/extended-postgresql/share/postgresql/extension/kilobase* "$CURRENT_PG_STORE/share/postgresql/extension/"; \
    fi && \
    \
    # Set ownership
    chown -R postgres:postgres "$CURRENT_PG_STORE/lib" "$CURRENT_PG_STORE/share" 2>/dev/null || true

# Final verification using the actual pg_config
RUN echo "=== Final Verification with Integrated Extensions ===" && \
    pg_config --version && \
    PG_LIBDIR=$(pg_config --pkglibdir) && \
    PG_SHAREDIR=$(pg_config --sharedir) && \
    echo "Library directory: $PG_LIBDIR" && \
    echo "Share directory: $PG_SHAREDIR" && \
    echo "Extensions found:" && \
    ls -la "$PG_LIBDIR" | grep kilobase || echo "kilobase.so not found in $PG_LIBDIR" && \
    ls -la "$PG_SHAREDIR/extension" | grep kilobase || echo "kilobase extension files not found in $PG_SHAREDIR/extension"

USER postgres