import styled from 'styled-components';

import NxWelcome from './nx-welcome';
import React from 'react';


const StyledApp = styled.div`
	// Your style here
`;

export function App() {
	return (
		<StyledApp>
			<NxWelcome title="js-embed-passport" />
		</StyledApp>
	);
}

export default App;
