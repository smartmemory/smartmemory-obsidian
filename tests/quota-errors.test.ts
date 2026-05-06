import { describe, it, expect, vi, beforeEach } from 'vitest';

const noticeSpy = vi.fn();
const modalOpenSpy = vi.fn();

vi.mock('obsidian', async () => {
	const actual = await vi.importActual<any>('obsidian');
	return {
		...actual,
		Notice: class {
			constructor(msg: string) {
				noticeSpy(msg);
			}
		},
		Modal: class {
			app: any;
			contentEl = {
				empty: () => {},
				addClass: () => {},
				createEl: () => ({ addEventListener: () => {} }),
				createDiv: () => ({
					createEl: () => ({ addEventListener: () => {} }),
				}),
			};
			constructor(app: any) {
				this.app = app;
			}
			open() {
				modalOpenSpy();
			}
			close() {}
		},
	};
});

import { handleQuotaError } from '../src/util/quota-errors';

const fakeApp = {} as any;

describe('handleQuotaError — actual server contract (429 for both quotas)', () => {
	beforeEach(() => {
		noticeSpy.mockClear();
		modalOpenSpy.mockClear();
	});

	it('memory quota 429 with detail "Memory quota exceeded" opens upgrade modal', () => {
		const err = {
			status: 429,
			data: { detail: 'Memory quota exceeded', current: 1000, limit: 1000 },
		};
		expect(handleQuotaError(fakeApp, err)).toBe(true);
		expect(modalOpenSpy).toHaveBeenCalledTimes(1);
		expect(noticeSpy).not.toHaveBeenCalled();
	});

	it('daily query 429 with detail "Daily query quota exceeded" shows notice, not modal', () => {
		const err = {
			status: 429,
			data: { detail: 'Daily query quota exceeded', resets_at: '2026-04-30T00:00:00Z' },
		};
		expect(handleQuotaError(fakeApp, err)).toBe(true);
		expect(noticeSpy).toHaveBeenCalledTimes(1);
		expect(modalOpenSpy).not.toHaveBeenCalled();
	});

	it('legacy 403 with error_code=quota_exceeded still opens upgrade modal', () => {
		const err = { status: 403, data: { error_code: 'quota_exceeded' } };
		expect(handleQuotaError(fakeApp, err)).toBe(true);
		expect(modalOpenSpy).toHaveBeenCalledTimes(1);
	});

	it('unrelated error returns false (caller handles)', () => {
		const err = { status: 500, data: { detail: 'Internal server error' } };
		expect(handleQuotaError(fakeApp, err)).toBe(false);
		expect(modalOpenSpy).not.toHaveBeenCalled();
		expect(noticeSpy).not.toHaveBeenCalled();
	});

	it('429 with no detail still surfaces something (defensive fallback)', () => {
		const err = { status: 429 };
		expect(handleQuotaError(fakeApp, err)).toBe(true);
		expect(noticeSpy).toHaveBeenCalledTimes(1);
	});

	it('legacy error_code=rate_limit shows notice', () => {
		const err = { status: 429, data: { error_code: 'rate_limit' } };
		expect(handleQuotaError(fakeApp, err)).toBe(true);
		expect(noticeSpy).toHaveBeenCalledTimes(1);
	});
});

describe('handleQuotaError — DIST-OBSIDIAN-LITE-1 lite-mode reroute', () => {
	beforeEach(() => {
		noticeSpy.mockClear();
		modalOpenSpy.mockClear();
	});

	it('memory quota in lite opens Sync-to-cloud modal (not upgrade modal)', () => {
		const err = { status: 429, data: { detail: 'Memory quota exceeded' } };
		expect(handleQuotaError(fakeApp, err, { isLite: true })).toBe(true);
		// Modal opens regardless of which copy is shown — the test for *which*
		// modal opens lives in openUpgradeModal coverage; here we just confirm
		// the lite branch still classifies the error correctly.
		expect(modalOpenSpy).toHaveBeenCalledTimes(1);
		expect(noticeSpy).not.toHaveBeenCalled();
	});

	it('rate-limit in lite shows lite-flavored notice copy', () => {
		const err = { status: 429, data: { detail: 'Daily query quota exceeded' } };
		expect(handleQuotaError(fakeApp, err, { isLite: true })).toBe(true);
		expect(noticeSpy).toHaveBeenCalledTimes(1);
		const callArg = (noticeSpy.mock.calls[0] as any)[0] as string;
		expect(callArg.toLowerCase()).toContain('sync');
	});

	it('default (no isLite) preserves cloud copy on rate-limit', () => {
		const err = { status: 429, data: { detail: 'Daily query quota exceeded' } };
		expect(handleQuotaError(fakeApp, err)).toBe(true);
		expect(noticeSpy).toHaveBeenCalledTimes(1);
		const callArg = (noticeSpy.mock.calls[0] as any)[0] as string;
		expect(callArg.toLowerCase()).toContain('upgrade');
	});
});
