import React, { Component, RefObject } from 'react';
import { StyleSheet, Dimensions, FlatList, Animated } from 'react-native';
import { Block, theme } from 'galio-framework';
import argonTheme,  { COLORS, SIZES }  from '../constants/Theme';

const { width } = Dimensions.get('screen');

const defaultMenu = [
	{ id: 'popular', title: 'Popular' },
	{ id: 'beauty', title: 'Beauty' },
	{ id: 'cars', title: 'Cars' },
	{ id: 'motocycles', title: 'Motocycles' },
];

interface TabItem {
	id: string;
	title: string;
}

interface TabsProps {
	data: TabItem[];
	initialIndex?: number | null; // Make optional since defaultProps provides a fallback
	onChange?: (id: string) => void; // Assuming you might have an onChange prop function
}

interface TabsState {
	active: string | null;
}

export default class Tabs extends Component<TabsProps, TabsState> {
	static defaultProps: Partial<TabsProps> = {
		data: defaultMenu,
		initialIndex: null,
	};

	state: TabsState = {
		active: null,
	};

	componentDidMount() {
		const { initialIndex, data } = this.props;
		if (initialIndex !== undefined && initialIndex !== null) {
			const initialItem = data[initialIndex];
			if (initialItem) {
				this.selectMenu(initialItem.id);
			}
		}
	}

	private animatedValue: Animated.Value = new Animated.Value(1);

	animate() {
		this.animatedValue.setValue(0);

		Animated.timing(this.animatedValue, {
			toValue: 1,
			duration: 300,
			useNativeDriver: false, // color not supported
		}).start();
	}

	private menuRef: RefObject<FlatList<TabItem>> = React.createRef();

	onScrollToIndexFailed = () => {
		if (this.menuRef.current) {
			this.menuRef.current.scrollToIndex({
				index: 0,
				viewPosition: 0.5,
			});
		}
	};

	selectMenu = (id: string) => {
		this.setState({ active: id });

		if (this.menuRef.current) {
			this.menuRef.current.scrollToIndex({
				index: this.props.data.findIndex((item) => item.id === id),
				viewPosition: 0.5,
			});
		}

		this.animate();
		this.props.onChange?.(id);
	};

	renderItem = ({ item }: { item: TabItem }) => {
		const isActive = this.state.active === item.id;

		// Logic to interpolate color based on the active state
		const textColor = this.animatedValue.interpolate({
			inputRange: [0, 1],
			outputRange: [
				argonTheme.COLORS.BLACK,
				isActive ? argonTheme.COLORS.WHITE : argonTheme.COLORS.BLACK,
			],
			extrapolate: 'clamp',
		});

		// Container styles based on the active state
		const containerStyles = [
			styles.titleContainer,
			!isActive && { backgroundColor: argonTheme.COLORS.SECONDARY },
			isActive && styles.containerShadow,
		];

		return (
			<Block style={containerStyles}>
				<Animated.Text
					style={[styles.menuTitle, { color: textColor }]}
					onPress={() => this.selectMenu(item.id)}>
					{item.title}
				</Animated.Text>
			</Block>
		);
	};

	renderMenu = () => {
		const { data, ...props } = this.props;

		return (
			<FlatList
				{...props}
				data={data}
				horizontal={true}
				ref={this.menuRef}
				extraData={this.state}
				keyExtractor={(item) => item.id}
				showsHorizontalScrollIndicator={false}
				onScrollToIndexFailed={this.onScrollToIndexFailed}
				renderItem={this.renderItem} // Simplified, directly passing the method reference
				contentContainerStyle={styles.menu}
			/>
		);
	};

	render() {
		return <Block style={styles.container}>{this.renderMenu()}</Block>;
	}
}

const styles = StyleSheet.create({
	container: {
		width: width,
		backgroundColor: COLORS.WHITE,
		zIndex: 2,
	},
	shadow: {
		shadowColor: COLORS.BLACK,
		shadowOffset: { width: 0, height: 2 },
		shadowRadius: 8,
		shadowOpacity: 0.2,
		elevation: 4,
	},
	menu: {
		paddingHorizontal: SIZES.BASE * 2.5,
		paddingTop: 8,
		paddingBottom: 16,
	},
	titleContainer: {
		alignItems: 'center',
		backgroundColor: argonTheme.COLORS.ACTIVE,
		borderRadius: 4,
		marginRight: 9,
	},
	containerShadow: {
		shadowColor: 'black',
		shadowOffset: { width: 0, height: 2 },
		shadowRadius: 4,
		shadowOpacity: 0.1,
		elevation: 1,
	},
	menuTitle: {
		fontWeight: '600',
		fontSize: 14,
		// lineHeight: 28,
		paddingVertical: 10,
		paddingHorizontal: 16,
		color: argonTheme.COLORS.MUTED,
	},
});
