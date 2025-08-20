
{:ok, _} =
  Repo.transaction(fn ->
    [
      "drop publication if exists #{publication}",
      "create publication #{publication} for table public.realtime_messages",
      "grant all on table public.realtime_messages to anon",
      "grant all on table public.realtime_messages to postgres",
      "grant all on table public.realtime_messages to service_role",
      "grant all on table public.realtime_messages to authenticated"
    ]
    |> Enum.each(&query(Repo, &1, []))
  end)
