/**
 * Main application component for DreamBound Action RPG.
 * 
 * This component serves as the root for the application's UI, encapsulating the
 * Phaser game component within a styled div. It employs `styled-components` for
 * CSS-in-JS styling, providing a convenient and modular way to apply styles directly
 * within the component file.
 * 
 * @fileoverview Main App component that serves as the entry point for the application's UI.
 * @requires styled-components: Utilized for CSS-in-JS styling, enabling encapsulated component-level styles.
 * @requires ./phaser/game: Imports the Game component which initializes and manages the Phaser game instance.
 * 
 * @returns {JSX.Element} The App component, rendering the Phaser game within a styled container.
 * 
 * @example
 * // This component is typically rendered by the root entry point of the application, such as `main.tsx`.
 * // It's not intended to be used directly elsewhere but serves as the top-level component that wraps the entire application.
 * 
 * import App from './app';
 * 
 * // In your main entry file
 * ReactDOM.render(<App />, document.getElementById('dreambound-root'));
 */

import styled from 'styled-components';
import Game from './phaser/game';

// Define the main application container with styled-components.
const StyledApp = styled.div`
    // Your style here. Example:
    // display: flex;
    // justify-content: center;
    // align-items: center;
    // height: 100vh;
    // background-color: #282c34;
`;

/**
 * The App function component serves as the root container for the application,
 * wrapping the Phaser game component with potentially global styles applied via StyledApp.
 * 
 * @returns {JSX.Element} Renders the Phaser game within a styled div for the application.
 */
export function App(): JSX.Element {
  return (
    <StyledApp>
      <Game />
    </StyledApp>
  );
}

export default App;