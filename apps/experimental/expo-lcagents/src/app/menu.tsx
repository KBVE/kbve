import React from 'react';
import { Activity } from '@tamagui/lucide-icons';
import {
	Image,
	SizableText,
	YStack,
	Button,
	H5,
	Separator,
	Tabs,
	View,
	isWeb,
} from 'tamagui';
import { useNavigation } from 'expo-router';
import { useBBQ } from '@kbve/expo-bbq';
import { StyleSheet } from 'react-native';


export function TabsDemo() {
	return (
		<YStack paddingHorizontal="$4" {...(isWeb ? { position: 'unset' } : {})}>
			<VerticalTabs />
		</YStack>
	);
}

// Memoized VerticalTabs
const VerticalTabs = React.memo(() => {
	const bbq = useBBQ();

	// Memoized handler function
	const handlePress = React.useCallback(async (route: string, params?: Record<string, any>) => {
		bbq.go(route, params);
	}, [bbq]);

	return (
		<Tabs
			defaultValue="tab1"
			flexDirection="row"
			orientation="vertical"
			width={400}
			borderRadius="$4"
			borderWidth="$0.25"
			overflow="hidden"
			borderColor="$borderColor">
			{/* Tab List */}
			<Tabs.List disablePassBorderRadius="end" aria-label="Manage your account" separator={<Separator />}>
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
			<MemoizedTabsContent value="tab1">
				<H5 textAlign="center">Profile Content</H5>
				<Button
					iconAfter={Activity}
					size="$3"
					onPress={() => handlePress('/profile', { filter: 'active', sort: 'asc' })}
				>
					Profile
				</Button>
			</MemoizedTabsContent>
			<MemoizedTabsContent value="tab2">
				<H5 textAlign="center">Connections Content</H5>
				<Button
					iconAfter={Activity}
					size="$3"
					onPress={() => handlePress('/projects', { filter: 'active', sort: 'asc' })}
				>
					Projects
				</Button>
			</MemoizedTabsContent>
			<MemoizedTabsContent value="tab3">
				<H5 textAlign="center">Notifications Content</H5>
			</MemoizedTabsContent>
		</Tabs>
	);
});

// Memoized TabsContent component
const MemoizedTabsContent = React.memo((props: Tabs.TabsContentProps) => (
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
		{...props}>
		{props.children}
	</Tabs.Content>
));

const ModalScreen = () => {
	const navigation = useNavigation();

	React.useEffect(() => {
		navigation.setOptions({
		  title: 'Menu',
		  headerBackTitle: 'Back',
		});
	  }, [navigation]);

	return (
		<View minHeight={500} style={styles.scrollViewContent}>
			<YStack flex={1} padding="$2" alignItems="center" justifyContent="center">
				<Image source={require('../../assets/lca_logo.png')} style={styles.imageStyle} />
				<TabsDemo />
			</YStack>
		</View>
	);
};

const styles = StyleSheet.create({
	scrollViewContent: {
		padding: 20,
	},
	imageStyle: {
		width: 400,
		height: 400,
		marginBottom: 0,
	},
});

export default ModalScreen;
