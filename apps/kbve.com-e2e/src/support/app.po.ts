export const getGreeting = () => cy.get('h1');
export const getLegal = (links: string[]) =>
	cy.get('footer').within(() => {
		links.forEach((link) => {
			cy.contains('a', link).should('exist');
		});
	});

    export const toggleTheme = () => {
        // First check the global <html> tag to determine the current theme state
        cy.get('html').then($html => {
          const isInitiallyDark = $html.hasClass('dark');
          const toggleAction = isInitiallyDark ? 'light' : 'dark';
          const expectedClassAfterToggle = isInitiallyDark ? 'not.have.class' : 'have.class';
      
          // Target the <nav> specifically within <header>
          cy.get('header nav').within(() => {
            // Click the appropriate toggle button based on the initial theme
            cy.get(`[data-hs-theme-click-value="${toggleAction}"]`).click({ multiple: true, force: true });
          });
      
          // Verify the theme change to ensure it's been applied globally
          cy.get('html').should(expectedClassAfterToggle, 'dark');
      
          // Optionally, toggle back to the original state to double-check toggle functionality
          if (Cypress.env('TEST_TOGGLE_BACK')) {
            cy.get('header nav').within(() => {
              cy.get(`[data-hs-theme-click-value="${isInitiallyDark ? 'dark' : 'light'}"]`).click({ multiple: true, force: true });
            });
            cy.get('html').should(isInitiallyDark ? 'have.class' : 'not.have.class', 'dark');
          }
        });
      };
      