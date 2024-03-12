import { createClient, SupabaseClient  } from '@supabase/supabase-js'

import { supabase_url, supabase_anon } from './kbve';


export function supabase_test(): string {
    return 'supabase_test';
}




/**
 * Register a new user with Supabase.
 * @param {Object} params - The registration parameters.
 * @param {string} params.email - The user's email.
 * @param {string} params.password - The user's chosen password.
 * @param {string} params.username - The user's chosen username.
 * @param {string} params.captchaToken - The CAPTCHA token for verification.
 * @returns {Promise<string>} A promise that resolves to a success or error message.
 */
export async function supabaseRegisterUser({ email, password, username, captchaToken }: { email: string; password: string; username: string; captchaToken: string; }): Promise<string> {
    
   
  
    try {
      
      const supabase_kbve: SupabaseClient = createClient(supabase_url, supabase_anon, {
        global: { fetch: fetch.bind(globalThis) }
      });

      const { data, error } = await supabase_kbve.auth.signUp({
        email,
        password,
        options: { 
            data: {
                username }, // Add username to user_metadata
        captchaToken, // Include the captchaToken
            }
      });
  
      // Handle the response
      if (error) {
        // Type assertion if error is known to follow a specific structure
        const errorMessage = (error as { message: string }).message;
        throw new Error(errorMessage);
      }
      
      if (data.user) return 'User registration successful';
  
      return 'Unexpected response from Supabase';
    } catch (error) {
      // Log or handle error appropriately
      let errorMessage = 'Registration failed: Unknown error';
        if (error instanceof Error) {
        errorMessage = `Registration failed: ${error.message}`;
        }
        console.error('Supabase registration error:', errorMessage);
        return errorMessage;
    }
}


/**
 * Log in a user with Supabase.
 * @param {Object} params - The login parameters.
 * @param {string} params.email - The user's email.
 * @param {string} params.password - The user's password.
 * @param {string} params.captchaToken - The CAPTCHA token for verification.
 * @returns {Promise<string>} A promise that resolves to a success or error message.
 */
export async function supabaseLoginUser({ email, password, captchaToken } : {email: string; password: string; captchaToken: string}): Promise<string> {
    try {
      
      const supabase_kbve: SupabaseClient = createClient(supabase_url, supabase_anon, {
        global: { fetch: fetch.bind(globalThis) }
      });
      
      const { data, error } = await supabase_kbve.auth.signInWithPassword({
        email,
        password,
        options: {
            captchaToken,  // Include the captchaToken in options
         }
      });
  
      // Handle the response
      if (error) {
        // Type assertion if error is known to follow a specific structure
        const errorMessage = (error as { message: string }).message;
        throw new Error(errorMessage);
      }
      if (data.session) return 'User login successful';
  
      return 'Unexpected response from Supabase';
    } catch (error) {
      // Improved error handling with type checking
      let errorMessage = 'Login failed: Unknown error';
      if (error instanceof Error) {
        errorMessage = `Login failed: ${error.message}`;
      }
      console.error('Supabase login error:', errorMessage);
      return errorMessage;
    }
  }