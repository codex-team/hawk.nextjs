import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Commit info in the format accepted by the Hawk collector
 */
export interface Commit {
  /**
   * Full commit hash
   */
  hash: string;

  /**
   * Commit subject
   */
  title: string;

  /**
   * Author email
   */
  author: string;

  /**
   * Author date in ISO 8601 format
   */
  date: string;
}

/**
 * Options of the commits collecting
 */
export interface CommitsOptions {
  /**
   * Path to the repository with `.git` directory. Default is the Next.js project directory
   */
  repo?: string;

  /**
   * How many recent commits to send. Default is 5
   */
  number?: number;
}

/**
 * Separates fields of a single commit in `git log` output
 */
const FIELD_SEPARATOR = '\x1f';

/**
 * Separates commits in `git log` output
 */
const RECORD_SEPARATOR = '\x1e';

/**
 * Returns recent commits of the repository
 * @param repo - path to the repository
 * @param count - number of commits to return
 */
export async function getCommits(repo: string, count: number): Promise<Commit[]> {
  const { stdout } = await execFileAsync('git', [
    'log',
    `--max-count=${count}`,
    '--format=%H%x1f%s%x1f%ae%x1f%aI%x1e',
  ], {
    cwd: repo,
    encoding: 'utf8',
  });

  return stdout
    .split(RECORD_SEPARATOR)
    .map(record => record.trim())
    .filter(record => record !== '')
    .map((record) => {
      const [hash, title, author, date] = record.split(FIELD_SEPARATOR);

      return {
        hash,
        title,
        author,
        date,
      };
    });
}
