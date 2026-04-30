// Minimal Obsidian API stub for vitest. Real implementation is provided by
// Obsidian at runtime; this only needs to satisfy type imports + vi.mock().

export interface RequestUrlResponse {
	status: number;
	headers: Record<string, string>;
	text: string;
	json: any;
	arrayBuffer: ArrayBuffer;
}

export interface RequestUrlParam {
	url: string;
	method?: string;
	headers?: Record<string, string>;
	body?: string | ArrayBuffer;
	contentType?: string;
	throw?: boolean;
}

export const requestUrl = async (_param: RequestUrlParam): Promise<RequestUrlResponse> => {
	throw new Error('requestUrl mock not configured — use vi.mocked(requestUrl).mockResolvedValue(...)');
};

export class Plugin {
	app: any;
	manifest: any;
	async onload(): Promise<void> {}
	onunload(): void {}
}

export class PluginSettingTab {
	app: any;
	plugin: any;
	containerEl: any;
}

export class ItemView {
	containerEl: any;
	leaf: any;
	getViewType(): string { return ''; }
	getDisplayText(): string { return ''; }
	getIcon(): string { return ''; }
}

export class WorkspaceLeaf {
	view: any;
}

export const MarkdownView = class {
	editor: any;
};

export class Modal {
	app: any;
	contentEl: any;
}

export class Notice {
	constructor(_msg: string) {}
}

export class TFile {
	path: string = '';
	extension: string = 'md';
	parent: TFolder | null = null;
}

export class TFolder {
	path: string = '';
	children: Array<TFile | TFolder> = [];
}
