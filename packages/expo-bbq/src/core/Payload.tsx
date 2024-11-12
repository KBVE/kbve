class Payload {
	private initialValue: number;

	private constructor(initialValue = 0) {
		this.initialValue = initialValue;
	}

    static instance = new Payload();

	// Recursive function to clean payload by removing empty, null, or undefined values
	public clean(data: any): any {
		const cleanObject = (obj: Record<string, any>) =>
			Object.entries(obj).reduce((acc, [key, value]) => {
				if (value && typeof value === 'object' && !Array.isArray(value)) {
					// Recursively clean nested objects
					const cleanedValue = cleanObject(value);
					if (Object.keys(cleanedValue).length > 0) acc[key] = cleanedValue;
				} else if (Array.isArray(value)) {
					// Clean arrays by filtering out empty or null values within arrays
					const cleanedArray = value
						.map((item) => (typeof item === 'object' ? cleanObject(item) : item))
						.filter((item) => item !== '' && item !== null && item !== undefined);
					if (cleanedArray.length > 0) acc[key] = cleanedArray;
				} else if (value !== '' && value !== null && value !== undefined) {
					// Add non-empty, non-null, and non-undefined values
					acc[key] = value;
				}
				return acc;
			}, {} as Record<string, any>);
		return cleanObject(data);
	}
}

export const payloadInstance = Payload.instance;
