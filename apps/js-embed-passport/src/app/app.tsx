import styled from 'styled-components';

//import NxWelcome from './nx-welcome';
import KB from './KB';
import React from 'react';
import Soksoa from './soksoa';

import Utility from './Utility';

const StyledApp = styled.div`
	// Your style here
`;

export function App() {
	return (
		<StyledApp>
			{/* <NxWelcome title="js-embed-passport" /> */}
			<KB />
			<Soksoa />
			<Utility />
		</StyledApp>
	);
}

export default App;
