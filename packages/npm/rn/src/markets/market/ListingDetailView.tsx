import { useEffect, useMemo, useState } from 'react';
import { createMarketApi } from './api';
import { ListingDetail } from './ListingDetail';

export interface ListingDetailViewProps {
	id: number;
	getToken: () => Promise<string | null>;
	baseUrl?: string;
	authenticated: boolean;
	onBack?: () => void;
}

export function ListingDetailView({
	id,
	getToken,
	baseUrl = '',
	authenticated,
	onBack,
}: ListingDetailViewProps) {
	const api = useMemo(
		() => createMarketApi({ getToken, baseUrl }),
		[getToken, baseUrl],
	);
	const [myAccount, setMyAccount] = useState<string | null>(null);
	useEffect(() => {
		if (!authenticated) {
			setMyAccount(null);
			return;
		}
		let live = true;
		void api.myAccountId().then((a) => {
			if (live) setMyAccount(a);
		});
		return () => {
			live = false;
		};
	}, [api, authenticated]);
	return (
		<ListingDetail
			api={api}
			listingId={id}
			authenticated={authenticated}
			myAccount={myAccount}
			onBack={
				onBack ??
				(() => {
					window.location.href = '/market/';
				})
			}
		/>
	);
}

export default ListingDetailView;
