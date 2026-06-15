import { useEffect, useState } from 'react';
import { useKbve } from './KbveProvider';

export const StaffPermission = {
	STAFF: 0x1,
	MODERATOR: 0x2,
	ADMIN: 0x4,
	DASHBOARD_VIEW: 0x100,
	DASHBOARD_MANAGE: 0x200,
	USER_VIEW: 0x400,
	USER_MANAGE: 0x800,
	CONTENT_MODERATE: 0x1000,
	CONTENT_DELETE: 0x2000,
	STAFF_GRANT: 0x10000,
	STAFF_REVOKE: 0x20000,
	SYSTEM_CONFIG: 0x40000,
	AUDIT_VIEW: 0x80000,
	SUPERADMIN: 0x40000000,
} as const;

export interface StaffState {
	permissions: number;
	isStaff: boolean;
	loading: boolean;
	has: (bit: number) => boolean;
}

export function useStaff(): StaffState {
	const { client } = useKbve();
	const [permissions, setPermissions] = useState<number | null>(null);

	useEffect(() => {
		let active = true;
		void client
			.rpc('staff_permissions')
			.then(({ data, error }: { data: unknown; error: unknown }) => {
				if (!active) return;
				setPermissions(!error && typeof data === 'number' ? data : 0);
			});
		return () => {
			active = false;
		};
	}, [client]);

	const perms = permissions ?? 0;
	const isSuper = (perms & StaffPermission.SUPERADMIN) !== 0;
	return {
		permissions: perms,
		isStaff: perms > 0,
		loading: permissions === null,
		has: (bit) => isSuper || (perms & bit) !== 0,
	};
}
