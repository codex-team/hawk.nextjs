import { readdir } from 'node:fs/promises';
import path from 'node:path';

/**
 * Returns paths of all entries (files and directories) inside the directory, recursively.
 * Paths are relative to the directory and use forward slashes on every platform.
 * @param dir - directory to scan
 * @returns empty list when the directory does not exist
 */
export async function listEntries(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { recursive: true });

    return entries.map(entry => entry.split(path.sep).join('/'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }

    throw error;
  }
}
