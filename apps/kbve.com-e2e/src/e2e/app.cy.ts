import {
	getGreeting,
	getLegal,
	toggleTheme,
	getNodeGraph,
	checkJSONendpointAPI,
} from '../support/app.po';

describe('kbve.com', () => {
	beforeEach(() => cy.visit('/'));

	it('should display welcome message', () => {
		//TODO Move this into Cypress ENV
		cy.login('my-email@something.com', 'myPassword');

		getGreeting().contains('Meet Your Dream');
	});

	it('should display the legal links', () => {
		const legalLinks = ['Terms of Service', 'EULA', 'Privacy', 'Legal'];
		getLegal(legalLinks);
	});

	it('should toggle light and dark display', () => {
		toggleTheme();
	});
});

describe('API JSON Format Tests', () => {
	it('should verify that the endpoints returns JSON with correct Content-Type', () => {
		const apiEndpoints = [
			'/api/graph.json',
			'/api/music.json',
			'https://rust.kbve.com/api/v1/health',
			'https://rust.kbve.com/api/v1/speed',
			// Add more API endpoints as needed
		];
		checkJSONendpointAPI(apiEndpoints);
	});
});

describe('kbve.com/journal', () => {
	beforeEach(() => cy.visit('/journal'));

	it('should display journal greeting message', () => {
		//cy.login('my-email@something.com', 'myPassword');
		getGreeting().contains(
			'The Creator’s Diary: Adventures in Art, Tech, and Cinema',
		);
	});

	it('should display the legal links', () => {
		const legalLinks = ['Terms of Service', 'EULA', 'Privacy', 'Legal'];
		getLegal(legalLinks);
	});
});

describe('kbve.com/graph', () => {
	beforeEach(() => cy.visit('/graph'));

	it('should display greeting message', () => {
		//cy.login('my-email@something.com', 'myPassword');
		getGreeting().contains('Graph');
	});

	it('should display the legal links', () => {
		const legalLinks = ['Terms of Service', 'EULA', 'Privacy', 'Legal'];
		getLegal(legalLinks);
	});

	it('should display the canvas within nodegraph', () => {
		getNodeGraph();
	});
});
