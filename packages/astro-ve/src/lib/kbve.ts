/* cspell:disable */
// Disabling spell checking for this file, useful for code editors with spell check features.

/* PUBLIC CONFIGURATIONS */
// Section for defining public configurations and constants.

// Declaring a TypeScript type 'kbveLocker' for user profile information.
export type kbveLocker = {
    /* core */
    username: string,  // User's username.
    uuid: string,      // User's unique identifier (UUID).
    email: string,     // User's email address.

    /* profile */
    avatar: string,    // URL to the user's avatar image.
    github: string,    // User's GitHub profile URL.
    instagram: string, // User's Instagram profile URL.
    bio: string,       // Short biography or description of the user.
    pgp: string,       // PGP key or identifier for the user.
    unsplash: string,  // User's Unsplash profile URL.
}

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
export const auth_login: string = '/api/v1/auth/login';       // Endpoint for user login.
