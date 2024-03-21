import React from 'react';
import { StyleProp, StyleSheet, ViewStyle } from 'react-native';
import PropTypes from 'prop-types';
import ModalDropdown from 'react-native-modal-dropdown';
import { Block, Text } from 'galio-framework';

import Icon from './Icon';
import { argonTheme } from '../constants';

interface DropDownProps {
	onSelect?: (index: number, value: string) => void;
	iconName?: string;
	iconFamily?: string;
	iconSize?: number;
	iconColor?: string;
	color?: string;
	textStyle?: StyleSheet.NamedStyles<any> | StyleSheet.NamedStyles<any>[];
	style?: StyleSheet.NamedStyles<any> | StyleSheet.NamedStyles<any>[];
	defaultIndex?: number;
	options?: string[];
	// Include any other props passed to ModalDropdown as needed
}

interface DropDownState {
	value: string | number; // Adjust based on what values you expect
}

class DropDown extends React.Component<DropDownProps, DropDownState> {
	static propTypes = {
		onSelect: PropTypes.func,
		iconName: PropTypes.string,
		iconFamily: PropTypes.string,
		iconSize: PropTypes.number,
		color: PropTypes.string,
		textStyle: PropTypes.oneOfType([PropTypes.object, PropTypes.array]),
		style: PropTypes.oneOfType([PropTypes.object, PropTypes.array]),
		// You can add PropTypes for any additional props passed to ModalDropdown if needed
	};

	state: DropDownState = {
		value: 1, // Adjust based on the default value you expect
	};

	handleOnSelect = (index: number, value: string) => {
		const { onSelect } = this.props;

		this.setState({ value });
		onSelect && onSelect(index, value); // Ensure onSelect is properly typed to accept a number for index
	};

	render() {
		const {
			onSelect,
			iconName,
			iconFamily,
			iconSize,
			iconColor,
			color,
			textStyle,
			style,
			...props
		} = this.props;

		const textStyles = [styles.text, textStyle];

		return (
			<ModalDropdown
				style={[
					styles.qty,
					color ? { backgroundColor: color } : undefined,
					style,
				]}
				onSelect={(index: any, value: string) =>
					this.handleOnSelect(index, value)
				}
				dropdownStyle={styles.dropdown}
				dropdownTextStyle={{ paddingLeft: 16, fontSize: 12 }}
				{...props}>
				<Block flex row middle space="between">
					<Text
						size={12}
						style={textStyles}>{`${this.state.value}`}</Text>
					<Icon
						name={iconName || 'nav-down'}
						family={iconFamily as 'ArgonExtra'}
						size={iconSize || 10}
						color={iconColor || argonTheme.COLORS.WHITE}
					/>
				</Block>
			</ModalDropdown>
		);
	}
}

const styles = StyleSheet.create({
	qty: {
		width: 100,
		backgroundColor: argonTheme.COLORS.DEFAULT,
		paddingHorizontal: 16,
		paddingTop: 10,
		paddingBottom: 9.5,
		borderRadius: 4,
		shadowColor: 'rgba(0, 0, 0, 0.1)',
		shadowOffset: { width: 0, height: 2 },
		shadowRadius: 4,
		shadowOpacity: 1,
	},
	text: {
		color: argonTheme.COLORS.WHITE,
		fontWeight: '600',
	},
	dropdown: {
		marginTop: 8,
		marginLeft: -16,
		width: 100,
	},
});

export default DropDown;
