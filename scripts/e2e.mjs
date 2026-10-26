/**
 * Builds the example app with the plugin and checks what was sent to the mock collector.
 *
 * Usage: yarn e2e [--webpack] [--debug-ids]
 */
import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { readdir, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { startMockCollector } from './mock-collector.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exampleDir = path.join(rootDir, 'example');
const distDir = path.join(exampleDir, '.next');
const staticDir = path.join(distDir, 'static');

const useWebpack = process.argv.includes('--webpack');
const useDebugIds = process.argv.includes('--debug-ids');

/**
 * Fake token: the plugin needs it to be present, the mock collector accepts any token
 */
const token = Buffer.from(JSON.stringify({
  integrationId: 'e2e',
  secret: 'e2e',
})).toString('base64');

const failures = [];

/**
 * Prints the check result and remembers failures
 *
 * @param {boolean} passed - check result
 * @param {string} title - check description
 */
function check(passed, title) {
  console.log(`${passed ? '✓' : '✗'} ${title}`);

  if (!passed) {
    failures.push(title);
  }
}

/**
 * Returns all file paths inside the directory relative to it
 *
 * @param {string} dir - directory to scan
 * @returns {Promise<string[]>}
 */
async function listFiles(dir) {
  const entries = await readdir(dir, {
    recursive: true,
    withFileTypes: true,
  });

  return entries
    .filter(entry => entry.isFile())
    .map(entry => path.relative(dir, path.join(entry.parentPath, entry.name)));
}

/**
 * Runs `next build` for the example app
 *
 * @param {string} collectorUrl - mock collector endpoint
 * @returns {Promise<void>}
 */
function buildExample(collectorUrl) {
  const nextBin = createRequire(path.join(exampleDir, 'package.json')).resolve('next/dist/bin/next');
  const args = [nextBin, 'build', ...(useWebpack ? ['--webpack'] : [])];

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: exampleDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        HAWK_TOKEN: token,
        NEXT_PUBLIC_HAWK_TOKEN: token,
        HAWK_COLLECTOR_ENDPOINT: collectorUrl,
        HAWK_E2E_DEBUG_IDS: useDebugIds ? '1' : '0',
      },
    });

    child.on('error', reject);
    child.on('exit', code => (code === 0 ? resolve() : reject(new Error(`next build exited with code ${code}`))));
  });
}

/**
 * Returns sources of a regular or indexed source map
 *
 * @param {object} map - parsed source map
 * @returns {string[]}
 */
function getSources(map) {
  return [
    ...(map.sources ?? []),
    ...(map.sections ?? []).flatMap(section => section.map?.sources ?? []),
  ];
}

await rm(distDir, {
  recursive: true,
  force: true,
});

const collector = await startMockCollector();

try {
  await buildExample(collector.url);
} finally {
  await collector.close();
}

console.log(`\nE2E checks (${useWebpack ? 'webpack' : 'Turbopack'}${useDebugIds ? ', debug ids' : ''})\n`);

const { requests } = collector;
const releases = new Set(requests.map(request => request.release));
const release = requests[0]?.release;
const mapRequests = requests.filter(request => request.files.length > 0);
const commitsRequests = requests.filter(request => request.commits !== undefined);

check(requests.length > 0, `collector received ${requests.length} requests`);
check(releases.size === 1 && typeof release === 'string' && release !== '', `all requests have the same release "${release}"`);
check(requests.every(request => request.authorization === `Bearer ${token}`), 'all requests are authorized with the token');
check(commitsRequests.length === 1 && commitsRequests[0].commits.length > 0, 'commits are sent in a single request');
check(requests.indexOf(commitsRequests[0]) === 0, 'commits are sent before source maps');
check(mapRequests.every(request => request.files.length === 1 && request.files[0].name.endsWith('.js.map')), `${mapRequests.length} source maps are sent one per request`);

const maps = mapRequests.map(request => JSON.parse(request.files[0].content));
const chunkFiles = new Set((await listFiles(staticDir)).map(file => `/_next/static/${file.split(path.sep).join('/')}`));
const sources = maps.flatMap(getSources);
const indexedMapsCount = maps.filter(map => Array.isArray(map.sections)).length;

if (process.argv.includes('--verbose')) {
  for (const map of maps) {
    console.log(`  ${map.file}: ${getSources(map).slice(0, 3)
.join(', ')}`);
  }

  console.log(`  chunks on disk: ${[...chunkFiles].join(', ')}`);
}

check(maps.every(map => /^\/_next\/static\/.+\.js$/.test(map.file)), 'every map has `file` with the public chunk path');
check(maps.every(map => chunkFiles.has(map.file)), 'every map `file` points to an existing chunk');
/**
 * Turbopack root is the repository root, so project sources start with `example/`
 */
check(sources.some(source => /^(example\/)?app\/error-button\.tsx$/.test(source)), 'project sources are normalized, e.g. example/app/error-button.tsx');
check(!sources.some(source => source.startsWith('turbopack:///[project]/')), 'no Turbopack project prefixes left in sources');
console.log(`  ${indexedMapsCount} of ${maps.length} maps are indexed (sections)`);

const staticFiles = await listFiles(staticDir);
const assets = staticFiles.filter(file => /\.(js|css)$/.test(file));
const contents = await Promise.all(assets.map(file => readFile(path.join(staticDir, file), 'utf8')));

check(!staticFiles.some(file => file.endsWith('.map')), 'no source maps left in .next/static');
check(!contents.some(content => /sourceMappingURL=\S+\s*(\*\/)?\s*$/.test(content)), 'no sourceMappingURL comments left in client assets');
check(contents.some(content => content.includes(release)), 'release is inlined into client chunks');

if (failures.length > 0) {
  console.log(`\n${failures.length} checks failed`);
  process.exit(1);
}

console.log('\nAll checks passed');
