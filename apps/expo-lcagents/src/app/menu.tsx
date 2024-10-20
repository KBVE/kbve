import React from 'react';
import { ChevronDown } from '@tamagui/lucide-icons';
import {
	Accordion,
	Paragraph,
	SizableText,
	Square,
	Stack,
	View,
	XStack,
	YStack,
	Button,
	H5,
	Separator,
	Tabs,
	isWeb,
} from 'tamagui';

import { useNavigation } from 'expo-router';

const demos = ['vertical'] as const;
const demosTitle: Record<(typeof demos)[number], string> = {
	vertical: 'Vertical',
};


export function TabsDemo() {
	const [demoIndex, setDemoIndex] = React.useState(0);
	const demo = demos[demoIndex];

	return (
		// Fix for web-only position relative
		<YStack
			paddingHorizontal="$4"
			{...(isWeb && {
				position: 'unset' as any,
			})}
		>
			{/* Render the vertical tabs */}
			<VerticalTabs />

			
		</YStack>
	);
}

// Vertical Tabs implementation
const VerticalTabs = () => {
	return (
		<Tabs
			defaultValue="tab1"
			flexDirection="row"
			orientation="vertical"
			width={400}
			borderRadius="$4"
			borderWidth="$0.25"
			overflow="hidden"
			borderColor="$borderColor"
		>
			{/* Tab List */}
			<Tabs.List
				disablePassBorderRadius="end"
				aria-label="Manage your account"
				separator={<Separator />}
			>
				<Tabs.Tab value="tab1">
					<SizableText>Profile</SizableText>
				</Tabs.Tab>
				<Tabs.Tab value="tab2">
					<SizableText>Connections</SizableText>
				</Tabs.Tab>
				<Tabs.Tab value="tab3">
					<SizableText>Notifications</SizableText>
				</Tabs.Tab>
			</Tabs.List>

			{/* Tab content separator */}
			<Separator vertical />

			{/* Tabs Content */}
			<TabsContent value="tab1">
				<H5 textAlign="center">Profile Content</H5>
			</TabsContent>
			<TabsContent value="tab2">
				<H5 textAlign="center">Connections Content</H5>
			</TabsContent>
			<TabsContent value="tab3">
				<H5 textAlign="center">Notifications Content</H5>
			</TabsContent>
		</Tabs>
	);
};

// Tabs Content component
const TabsContent = (props: Tabs.TabsContentProps) => {
	return (
		<Tabs.Content
			backgroundColor="$background"
			key={props.value}
			padding="$2"
			alignItems="center"
			justifyContent="center"
			flex={1}
			borderColor="$background"
			borderRadius="$2"
			borderTopLeftRadius={0}
			borderTopRightRadius={0}
			borderWidth="$2"
			{...props}
		>
			{props.children}
		</Tabs.Content>
	);
};

const ModalScreen = () => {
	const navigation = useNavigation();

	React.useEffect(() => {
		navigation.setOptions({
			title: 'Menu',
			headerBackTitle: 'Back',
		});
	}, [navigation]);

	return (
		<View minHeight={500} style={{ padding: 20 }}>
			<YStack
				flex={1}
				
				padding="$2"
				alignItems="center"
				justifyContent="center">
				<TabsDemo />
			</YStack>
		</View>
	);
};

export default ModalScreen;
