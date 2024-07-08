/** @jsxImportSource react */
import styled from 'styled-components';

import GameWindow from './GameWindow';
import ModalComponent from './menu/ModalComponent';
import Sticky from './menu/Sticky';
import ActionMenu from './menu/ActionMenu';
import EventNotification from './menu/EventNotification';

import { MinigameDice } from '@kbve/laser';

const StyledApp = styled.div`
  // Your style here
`;

export function App() {
  return (
    <StyledApp>
      <Sticky />
      {/* <MinigameDice
        textures={{
          side1: '/assets/items/set/dice/dice1.png',
          side2: '/assets/items/set/dice/dice2.png',
          side3: '/assets/items/set/dice/dice3.png',
          side4: '/assets/items/set/dice/dice4.png',
          side5: '/assets/items/set/dice/dice5.png',
          side6: '/assets/items/set/dice/dice6.png'
        }}
        styleClass="h-96"
        diceCount={2}
      /> */}
      <div className="flex justify-center items-center h-screen">
      <div className="border-4 border-yellow-500 rounded-xl">
      <GameWindow />
      <EventNotification />
      </div></div>
      <ActionMenu />
      <ModalComponent />
    </StyledApp>
  );
}

export default App;
