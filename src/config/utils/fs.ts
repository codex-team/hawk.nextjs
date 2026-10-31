import { Buffer } from 'node:buffer';
import { open, readdir } from 'node:fs/promises';
import path from 'node:path';

/**
 * Max number of files read or written at the same time.
 * Keeps memory usage flat on builds with thousands of chunks
 */
export const MAX_PARALLEL_FILE_OPERATIONS = 16;

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

/**
 * Reads the end of the file without loading the whole file into memory,
 * e.g. to find the trailing `//# sourceMappingURL=...` comment
 * @param filePath - absolute path to the file
 * @param maxBytes - max number of bytes to read
 * @returns whole file when it fits, otherwise its last lines starting with `\n`: the cut line is dropped
 */
export async function readFileTail(filePath: string, maxBytes: number): Promise<string> {
  const file = await open(filePath, 'r');

  try {
    const { size } = await file.stat();
    const length = Math.min(maxBytes, size);
    const { bytesRead, buffer } = await file.read(Buffer.alloc(length), 0, length, size - length);
    const tail = buffer.subarray(0, bytesRead).toString('utf8');

    if (length === size) {
      return tail;
    }

    const cutLineEnd = tail.indexOf('\n');

    return cutLineEnd === -1 ? '' : tail.slice(cutLineEnd);
  } finally {
    await file.close();
  }
}
