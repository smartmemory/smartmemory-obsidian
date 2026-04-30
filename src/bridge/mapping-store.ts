import type { VaultMappings } from '../types';

/**
 * Bidirectional store mapping vault file paths to SmartMemory item IDs.
 *
 * Maintains:
 * - fileToMemory / memoryToFile (bidirectional, kept in sync on every mutation)
 * - entityToFile (entity name → vault note that represents it, used for auto-linking)
 * - contentHashes (file path → hash, used to detect content changes for re-ingest path selection)
 */
export class MappingStore {
	private fileToMemory: Record<string, string>;
	private memoryToFile: Record<string, string>;
	private entityToFile: Record<string, string>;
	private contentHashes: Record<string, string>;

	constructor(initial: VaultMappings) {
		this.fileToMemory = { ...initial.fileToMemory };
		this.memoryToFile = { ...initial.memoryToFile };
		this.entityToFile = { ...initial.entityToFile };
		this.contentHashes = { ...initial.contentHashes };
	}

	set(filePath: string, itemId: string): void {
		// Clear stale reverse mapping if this file was previously mapped to a different itemId
		const oldItemId = this.fileToMemory[filePath];
		if (oldItemId && oldItemId !== itemId) {
			delete this.memoryToFile[oldItemId];
		}
		// Clear stale forward mapping if this itemId was previously mapped to a different file
		const oldFilePath = this.memoryToFile[itemId];
		if (oldFilePath && oldFilePath !== filePath) {
			delete this.fileToMemory[oldFilePath];
			delete this.contentHashes[oldFilePath];
		}
		this.fileToMemory[filePath] = itemId;
		this.memoryToFile[itemId] = filePath;
	}

	getMemoryId(filePath: string): string | null {
		return this.fileToMemory[filePath] ?? null;
	}

	getFilePath(itemId: string): string | null {
		return this.memoryToFile[itemId] ?? null;
	}

	handleRename(oldPath: string, newPath: string): void {
		const itemId = this.fileToMemory[oldPath];
		if (!itemId) return;

		// Clear any stale mapping for newPath before overwriting
		const displacedItemId = this.fileToMemory[newPath];
		if (displacedItemId && displacedItemId !== itemId) {
			delete this.memoryToFile[displacedItemId];
		}

		delete this.fileToMemory[oldPath];
		this.fileToMemory[newPath] = itemId;
		this.memoryToFile[itemId] = newPath;

		const hash = this.contentHashes[oldPath];
		if (hash !== undefined) {
			delete this.contentHashes[oldPath];
			this.contentHashes[newPath] = hash;
		}
	}

	handleDelete(filePath: string): void {
		const itemId = this.fileToMemory[filePath];
		if (itemId) {
			delete this.memoryToFile[itemId];
		}
		delete this.fileToMemory[filePath];
		delete this.contentHashes[filePath];
	}

	setContentHash(filePath: string, hash: string): void {
		this.contentHashes[filePath] = hash;
	}

	getContentHash(filePath: string): string | undefined {
		return this.contentHashes[filePath];
	}

	setEntityFile(entityName: string, filePath: string): void {
		this.entityToFile[entityName] = filePath;
	}

	getEntityFile(entityName: string): string | null {
		return this.entityToFile[entityName] ?? null;
	}

	toJSON(): VaultMappings {
		return {
			fileToMemory: { ...this.fileToMemory },
			memoryToFile: { ...this.memoryToFile },
			entityToFile: { ...this.entityToFile },
			contentHashes: { ...this.contentHashes },
			lastSyncTimestamp: new Date().toISOString(),
		};
	}
}
