import {
	KbveProvider,
	AccountScreen,
	KBVE_SUPABASE_URL,
	KBVE_SUPABASE_ANON_KEY,
} from '@kbve/rn/account';

export default function ReactAccountRN() {
	return (
		<KbveProvider
			supabaseUrl={KBVE_SUPABASE_URL}
			anonKey={KBVE_SUPABASE_ANON_KEY}>
			<AccountScreen
				onOpenUrl={(url) => {
					window.location.href = url;
				}}
			/>
		</KbveProvider>
	);
}
