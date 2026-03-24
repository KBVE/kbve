import {
  createServiceClient,
  jsonResponse,
  requireAdmin,
  validateUuid,
  type OwsRequest,
} from "./_shared.ts";

export const MAINTENANCE_ACTIONS = [
  "cleanup_worldservers",
  "cleanup_map_instances",
  "status",
];

export async function handleMaintenance(req: OwsRequest): Promise<Response> {
  const adminErr = requireAdmin(req.claims);
  if (adminErr) return adminErr;

  switch (req.action) {
    case "cleanup_worldservers":
      return cleanupWorldServers(req);
    case "cleanup_map_instances":
      return cleanupMapInstances(req);
    case "status":
      return status(req);
    default:
      return jsonResponse(
        {
          error: `Unknown action: ${req.action}. Available: ${MAINTENANCE_ACTIONS.join(", ")}`,
        },
        400,
      );
  }
}

// ---------------------------------------------------------------------------
// maintenance.cleanup_worldservers
//
// Removes duplicate WorldServer rows (keeps lowest ID) and ensures the
// remaining server is marked active (ServerStatus=1).
//
// Body: { customer_guid }
// ---------------------------------------------------------------------------
async function cleanupWorldServers(req: OwsRequest): Promise<Response> {
  const { customer_guid } = req.body as { customer_guid?: string };

  const guidErr = validateUuid(customer_guid, "customer_guid");
  if (guidErr) return guidErr;

  const sb = createServiceClient();

  // Get all world servers for this customer
  const { data: servers, error: fetchErr } = await sb
    .schema("ows")
    .from("worldservers")
    .select("worldserverid, serverip, serverstatus, zonserverguid")
    .eq("customerguid", customer_guid!)
    .order("worldserverid", { ascending: true });

  if (fetchErr) {
    console.error("cleanup_worldservers fetch error:", fetchErr.message);
    return jsonResponse({ error: "Failed to fetch world servers" }, 500);
  }

  if (!servers || servers.length === 0) {
    return jsonResponse({ ok: true, message: "No world servers found", deleted: 0 });
  }

  // Keep the first (lowest ID), delete the rest
  const keepId = servers[0].worldserverid;
  const duplicateIds = servers
    .slice(1)
    .map((s) => s.worldserverid);

  let deleted = 0;
  if (duplicateIds.length > 0) {
    const { error: delErr, count } = await sb
      .schema("ows")
      .from("worldservers")
      .delete({ count: "exact" })
      .eq("customerguid", customer_guid!)
      .in("worldserverid", duplicateIds);

    if (delErr) {
      console.error("cleanup_worldservers delete error:", delErr.message);
      return jsonResponse({ error: "Failed to delete duplicate servers" }, 500);
    }
    deleted = count ?? duplicateIds.length;
  }

  // Ensure the remaining server is active
  const { error: activateErr } = await sb
    .schema("ows")
    .from("worldservers")
    .update({
      serverstatus: 1,
      activestarttime: new Date().toISOString(),
    })
    .eq("customerguid", customer_guid!)
    .eq("worldserverid", keepId);

  if (activateErr) {
    console.error("cleanup_worldservers activate error:", activateErr.message);
  }

  return jsonResponse({
    ok: true,
    kept_server_id: keepId,
    deleted,
    activated: !activateErr,
  });
}

// ---------------------------------------------------------------------------
// maintenance.cleanup_map_instances
//
// Removes stale MapInstances (status != 2, no update in > 1 hour).
//
// Body: { customer_guid }
// ---------------------------------------------------------------------------
async function cleanupMapInstances(req: OwsRequest): Promise<Response> {
  const { customer_guid } = req.body as { customer_guid?: string };

  const guidErr = validateUuid(customer_guid, "customer_guid");
  if (guidErr) return guidErr;

  const sb = createServiceClient();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { error: delErr, count } = await sb
    .schema("ows")
    .from("mapinstances")
    .delete({ count: "exact" })
    .eq("customerguid", customer_guid!)
    .neq("status", 2)
    .lt("lastupdatefromserver", oneHourAgo);

  if (delErr) {
    console.error("cleanup_map_instances error:", delErr.message);
    return jsonResponse({ error: "Failed to clean map instances" }, 500);
  }

  return jsonResponse({
    ok: true,
    deleted: count ?? 0,
  });
}

// ---------------------------------------------------------------------------
// maintenance.status
//
// Returns a snapshot of OWS infrastructure state for a customer:
// world servers, active map instances, online characters.
//
// Body: { customer_guid }
// ---------------------------------------------------------------------------
async function status(req: OwsRequest): Promise<Response> {
  const { customer_guid } = req.body as { customer_guid?: string };

  const guidErr = validateUuid(customer_guid, "customer_guid");
  if (guidErr) return guidErr;

  const sb = createServiceClient();

  const [serversRes, mapsRes, instancesRes, onlineRes] = await Promise.all([
    sb
      .schema("ows")
      .from("worldservers")
      .select("worldserverid, serverip, serverstatus, activestarttime, port")
      .eq("customerguid", customer_guid!),
    sb
      .schema("ows")
      .from("maps")
      .select("mapid, mapname, zonename, softplayercap, hardplayercap")
      .eq("customerguid", customer_guid!),
    sb
      .schema("ows")
      .from("mapinstances")
      .select(
        "mapinstanceid, worldserverid, mapid, port, status, numberofreportedplayers, lastupdatefromserver",
      )
      .eq("customerguid", customer_guid!),
    sb
      .schema("ows")
      .from("characters")
      .select("characterid, charname, mapname, serverip, lastactivity")
      .eq("customerguid", customer_guid!)
      .not("serverip", "is", null),
  ]);

  return jsonResponse({
    ok: true,
    world_servers: serversRes.data ?? [],
    maps: mapsRes.data ?? [],
    map_instances: instancesRes.data ?? [],
    online_characters: onlineRes.data ?? [],
  });
}
