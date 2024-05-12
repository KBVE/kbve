import { getGreeting, getLegal, toggleTheme} from '../support/app.po';

describe('kbve.com', () => {
  beforeEach(() => cy.visit('/'));

  it('should display welcome message', () => {
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


describe('kbve.com/journal', () => {
  beforeEach(() => cy.visit('/journal'));

  it('should display journal greeting message', () => {
    //cy.login('my-email@something.com', 'myPassword');
    getGreeting().contains('The Creator’s Diary: Adventures in Art, Tech, and Cinema');
  });

  it('should display the legal links', () => {
    const legalLinks = ['Terms of Service', 'EULA', 'Privacy', 'Legal'];
    getLegal(legalLinks);
  });


});

describe('kbve.com/graph', () => {
  beforeEach(() => cy.visit('/graph'));

  it('should display graph greeting message', () => {
    //cy.login('my-email@something.com', 'myPassword');
    getGreeting().contains('Graph');
  });

  it('should display the legal links', () => {
    const legalLinks = ['Terms of Service', 'EULA', 'Privacy', 'Legal'];
    getLegal(legalLinks);
  });


});

