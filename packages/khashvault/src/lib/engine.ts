/* cspell:disable */

// Exporting a constant 'kbve_v01d' representing a version or an identifier.
export const kbve_v01d: string = '/api/v1/';

/* hCaptcha */
// Section for hCaptcha configuration constants.

// Exporting the hCaptcha site key as a constant.
// This key is specific to your site and is used to authenticate with the hCaptcha service.
export const hcaptcha_site_key: string = '5ba581fa-b6fc-4bb0-8222-02fcd6a59e35'; // 9-20-2023 Key

// Exporting the URL to the hCaptcha API script.
// This is the script that will be loaded to integrate hCaptcha into your site.
export const hcaptcha_api: string = 'https://js.hcaptcha.com/1/api.js';

// Exporting API endpoints for authentication.
// These are the server endpoints for registering and logging in users.
export const auth_register: string = 'auth/register'; // Endpoint for user registration.
export const auth_login: string = 'auth/login'; // Endpoint for user login.
export const auth_logout: string = 'auth/logout'; // Endpoint for user logout.
export const auth_profile: string = 'auth/profile'; // Endpoint for the user profile.


// Summary:
// The InternalResponse interface and the InternalResponseHandler class are designed
// to standardize and manage API responses throughout an application.
// The InternalResponse interface declares the structure of a typical API response,
// including status, error, message, and data fields.
// The InternalResponseHandler class implements this interface and provides methods
// to display, serialize, and deserialize the response data. It includes error handling
// for serialization and deserialization processes.

// Interface representing the structure of an internal response.
interface InternalResponse {
	status: number; // Numeric status code of the response.
	error: boolean; // Boolean flag indicating whether there was an error.
	message: string; // Message associated with the response.
	data: any; // Data payload of the response. 'any' type allows flexibility.
}

// Class implementing the InternalResponse interface.
class InternalResponseHandler implements InternalResponse {
	status: number; // Holds the status code of the response.
	error: boolean; // Holds the error status of the response.
	message: string; // Holds the message of the response.
	data: any; // Holds the data payload of the response.

	// Constructor to initialize the response handler with status, message, and data.
	constructor(status: number, message: string, data: any) {
		this.status = status; // Sets the status.
		this.error = status < 200 || status >= 300; // Determines error based on status code.
		this.message = message; // Sets the message.
		this.data = data; // Sets the data.
	}

	// Method to display the response details in the console.
	display(): void {
		console.log(
			`Status: ${this.status}, Message: ${this.message}, Error: ${
				this.error
			}, Data: ${JSON.stringify(this.data)}` // Formats and logs the response details.
		);
	}

    // Method to return a string representation of the data property
    scope(): string {
        try {
            return JSON.stringify(this.data);
        } catch (e) {
            console.error('Parsing error:', e); // Log parsing errors
            // Return a default error message if parsing fails
            return 'Error: Unable to parse data';
        }
    }

	// Method to serialize the response object into a JSON string.
	async serialize(): Promise<string> {
		try {
			return JSON.stringify({
				// Tries to serialize the response object.
				status: this.status,
				error: this.error,
				message: this.message,
				data: this.data,
			});
		} catch (e) {
			console.error('Serialization error:', e); // Catches and logs serialization errors.
			return JSON.stringify({
				// Returns error response if serialization fails.
				status: 500,
				error: true,
				message: 'Internal Server Error: Unable to serialize response',
				data: {},
			});
		}
	}

	// Static method to deserialize a JSON string back into an InternalResponse object.
	static async deserialize(jsonString: string): Promise<InternalResponse> {
		try {
			const obj = JSON.parse(jsonString); // Tries to parse the JSON string.
			return new InternalResponseHandler(
				obj.status,
				obj.message,
				obj.data
			);
		} catch (e) {
			console.error('Deserialization error:', e); // Catches and logs deserialization errors.
			return new InternalResponseHandler(
				500,
				'Internal Server Error: Unable to deserialize response',
				{} // Returns error response if deserialization fails.
			);
		}
	}
}

//  ?   Validations

interface ValidationResult {
	isValid: boolean;
	error: string | null;
}

//  *   These are all the validations that the library will utilize through out the whole application.

//  *   [Username]
// Regular expression for validating usernames.
// This regex pattern allows usernames to consist only of alphanumeric characters (both uppercase and lowercase).
// The pattern does not permit special characters or spaces in the username.
// Usage of this regex ensures that usernames follow a standard alphanumeric format.
export const usernameRegex = new RegExp(/^[a-z0-9]+$/i);

// The minimum length requirement for usernames.
// This constant sets the required minimum number of characters for a valid username.
// In this case, a username must be at least 8 characters long.
// This requirement helps ensure that usernames are sufficiently unique and identifiable.
export const usernameLength: number = 8;


/**
 * Validates a username based on length and character composition using a regex pattern.
 * This function takes a single string parameter 'value', which is the username to be validated.
 * It first checks if the username meets a minimum length requirement (defined by `usernameLength`).
 * Then, it validates the username against a regular expression `usernameRegex` (assumed to be defined elsewhere in your codebase)
 * to ensure it contains only valid characters. The function can be extended to check if the username is already taken
 * by making an API request (as indicated by the TODO comment).
 * If the username fails any of these checks, the function returns a validation error response using `InternalResponseHandler`
 * with a 400 status and an error message. If all checks pass, the function returns a success response with a 200 status,
 * indicating the username is valid.
 * 
 * @param value - The username string to be validated.
 * @returns A Promise resolving to an InternalResponseHandler, indicating the validation result.
 */
export const validateUsername = async (
    value: string
): Promise<InternalResponseHandler> => {
    // Check if the username is shorter than the minimum required length
    if (value.length < usernameLength) {
        return new InternalResponseHandler(400, 'Validation Error', {
            error: 'Username is too short. Minimum length is ' + usernameLength,
        });
    }

    // Check if the username does not match the regex pattern
    if (!usernameRegex.test(value)) {
        return new InternalResponseHandler(400, 'Validation Error', {
            error: 'Username contains invalid characters.',
        });
    }

    // TODO: Additional checks as needed, such as verifying if the username is already in use

    // If all checks pass, return a success response
    return new InternalResponseHandler(200, 'Validation Successful', {
        message: 'Username is valid.',
    });
};


/**
 * Validates a username by sending it to a username validation service.
 * This function takes a single string parameter 'username', which it sends to the `validateUsername` function.
 * The `validateUsername` function is assumed to be an external or asynchronous service that validates the username based on specific criteria.
 * The function checks the response from `validateUsername` to determine if the username is valid.
 * If the username is valid (status 200), it returns an object indicating the username is valid.
 * If the username is invalid or if the `validateUsername` service returns a non-200 status, it returns an object indicating the username is invalid along with the error message.
 * In case of an exception, such as a network error or an issue with the `validateUsername` service, the function catches the error and returns a generic error message.
 * 
 * @param username - The username string to be validated.
 * @returns An object containing a boolean flag 'isValid' and an 'error' message if applicable.
 */
export async function checkUsername(username: string) {
    try {
        // Await response from the username validation service
        const response = await validateUsername(username);

        // Check if the response status is 200 (OK)
        if (response.status === 200) {
            // Username is valid, return an object indicating validity
            return { isValid: true, error: null };
        } else {
            // Username is invalid, return an object with the error message
            return { isValid: false, error: response.data.error };
        }
    } catch (error) {
        // Catch and handle any unexpected errors
        // Return an object indicating the username is invalid and provide a generic error message
        return { isValid: false, error: 'An unexpected error occurred' };
    }
}

//  *   [Email]
export const emailRegex = new RegExp(
	/(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])/
);

/**
 * Validates an email address using a regular expression (regex).
 * This function takes a single string parameter 'value', which is the email address to be validated.
 * It uses a predefined regular expression `emailRegex` (assumed to be defined elsewhere in your codebase)
 * to check the format of the email address. If the email does not match the regex, the function returns
 * a validation error response using `InternalResponseHandler` with a 400 status and an error message.
 * If the email matches the regex, the function can perform additional checks (as indicated by the TODO comment).
 * If all checks pass, the function returns a success response with a 200 status, indicating the email is valid.
 * 
 * @param value - The email string to be validated.
 * @returns A Promise resolving to an InternalResponseHandler, indicating the validation result.
 */
export const validateEmail = async (
    value: string
): Promise<InternalResponseHandler> => {
    // Check if the email does not match the regex
    if (!emailRegex.test(value)) {
        return new InternalResponseHandler(400, 'Validation Error', {
            error: 'Email is invalid.',
        });
    }

    // TODO: Additional checks as needed, such as checking if the email is already in use

    // If all checks pass, return a success response
    return new InternalResponseHandler(200, 'Validation Successful', {
        message: 'Email is valid.',
    });
};

/**
 * Validates an email address by sending it to an email validation service.
 * This function takes a single string parameter 'email', which it sends to the `validateEmail` function.
 * The `validateEmail` function is assumed to be an external or asynchronous service that validates the email format.
 * The function checks the response from `validateEmail` to determine if the email is valid.
 * If the email is valid (status 200), it returns an object indicating the email is valid.
 * If the email is invalid or if the `validateEmail` service returns a non-200 status, it returns an object indicating the email is invalid along with the error message.
 * In case of an exception, such as a network error or an issue with the `validateEmail` service, the function catches the error and returns a generic error message.
 * 
 * @param email - The email string to be validated.
 * @returns An object containing a boolean flag 'isValid' and an 'error' message if applicable.
 */
export async function checkEmail(email: string) {
    try {
        // Await response from the email validation service
        const response = await validateEmail(email);

        // Check if the response status is 200 (OK)
        if (response.status === 200) {
            // Email is valid, return an object indicating validity
            return { isValid: true, error: null };
        } else {
            // Email is invalid, return an object with the error message
            return { isValid: false, error: response.data.error };
        }
    } catch (error) {
        // Catch and handle any unexpected errors
        // Return an object indicating the email is invalid and provide a generic error message
        return { isValid: false, error: 'An unexpected error occurred' };
    }
}


/**
 * This function validates a given password based on several criteria: length, 
 * presence of uppercase and lowercase letters, digits, and special characters.
 * It accepts a string parameter 'password' and returns a Promise that resolves to 
 * an instance of `InternalResponseHandler`. This instance represents the outcome 
 * of the validation: either a success (valid password) or a failure (invalid password), 
 * along with appropriate messages and status codes.
 * 
 * @param password - The password string to be validated.
 * @returns A Promise resolving to an InternalResponseHandler, indicating the validation result.
 */
export const validatePassword = async (
    password: string
): Promise<InternalResponseHandler> => {
    // Check if the password is shorter than 8 characters
    if (password.length < 8) {
        // Return a validation error with a message about the password being too short
        return new InternalResponseHandler(400, 'Validation Error', {
            error: 'Password is too short',
        });
    }

    // Check if the password is longer than 255 characters
    if (password.length > 255) {
        // Return a validation error with a message about the password being too long
        return new InternalResponseHandler(400, 'Validation Error', {
            error: 'Password is too long',
        });
    }

    // Define regular expressions for different character types
    const hasUppercase = /[A-Z]/.test(password); // Checks for uppercase letters
    const hasLowercase = /[a-z]/.test(password); // Checks for lowercase letters
    const hasDigit = /\d/.test(password);       // Checks for digits
    const hasSpecial = /[^A-Za-z0-9]/.test(password); // Checks for special characters

    // Check if the password contains uppercase, lowercase, digits, and special characters
    if (!hasUppercase || !hasLowercase || !hasDigit || !hasSpecial) {
        // Return a validation error with a message about missing character types
        return new InternalResponseHandler(400, 'Validation Error', {
            error: 'Password must include uppercase, lowercase, digits, and special characters',
        });
    }

    // If all checks pass, return a success response
    return new InternalResponseHandler(200, 'Validation Successful', {
        message: 'Password is valid',
    });
};

/**
 * This function checks the validity of a password by sending it to a validation service.
 * It takes a single string parameter 'password', which it passes to the `validatePassword` function (assumed to be an external or asynchronous service).
 * The function interprets the response from `validatePassword` to determine if the password is valid.
 * If the password is valid (status 200), it returns an object indicating the password is valid.
 * If the password is invalid or if the `validatePassword` service returns a non-200 status, it returns an object indicating the password is invalid along with the error message.
 * In case of an exception, such as a network error or an issue with the `validatePassword` service, the function catches the error and returns a generic error message.
 * 
 * @param password - The password string to be validated.
 * @returns An object containing a boolean flag 'isValid' and an 'error' message if applicable.
 */
export async function checkPassword(password: string) {
	try {
		// Await response from the password validation service
		const response = await validatePassword(password);

		// Check if the response status is 200 (OK)
		if (response.status === 200) {
			// Password is valid, return an object indicating validity
			return { isValid: true, error: null };
		} else {
			// Password is invalid, return an object with the error message
			return { isValid: false, error: response.data.error };
		}
	} catch (error) {
		// Catch and handle any unexpected errors
		// Return an object indicating the password is invalid and provide a generic error message
		return { isValid: false, error: 'An unexpected error occurred' };
	}
}


/**
 * This function sends a POST request to a specified URL with the given data and headers.
 * It uses the JavaScript Fetch API to perform the HTTP POST request. The function accepts three parameters:
 * the URL to which the request is sent, the data to be sent as part of the request body, and any additional headers.
 * The data is sent as JSON. The function handles the response by creating an instance of `InternalResponseHandler`,
 * which standardizes the response format, whether it's a successful response or an error.
 * In case of a network or other request-related error, the function catches the error and returns an error response.
 * 
 * @param url - The URL to which the POST request is sent.
 * @param data - The data object to be sent, which is serialized to JSON.
 * @param headers - Additional headers to be sent with the request.
 * @returns A promise that resolves to an instance of InternalResponseHandler, representing the response.
 */

export async function spear(
    url: string, 
    data: any, 
    headers: Record<string, string>
): Promise<InternalResponseHandler> {
    try {
        // Initiating a POST request using the fetch API
        const response = await fetch(url, {
            method: 'POST', // Setting the method as POST
            headers: {
                'Content-Type': 'application/json', // Setting content type header to JSON
                ...headers // Spreading any additional headers passed to the function
            },
            body: JSON.stringify(data), // Serializing the data object to a JSON string
            credentials: 'include'
        });

        // Parsing the JSON response body
        const responseData = await response.json();
        // Creating a new instance of InternalResponseHandler with the response details
        const message = responseData.message || (response.ok ? 'Success' : 'Error');
        const error = !response.ok;
        const dataField = error && responseData.error ? { error: responseData.error } : responseData;

        return new InternalResponseHandler(response.status, message, dataField);

    } catch (error) {
        // Catching and logging any errors that occur during the fetch request
        console.error('Request failed:', error);
        // Returning an InternalResponseHandler instance for the error case
        return new InternalResponseHandler(
            500, // HTTP status code for internal server error
            'Internal Server Error: Request failed', // Error message
            {} // Empty object for data
        );
    }
}


/**
 * Sends a GET request to a specified URL with the given query parameters and headers.
 * It uses the JavaScript Fetch API to perform the HTTP GET request. The function accepts three parameters:
 * the URL to which the request is sent, the data to be sent as part of the query string, and any additional headers.
 * The data object is converted into a query string. The function handles the response by creating an instance of
 * `InternalResponseHandler`, which standardizes the response format, whether it's a successful response or an error.
 * In case of a network or other request-related error, the function catches the error and returns an error response.
 * 
 * @param url - The base URL to which the GET request is sent.
 * @param data - The data object to be sent, which is converted to a query string.
 * @param headers - Additional headers to be sent with the request.
 * @returns A promise that resolves to an instance of InternalResponseHandler, representing the response.
 */
export async function helmet(
    url: string, 
    data: Record<string, any>, 
    headers: Record<string, string>
): Promise<InternalResponseHandler> {
    try {
        // Convert data object to query string
        const queryString = new URLSearchParams(data).toString();
        const fullUrl = `${url}?${queryString}`;

        // Initiating a GET request using the fetch API
        const response = await fetch(fullUrl, {
            method: 'GET', // Setting the method as GET
            headers: {
                ...headers // Spreading any additional headers passed to the function
            },
            credentials: 'include'
        });

        // Parsing the JSON response body
        const responseData = await response.json();
        // Creating a new instance of InternalResponseHandler with the response details
        return new InternalResponseHandler(
            response.status, // HTTP status code of the response
            responseData.message || (response.ok ? 'Success' : 'Error'), // Response message or default based on HTTP status
            responseData.data || {} // Response data or an empty object if none
        );
    } catch (error) {
        // Catching and logging any errors that occur during the fetch request
        console.error('Request failed:', error);
        // Returning an InternalResponseHandler instance for the error case
        return new InternalResponseHandler(
            500, // HTTP status code for internal server error
            'Internal Server Error: Request failed', // Error message
            {} // Empty object for data
        );
    }
}


/**
 * Registers a new user by sending their details to a dynamically constructed registration API URL.
 * This function takes five parameters: an endpoint URL, username, email, password, and captcha.
 * It constructs the full API URL by concatenating the endpoint with predefined path segments.
 * A data object is constructed from the username, email, password, and captcha, and a POST request
 * is sent to the constructed URL. An additional custom header 'x-kbve-shieldwall' is included in the request.
 * The function relies on a `spear` function (assumed to be defined elsewhere) to send the request and handle the response.
 * 
 * @param endpoint - The base URL of the API (e.g., 'https://rust.kbve.com' or 'https://api.herbmail.com').
 * @param username - The username of the new user.
 * @param email - The email address of the new user.
 * @param password - The password chosen by the new user.
 * @param captcha - The captcha response to verify the user is not a bot.
 * @returns A promise that resolves to the response from the registration API.
 */
export async function registerUser(
    endpoint: string,
    username: string, 
    email: string, 
    password: string, 
    captcha: string
): Promise<InternalResponseHandler> {
    // Construct the full URL using the endpoint and predefined path segments
    const url = `${endpoint}${kbve_v01d}${auth_register}`;
    const data = {
        username,
        email,
        password,
        token: captcha
    };
    const headers = {
        'x-kbve-shieldwall': 'auth-register'
    };

    return spear(url, data, headers);
}

/**
 * Logs in a user by sending their email and password to a dynamically constructed login API URL.
 * This function takes three parameters: an endpoint URL, email, and password. It constructs the full API URL
 * by concatenating the endpoint with predefined path segments. It then constructs a data object
 * from the email and password, and sends a POST request to the constructed URL.
 * The `spear` function (assumed to be defined elsewhere) is used to send the request and handle the response.
 *
 * @param endpoint - The base URL of the API (e.g., 'https://rust.kbve.com' or 'https://api.herbmail.com').
 * @param email - The email address of the user attempting to log in.
 * @param password - The password of the user attempting to log in.
 * @returns A promise that resolves to the response from the login API.
 */
export async function loginUser(
    endpoint: string,
    email: string,
    password: string
): Promise<InternalResponseHandler> {
    // Construct the full URL using the endpoint and predefined path segments
    const url = `${endpoint}${kbve_v01d}${auth_login}`;
    const data = {
        email,
        password
    };
    // Use appropriate headers if needed
    const headers = {
		'x-kbve-shieldwall': 'auth-login'
	};

    return spear(url, data, headers);
}

/**
 * Logs out a user by sending a GET request to a dynamically constructed logout API URL.
 * This function takes one parameter: the endpoint URL. It constructs the full API URL
 * by concatenating the endpoint with predefined path segments. The function then sends a GET request
 * to the constructed URL using the `helmet` function (assumed to be defined elsewhere).
 * The `helmet` function handles the request and the response.
 *
 * @param endpoint - The base URL of the API (e.g., 'https://rust.kbve.com' or 'https://api.herbmail.com').
 * @returns A promise that resolves to the response from the logout API.
 */
export async function logoutUser(endpoint: string): Promise<InternalResponseHandler> {
    // Construct the full URL using the endpoint and predefined path segments
    const url = `${endpoint}${kbve_v01d}${auth_logout}`;

    // Define the headers or any other configurations if needed
    const headers = {
		'x-kbve-shieldwall': 'auth-logout'
	};

    // Since logout might not require sending data, we send an empty object
    return helmet(url, {}, headers);
}

/**
 * TODO: Profile
 * 
 */

export async function profile(endpoint: string): Promise<InternalResponseHandler> {
    // Construct the full URL using the endpoint and predefined path segments
    const url = `${endpoint}${kbve_v01d}${auth_profile}`;

    // Define the headers or any other configurations if needed
    const headers = {
		'x-kbve-shieldwall': 'auth-profile'
	};

    return helmet(url, {}, headers);

}