
Repo.transaction(fn ->
  case Repo.get_by(Tenant, external_id: tenant_name) do
    %Tenant{} = tenant -> Repo.delete!(tenant)
    nil -> {:ok, nil}
  end

  %Tenant{}
  |> Tenant.changeset(%{
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
          "db_host" => System.get_env("DB_HOST", "supabase-cluster-rw.kilobase.svc.cluster.local"),
          "db_user" => System.get_env("DB_USER", "supabase_admin"),
          "db_password" => System.get_env("DB_PASSWORD", "postgres"),
          "db_port" => System.get_env("DB_PORT", "5432"),
          "region" => "us-east-1",
          "poll_interval_ms" => 100,
          "poll_max_record_bytes" => 1_048_576,
          "ssl_enforced" => false
        }
      }
    ],
    "notify_private_alpha" => true
  })
  |> Repo.insert!()
end)
