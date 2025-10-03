export const GET = async () => {
	const mapEntries = await getCollection('mapdb', 
		(entry) => entry.data.type === 'resource' && !entry.data.drafted
	);
	
	const resources = mapEntries.map(entry => entry.data);
	
	return new Response(JSON.stringify({ resources }, null, 2), {
		headers: { 'Content-Type': 'application/json' },
	});
};