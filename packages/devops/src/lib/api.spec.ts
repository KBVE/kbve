import { _prompt, _headers, _post, _message, _groq } from './api';
import { _isULID } from './sanitization';

describe('API Functions', () => {
  test('_isULID should validate ULIDs correctly', () => {
    expect(_isULID('01ARZ3NDEKTSV4RRFFQ69G5FAV')).toBe(true);
    expect(_isULID('invalidULID')).toBe(false);
  });

  test('_prompt should fetch prompt successfully', async () => {
    const ulid = '01J05G1PCD6ZXPNHEFBDYHYS77';
    const result = await _prompt(ulid);
    expect(result).toHaveProperty('task');
  });

  test('_headers should construct headers correctly', () => {
    const kbve_api = 'test_api_key';
    const headers = _headers(kbve_api);
    expect(headers).toEqual({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${kbve_api}`
    });

    const headersWithoutApiKey = _headers();
    expect(headersWithoutApiKey).toEqual({
      'Content-Type': 'application/json'
    });
  });

  test('_post should make a POST request and return data', async () => {
    const url = 'https://jsonplaceholder.typicode.com/posts';
    const payload = { title: 'foo', body: 'bar', userId: 1 };
    const result = await _post(url, payload, { 'Content-Type': 'application/json' });
    expect(result).toHaveProperty('id');
  });

  test('_message should sanitize message correctly', async () => {
    const message = '# Hello, World!';
    const sanitizedMessage = await _message(message, 1);
    expect(sanitizedMessage).toEqual(JSON.stringify('Hello, World!'));
  });

  test('_groq should process request and return API response', async () => {
    const system = '01J05G1PCD6ZXPNHEFBDYHYS77';
    const message = '# What other roles can you perform on my behalf?';
    const kbve_api = '';
    const model = 'mixtral-8x7b-32768';
    const sanitizationLevel = 1;

    const result = await _groq(system, message, kbve_api, model, sanitizationLevel);
    console.log('API Response:', result);
    expect(result).toBeDefined();
  });
});
