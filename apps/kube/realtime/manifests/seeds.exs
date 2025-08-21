require Logger
alias Realtime.{Api.Tenant, Repo}
import Ecto.Adapters.SQL, only: [query: 3]

# =============================================================================
# CONFIGURATION
# =============================================================================

tenant_name = System.get_env("TENANT_NAME", "realtime")
publication = "supabase_realtime"

env = if :ets.whereis(Mix.State) != :undefined, do: Mix.env(), else: :prod
default_db_host = if env in [:dev, :test], do: "localhost", else: "supabase-cluster-rw.kilobase.svc.cluster.local"


# =============================================================================
# TENANT SETUP (Update existing or create new)
# =============================================================================

Logger.info("Setting up tenant: #{tenant_name}")

tenant_result = Repo.transaction(fn ->
  # Prepare tenant attributes
  tenant_attrs = %{
    "name" => tenant_name,
    "external_id" => tenant_name,
    "jwt_secret" =>
      System.get_env("API_JWT_SECRET", "super-secret-jwt-token-with-at-least-32-characters-long"),
    "jwt_jwks" => System.get_env("API_JWT_JWKS") |> then(fn v -> if v, do: Jason.decode!(v) end),
    "extensions" => [
      %{
        "type" => "postgres_cdc_rls",
        "settings" => %{
          "db_name" => System.get_env("DB_NAME", "supabase"),
          "db_host" => System.get_env("DB_HOST", default_db_host),
          "db_user" => System.get_env("DB_USER", "supabase_admin"),
          "db_password" => System.get_env("DB_PASSWORD", "postgres"),
          "db_port" => System.get_env("DB_PORT", "5432"),
          "region" => System.get_env("AWS_REGION", "us-east-1"),
          "poll_interval_ms" => System.get_env("POLL_INTERVAL_MS", "100") |> String.to_integer(),
          "poll_max_record_bytes" => 1_048_576,
          "ssl_enforced" => System.get_env("DB_SSL_ENFORCED", "false") == "true"
        }
      }
    ],
    "notify_private_alpha" => true
  }

  # Check if tenant exists
  case Repo.get_by(Tenant, external_id: tenant_name) do
    nil ->
      # Create new tenant
      Logger.info("  Creating new tenant...")
      %Tenant{}
      |> Tenant.changeset(tenant_attrs)
      |> Repo.insert!()

    %Tenant{} = existing_tenant ->
      # Update existing tenant
      Logger.info("  Updating existing tenant...")
      existing_tenant
      |> Tenant.changeset(tenant_attrs)
      |> Repo.update!()
  end
end)


# =============================================================================
# PUBLICATION SETUP
# =============================================================================

Logger.info("Setting up publication: #{publication}")


publication_result = Repo.transaction(fn ->
  # First check if publication exists
  check_sql = """
  SELECT EXISTS (
    SELECT 1 FROM pg_publication
    WHERE pubname = $1
  )
  """

  publication_exists = case query(Repo, check_sql, [publication]) do
    {:ok, %{rows: [[true]]}} -> true
    _ -> false
  end

  if publication_exists do
    Logger.info("  Publication already exists, checking if table is included...")

    # Check if our table is in the publication
    check_table_sql = """
    SELECT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = $1
      AND schemaname = 'public'
      AND tablename = 'realtime_messages'
    )
    """

    table_in_publication = case query(Repo, check_table_sql, [publication]) do
      {:ok, %{rows: [[true]]}} -> true
      _ -> false
    end

    unless table_in_publication do
      Logger.info("  Adding table to existing publication...")
      query(Repo, "ALTER PUBLICATION #{publication} ADD TABLE public.realtime_messages", [])
    else
      Logger.info("  Table already in publication, skipping...")
    end
  else
    Logger.info("  Creating new publication...")
    query(Repo, "CREATE PUBLICATION #{publication} FOR TABLE public.realtime_messages", [])
  end

  # Always ensure permissions are set correctly
  permission_sqls = [
    "GRANT ALL ON TABLE public.realtime_messages TO authenticated",
    "GRANT ALL ON TABLE public.realtime_messages TO postgres",
    "GRANT ALL ON TABLE public.realtime_messages TO service_role",
    "GRANT ALL ON TABLE public.realtime_messages TO anon"  # Remove this line if you don't want guest access
  ]

  Enum.each(permission_sqls, fn sql ->
    Logger.info("  Setting permissions: #{String.slice(sql, 0, 60)}...")

    case query(Repo, sql, []) do
      {:ok, _} ->
        :ok
      {:error, %{postgres: %{code: :undefined_table}}} ->
        Logger.warning("Table public.realtime_messages doesn't exist yet")
        Logger.warning("Make sure to run the schema creation SQL first")
        throw(:table_not_found)
      {:error, reason} ->
        Logger.error("Failed: #{inspect(reason)}")
        throw({:error, reason})
    end
  end)
end)

case publication_result do
  {:ok, _} ->
    Logger.info("Publication setup successful")
  {:error, :table_not_found} ->
    Logger.warning("Publication setup skipped - table doesn't exist")
    Logger.warning("Run your schema SQL files first, then re-run seeds")
  {:error, reason} ->
    Logger.error("Publication setup failed: #{inspect(reason)}")
    raise "Failed to setup publication: #{inspect(reason)}"
end
