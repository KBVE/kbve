// OSRSExternalLinks - React nano component for OSRS card external links
// Provides Lucide icons with hover interactions
// Isolated component - no shared state or global dependencies

import { ExternalLink, Globe } from 'lucide-react';

interface Props {
	wikiUrl: string;
	geUrl: string;
}

const srOnlyStyle: React.CSSProperties = {
	position: 'absolute',
	width: '1px',
	height: '1px',
	padding: 0,
	margin: '-1px',
	overflow: 'hidden',
	clip: 'rect(0, 0, 0, 0)',
	whiteSpace: 'nowrap',
	border: 0,
};

export default function OSRSExternalLinks({ wikiUrl, geUrl }: Props) {
	return (
		<nav className="osrs-links-section" aria-label="External resources">
			<a
				href={wikiUrl}
				target="_blank"
				rel="noopener noreferrer"
				className="external-link">
				<ExternalLink size={16} aria-hidden="true" />
				OSRS Wiki
				<span style={srOnlyStyle}>(opens in new tab)</span>
			</a>
			<a
				href={geUrl}
				target="_blank"
				rel="noopener noreferrer"
				className="external-link">
				<Globe size={16} aria-hidden="true" />
				Grand Exchange
				<span style={srOnlyStyle}>(opens in new tab)</span>
			</a>
		</nav>
	);
}
