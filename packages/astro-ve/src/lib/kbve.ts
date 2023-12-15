/* cspell:disable */
// Disabling spell checking for this file, useful for code editors with spell check features.

/* PUBLIC CONFIGURATIONS */
// Section for defining public configurations and constants.

// Declaring a TypeScript type 'kbveLocker' for user profile information.
export type kbveLocker = {
	/* core */
	username: string; // User's username.
	uuid: string; // User's unique identifier (UUID).
	email: string; // User's email address.

	/* profile */
	avatar: string; // URL to the user's avatar image.
	github: string; // User's GitHub profile URL.
	instagram: string; // User's Instagram profile URL.
	bio: string; // Short biography or description of the user.
	pgp: string; // PGP key or identifier for the user.
	unsplash: string; // User's Unsplash profile URL.
};

// Exporting a constant 'kbve_v01d' representing a version or an identifier.
export const kbve_v01d: string = '1';

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
export const auth_register: string = '/api/v1/auth/register'; // Endpoint for user registration.
export const auth_login: string = '/api/v1/auth/login'; // Endpoint for user login.


// ? Interface

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
    status: number;    // Numeric status code of the response.
    error: boolean;    // Boolean flag indicating whether there was an error.
    message: string;   // Message associated with the response.
    data: any;         // Data payload of the response. 'any' type allows flexibility.
}

// Class implementing the InternalResponse interface.
class InternalResponseHandler implements InternalResponse {
    status: number;    // Holds the status code of the response.
    error: boolean;    // Holds the error status of the response.
    message: string;   // Holds the message of the response.
    data: any;         // Holds the data payload of the response.

    // Constructor to initialize the response handler with status, message, and data.
    constructor(status: number, message: string, data: any) {
        this.status = status;                                      // Sets the status.
        this.error = status < 200 || status >= 300;               // Determines error based on status code.
        this.message = message;                                    // Sets the message.
        this.data = data;                                          // Sets the data.
    }

    // Method to display the response details in the console.
    display(): void {
        console.log(
            `Status: ${this.status}, Message: ${this.message}, Error: ${
                this.error
            }, Data: ${JSON.stringify(this.data)}`                 // Formats and logs the response details.
        );
    }

    // Method to serialize the response object into a JSON string.
    async serialize(): Promise<string> {
        try {
            return JSON.stringify({                               // Tries to serialize the response object.
                status: this.status,
                error: this.error,
                message: this.message,
                data: this.data,
            });
        } catch (e) {
            console.error('Serialization error:', e);               // Catches and logs serialization errors.
            return JSON.stringify({                                // Returns error response if serialization fails.
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
            const obj = JSON.parse(jsonString);                     // Tries to parse the JSON string.
            return new InternalResponseHandler(
                obj.status,
                obj.message,
                obj.data
            );
        } catch (e) {
            console.error('Deserialization error:', e);             // Catches and logs deserialization errors.
            return new InternalResponseHandler(
                500,
                'Internal Server Error: Unable to deserialize response',
                {}                                                 // Returns error response if deserialization fails.
            );
        }
    }
}


//  ?   Validations

//  *   These are all the validations that the library will utilize through out the whole application.

//  *   [Username]
export const usernameRegex = new RegExp(/^[a-z0-9]+$/i); // Regular expression for validating usernames.
export const usernameLength: number = 8;
export const validateUsername = async (value: string): Promise<InternalResponseHandler> => {
    // Check if the username is too short
    if (value.length < usernameLength) {
        return new InternalResponseHandler(
            400, 
            'Validation Error', 
            { error: 'Username is too short. Minimum length is ' + usernameLength }
        );
    }

    // Check if the username does not match the regex
    if (!usernameRegex.test(value)) {
        return new InternalResponseHandler(
            400, 
            'Validation Error', 
            { error: 'Username contains invalid characters.' }
        );
    }

    // If all checks pass, return a success response
    return new InternalResponseHandler(
        200, 
        'Validation Successful', 
        { message: 'Username is valid.' }
    );
};
