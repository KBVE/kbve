jest.mock('expo/src/winter/ImportMetaRegistry', () => ({
	ImportMetaRegistry: {
		get url() {
			return null;
		},
	},
}));

if (typeof global.structuredClone === 'undefined') {
	global.structuredClone = (object) => JSON.parse(JSON.stringify(object));
}
