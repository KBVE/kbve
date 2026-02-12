let
  pkgs = import <nixpkgs> {};

  supabasePostgreSQL = /supabase-postgresql;

  extendedPostgreSQL = pkgs.stdenv.mkDerivation {
    name = "supabase-postgresql-with-kilobase";

    unpackPhase = "true";

    installPhase = ''
      cp -r ${supabasePostgreSQL} $out
      chmod -R +w $out

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

      chmod 755 $out/lib/*.so 2>/dev/null || true
      chmod 644 $out/share/postgresql/extension/* 2>/dev/null || true

      echo "=== Extended PostgreSQL contents ==="
      ls -la $out/lib/ | grep kilobase || echo "No kilobase.so found"
      ls -la $out/share/postgresql/extension/ | grep kilobase || echo "No kilobase extension files found"
    '';
  };

in extendedPostgreSQL
