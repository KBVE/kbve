import { _prompt, _headers, _post, _message, _groq } from './api';
import { _isULID } from './sanitization';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

describe('API Functions', () => {
	afterEach(() => {
		vi.restoreAllMocks();
		fetchMock.mockReset();
	});

	test('_isULID should validate ULIDs correctly', () => {
		expect(_isULID('01ARZ3NDEKTSV4RRFFQ69G5FAV')).toBe(true);
		expect(_isULID('invalidULID')).toBe(false);
	});

	test('_prompt should fetch prompt successfully', async () => {
		const ulid = '01J05G1PCD6ZXPNHEFBDYHYS77';
		fetchMock.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				key: {
					[ulid]: { task: 'test-task', system: 'test-system' },
				},
			}),
		});
		const result = await _prompt(ulid);
		expect(result).toHaveProperty('task');
	});

	test('_headers should construct headers correctly', () => {
		const kbve_api = 'test_api_key';
		const headers = _headers(kbve_api);
		expect(headers).toEqual({
			'Content-Type': 'application/json',
			Authorization: `Bearer ${kbve_api}`,
		});

		const headersWithoutApiKey = _headers();
		expect(headersWithoutApiKey).toEqual({
			'Content-Type': 'application/json',
		});
	});

	test('_post should make a POST request and return data', async () => {
		fetchMock.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				id: 101,
				title: 'foo',
				body: 'bar',
				userId: 1,
			}),
		});
		const url = 'https://jsonplaceholder.typicode.com/posts';
		const payload = { title: 'foo', body: 'bar', userId: 1 };
		const result = await _post(url, payload, {
			'Content-Type': 'application/json',
		});
		expect(result).toHaveProperty('id');
	});

	test('_message should sanitize message correctly', async () => {
		const message = '# Hello, World!';
		const sanitizedMessage = await _message(message, 1);
		expect(sanitizedMessage).toEqual(JSON.stringify('Hello, World!'));
	});
});
