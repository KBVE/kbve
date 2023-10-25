//import tw from 'twin.macro';

/* eslint-disable-next-line */
export interface ReactAppwriteProps {}

export function ReactAppwrite(props: ReactAppwriteProps) {
	return (
		<>
			<div className="px-4 py-3">
				<span className="block text-sm text-white">Guest</span>
				<span className="block text-sm truncate text-zinc-400">
					hi@kbve.com
				</span>
			</div>
			<ul className="py-2" aria-labelledby="user-menu-button">
				<li>
					<a
						href="/#"
						className="block px-4 py-2 text-sm hover:bg-zinc-600 text-zinc-200 hover:text-white">
						Dashboard
					</a>
				</li>
				<li>
					<a
						href="/#"
						className="block px-4 py-2 text-sm hover:bg-zinc-600 text-zinc-200 hover:text-white">
						Settings
					</a>
				</li>
				<li>
					<a
						href="/#"
						className="block px-4 py-2 text-sm hover:bg-zinc-600 text-zinc-200 hover:text-white">
						Earnings
					</a>
				</li>
				<li>
					<a
						href="/#"
						className="block px-4 py-2 text-sm hover:bg-zinc-600 text-zinc-200 hover:text-white">
						Sign out
					</a>
				</li>
			</ul>
		</>
	);
}

export default ReactAppwrite;
