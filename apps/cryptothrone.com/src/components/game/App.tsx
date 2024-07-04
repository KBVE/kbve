/** @jsxImportSource react */
import styled from 'styled-components';

import GameWindow from './GameWindow';
import ModalComponent from './menu/ModalComponent';
import Sticky from './menu/Sticky';

const StyledApp = styled.div`
  // Your style here
`;

export function App() {
  return (
    <StyledApp>
      <Sticky />
      <GameWindow />
      <ModalComponent />
    </StyledApp>
  );
}

export default App;
