import React, { ReactElement  } from 'react';
import { withNavigation } from '@react-navigation/compat';
import {
	TouchableOpacity,
	StyleSheet,
	Platform,
	Dimensions,
	ViewStyle,
	TextStyle,
	StyleProp,
} from 'react-native';
import { Button, Block, NavBar, Text, theme } from 'galio-framework';
import PropTypes from 'prop-types';
import Icon from './Icon';
import Input from './Input';
import Tabs from './Tabs';
import argonTheme, { COLORS, SIZES } from '../constants/Theme';
import { useNavigation } from '@react-navigation/native';

const { height, width } = Dimensions.get('window');
const iPhoneX = () =>
	Platform.OS === 'ios' &&
	(height === 812 || width === 812 || height === 896 || width === 896);

interface ButtonProps {
	isWhite?: boolean;
	style?: StyleSheet.NamedStyles<any> | StyleSheet.NamedStyles<any>[];
}

interface BasketButtonProps {
	isWhite?: boolean;
	style?: StyleProp<ViewStyle>;
}

interface SearchButtonProps {
	isWhite?: boolean;
	style?: StyleProp<ViewStyle>;
}

interface HeaderProps {
	back?: boolean;
	title?: string;
	white?: boolean;
	transparent?: boolean;
	bgColor?: string;
	iconColor?: string;
	titleColor?: string;
	navigation: any; // If using types from @react-navigation/native, replace any with the correct navigation prop types.
	optionLeft?: string;
	optionRight?: string;
	tabs?: Array<{ id: string; title: string }>;
	tabIndex?: number;
	search?: boolean;
	options?: boolean;
}

const BellButton: React.FC<ButtonProps> = ({ isWhite, style }) => {
	const navigation = useNavigation<any>();
	return (
		<TouchableOpacity
			style={[styles.button, style]}
			onPress={() => navigation.navigate('Pro')}>
			<Icon
				family="ArgonExtra"
				size={16}
				name="bell"
				color={argonTheme.COLORS[isWhite ? 'WHITE' : 'ICON']}
			/>
			<Block middle style={styles.notify} />
		</TouchableOpacity>
	);
};

const BasketButton: React.FC<BasketButtonProps> = ({ isWhite, style }) => {
	const navigation = useNavigation<any>();
	return (
		<TouchableOpacity
			style={[styles.button, style]}
			onPress={() => navigation.navigate('Pro')}>
			<Icon
				family="ArgonExtra"
				size={16}
				name="basket"
				color={argonTheme.COLORS[isWhite ? 'WHITE' : 'ICON']}
			/>
		</TouchableOpacity>
	);
};

const SearchButton: React.FC<SearchButtonProps> = ({ isWhite, style }) => {
	const navigation = useNavigation<any>();

	return (
		<TouchableOpacity
			style={[styles.button, style]}
			onPress={() => navigation.navigate('Pro')}>
			<Icon
				size={16}
				family="Galio" // Ensure this is correct, might need adjustment based on your Icon component
				name="search-zoom-in"
				color={argonTheme.COLORS[isWhite ? 'WHITE' : 'ICON']}
			/>
		</TouchableOpacity>
	);
};

class Header extends React.Component<HeaderProps> {
	handleLeftPress = () => {
		const { back, navigation } = this.props;
		return back ? navigation.goBack() : navigation.openDrawer();
	};
	renderRight = () => {
		const { white, title, navigation } = this.props;

		if (title === 'Title') {
			return [
				<BellButton
					key="chat-title"
					isWhite={white}
				/>,
				<BasketButton
					key="basket-title"
					isWhite={white}
				/>,
			];
		}

		switch (title) {
			case 'Home':
				return [
					<BellButton
						key="chat-home"
						isWhite={white}
					/>,
					<BasketButton
						key="basket-home"
						isWhite={white}
					/>,
				];
			case 'Deals':
				return [
					<BellButton
						key="chat-categories"
					/>,
					<BasketButton
						key="basket-categories"
					/>,
				];
			case 'Categories':
				return [
					<BellButton
						key="chat-categories"
						isWhite={white}
					/>,
					<BasketButton
						key="basket-categories"
						isWhite={white}
					/>,
				];
			case 'Category':
				return [
					<BellButton
						key="chat-deals"
						isWhite={white}
					/>,
					<BasketButton
						key="basket-deals"
						isWhite={white}
					/>,
				];
			case 'Profile':
				return [
					<BellButton
						key="chat-profile"
						isWhite={white}
					/>,
					<BasketButton
						key="basket-deals"
						isWhite={white}
					/>,
				];
			case 'Product':
				return [
					<SearchButton
						key="search-product"
						isWhite={white}
					/>,
					<BasketButton
						key="basket-product"
						isWhite={white}
					/>,
				];
			case 'Search':
				return [
					<BellButton
						key="chat-search"
						isWhite={white}
					/>,
					<BasketButton
						key="basket-search"
						isWhite={white}
					/>,
				];
			case 'Settings':
				return [
					<BellButton
						key="chat-search"
						isWhite={white}
					/>,
					<BasketButton
						key="basket-search"
						isWhite={white}
					/>,
				];
			default:
				break;
		}
	};
	renderSearch = () => {
		const { navigation } = this.props;
		return (
			<Input
				right
				color="black"
				style={styles.search}
				placeholder="What are you looking for?"
				placeholderTextColor={'#8898AA'}
				onFocus={() => navigation.navigate('Pro')}
				iconContent={
					<Icon
						size={16}
						color={COLORS.MUTED}
						name="search-zoom-in"
						family="ArgonExtra"
					/>
				}
			/>
		);
	};
	renderOptions = () => {
		const { navigation, optionLeft, optionRight } = this.props;

		return (
			<Block row style={styles.options}>
				<Button
					shadowless
					style={[styles.tab, styles.divider]}
					onPress={() => navigation.navigate('Pro')}>
					<Block row middle>
						<Icon
							name="diamond"
							family="ArgonExtra"
							style={{ paddingRight: 8 }}
							color={argonTheme.COLORS.ICON}
						/>
						<Text size={16} style={styles.tabTitle}>
							{optionLeft || 'Beauty'}
						</Text>
					</Block>
				</Button>
				<Button
					shadowless
					style={styles.tab}
					onPress={() => navigation.navigate('Pro')}>
					<Block row middle>
						<Icon
							size={16}
							name="bag-17"
							family="ArgonExtra"
							style={{ paddingRight: 8 }}
							color={argonTheme.COLORS.ICON}
						/>
						<Text size={16} style={styles.tabTitle}>
							{optionRight || 'Fashion'}
						</Text>
					</Block>
				</Button>
			</Block>
		);
	};
	renderTabs = () => {
		const { tabs, tabIndex, navigation } = this.props;

		if (!tabs || tabs.length === 0) return null;

		const defaultTab = tabs && tabs[0] && tabs[0].id;

		const initialTabIndex = typeof tabIndex === 'number' ? tabIndex : 0;

		return (
			<Tabs
				data={tabs || []}
				// initialIndex={tabIndex || defaultTab}
				initialIndex={initialTabIndex}
				onChange={(id) => navigation.setParams({ tabId: id })}
			/>
		);
	};
	renderHeader = () => {
		const { search, options, tabs } = this.props;
		if (search || tabs || options) {
			return (
				<Block center>
					{search ? this.renderSearch() : null}
					{options ? this.renderOptions() : null}
					{tabs ? this.renderTabs() : null}
				</Block>
			);
		}
	};

	render() {
		const {
			back,
			title,
			white,
			transparent,
			bgColor,
			iconColor,
			titleColor,
			navigation,
			...props
		} = this.props;

		const noShadow = [
			'Search',
			'Categories',
			'Deals',
			'Pro',
			'Profile',
		].includes(title || "");
		const headerStyles = [
			!noShadow ? styles.shadow : null,
			transparent ? { backgroundColor: 'rgba(0,0,0,0)' } : null,
		];

		const navbarStyles = [
			styles.navbar,
			bgColor && { backgroundColor: bgColor },
		];

		return (
			<Block style={headerStyles}>
				<NavBar
					back={false}
					title={title}
					style={navbarStyles}
					transparent={transparent}
					right={this.renderRight()}
					rightStyle={{ alignItems: 'center' }}
					left={
						<Icon
							name={back ? 'chevron-left' : 'menu'}
							family="Entypo"
							size={20}
							onPress={this.handleLeftPress}
							color={
								iconColor ||
								(white
									? argonTheme.COLORS.WHITE
									: argonTheme.COLORS.ICON)
							}
							style={{ marginTop: 2 }}
						/>
					}
					leftStyle={{ paddingVertical: 12, flex: 0.2 }}
					titleStyle={{
            ...styles.title,
          }}
					{...props}
				/>
				{this.renderHeader()}
			</Block>
		);
	}
}

const styles = StyleSheet.create({
	button: {
		padding: 12,
		position: 'relative',
	},
	title: {
		width: '100%',
		fontSize: 16,
		fontWeight: 'bold',
    color: argonTheme.COLORS.HEADER
	},
	navbar: {
		paddingVertical: 0,
		paddingBottom: SIZES.BASE * 1.5,
		paddingTop: iPhoneX() ? SIZES.BASE * 4 : SIZES.BASE,
		zIndex: 5,
	},
	shadow: {
		backgroundColor: COLORS.WHITE,
		shadowColor: 'black',
		shadowOffset: { width: 0, height: 2 },
		shadowRadius: 6,
		shadowOpacity: 0.2,
		elevation: 3,
	},
	notify: {
		backgroundColor: argonTheme.COLORS.LABEL,
		borderRadius: 4,
		height: SIZES.BASE / 2,
		width: SIZES.BASE / 2,
		position: 'absolute',
		top: 9,
		right: 12,
	},
	header: {
		backgroundColor: COLORS.WHITE,
	},
	divider: {
		borderRightWidth: 0.3,
		borderRightColor: COLORS.ICON,
	},
	search: {
		height: 48,
		width: width - 32,
		marginHorizontal: 16,
		borderWidth: 1,
		borderRadius: 3,
		borderColor: argonTheme.COLORS.BORDER,
	},
	options: {
		marginBottom: 24,
		marginTop: 10,
		elevation: 4,
	},
	tab: {
		backgroundColor: COLORS.TRANSPARENT,
		width: width * 0.35,
		borderRadius: 0,
		borderWidth: 0,
		height: 24,
		elevation: 0,
	},
	tabTitle: {
		lineHeight: 19,
		fontWeight: '400',
		color: argonTheme.COLORS.HEADER,
	},
});

export default withNavigation(Header);
