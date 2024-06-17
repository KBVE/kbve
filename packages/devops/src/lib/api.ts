import axios from 'axios';
import {
  _isULID,
  markdownToJsonSafeString,
  markdownToJsonSafeStringThenStrip,
  _md2json,
  __md2json,
} from './sanitization';

const sanitizationFunctions: {
  [key: number]: (text: string) => Promise<string>;
} = {
  1: markdownToJsonSafeString,
  2: markdownToJsonSafeStringThenStrip,
  3: _md2json,
  4: __md2json,
};

/**
 * Fetches the prompt from the API using a ULID.
 * @param ulid - The ULID to fetch the prompt for.
 * @returns The prompt object.
 */
export async function _prompt(ulid: string): Promise<{ task: string }> {
  if (!_isULID(ulid)) {
    throw new Error(`Invalid ULID: ${ulid}`);
  }

  try {
    const response = await axios.get('https://kbve.com/api/prompt/engine.json');
    const data = response.data.key;

    const prompt = data[ulid];

    if (!prompt) {
      throw new Error(`Prompt with ULID ${ulid} not found`);
    }

    return prompt;
  } catch (error) {
    console.error(`Error fetching prompt for ULID ${ulid}:`, error);
    throw error;
  }
}

/**
 * Constructs the headers for the API request.
 * @param kbve_api - The API token for authentication.
 * @returns The headers object.
 */
export function _headers(kbve_api?: string): object {
  const headers: { [key: string]: string } = {
    'Content-Type': 'application/json',
  };

  if (kbve_api) {
    headers['Authorization'] = `Bearer ${kbve_api}`;
  }

  return headers;
}

/**
 * Makes a POST request to the specified API with the given payload.
 * @param url - The URL of the API to call.
 * @param payload - The payload to send in the request.
 * @param headers - The headers to include in the request.
 * @returns The API response data.
 * @throws Error if the response status is not successful.
 */
export async function _post<T>(
    url: string,
    payload: object,
    headers: object,
  ): Promise<T> {
    try {
      const response = await axios.post<T>(url, payload, {
        headers: headers,
      });
  
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
  
      return response.data;
    } catch (error) {
      console.error(`Error making POST request to ${url}:`, error);
      throw error;
    }
  }
  
/**
 * Sanitizes the message based on the specified sanitization level.
 * @param message - The message to sanitize.
 * @param level - The sanitization level to apply.
 * @returns The sanitized message.
 */
export async function _message(
  message: string,
  level: number,
): Promise<string> {
  if (sanitizationFunctions[level]) {
    return await sanitizationFunctions[level](message);
  }
  return message;
}

/**
 * Processes the groq request.
 * @param system - The system to use.
 * @param message - The message to process.
 * @param kbve_api - The API token for authentication.
 * @param model - The model to use.
 * @param sanitizationLevel - The level of sanitization to apply.
 * @returns The response data from the API.
 */
export async function _groq(
  system: string,
  message: string,
  kbve_api: string,
  model: string,
  sanitizationLevel: number,
): Promise<any> {
  try {
    const headers = _headers(kbve_api);

    if (_isULID(system)) {
      const prompt = await _prompt(system);
      system = prompt.task;
    }

    message = await _message(message, sanitizationLevel);

    const payload = {
      system,
      message,
      model,
    };

    const apiResponse = await _post(
      'https://rust.kbve.com/api/v1/call_groq',
      payload,
      headers,
    );
    return apiResponse;
  } catch (error) {
    console.error('Error processing groq request:', error);
    throw error;
  }
}
