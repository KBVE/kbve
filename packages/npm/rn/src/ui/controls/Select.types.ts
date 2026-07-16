export interface SelectOption<T extends string = string> {
	label: string;
	value: T;
	disabled?: boolean;
}
export interface SelectProps<T extends string = string> {
	value?: T;
	options: SelectOption<T>[];
	placeholder?: string;
	disabled?: boolean;
	onValueChange: (value: T) => void;
}
