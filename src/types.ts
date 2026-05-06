export type SmartMemoryMode = 'cloud' | 'lite';

export interface SmartMemorySettings {
	// Connection mode (DIST-OBSIDIAN-LITE-1)
	mode: SmartMemoryMode;

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
	mode: 'cloud',
	apiKey: '',
	apiUrl: 'https://api.smartmemory.ai',
	workspaceId: '',

	// Seamless by default: edited and new notes flow into SmartMemory without
	// requiring a command. Users can disable in settings if they prefer
	// command-driven ingest.
	autoIngestOnSave: true,
	autoIngestOnCreate: true,
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

/** DIST-OBSIDIAN-LITE-1: daemon defaults for the local-only path. */
export const LITE_DAEMON_URL = 'http://127.0.0.1:9014';

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
