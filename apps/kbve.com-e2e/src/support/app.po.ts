export const getGreeting = () => cy.get('h1');
export const getLegal = (links: string[]) =>
	cy.get('footer').within(() => {
		links.forEach((link) => {
			cy.contains('a', link).should('exist');
		});
	});

export const toggleTheme = () => {
	// First check the global <html> tag to determine the current theme state
	cy.get('html').then(($html) => {
		const isInitiallyDark = $html.hasClass('dark');
		const toggleAction = isInitiallyDark ? 'light' : 'dark';
		const expectedClassAfterToggle = isInitiallyDark
			? 'not.have.class'
			: 'have.class';

		// Target the <nav> specifically within <header>
		cy.get('header nav').within(() => {
			// Click the appropriate toggle button based on the initial theme
			cy.get(`[data-hs-theme-click-value="${toggleAction}"]`).click({
				multiple: true,
				force: true,
			});
		});

		// Verify the theme change to ensure it's been applied globally
		cy.get('html').should(expectedClassAfterToggle, 'dark');

		// Optionally, toggle back to the original state to double-check toggle functionality
		if (Cypress.env('TEST_TOGGLE_BACK')) {
			cy.get('header nav').within(() => {
				cy.get(
					`[data-hs-theme-click-value="${isInitiallyDark ? 'dark' : 'light'}"]`,
				).click({ multiple: true, force: true });
			});
			cy.get('html').should(
				isInitiallyDark ? 'have.class' : 'not.have.class',
				'dark',
			);
		}
	});
};

export const getNodeGraph = () => {
	// Extending out the timeout
	cy.get('#nodegraph canvas', { timeout: 10000 }).should('exist');
	cy.get('#nodegraph canvas', { timeout: 10000 }).should('be.visible');

	// Additional checks to ensure the canvas is properly initialized
	cy.get('#nodegraph canvas').invoke('attr', 'width').should('not.be.empty');
	cy.get('#nodegraph canvas').invoke('attr', 'height').should('not.be.empty');

	// Ensure the canvas has the correct data attribute for the rendering engine (three.js)
	cy.get('#nodegraph canvas')
		.invoke('attr', 'data-engine')
		.should('match', /^three\.js/);

	// Minor Interactivity Check
	cy.get('#nodegraph canvas')
		.trigger('mousedown', { button: 0, clientX: 100, clientY: 100 })
		.trigger('mousemove', { clientX: 150, clientY: 150 })
		.trigger('mouseup');

	// Add assertions to check for expected changes in the graph's state or view
	// This might include checking the transformation matrix or other properties
	// Example (pseudo-code, adjust according to your actual state checks):
	// cy.get('#some-element').should('have.css', 'transform', 'expected-transformation');

	cy.get('#nodegraph canvas').trigger('wheel', { deltaY: -100 });

	// Verify changes in the graph's zoom level
	// Example:
	// cy.get('#zoom-level-display').should('contain', 'expected-zoom-level');
};


export const checkJSONendpointAPI = (endpoints: string[]) => {
    endpoints.forEach(endpoint => {
      cy.request(endpoint).then(response => {
        expect(response.status).to.eq(200);
        expect(response.headers['content-type']).to.include('application/json');
        expect(response.body).to.be.an('object');
      });
    });
  };