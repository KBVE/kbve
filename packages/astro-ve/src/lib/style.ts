interface IKBVEStyleSheet {
	getVariable(name: string, dyn?: boolean): IVariableProcessor;
}

interface IVariableProcessor {
	variable: string;
	getText(): string;
	setTransparent(percentage: number): IVariableProcessor;
}

class KBVEStyleManager implements IKBVEStyleSheet {

    private variables: { [key: string]: string } = {
		'menu-primary-color': 'text-kbve-menu-primary-color',
	};

	// Method to get a variable. If dyn is true, append '-dyn' to the variable name.
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

	private replaceHyphensWithSpaces(inputString: string): string {
		return inputString.replace(/-/g, ' ').replace(/drawer\s?/gi, '');
	}

	private applyTransparency(variable: string, percentage: number): string {
        const opacity = (percentage / 100).toFixed(2); 
		return `${variable} opacity-[${opacity}]`;
	}
}

class DynamicKBVEStyleManager extends KBVEStyleManager {
	public getVariable(name: string): IVariableProcessor {
		return super.getVariable(name, true);
	}
}

export const style = new KBVEStyleManager();
export const dyn_style = new DynamicKBVEStyleManager();
