export interface Skill {
	id: string;
	name: string;
	description: string;
	icon?: string;
	level?: 'beginner' | 'intermediate' | 'advanced' | 'expert';
	link?: string;
}

export interface DialogueOption {
	id: string;
	text: string;
	response: string;
	next?: string;
}

export interface CharacterKeyPoint {
	id: string;
	label: string;
	x: number;
	y: number;
	dialogue: string;
	width?: number;
	height?: number;
}

export const hardSkills: Skill[] = [
	{
		id: 'javascript',
		name: 'JavaScript',
		description: 'Web development with JS, TypeScript, and Node.js',
		level: 'expert',
		link: '/application/javascript/',
	},
	{
		id: 'python',
		name: 'Python',
		description: 'Scripting, automation, data processing, and ML pipelines',
		level: 'advanced',
		link: '/application/python/',
	},
	{
		id: 'rust',
		name: 'Rust',
		description: 'Systems programming, performance, and memory safety',
		level: 'advanced',
		link: '/application/rust/',
	},
	{
		id: 'php',
		name: 'PHP',
		description: 'Server-side scripting and legacy web applications',
		level: 'intermediate',
		link: '/application/php/',
	},
	{
		id: 'dotnet',
		name: '.NET',
		description: 'C# application development and enterprise solutions',
		level: 'intermediate',
		link: '/application/dotnet/',
	},
	{
		id: 'docker',
		name: 'Docker',
		description: 'Containerization, image management, and compose stacks',
		level: 'expert',
		link: '/application/docker/',
	},
	{
		id: 'kubernetes',
		name: 'Kubernetes',
		description: 'Container orchestration, deployments, and cluster ops',
		level: 'advanced',
		link: '/application/kubernetes/',
	},
	{
		id: 'terraform',
		name: 'Terraform',
		description: 'Infrastructure as code and cloud provisioning',
		level: 'advanced',
		link: '/application/terraform/',
	},
	{
		id: 'ansible',
		name: 'Ansible',
		description: 'Configuration management and server automation',
		level: 'intermediate',
		link: '/application/ansible/',
	},
	{
		id: 'linux',
		name: 'Linux',
		description:
			'Server administration, shell scripting, and system tuning',
		level: 'expert',
		link: '/application/linux/',
	},
	{
		id: 'nginx',
		name: 'Nginx',
		description: 'Reverse proxy, load balancing, and web serving',
		level: 'advanced',
		link: '/application/nginx/',
	},
	{
		id: 'traefik',
		name: 'Traefik',
		description: 'Cloud-native edge router and automatic TLS',
		level: 'intermediate',
		link: '/application/traefik/',
	},
	{
		id: 'sql',
		name: 'SQL',
		description: 'Relational database design, queries, and migrations',
		level: 'advanced',
		link: '/application/sql/',
	},
	{
		id: 'supabase',
		name: 'Supabase',
		description: 'Open-source Firebase alternative with PostgreSQL',
		level: 'advanced',
		link: '/application/supabase/',
	},
	{
		id: 'redis',
		name: 'Redis',
		description: 'In-memory caching, pub/sub, and data structures',
		level: 'intermediate',
		link: '/application/redis/',
	},
	{
		id: 'git',
		name: 'Git',
		description: 'Version control, branching strategies, and collaboration',
		level: 'advanced',
		link: '/application/git/',
	},
	{
		id: 'unity',
		name: 'Unity',
		description: 'Cross-platform game engine and interactive experiences',
		level: 'intermediate',
		link: '/application/unity/',
	},
	{
		id: 'godot',
		name: 'Godot',
		description: 'Open-source 2D and 3D game engine with GDScript',
		level: 'intermediate',
		link: '/application/godot/',
	},
	{
		id: 'nmap',
		name: 'Nmap',
		description: 'Network scanning, port discovery, and reconnaissance',
		level: 'intermediate',
		link: '/application/nmap/',
	},
	{
		id: 'wireguard',
		name: 'WireGuard',
		description: 'VPN tunneling and secure network connections',
		level: 'intermediate',
		link: '/application/wireguard/',
	},
	{
		id: 'ml',
		name: 'Machine Learning',
		description: 'TensorFlow, PyTorch, and LLM integration',
		level: 'intermediate',
		link: '/application/ml/',
	},
	{
		id: 'n8n',
		name: 'N8N',
		description: 'Workflow automation and service integrations',
		level: 'intermediate',
		link: '/application/n8n/',
	},
	{
		id: 'gcloud',
		name: 'GCloud',
		description: 'Google Cloud Platform services and deployment',
		level: 'intermediate',
		link: '/application/gcloud/',
	},
	{
		id: 'flutter',
		name: 'Flutter',
		description: 'Cross-platform mobile and desktop applications',
		level: 'beginner',
		link: '/application/flutter/',
	},
];

export const softSkills: Skill[] = [
	{
		id: 'getting-started',
		name: 'Getting Started',
		description: 'Onboarding guide for new contributors and developers',
		level: 'beginner',
		link: '/guides/getting-started/',
	},
	{
		id: 'intro',
		name: 'Introduction',
		description: 'Overview of KBVE services and platform capabilities',
		level: 'beginner',
		link: '/guides/intro/',
	},
	{
		id: 'first-project',
		name: 'First Project',
		description: 'Step-by-step checklist for launching your first project',
		level: 'beginner',
		link: '/guides/first-project-checklist/',
	},
	{
		id: 'programming-theory',
		name: 'Programming',
		description: 'Core programming concepts, paradigms, and best practices',
		level: 'expert',
		link: '/theory/programming/',
	},
	{
		id: 'automation',
		name: 'Automation',
		description: 'Automating workflows, CI/CD, and repetitive processes',
		level: 'advanced',
		link: '/theory/automation/',
	},
	{
		id: 'emulation',
		name: 'Emulation',
		description: 'Hardware emulation and retro computing',
		level: 'intermediate',
		link: '/theory/emulation/',
	},
	{
		id: 'solarpunk',
		name: 'SolarPunk',
		description: 'Sustainable technology and optimistic futurism',
		level: 'beginner',
		link: '/theory/solarpunk/',
	},
	{
		id: 'tech-specs',
		name: 'Technical Specs',
		description: 'Architecture decisions and system design documentation',
		level: 'advanced',
		link: '/advanced/technical-specifications/',
	},
	{
		id: 'webmaster',
		name: 'Webmaster',
		description:
			'Site operations, project management, and team coordination',
		level: 'advanced',
		link: '/webmaster/',
	},
	{
		id: 'api',
		name: 'API',
		description: 'Shared API design, REST endpoints, and integrations',
		level: 'advanced',
		link: '/project/api/',
	},
	{
		id: 'cryptothrone',
		name: 'CryptoThrone',
		description: 'Browser-based strategy game with blockchain elements',
		level: 'advanced',
		link: '/project/cryptothrone/',
	},
	{
		id: 'rareicon',
		name: 'RareIcon',
		description: 'Collectible and digital asset game project',
		level: 'intermediate',
		link: '/project/rareicon/',
	},
	{
		id: 'cityvote',
		name: 'CityVote',
		description: 'Community-driven city ranking and voting platform',
		level: 'intermediate',
		link: '/project/cityvote/',
	},
	{
		id: 'discordsh',
		name: 'DiscordSH',
		description: 'Discord bot framework and shell integration tools',
		level: 'advanced',
		link: '/project/discordsh/',
	},
	{
		id: 'brackeys',
		name: 'Brackeys Jam',
		description: 'Game jam prototypes and rapid development challenges',
		level: 'intermediate',
		link: '/project/brackeys/',
	},
	{
		id: 'pirate',
		name: 'Pirate Jam',
		description: 'Pirate Jam 17 game jam entry and design process',
		level: 'intermediate',
		link: '/project/pirate/',
	},
	{
		id: 'herbmail',
		name: 'HerbMail',
		description: 'Email automation and newsletter management tool',
		level: 'beginner',
		link: '/project/herbmail/',
	},
	{
		id: 'lofifocus',
		name: 'LofiFocus',
		description: 'Ambient music and productivity focus application',
		level: 'beginner',
		link: '/project/lofifocus/',
	},
	{
		id: 'atlas',
		name: 'Atlas',
		description: 'Interactive mapping and geospatial data visualization',
		level: 'intermediate',
		link: '/project/atlas/',
	},
	{
		id: 'charles',
		name: 'Charles',
		description: 'AI assistant project and conversational agent',
		level: 'intermediate',
		link: '/project/charles/',
	},
	{
		id: 'bitcraft',
		name: 'BitCraft',
		description: 'Community-driven sandbox MMO with crafting systems',
		level: 'intermediate',
		link: '/gaming/bitcraft/',
	},
	{
		id: 'lol',
		name: 'League of Legends',
		description: 'Competitive MOBA strategy and champion analysis',
		level: 'intermediate',
		link: '/gaming/lol/',
	},
	{
		id: 'wow',
		name: 'World of Warcraft',
		description: 'MMO raiding, economy systems, and addon development',
		level: 'intermediate',
		link: '/gaming/wow/',
	},
	{
		id: 'rimworld',
		name: 'RimWorld',
		description: 'Colony simulation, modding, and emergent storytelling',
		level: 'intermediate',
		link: '/gaming/rimworld/',
	},
];

export const characterKeyPoints: CharacterKeyPoint[] = [
	{
		id: 'mug',
		label: 'Coffee Mug',
		x: 0.22,
		y: 0.35,
		width: 0.12,
		height: 0.12,
		dialogue:
			'Coffee is fuel for late-night coding sessions! This mug has seen countless debugging marathons.',
	},
	{
		id: 'cube',
		label: 'Mystery Cube',
		x: 0.78,
		y: 0.32,
		width: 0.12,
		height: 0.14,
		dialogue:
			'A puzzle cube - because every complex problem can be broken down into smaller, solvable pieces.',
	},
	{
		id: 'jacket',
		label: 'Number 2 Jacket',
		x: 0.5,
		y: 0.45,
		width: 0.35,
		height: 0.25,
		dialogue:
			"The #2 represents being second to none in dedication. Also, it's just a really comfy jacket!",
	},
	{
		id: 'face',
		label: 'Say Hello',
		x: 0.5,
		y: 0.15,
		width: 0.2,
		height: 0.15,
		dialogue:
			'Hey there! Welcome to my portfolio. Click around to learn more about my skills and experience!',
	},
];

export interface MagicalRune {
	id: string;
	name: string;
	dialogue: string;
	color: string;
	glowColor: string;
}

export const magicalRunes: MagicalRune[] = [
	{
		id: 'greeting',
		name: 'Greeting',
		dialogue:
			'Welcome, traveler! I am the keeper of knowledge in this mystical library. What wisdom do you seek?',
		color: '#aa88ff',
		glowColor: '#cc99ff',
	},
	{
		id: 'skills',
		name: 'Skills',
		dialogue:
			'My grimoire contains spells of many kinds - TypeScript incantations, Python enchantments, and Rust runes of power. The bookshelves hold the secrets of my craft.',
		color: '#88ccff',
		glowColor: '#aaddff',
	},
	{
		id: 'vision',
		name: 'Vision',
		dialogue:
			'I see beyond the veil of ordinary code. My vision is to weave magic into technology, creating experiences that inspire wonder and delight.',
		color: '#ffaa88',
		glowColor: '#ffcc99',
	},
	{
		id: 'journey',
		name: 'Journey',
		dialogue:
			'Every spell mastered, every bug vanquished, has been a step on my mystical journey. From humble scrolls to grand grimoires, I continue to learn.',
		color: '#88ffaa',
		glowColor: '#aaffcc',
	},
	{
		id: 'connect',
		name: 'Connect',
		dialogue:
			'Seek me through the ethereal channels - GitHub for shared incantations, LinkedIn for professional enchantments. Together we can create magic!',
		color: '#ffff88',
		glowColor: '#ffffaa',
	},
];

export const socialLinks = {
	github: 'https://github.com',
	linkedin: 'https://linkedin.com',
	facebook: 'https://facebook.com',
};

export function getSkillLevelColor(level?: Skill['level']): string {
	switch (level) {
		case 'expert':
			return '#fbbf24';
		case 'advanced':
			return '#60a5fa';
		case 'intermediate':
			return '#34d399';
		case 'beginner':
			return '#9ca3af';
		default:
			return '#9ca3af';
	}
}

export function getSkillLevelLabel(level?: Skill['level']): string {
	switch (level) {
		case 'expert':
			return 'Expert';
		case 'advanced':
			return 'Advanced';
		case 'intermediate':
			return 'Intermediate';
		case 'beginner':
			return 'Beginner';
		default:
			return '';
	}
}
