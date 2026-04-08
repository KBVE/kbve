import { jsonResponse } from "../_shared/supabase.ts";
import { requireServiceRole } from "../_shared/supabase.ts";
import type { OwsRequest } from "./_shared.ts";

// ---------------------------------------------------------------------------
// Firecracker MicroVM — OWS Admin Submodule
//
// Proxies VM lifecycle operations to the firecracker-ctl service.
// All actions require service_role JWT.
//
// Actions: status, create, list, destroy
// ---------------------------------------------------------------------------

const FIRECRACKER_URL =
  Deno.env.get("FIRECRACKER_URL") ??
  "http://firecracker-ctl.firecracker.svc.cluster.local:9001";

export const FIRECRACKER_ACTIONS = [
  "status",
  "create",
  "list",
  "destroy",
];

async function fcFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(`${FIRECRACKER_URL}${path}`, {
    ...init,
    signal: AbortSignal.timeout(30_000),
  });
  const body = await res.text();
  const contentType = res.headers.get("content-type") ?? "application/json";
  return new Response(body, {
    status: res.status,
    headers: { "Content-Type": contentType },
  });
}

export async function handleFirecracker(
  req: OwsRequest,
): Promise<Response> {
  const roleErr = requireServiceRole(req.claims);
  if (roleErr) return roleErr;

  switch (req.action) {
    case "status": {
      // GET /health from firecracker-ctl
      try {
        return await fcFetch("/health");
      } catch (err) {
        console.error("firecracker status error:", err);
        return jsonResponse(
          {
            status: "unreachable",
            error: "firecracker-ctl service is not reachable",
            url: FIRECRACKER_URL,
          },
          503,
        );
      }
    }

    case "create": {
      const { rootfs, vcpu_count, mem_size_mib, timeout_ms, entrypoint, env } =
        req.body;
      if (!rootfs || typeof rootfs !== "string") {
        return jsonResponse({ error: "rootfs is required (string)" }, 400);
      }
      if (!entrypoint || typeof entrypoint !== "string") {
        return jsonResponse({ error: "entrypoint is required (string)" }, 400);
      }

      try {
        return await fcFetch("/vm/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rootfs,
            vcpu_count: vcpu_count ?? 1,
            mem_size_mib: mem_size_mib ?? 128,
            timeout_ms: timeout_ms ?? 30000,
            entrypoint,
            env: env ?? {},
            boot_args: "console=ttyS0 reboot=k panic=1",
          }),
        });
      } catch (err) {
        console.error("firecracker create error:", err);
        return jsonResponse(
          { error: "Failed to create VM — firecracker-ctl unreachable" },
          503,
        );
      }
    }

    case "list": {
      try {
        return await fcFetch("/vm");
      } catch (err) {
        console.error("firecracker list error:", err);
        return jsonResponse(
          { error: "Failed to list VMs — firecracker-ctl unreachable" },
          503,
        );
      }
    }

    case "destroy": {
      const { vm_id } = req.body;
      if (!vm_id || typeof vm_id !== "string") {
        return jsonResponse({ error: "vm_id is required (string)" }, 400);
      }

      try {
        return await fcFetch(`/vm/${vm_id}`, { method: "DELETE" });
      } catch (err) {
        console.error("firecracker destroy error:", err);
        return jsonResponse(
          { error: "Failed to destroy VM — firecracker-ctl unreachable" },
          503,
        );
      }
    }

    default:
      return jsonResponse(
        {
          error: `Unknown firecracker action: ${req.action}. Available: ${FIRECRACKER_ACTIONS.join(", ")}`,
        },
        400,
      );
  }
}
