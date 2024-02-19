/**
 * Interface defining the structure for a stylesheet within the KBVE application context.
 * It outlines the method for retrieving a variable processor based on a variable name.
 */
interface IKBVEStyleSheet {
	/**
	 * Retrieves a processor for a specified variable name.
	 * @param name The name of the variable to retrieve.
	 * @param dyn Optional. Specifies whether to retrieve a dynamic version of the variable.
	 * @returns An instance of IVariableProcessor for the specified variable.
	 */
	getVariable(name: string, dyn?: boolean): IVariableProcessor;
}

/**
 * Interface defining the structure for processing a variable.
 * It includes methods for getting the variable's text representation and setting its transparency.
 */
interface IVariableProcessor {
	variable: string; // The variable's name.

	/**
	 * Gets the text representation of the variable.
	 * @returns The text representation of the variable.
	 */
	getText(): string;

	/**
	 * Sets the transparency level of the variable.
	 * @param percentage The transparency percentage to apply.
	 * @returns The instance of IVariableProcessor with updated transparency.
	 */
	setTransparent(percentage: number): IVariableProcessor;
}

/**
 * Implements the IKBVEStyleSheet interface, managing style variables for the KBVE application.
 */
class KBVEStyleManager implements IKBVEStyleSheet {
	private variables: { [key: string]: string } = {
		// Mapping of variable names to their corresponding CSS classes or variables
		'menu-primary-color': 'text-kbve-menu-primary-color',

		// Background variables
		'bg-kbve-menu-bg': 'bg-kbve-menu-bg',
		'bg-k-m-bg': 'bg-kbve-menu-bg', // Alias for 'bg-kbve-menu-bg'

		// Text color variables
		'text-kbve-text-primary': 'text-kbve-text-primary',
		'text-kbve-text-secondary': 'text-kbve-text-secondary',

		// Text -> SVG
		'text-kbve-svg-primary': 'text-kbve-svg-primary',
	};

	/**
	 * Retrieves a variable processor for a given variable name, with an option for dynamic variables.
	 * @param name The name of the variable to retrieve.
	 * @param dyn Optional. If true, retrieves a dynamic version of the variable.
	 * @returns An object conforming to the IVariableProcessor interface.
	 */
	public getVariable(name: string, dyn: boolean = false): IVariableProcessor {
		const variableName = this.variables[name];
		if (!variableName) {
			throw new Error(`Variable ${name} not found`);
		}
		const processedVariable = dyn ? `${variableName}-dyn` : variableName;

		const self = this;

		return {
			variable: processedVariable,
			getText: function () {
				return self.replaceHyphensWithSpaces(this.variable);
			},
			setTransparent: function (percentage: number) {
				const transparentVariable = self.applyTransparency(
					this.variable,
					percentage
				);
				// Update 'variable' for the current object context and return 'this' to satisfy the interface
				this.variable = transparentVariable;
				return this;
			},
		};
	}

    /**
     * Replaces hyphens with spaces in a given string.
     * @param inputString The string to process.
     * @returns The processed string with hyphens replaced by spaces.
     */
	private replaceHyphensWithSpaces(inputString: string): string {
		return inputString.replace(/-/g, ' ').replace(/drawer\s?/gi, '');
	}

    /**
     * Applies a transparency level to a variable.
     * @param variable The variable to modify.
     * @param percentage The percentage of transparency to apply.
     * @returns The modified variable with transparency applied.
     */
	private applyTransparency(variable: string, percentage: number): string {
		const opacity = (percentage / 100).toFixed(2);
		return `${variable} opacity-[${opacity}]`;
	}
}

/**
 * Extends KBVEStyleManager to automatically apply dynamic variable processing.
 */
class DynamicKBVEStyleManager extends KBVEStyleManager {
    /**
     * Retrieves a dynamic version of the specified variable.
     * @param name The name of the variable to retrieve.
     * @returns An instance of IVariableProcessor for the dynamic variable.
     */
	public getVariable(name: string): IVariableProcessor {
		return super.getVariable(name, true);
	}
}

// Export instances of KBVEStyleManager and DynamicKBVEStyleManager for external use.
export const style = new KBVEStyleManager();
export const dynStyle = new DynamicKBVEStyleManager();
