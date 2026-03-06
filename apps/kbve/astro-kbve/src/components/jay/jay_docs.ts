export interface SkillDoc {
	title: string;
	path: string;
	description: string;
}

export interface SkillDocsEntry {
	skillId: string;
	docs: SkillDoc[];
}

export const skillDocs: SkillDocsEntry[] = [
	{
		skillId: 'programming',
		docs: [
			{
				title: 'Programming',
				path: '/theory/programming/',
				description: 'Core programming concepts and paradigms',
			},
			{
				title: 'JavaScript',
				path: '/application/javascript/',
				description: 'Web development with JS and TypeScript',
			},
			{
				title: 'Python',
				path: '/application/python/',
				description: 'Scripting, automation, and data processing',
			},
			{
				title: 'Rust',
				path: '/application/rust/',
				description: 'Systems programming and performance',
			},
		],
	},
	{
		skillId: 'devops',
		docs: [
			{
				title: 'Docker',
				path: '/application/docker/',
				description: 'Containerization and image management',
			},
			{
				title: 'Kubernetes',
				path: '/application/kubernetes/',
				description: 'Container orchestration at scale',
			},
			{
				title: 'Terraform',
				path: '/application/terraform/',
				description: 'Infrastructure as code',
			},
			{
				title: 'Linux',
				path: '/application/linux/',
				description: 'Server administration and shell scripting',
			},
		],
	},
	{
		skillId: 'databases',
		docs: [
			{
				title: 'SQL',
				path: '/application/sql/',
				description: 'Relational database design and queries',
			},
			{
				title: 'Supabase',
				path: '/application/supabase/',
				description: 'Open-source Firebase alternative',
			},
			{
				title: 'Redis',
				path: '/application/redis/',
				description: 'In-memory caching and data structures',
			},
		],
	},
	{
		skillId: 'gamedev',
		docs: [
			{
				title: 'Unity',
				path: '/application/unity/',
				description: 'Cross-platform game engine',
			},
			{
				title: 'Godot',
				path: '/application/godot/',
				description: 'Open-source 2D and 3D game engine',
			},
			{
				title: 'Brackeys GameJam',
				path: '/project/brackeys/',
				description: 'Game jam projects and prototypes',
			},
			{
				title: 'RareIcon',
				path: '/project/rareicon/',
				description: 'Collectible game project',
			},
		],
	},
	{
		skillId: 'security',
		docs: [
			{
				title: 'Nmap',
				path: '/application/nmap/',
				description: 'Network scanning and reconnaissance',
			},
			{
				title: 'WireGuard',
				path: '/application/wireguard/',
				description: 'VPN tunneling and secure networking',
			},
			{
				title: 'Authelia',
				path: '/application/authelia/',
				description: 'Authentication and access control',
			},
		],
	},
	{
		skillId: 'ml',
		docs: [
			{
				title: 'Machine Learning',
				path: '/application/ml/',
				description: 'ML frameworks and AI integration',
			},
		],
	},
	{
		skillId: 'leadership',
		docs: [
			{
				title: 'Webmaster',
				path: '/webmaster/',
				description: 'Project management and site operations',
			},
		],
	},
	{
		skillId: 'communication',
		docs: [
			{
				title: 'Introduction',
				path: '/guides/intro/',
				description: 'KBVE services overview and documentation',
			},
			{
				title: 'Getting Started',
				path: '/guides/getting-started/',
				description: 'Onboarding guide for new contributors',
			},
		],
	},
	{
		skillId: 'problemsolving',
		docs: [
			{
				title: 'Automation',
				path: '/theory/automation/',
				description: 'Automating workflows and processes',
			},
			{
				title: 'Technical Specifications',
				path: '/advanced/technical-specifications/',
				description: 'Architecture and design decisions',
			},
		],
	},
	{
		skillId: 'collaboration',
		docs: [
			{
				title: 'API',
				path: '/project/api/',
				description: 'Shared API design and integrations',
			},
			{
				title: 'Git',
				path: '/application/git/',
				description: 'Version control and collaboration',
			},
		],
	},
	{
		skillId: 'adaptability',
		docs: [
			{
				title: 'First Project Checklist',
				path: '/guides/first-project-checklist/',
				description: 'Getting up to speed on new projects',
			},
		],
	},
	{
		skillId: 'mentoring',
		docs: [
			{
				title: 'Getting Started',
				path: '/guides/getting-started/',
				description: 'Guiding newcomers through the codebase',
			},
		],
	},
];

export function getSkillDocs(skillId: string): SkillDoc[] {
	const entry = skillDocs.find((e) => e.skillId === skillId);
	return entry?.docs ?? [];
}
