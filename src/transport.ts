import { requestUrl, RequestUrlResponse } from 'obsidian';

/**
 * Creates a fetch-compatible function backed by Obsidian's requestUrl.
 *
 * Key behaviors:
 * - requestUrl bypasses CORS and works in Obsidian's Electron environment
 * - requestUrl THROWS on non-2xx responses; we catch and return a synthetic
 *   non-ok Response so consumers (like SDK BaseAPI._handleError) can parse
 *   status codes and error bodies through the normal fetch contract
 * - Network-level failures (no status) throw TypeError to match fetch semantics
 */
export function createObsidianFetch(): typeof fetch {
	return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
		const url = typeof input === 'string' ? input : input.toString();
		try {
			const result = await requestUrl({
				url,
				method: init?.method || 'GET',
				headers: init?.headers as Record<string, string>,
				body: typeof init?.body === 'string' ? init.body : undefined,
			});
			return toFetchResponse(result);
		} catch (err: any) {
			// requestUrl throws on non-2xx — convert to synthetic Response so
			// BaseAPI._handleError can parse status + body normally
			if (err && typeof err.status === 'number') {
				return toFetchResponse(err as RequestUrlResponse);
			}
			// Network-level failure (offline, DNS, ECONNREFUSED)
			throw new TypeError(`Network request failed: ${err?.message || err}`);
		}
	};
}

function toFetchResponse(result: RequestUrlResponse): Response {
	const body = typeof result.text === 'string' ? result.text : '';
	return {
		ok: result.status >= 200 && result.status < 300,
		status: result.status,
		statusText: '',
		headers: new Headers(result.headers as Record<string, string>),
		json: async () => {
			if (result.json !== undefined && result.json !== null) {
				return result.json;
			}
			return JSON.parse(body);
		},
		text: async () => body,
	} as Response;
}
