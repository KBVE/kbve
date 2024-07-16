/** @jsxImportSource react */
import styled from 'styled-components';

import GameWindow from './GameWindow';
import ModalComponent from './menu/ModalComponent';
import Sticky from './menu/Sticky';
import ActionMenu from './menu/ActionMenu';
import DialogueComponent from './menu/DialogueComponent';
import EventNotification from './menu/EventNotification';
import ModalDice from './menu/ModalDice';


const StyledApp = styled.div`
  // Your style here
`;

export function App() {
  return (
    <StyledApp>
      <Sticky />

      <div className="flex justify-center items-center h-screen">
      <div className="border-4 border-yellow-500 rounded-xl">
      <DialogueComponent />
      <ModalDice />
      <GameWindow />
      <EventNotification />
      </div></div>
      <ActionMenu />
      <ModalComponent />
    </StyledApp>
  );
}

export default App;
