import styled from 'styled-components';

import NxWelcome from './nx-welcome';
import KB from './KB';
import React from 'react';


const StyledApp = styled.div`
	// Your style here
`;

export function App() {
	return (
		<StyledApp>
			<NxWelcome title="js-embed-passport" />
			<KB />
		</StyledApp>
	);
}

export default App;
