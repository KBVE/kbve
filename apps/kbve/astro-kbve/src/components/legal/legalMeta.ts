export type LegalKind = 'policy' | 'permissive' | 'copyleft' | 'content';

export interface LegalMeta {
	/** Which rail group the page belongs to. */
	kind: LegalKind;
	/** SPDX identifier, or the document type for policies. */
	spdx: string;
	/** One-line "what this obliges you to do", shown as a hero stat. */
	obligation: string;
	/** Hero accent; one hue per kind so the section reads as a set. */
	accent: string;
}

const KIND_LABELS: Record<LegalKind, string> = {
	policy: 'Policy',
	permissive: 'Permissive license',
	copyleft: 'Copyleft license',
	content: 'Content license',
};

const ACCENTS: Record<LegalKind, string> = {
	policy: '#38bdf8',
	permissive: '#34d399',
	copyleft: '#fbbf24',
	content: '#c084fc',
};

const entry = (
	kind: LegalKind,
	spdx: string,
	obligation: string,
): LegalMeta => ({ kind, spdx, obligation, accent: ACCENTS[kind] });

export const LEGAL_META: Record<string, LegalMeta> = {
	disclaimer: entry('policy', 'Disclaimer', 'Informational only'),
	privacy: entry('policy', 'Privacy Policy', 'Data handling'),
	tos: entry('policy', 'Terms of Service', 'Binding on use'),
	eula: entry('policy', 'EULA', 'Binding on install'),

	mit: entry('permissive', 'MIT', 'Attribution'),
	'apache-2': entry('permissive', 'Apache-2.0', 'Attribution + NOTICE'),
	'bsd-2': entry('permissive', 'BSD-2-Clause', 'Attribution'),
	'bsd-3': entry(
		'permissive',
		'BSD-3-Clause',
		'Attribution + no endorsement',
	),
	isc: entry('permissive', 'ISC', 'Attribution'),

	'gpl-3': entry('copyleft', 'GPL-3.0', 'Derivatives stay GPL'),
	'lgpl-3': entry('copyleft', 'LGPL-3.0', 'Linking exception'),
	'mpl-2': entry('copyleft', 'MPL-2.0', 'Modified files stay MPL'),

	'cc-by-4': entry('content', 'CC-BY-4.0', 'Attribution'),
	'cc-by-sa-4': entry('content', 'CC-BY-SA-4.0', 'Attribution + ShareAlike'),
	unlicense: entry('content', 'Unlicense / CC0', 'No conditions'),
};

export const legalKindLabel = (kind: LegalKind): string => KIND_LABELS[kind];
