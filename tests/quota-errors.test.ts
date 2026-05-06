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
