/**
 * Pure connection-gating logic for the SmartMemory SDK client
 * (DIST-OBSIDIAN-LITE-PARITY-1).
 *
 * Extracted from main.ts:initClient so the cloud-vs-lite decision is unit
 * testable. The core invariant:
 *
 *   - cloud mode  → requires an API key (hosted service enforces auth)
 *   - lite  mode  → connects KEYLESS; the local daemon reports auth:false,
 *                   so an API key is meaningless (and a leftover cloud key
 *                   must not be sent as a bearer token to the daemon).
 *   - either mode → requires a non-empty apiUrl.
 *
 * Returning `auth: 'none'` tells the caller to construct SmartMemoryClient
 * with no token, which makes the SDK omit the Authorization header entirely
 * (AuthCore.getAuthHeaders only sets it when a currentToken exists).
 */
export type ClientMode = 'cloud' | 'lite';

export interface ClientConfigInput {
	mode: ClientMode;
	apiUrl: string;
	apiKey: string;
}

export type ClientConfigDecision =
	| { connect: false }
	| {
			connect: true;
			/** 'apiKey' → send Bearer token; 'none' → keyless (lite daemon). */
			auth: 'apiKey' | 'none';
			apiKey?: string;
			/** Cloud auto-discovers the workspace from /auth/me; lite is single-tenant. */
			discoverWorkspace: boolean;
	  };

export function resolveClientConfig(input: ClientConfigInput): ClientConfigDecision {
	const { mode, apiUrl, apiKey } = input;

	// No endpoint → cannot connect in any mode.
	if (!apiUrl) {
		return { connect: false };
	}

	// Lite daemon has no auth. Connect keyless and never auto-discover a
	// workspace (the daemon is single-tenant and exposes no /auth/me).
	if (mode === 'lite') {
		return { connect: true, auth: 'none', discoverWorkspace: false };
	}

	// Cloud requires an API key.
	if (!apiKey) {
		return { connect: false };
	}

	return { connect: true, auth: 'apiKey', apiKey, discoverWorkspace: true };
}
