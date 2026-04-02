/**
 * Firecracker microVM client for edge functions.
 *
 * Usage:
 *   import { createVM, getResult, destroyVM } from "../_shared/firecracker.ts";
 *
 *   const vm = await createVM({
 *     rootfs: "alpine-minimal",
 *     vcpu_count: 1,
 *     mem_size_mib: 128,
 *     timeout_ms: 30000,
 *     entrypoint: "/usr/local/bin/worker",
 *     env: { TASK: "compute", INPUT: payload },
 *   });
 *
 *   const result = await getResult(vm.vm_id);
 */

const FIRECRACKER_URL =
  Deno.env.get("FIRECRACKER_URL") ?? "http://firecracker-ctl:9001";

export interface CreateVMRequest {
  rootfs: string;
  vcpu_count?: number;
  mem_size_mib?: number;
  timeout_ms?: number;
  entrypoint: string;
  env?: Record<string, string>;
  boot_args?: string;
}

export interface VMInfo {
  vm_id: string;
  status: "creating" | "running" | "completed" | "failed" | "timeout";
  created_at: string;
}

export interface VMResult {
  vm_id: string;
  status: "completed" | "failed" | "timeout";
  exit_code: number;
  stdout: string;
  stderr: string;
  duration_ms: number;
}

export async function createVM(req: CreateVMRequest): Promise<VMInfo> {
  const res = await fetch(`${FIRECRACKER_URL}/vm/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rootfs: req.rootfs,
      vcpu_count: req.vcpu_count ?? 1,
      mem_size_mib: req.mem_size_mib ?? 128,
      timeout_ms: req.timeout_ms ?? 30000,
      entrypoint: req.entrypoint,
      env: req.env ?? {},
      boot_args: req.boot_args ?? "console=ttyS0 reboot=k panic=1",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`firecracker-ctl create failed (${res.status}): ${body}`);
  }

  return await res.json();
}

export async function getResult(vmId: string): Promise<VMResult> {
  const res = await fetch(`${FIRECRACKER_URL}/vm/${vmId}/result`);

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`firecracker-ctl result failed (${res.status}): ${body}`);
  }

  return await res.json();
}

export async function getStatus(vmId: string): Promise<VMInfo> {
  const res = await fetch(`${FIRECRACKER_URL}/vm/${vmId}`);

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`firecracker-ctl status failed (${res.status}): ${body}`);
  }

  return await res.json();
}

export async function destroyVM(vmId: string): Promise<void> {
  const res = await fetch(`${FIRECRACKER_URL}/vm/${vmId}`, {
    method: "DELETE",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`firecracker-ctl delete failed (${res.status}): ${body}`);
  }
}

/**
 * Create a VM, poll until completion, and return the result.
 * Convenience wrapper for simple request/response workloads.
 */
export async function runVM(
  req: CreateVMRequest,
  pollIntervalMs = 500,
): Promise<VMResult> {
  const vm = await createVM(req);
  const deadline = Date.now() + (req.timeout_ms ?? 30000) + 5000;

  while (Date.now() < deadline) {
    const info = await getStatus(vm.vm_id);
    if (
      info.status === "completed" ||
      info.status === "failed" ||
      info.status === "timeout"
    ) {
      return await getResult(vm.vm_id);
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  await destroyVM(vm.vm_id);
  throw new Error(`VM ${vm.vm_id} timed out waiting for result`);
}
