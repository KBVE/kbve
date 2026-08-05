import { describe, it, expect } from 'vitest';
import {
	diskLabelFromPath,
	formatBytesBin,
	longhornLens,
	normalizeVolume,
	summarizeDisks,
	volumeHealth,
} from '../longhorn';
import type { RawLonghornNode, RawLonghornVolume } from '../longhorn';

const rawVolume: RawLonghornVolume = {
	name: 'pvc-37639f20-f478-418c-9f7f-9bf82de00f5d',
	size: '2147483648',
	state: 'attached',
	robustness: 'healthy',
	created: '2026-04-10T00:00:00Z',
	numberOfReplicas: 1,
	kubernetesStatus: {
		namespace: 'firecracker',
		pvcName: 'firecracker-rootfs',
		pvName: 'pvc-37639f20-f478-418c-9f7f-9bf82de00f5d',
		workloadsStatus: [{ workloadName: 'firecracker-vm', podName: 'fc-0' }],
	},
	replicas: [
		{
			name: 'r-4f939edb',
			mode: 'RW',
			running: true,
			hostId: 'talos-4bn-whr',
			diskPath: '/var/lib/longhorn',
		},
		{
			name: 'r-c4b9fcd4',
			running: false,
			hostId: 'talos-4bn-whr',
			diskPath: '/var/mnt/longhorn-sdb',
			failedAt: '2026-06-06T01:54:48Z',
		},
	],
	controllers: [{ actualSize: '1073741824', hostId: 'talos-4bn-whr' }],
};

const rawNodes: RawLonghornNode[] = [
	{
		name: 'talos-4bn-whr',
		disks: {
			'default-disk-080500000000': {
				path: '/var/lib/longhorn',
				storageMaximum: 957000000000,
				storageAvailable: 478000000000,
				storageScheduled: 444000000000,
				storageReserved: 286000000000,
			},
			'sdb-longhorn': {
				path: '/var/mnt/longhorn-sdb',
				storageMaximum: 959000000000,
				storageAvailable: 208000000000,
				storageScheduled: 1427000000000,
				storageReserved: 0,
			},
		},
	},
];

describe('Longhorn Adapter', () => {
	describe('diskLabelFromPath', () => {
		it('maps default path to sda', () => {
			expect(diskLabelFromPath('/var/lib/longhorn')).toBe('sda');
		});

		it('maps mounted disks by suffix', () => {
			expect(diskLabelFromPath('/var/mnt/longhorn-sdb')).toBe('sdb');
			expect(diskLabelFromPath('/var/mnt/longhorn-sdc')).toBe('sdc');
		});

		it('falls back to last segment then unknown', () => {
			expect(diskLabelFromPath('/mnt/extra')).toBe('extra');
			expect(diskLabelFromPath(undefined)).toBe('unknown');
		});
	});

	describe('normalizeVolume', () => {
		it('normalizes claim, sizes, disk, and replica counts', () => {
			const item = normalizeVolume(rawVolume);
			expect(item.claim).toBe('firecracker/firecracker-rootfs');
			expect(item.sizeBytes).toBe(2147483648);
			expect(item.actualSizeBytes).toBe(1073741824);
			expect(item.node).toBe('talos-4bn-whr');
			expect(item.diskLabel).toBe('sda');
			expect(item.replicaCount).toBe(2);
			expect(item.failedReplicas).toBe(1);
			expect(item.workloads).toBe('firecracker-vm');
		});

		it('falls back to volume name when kubernetesStatus is empty', () => {
			const item = normalizeVolume({ name: 'pvc-x' });
			expect(item.claim).toBe('pvc-x');
			expect(item.state).toBe('unknown');
			expect(item.diskLabel).toBe('unknown');
			expect(item.sizeBytes).toBe(0);
		});
	});

	describe('volumeHealth', () => {
		it('flags failed replicas as degraded even when robust', () => {
			expect(volumeHealth(normalizeVolume(rawVolume))).toBe('degraded');
		});

		it('classifies healthy, detached, faulted', () => {
			expect(
				volumeHealth(
					normalizeVolume({
						...rawVolume,
						replicas: [rawVolume.replicas![0]],
					}),
				),
			).toBe('healthy');
			expect(
				volumeHealth(normalizeVolume({ name: 'v', state: 'detached' })),
			).toBe('detached');
			expect(
				volumeHealth(
					normalizeVolume({ name: 'v', robustness: 'faulted' }),
				),
			).toBe('faulted');
		});
	});

	describe('summarizeDisks', () => {
		it('flattens node disk maps sorted by label', () => {
			const disks = summarizeDisks(rawNodes);
			expect(disks).toHaveLength(2);
			expect(disks[0].label).toBe('sda');
			expect(disks[1].label).toBe('sdb');
			expect(disks[1].scheduledBytes).toBe(1427000000000);
			expect(disks[1].node).toBe('talos-4bn-whr');
		});
	});

	describe('longhornLens', () => {
		it('groups by disk and computes stats with disk meta', () => {
			const item = normalizeVolume(rawVolume);
			expect(longhornLens.group?.(item)).toBe('Disk: sda');

			const stats = longhornLens.stats?.([item], summarizeDisks(rawNodes));
			const ids = (stats ?? []).map((s) => s.id);
			expect(ids).toContain('disk_sda');
			expect(ids).toContain('disk_sdb');
			const sdb = stats?.find((s) => s.id === 'disk_sdb');
			expect(sdb?.value).toBe('149%');
			expect(sdb?.tone).toBe('danger');
		});

		it('filters stale replicas', () => {
			const stale = longhornLens.filters?.find((f) => f.id === 'stale');
			expect(stale?.predicate(normalizeVolume(rawVolume))).toBe(true);
			expect(stale?.predicate(normalizeVolume({ name: 'v' }))).toBe(false);
		});
	});

	describe('formatBytesBin', () => {
		it('formats binary units', () => {
			expect(formatBytesBin(0)).toBe('0 B');
			expect(formatBytesBin(2147483648)).toBe('2.0 GiB');
			expect(formatBytesBin(1099511627776)).toBe('1.00 TiB');
		});
	});
});
