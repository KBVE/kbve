import { useQuery } from '@tanstack/react-query';
import { fetchMeta } from '../api/client';

// Thin banner shown only when the server reports dev mode (AUTH_MODE=remote):
// auth resolves against live Supabase while data lands in the local DB, and
// users are auto-provisioned. Renders nothing in prod.
export function DevBanner() {
	const { data } = useQuery({
		queryKey: ['meta'],
		queryFn: fetchMeta,
		staleTime: Infinity,
		retry: false,
	});

	if (!data?.dev) return null;

	return (
		<div className="bg-amber-500/15 px-4 py-1.5 text-center text-xs font-medium text-amber-300 ring-1 ring-inset ring-amber-500/30">
			Dev mode — auth verified against live Supabase, data written to the
			local DB (users auto-provisioned).
		</div>
	);
}
