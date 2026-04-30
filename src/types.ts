export interface SmartMemorySettings {
	// Auth
	apiKey: string;
	apiUrl: string;
	workspaceId: string;

	// Ingest
	autoIngestOnSave: boolean;
	autoIngestOnCreate: boolean;
	ingestDebounceMs: number;
	includeFolders: string[];
	excludeFolders: string[];

	// Enrichment
	enrichEntities: boolean;
	enrichRelations: boolean;
	enrichMemoryType: boolean;
	enrichSyncTimestamp: boolean;
	writeFrontmatterId: boolean;

	// Suggestions
	inlineSuggestionsEnabled: boolean;
	suggestionConfidenceThreshold: number;
	suggestionFrequency: 'aggressive' | 'balanced' | 'minimal';

	// Contradiction detection
	contradictionBannerEnabled: boolean;
	contradictionSweepIntervalMin: number;

	// Graph
	graphDefaultHops: number;
	graphMaxNodes: number;

	// Onboarding
	hasCompletedOnboarding: boolean;
	hasSeenIngestTour: boolean;
}

export const DEFAULT_SETTINGS: SmartMemorySettings = {
	apiKey: '',
	apiUrl: 'https://api.smartmemory.ai',
	workspaceId: '',

	autoIngestOnSave: false,
	autoIngestOnCreate: false,
	ingestDebounceMs: 5000,
	includeFolders: ['**/*'],
	excludeFolders: ['templates/', '.obsidian/'],

	enrichEntities: true,
	enrichRelations: true,
	enrichMemoryType: true,
	enrichSyncTimestamp: true,
	writeFrontmatterId: true,

	inlineSuggestionsEnabled: false,
	suggestionConfidenceThreshold: 0.7,
	suggestionFrequency: 'balanced',

	contradictionBannerEnabled: true,
	contradictionSweepIntervalMin: 60,

	graphDefaultHops: 2,
	graphMaxNodes: 100,

	hasCompletedOnboarding: false,
	hasSeenIngestTour: false,
};

export type ConnectionStatus = 'connected' | 'disconnected' | 'syncing';

export interface PluginData {
	settings: SmartMemorySettings;
	mappings: VaultMappings;
}

export interface VaultMappings {
	fileToMemory: Record<string, string>;
	memoryToFile: Record<string, string>;
	entityToFile: Record<string, string>;
	contentHashes: Record<string, string>;
	lastSyncTimestamp: string;
}

export const EMPTY_MAPPINGS: VaultMappings = {
	fileToMemory: {},
	memoryToFile: {},
	entityToFile: {},
	contentHashes: {},
	lastSyncTimestamp: '',
};
