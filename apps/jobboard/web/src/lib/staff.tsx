import { createContext, useContext, type ReactNode } from 'react';
import { useStaff } from '@kbve/rn/auth';

// One staff_permissions fetch per session, shared by the dashboard gate and the
// shell. Calling useStaff() in each spot re-ran the RPC and flashed the member
// view for staff while it re-resolved; the provider resolves it once.
type StaffState = ReturnType<typeof useStaff>;

const StaffContext = createContext<StaffState | null>(null);

export function StaffProvider({ children }: { children: ReactNode }) {
	const staff = useStaff();
	return (
		<StaffContext.Provider value={staff}>{children}</StaffContext.Provider>
	);
}

export function useStaffContext(): StaffState {
	const ctx = useContext(StaffContext);
	if (!ctx) {
		throw new Error('useStaffContext must be used within StaffProvider');
	}
	return ctx;
}
