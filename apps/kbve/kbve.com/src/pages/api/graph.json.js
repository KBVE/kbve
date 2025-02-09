import { getCollection } from 'astro:content';
// Normalize URLs by removing trailing slashes and hash fragments
function normalizeUrl(url) {
	// Remove hash (anything after # including # itself)
	let normalizedUrl = url.split('#')[0];

	// Remove trailing slash if present
	if (normalizedUrl.endsWith('/')) {
		normalizedUrl = normalizedUrl.slice(0, -1);
	}

	return normalizedUrl;
}

export const GET = async () => {
	const application = await getCollection('docs');

	const nodes = application.map((entry) => ({
		id: entry.slug,
		name: entry.data.title,
		description: entry.data.description,
		tags: Array.isArray(entry.data.tags) ? entry.data.tags : [],
	}));

	const links = [];
	const linkPattern = /\[.*?\]\((.*?)\)/g;

	// First, add links based on explicit URLs in the content
	application.forEach((entry) => {
		const content = entry.body;
		if (content) {
			let match;
			while ((match = linkPattern.exec(content)) !== null) {
				const url = match[1];
				if (url.startsWith('https://kbve.com/')) {
					const normalizedSlug = normalizeUrl(url)
						.replace('https://kbve.com/', '')
						.replace('.mdx', '');
					if (application.some((e) => e.slug === normalizedSlug)) {
						links.push({
							source: entry.slug,
							target: normalizedSlug,
							type: 'url',
						});
					}
				}
			}
		}
	});

	// Then, add links based on shared tags
	nodes.forEach((node) => {
		nodes.forEach((otherNode) => {
			if (
				node.id !== otherNode.id &&
				node.tags.some((tag) => otherNode.tags.includes(tag))
			) {
				links.push({
					source: node.id,
					target: otherNode.id,
					type: 'tag',
				});
			}
		});
	});

	const graphData = { nodes, links };

	return new Response(JSON.stringify(graphData), {
		headers: {
			'Content-Type': 'application/json',
		},
	});
};
