const LINKS = [
	{ label: 'About', url: 'https://kbve.com/about/' },
	{ label: 'Legal', url: 'https://kbve.com/legal/' },
	{ label: 'Discord', url: 'https://kbve.com/discord/' },
];

export function Footer() {
	return (
		<footer className="flex flex-col items-center gap-2 py-12">
			<div className="flex gap-6">
				{LINKS.map((link) => (
					<a
						key={link.url}
						href={link.url}
						target="_blank"
						rel="noreferrer"
						className="text-xs text-quest-400 transition hover:text-quest-300">
						{link.label}
					</a>
				))}
			</div>
			<span className="text-xs text-zinc-500">© KBVE</span>
		</footer>
	);
}
