// src/styles/GlobalStyles.tsx
import { createGlobalStyle } from 'styled-components';
import tw, { theme, GlobalStyles as BaseStyles } from 'twin.macro';

const CustomStyles = createGlobalStyle({
	body: {
		WebkitTapHighlightColor: theme`colors.green.500`,
		...tw`antialiased`,
	},
});

const GlobalStyles = () => (
	<>
		<BaseStyles />
		<CustomStyles />
	</>
);

export default GlobalStyles;
