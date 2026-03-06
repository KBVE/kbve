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
	// --- Hard Skills (Left Shelf) ---
	{
		skillId: 'javascript',
		docs: [
			{
				title: 'Python',
				path: '/application/python/',
				description: 'Scripting and data processing',
			},
			{
				title: 'Rust',
				path: '/application/rust/',
				description: 'Systems programming',
			},
			{
				title: 'Programming',
				path: '/theory/programming/',
				description: 'Core concepts',
			},
		],
	},
	{
		skillId: 'python',
		docs: [
			{
				title: 'JavaScript',
				path: '/application/javascript/',
				description: 'Web development',
			},
			{
				title: 'Machine Learning',
				path: '/application/ml/',
				description: 'ML frameworks',
			},
			{
				title: 'Automation',
				path: '/theory/automation/',
				description: 'Workflow automation',
			},
		],
	},
	{
		skillId: 'rust',
		docs: [
			{
				title: 'JavaScript',
				path: '/application/javascript/',
				description: 'Web development',
			},
			{
				title: 'Linux',
				path: '/application/linux/',
				description: 'Server administration',
			},
			{
				title: 'Programming',
				path: '/theory/programming/',
				description: 'Core concepts',
			},
		],
	},
	{
		skillId: 'php',
		docs: [
			{
				title: 'JavaScript',
				path: '/application/javascript/',
				description: 'Web development',
			},
			{
				title: 'SQL',
				path: '/application/sql/',
				description: 'Database queries',
			},
			{
				title: 'Nginx',
				path: '/application/nginx/',
				description: 'Web serving',
			},
		],
	},
	{
		skillId: 'dotnet',
		docs: [
			{
				title: 'SQL',
				path: '/application/sql/',
				description: 'Database design',
			},
			{
				title: 'Docker',
				path: '/application/docker/',
				description: 'Containerization',
			},
			{
				title: 'Unity',
				path: '/application/unity/',
				description: 'Game engine',
			},
		],
	},
	{
		skillId: 'docker',
		docs: [
			{
				title: 'Kubernetes',
				path: '/application/kubernetes/',
				description: 'Container orchestration',
			},
			{
				title: 'Linux',
				path: '/application/linux/',
				description: 'Server administration',
			},
			{
				title: 'Traefik',
				path: '/application/traefik/',
				description: 'Edge router',
			},
		],
	},
	{
		skillId: 'kubernetes',
		docs: [
			{
				title: 'Docker',
				path: '/application/docker/',
				description: 'Containerization',
			},
			{
				title: 'Terraform',
				path: '/application/terraform/',
				description: 'Infrastructure as code',
			},
			{
				title: 'Technical Specs',
				path: '/advanced/technical-specifications/',
				description: 'Architecture',
			},
		],
	},
	{
		skillId: 'terraform',
		docs: [
			{
				title: 'Ansible',
				path: '/application/ansible/',
				description: 'Configuration management',
			},
			{
				title: 'GCloud',
				path: '/application/gcloud/',
				description: 'Google Cloud',
			},
			{
				title: 'Kubernetes',
				path: '/application/kubernetes/',
				description: 'Container orchestration',
			},
		],
	},
	{
		skillId: 'ansible',
		docs: [
			{
				title: 'Terraform',
				path: '/application/terraform/',
				description: 'Infrastructure as code',
			},
			{
				title: 'Linux',
				path: '/application/linux/',
				description: 'Server administration',
			},
			{
				title: 'Docker',
				path: '/application/docker/',
				description: 'Containerization',
			},
		],
	},
	{
		skillId: 'linux',
		docs: [
			{
				title: 'Docker',
				path: '/application/docker/',
				description: 'Containerization',
			},
			{
				title: 'Nginx',
				path: '/application/nginx/',
				description: 'Web serving',
			},
			{
				title: 'WireGuard',
				path: '/application/wireguard/',
				description: 'VPN tunneling',
			},
		],
	},
	{
		skillId: 'nginx',
		docs: [
			{
				title: 'Traefik',
				path: '/application/traefik/',
				description: 'Edge router',
			},
			{
				title: 'Linux',
				path: '/application/linux/',
				description: 'Server administration',
			},
			{
				title: 'Docker',
				path: '/application/docker/',
				description: 'Containerization',
			},
		],
	},
	{
		skillId: 'traefik',
		docs: [
			{
				title: 'Nginx',
				path: '/application/nginx/',
				description: 'Web serving',
			},
			{
				title: 'Docker',
				path: '/application/docker/',
				description: 'Containerization',
			},
			{
				title: 'Kubernetes',
				path: '/application/kubernetes/',
				description: 'Container orchestration',
			},
		],
	},
	{
		skillId: 'sql',
		docs: [
			{
				title: 'Supabase',
				path: '/application/supabase/',
				description: 'PostgreSQL platform',
			},
			{
				title: 'Redis',
				path: '/application/redis/',
				description: 'In-memory caching',
			},
			{
				title: 'Python',
				path: '/application/python/',
				description: 'Data processing',
			},
		],
	},
	{
		skillId: 'supabase',
		docs: [
			{
				title: 'SQL',
				path: '/application/sql/',
				description: 'Database queries',
			},
			{
				title: 'JavaScript',
				path: '/application/javascript/',
				description: 'Web development',
			},
			{
				title: 'API',
				path: '/project/api/',
				description: 'API integrations',
			},
		],
	},
	{
		skillId: 'redis',
		docs: [
			{
				title: 'SQL',
				path: '/application/sql/',
				description: 'Relational databases',
			},
			{
				title: 'Docker',
				path: '/application/docker/',
				description: 'Containerization',
			},
			{
				title: 'N8N',
				path: '/application/n8n/',
				description: 'Workflow automation',
			},
		],
	},
	{
		skillId: 'git',
		docs: [
			{
				title: 'Getting Started',
				path: '/guides/getting-started/',
				description: 'Contributor guide',
			},
			{
				title: 'Linux',
				path: '/application/linux/',
				description: 'Command line',
			},
			{
				title: 'API',
				path: '/project/api/',
				description: 'Collaborative development',
			},
		],
	},
	{
		skillId: 'unity',
		docs: [
			{
				title: 'Godot',
				path: '/application/godot/',
				description: 'Open-source engine',
			},
			{
				title: 'Brackeys Jam',
				path: '/project/brackeys/',
				description: 'Game jams',
			},
			{
				title: 'RareIcon',
				path: '/project/rareicon/',
				description: 'Game project',
			},
		],
	},
	{
		skillId: 'godot',
		docs: [
			{
				title: 'Unity',
				path: '/application/unity/',
				description: 'Game engine',
			},
			{
				title: 'Pirate Jam',
				path: '/project/pirate/',
				description: 'Game jam entry',
			},
			{
				title: 'Brackeys Jam',
				path: '/project/brackeys/',
				description: 'Game jams',
			},
		],
	},
	{
		skillId: 'nmap',
		docs: [
			{
				title: 'WireGuard',
				path: '/application/wireguard/',
				description: 'VPN tunneling',
			},
			{
				title: 'Linux',
				path: '/application/linux/',
				description: 'Server administration',
			},
		],
	},
	{
		skillId: 'wireguard',
		docs: [
			{
				title: 'Nmap',
				path: '/application/nmap/',
				description: 'Network scanning',
			},
			{
				title: 'Linux',
				path: '/application/linux/',
				description: 'Server administration',
			},
		],
	},
	{
		skillId: 'ml',
		docs: [
			{
				title: 'Python',
				path: '/application/python/',
				description: 'ML scripting language',
			},
			{
				title: 'Charles',
				path: '/project/charles/',
				description: 'AI assistant project',
			},
		],
	},
	{
		skillId: 'n8n',
		docs: [
			{
				title: 'Automation',
				path: '/theory/automation/',
				description: 'Workflow concepts',
			},
			{
				title: 'Docker',
				path: '/application/docker/',
				description: 'Containerization',
			},
			{
				title: 'API',
				path: '/project/api/',
				description: 'Service integrations',
			},
		],
	},
	{
		skillId: 'gcloud',
		docs: [
			{
				title: 'Terraform',
				path: '/application/terraform/',
				description: 'Infrastructure as code',
			},
			{
				title: 'Kubernetes',
				path: '/application/kubernetes/',
				description: 'Container orchestration',
			},
			{
				title: 'Docker',
				path: '/application/docker/',
				description: 'Containerization',
			},
		],
	},
	{
		skillId: 'flutter',
		docs: [
			{
				title: 'JavaScript',
				path: '/application/javascript/',
				description: 'Web development',
			},
			{
				title: 'Godot',
				path: '/application/godot/',
				description: 'Cross-platform engine',
			},
		],
	},
	// --- Soft Skills / Right Shelf ---
	{
		skillId: 'getting-started',
		docs: [
			{
				title: 'Introduction',
				path: '/guides/intro/',
				description: 'Platform overview',
			},
			{
				title: 'First Project',
				path: '/guides/first-project-checklist/',
				description: 'Launch checklist',
			},
			{
				title: 'Git',
				path: '/application/git/',
				description: 'Version control',
			},
		],
	},
	{
		skillId: 'intro',
		docs: [
			{
				title: 'Getting Started',
				path: '/guides/getting-started/',
				description: 'Onboarding',
			},
			{
				title: 'Webmaster',
				path: '/webmaster/',
				description: 'Site operations',
			},
		],
	},
	{
		skillId: 'first-project',
		docs: [
			{
				title: 'Getting Started',
				path: '/guides/getting-started/',
				description: 'Onboarding',
			},
			{
				title: 'Git',
				path: '/application/git/',
				description: 'Version control',
			},
			{
				title: 'Docker',
				path: '/application/docker/',
				description: 'Dev environments',
			},
		],
	},
	{
		skillId: 'programming-theory',
		docs: [
			{
				title: 'JavaScript',
				path: '/application/javascript/',
				description: 'Web development',
			},
			{
				title: 'Python',
				path: '/application/python/',
				description: 'Scripting',
			},
			{
				title: 'Rust',
				path: '/application/rust/',
				description: 'Systems programming',
			},
			{
				title: 'Automation',
				path: '/theory/automation/',
				description: 'Workflow automation',
			},
		],
	},
	{
		skillId: 'automation',
		docs: [
			{
				title: 'N8N',
				path: '/application/n8n/',
				description: 'Workflow automation',
			},
			{
				title: 'Ansible',
				path: '/application/ansible/',
				description: 'Configuration management',
			},
			{
				title: 'Programming',
				path: '/theory/programming/',
				description: 'Core concepts',
			},
		],
	},
	{
		skillId: 'emulation',
		docs: [
			{
				title: 'Programming',
				path: '/theory/programming/',
				description: 'Core concepts',
			},
			{
				title: 'Linux',
				path: '/application/linux/',
				description: 'System administration',
			},
		],
	},
	{
		skillId: 'solarpunk',
		docs: [
			{
				title: 'Automation',
				path: '/theory/automation/',
				description: 'Sustainable workflows',
			},
		],
	},
	{
		skillId: 'tech-specs',
		docs: [
			{
				title: 'Kubernetes',
				path: '/application/kubernetes/',
				description: 'Container orchestration',
			},
			{ title: 'API', path: '/project/api/', description: 'API design' },
			{
				title: 'Automation',
				path: '/theory/automation/',
				description: 'Workflow automation',
			},
		],
	},
	{
		skillId: 'webmaster',
		docs: [
			{
				title: 'Introduction',
				path: '/guides/intro/',
				description: 'Platform overview',
			},
			{
				title: 'Technical Specs',
				path: '/advanced/technical-specifications/',
				description: 'Architecture',
			},
		],
	},
	{
		skillId: 'api',
		docs: [
			{
				title: 'Supabase',
				path: '/application/supabase/',
				description: 'Backend platform',
			},
			{
				title: 'JavaScript',
				path: '/application/javascript/',
				description: 'Web development',
			},
			{
				title: 'Technical Specs',
				path: '/advanced/technical-specifications/',
				description: 'Architecture',
			},
		],
	},
	{
		skillId: 'cryptothrone',
		docs: [
			{
				title: 'JavaScript',
				path: '/application/javascript/',
				description: 'Web development',
			},
			{
				title: 'Supabase',
				path: '/application/supabase/',
				description: 'Backend',
			},
			{ title: 'API', path: '/project/api/', description: 'API design' },
		],
	},
	{
		skillId: 'rareicon',
		docs: [
			{
				title: 'Unity',
				path: '/application/unity/',
				description: 'Game engine',
			},
			{
				title: 'Godot',
				path: '/application/godot/',
				description: 'Game engine',
			},
		],
	},
	{
		skillId: 'cityvote',
		docs: [
			{
				title: 'JavaScript',
				path: '/application/javascript/',
				description: 'Web development',
			},
			{
				title: 'Supabase',
				path: '/application/supabase/',
				description: 'Backend',
			},
		],
	},
	{
		skillId: 'discordsh',
		docs: [
			{
				title: 'Python',
				path: '/application/python/',
				description: 'Bot scripting',
			},
			{
				title: 'API',
				path: '/project/api/',
				description: 'API integrations',
			},
			{
				title: 'Docker',
				path: '/application/docker/',
				description: 'Deployment',
			},
		],
	},
	{
		skillId: 'brackeys',
		docs: [
			{
				title: 'Unity',
				path: '/application/unity/',
				description: 'Game engine',
			},
			{
				title: 'Godot',
				path: '/application/godot/',
				description: 'Game engine',
			},
			{
				title: 'Pirate Jam',
				path: '/project/pirate/',
				description: 'Another game jam',
			},
		],
	},
	{
		skillId: 'pirate',
		docs: [
			{
				title: 'Godot',
				path: '/application/godot/',
				description: 'Game engine',
			},
			{
				title: 'Brackeys Jam',
				path: '/project/brackeys/',
				description: 'Game jams',
			},
		],
	},
	{
		skillId: 'herbmail',
		docs: [
			{
				title: 'N8N',
				path: '/application/n8n/',
				description: 'Email automation',
			},
			{
				title: 'JavaScript',
				path: '/application/javascript/',
				description: 'Web development',
			},
		],
	},
	{
		skillId: 'lofifocus',
		docs: [
			{
				title: 'JavaScript',
				path: '/application/javascript/',
				description: 'Web development',
			},
		],
	},
	{
		skillId: 'atlas',
		docs: [
			{
				title: 'JavaScript',
				path: '/application/javascript/',
				description: 'Web development',
			},
			{
				title: 'API',
				path: '/project/api/',
				description: 'Data integration',
			},
		],
	},
	{
		skillId: 'charles',
		docs: [
			{
				title: 'Machine Learning',
				path: '/application/ml/',
				description: 'ML frameworks',
			},
			{
				title: 'Python',
				path: '/application/python/',
				description: 'AI scripting',
			},
		],
	},
	{
		skillId: 'bitcraft',
		docs: [
			{
				title: 'RareIcon',
				path: '/project/rareicon/',
				description: 'Game project',
			},
			{
				title: 'Unity',
				path: '/application/unity/',
				description: 'Game engine',
			},
		],
	},
	{
		skillId: 'lol',
		docs: [
			{
				title: 'World of Warcraft',
				path: '/gaming/wow/',
				description: 'MMO',
			},
		],
	},
	{
		skillId: 'wow',
		docs: [
			{
				title: 'League of Legends',
				path: '/gaming/lol/',
				description: 'MOBA',
			},
			{
				title: 'RimWorld',
				path: '/gaming/rimworld/',
				description: 'Colony sim',
			},
		],
	},
	{
		skillId: 'rimworld',
		docs: [
			{
				title: 'BitCraft',
				path: '/gaming/bitcraft/',
				description: 'Sandbox MMO',
			},
			{
				title: 'Godot',
				path: '/application/godot/',
				description: 'Modding tools',
			},
		],
	},
];

export function getSkillDocs(skillId: string): SkillDoc[] {
	const entry = skillDocs.find((e) => e.skillId === skillId);
	return entry?.docs ?? [];
}
