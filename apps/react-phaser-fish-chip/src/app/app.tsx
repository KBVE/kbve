
import styled from 'styled-components';

import NxWelcome from "./nx-welcome";

import Game from './phaser/game';


const StyledApp = styled.div`
    // Your style here
`;


export function App() {

  return (
      <StyledApp>
        
        <Game />
        
      </StyledApp>
  );

}


export default App;

