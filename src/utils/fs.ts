import { readdir } from 'node:fs/promises';
import path from 'node:path';

/**
 * Returns paths of all files inside the directory, recursively. Directories are not listed,
 * so a route directory like `app/feed.js/` is not taken for a file.
 * Paths are relative to the directory and use forward slashes on every platform.
 * @param dir - directory to scan
 * @returns empty list when the directory does not exist
 */
export async function listFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = await Promise.all(entries.map(async (entry) => {
      if (entry.isDirectory()) {
        return (await listFiles(path.join(dir, entry.name))).map(file => `${entry.name}/${file}`);
      }

      return entry.isFile() ? [entry.name] : [];
    }));

    return files.flat();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }

    throw error;
  }
}
