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
		id: 'programming',
		name: 'Programming',
		description:
			'Full-stack development with TypeScript, Python, Rust, and more',
		level: 'expert',
	},
	{
		id: 'devops',
		name: 'DevOps & Cloud',
		description: 'AWS, GCP, Docker, Kubernetes, CI/CD pipelines',
		level: 'advanced',
	},
	{
		id: 'databases',
		name: 'Databases',
		description: 'PostgreSQL, MongoDB, Redis, Supabase',
		level: 'advanced',
	},
	{
		id: 'gamedev',
		name: 'Game Development',
		description: 'Unity, Phaser, Godot, and custom engines',
		level: 'intermediate',
	},
	{
		id: 'security',
		name: 'Cybersecurity',
		description: 'Penetration testing, security audits, CTF competitions',
		level: 'intermediate',
	},
	{
		id: 'ml',
		name: 'Machine Learning',
		description: 'TensorFlow, PyTorch, LLM integration',
		level: 'intermediate',
	},
];

export const softSkills: Skill[] = [
	{
		id: 'leadership',
		name: 'Leadership',
		description: 'Team management and project coordination',
		level: 'advanced',
	},
	{
		id: 'communication',
		name: 'Communication',
		description: 'Technical writing, presentations, and documentation',
		level: 'advanced',
	},
	{
		id: 'problemsolving',
		name: 'Problem Solving',
		description: 'Analytical thinking and creative solutions',
		level: 'expert',
	},
	{
		id: 'collaboration',
		name: 'Collaboration',
		description: 'Cross-functional teamwork and open source contribution',
		level: 'advanced',
	},
	{
		id: 'adaptability',
		name: 'Adaptability',
		description: 'Quick learner, embraces new technologies',
		level: 'expert',
	},
	{
		id: 'mentoring',
		name: 'Mentoring',
		description: 'Teaching and guiding junior developers',
		level: 'intermediate',
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
