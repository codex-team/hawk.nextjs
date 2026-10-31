/**
 * Builds the example app with the plugin and checks the release sent to the mock collector.
 * Then starts the app, triggers errors on the server, in the Edge runtime and in the browser,
 * and checks the events received by the collector.
 *
 * Usage: yarn e2e [--webpack] [--debug-ids]
 */
import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { readdir, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startMockCollector } from './mock-collector.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exampleDir = path.join(rootDir, 'example');
const distDir = path.join(exampleDir, '.next');
const staticDir = path.join(distDir, 'static');
const prerenderedDir = path.join(distDir, 'server', 'app');

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
 * Path to the Next.js CLI of the example app
 */
const nextBin = createRequire(path.join(exampleDir, 'package.json')).resolve('next/dist/bin/next');

/**
 * Runs `next build` for the example app
 *
 * @param {{ url: string, wsUrl: string }} collector - mock collector endpoints
 * @returns {Promise<void>}
 */
function buildExample(collector) {
  const args = [nextBin, 'build', ...(useWebpack ? ['--webpack'] : [])];

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: exampleDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        HAWK_TOKEN: token,
        NEXT_PUBLIC_HAWK_TOKEN: token,
        HAWK_COLLECTOR_ENDPOINT: collector.url,
        NEXT_PUBLIC_HAWK_E2E_WS_ENDPOINT: collector.wsUrl,
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

/**
 * Returns URLs of the client scripts as the browser loads them, taken from the prerendered HTML pages
 *
 * @returns {Promise<string[]>}
 */
async function getPageScriptUrls() {
  const pages = (await listFiles(prerenderedDir)).filter(file => file.endsWith('.html'));
  const html = await Promise.all(pages.map(file => readFile(path.join(prerenderedDir, file), 'utf8')));
  const urls = html.flatMap(content => [...content.matchAll(/src="(\/_next\/static\/[^"?]+\.js)(?:\?[^"]*)?"/g)].map(match => match[1]));

  return [...new Set(urls)];
}

/**
 * Returns a free TCP port
 *
 * @returns {Promise<number>}
 */
function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();

      server.close(() => resolve(port));
    });
  });
}

/**
 * Starts `next start` for the built example app
 *
 * @param {number} port - port to listen
 * @param {string[]} output - receives the server output
 * @returns {import('node:child_process').ChildProcess}
 */
function startExample(port, output) {
  const child = spawn(process.execPath, [nextBin, 'start', '--port', String(port), '--hostname', '127.0.0.1'], {
    cwd: exampleDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      HAWK_E2E_HTTP_ENDPOINT: collector.eventsUrl,
    },
  });

  child.stdout.on('data', data => output.push(data.toString()));
  child.stderr.on('data', data => output.push(data.toString()));

  return child;
}

/**
 * Waits until the condition returns a value
 *
 * @template T
 * @param {() => T | undefined | Promise<T | undefined>} condition - returns undefined while waiting
 * @param {number} [timeout] - max time to wait, in milliseconds
 * @returns {Promise<T | undefined>} undefined when the timeout is reached
 */
async function waitFor(condition, timeout = 15_000) {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const result = await condition();

    if (result !== undefined) {
      return result;
    }

    await sleep(100);
  }

  return undefined;
}

/**
 * Waits for the event with the title
 *
 * @param {string} title - event title, i.e. the error message
 * @returns {Promise<import('./mock-collector.mjs').CollectorEvent | undefined>}
 */
function waitForEvent(title) {
  return waitFor(() => collector.events.find(event => event.payload.title === title));
}

/**
 * Starts the example app, triggers errors and checks the events received by the collector
 *
 * @param {string} release - release sent during the build
 * @returns {Promise<void>}
 */
async function checkErrorTracking(release) {
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const output = [];
  const server = startExample(port, output);
  const failuresBefore = failures.length;

  try {
    const isReady = await waitFor(() => fetch(baseUrl).then(response => (response.ok ? true : undefined), () => undefined), 30_000);

    if (!isReady) {
      throw new Error(`next start is not ready:\n${output.join('')}`);
    }

    const [serverErrorResponse, edgeErrorResponse, edgeSendResponse, redirectResponse, notFoundResponse] = await Promise.all([
      fetch(`${baseUrl}/server-error`),
      fetch(`${baseUrl}/edge-error`),
      fetch(`${baseUrl}/edge-send`),
      fetch(`${baseUrl}/redirect`, { redirect: 'manual' }),
      fetch(`${baseUrl}/not-found-page`),
    ]);

    check(serverErrorResponse.status === 500 && edgeErrorResponse.status === 500, 'server and Edge routes fail with 500');
    check(redirectResponse.status === 307 && notFoundResponse.status === 404, 'redirect() and notFound() pages respond with 307 and 404');

    const serverEvent = await waitForEvent('Hawk Next.js example server error');
    const serverAddons = serverEvent?.payload.addons?.nextjs;

    check(serverEvent?.transport === 'http' && serverEvent.catcherType === 'errors/nodejs' && serverEvent.token === token, 'server component error is sent by the server catcher');
    check(serverEvent?.payload.release === release, 'server event has the release of the uploaded source maps');
    check(serverAddons?.runtime === 'nodejs' && serverAddons.routePath === '/server-error' && serverAddons.routeType === 'render' && typeof serverAddons.digest === 'string', 'server event has the route data and the digest');
    check(serverEvent !== undefined && serverEvent.payload.user === undefined, 'server event has no shared anonymous user');
    check(serverEvent?.payload.backtrace?.length > 0, 'server event has a backtrace');

    /**
     * `next start` passes errors of Edge routes to `onRequestError` of the Node.js runtime
     */
    const edgeErrorEvent = await waitForEvent('Hawk Next.js example edge error');
    const edgeErrorAddons = edgeErrorEvent?.payload.addons?.nextjs;

    check(edgeErrorAddons?.routePath?.startsWith('/edge-error') && edgeErrorAddons.routeType === 'route', 'Edge route handler error is sent with the route data');

    const edgeSendEvent = await waitForEvent('Hawk Next.js example edge message');

    check(edgeSendResponse.status === 200 && edgeSendEvent?.payload.addons?.nextjs?.runtime === 'edge', 'error sent from the Edge runtime is delivered before the response');
    check(edgeSendEvent?.payload.release === release && edgeSendEvent.payload.context?.source === 'edge-send', 'Edge event has the release and the context');

    const browser = await chromium.launch();

    try {
      const page = await browser.newPage();

      await page.goto(baseUrl);
      await page.getByRole('button', { name: 'Throw an error' }).click();

      const clickEvent = await waitForEvent('Hawk Next.js example error');

      check(clickEvent?.transport === 'ws' && clickEvent.catcherType === 'errors/javascript', 'browser error is sent over the WebSocket');
      check(clickEvent?.payload.release === release, 'browser event has the release of the uploaded source maps');

      await page.goto(`${baseUrl}/boundary`);
      await page.getByRole('button', { name: 'Break the component' }).click();

      const boundaryEvent = await waitForEvent('Hawk Next.js example render error');

      check(boundaryEvent?.payload.addons?.nextjs?.boundary === 'boundary', 'error caught by HawkErrorBoundary is sent with the boundary data');
      check(await page.getByRole('button', { name: 'Render again' }).isVisible(), 'HawkErrorBoundary shows the fallback');

      await page.goto(`${baseUrl}/action-error`);
      await page.getByRole('button', { name: 'Run failing action' }).click();

      const actionEvent = await waitForEvent('Hawk Next.js example server action error');

      check(actionEvent?.payload.addons?.nextjs?.routeType === 'action', 'server action error is sent with the action route type');

      await page.getByText('Something went wrong').waitFor();
      await sleep(1000);
    } finally {
      await browser.close();
    }

    const expectedTitles = new Set([
      'Hawk Next.js example server error',
      'Hawk Next.js example edge error',
      'Hawk Next.js example edge message',
      'Hawk Next.js example error',
      'Hawk Next.js example render error',
      'Hawk Next.js example server action error',
    ]);
    const unexpected = collector.events.filter(event => !expectedTitles.has(event.payload.title));

    check(unexpected.length === 0, `no other events are sent: redirects, not found pages and server errors on the error page${unexpected.length > 0 ? ` (got ${unexpected.map(event => `"${event.payload.title}"`).join(', ')})` : ''}`);
    check([...expectedTitles].every(title => collector.events.filter(event => event.payload.title === title).length === 1), 'every error is sent once');
  } finally {
    server.kill();

    if (failures.length > failuresBefore) {
      console.log(`\nnext start output:\n${output.join('')}`);
    }
  }
}

await rm(distDir, {
  recursive: true,
  force: true,
});

const collector = await startMockCollector();

try {
  await buildExample(collector);
} catch (error) {
  await collector.close();
  throw error;
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
const mapNames = mapRequests.map(request => request.files[0].name);
const chunkFiles = new Set((await listFiles(staticDir)).map(file => `/_next/static/${file.split(path.sep).join('/')}`));
const sources = maps.flatMap(getSources);
const indexedMapsCount = maps.filter(map => Array.isArray(map.sections)).length;
const scriptUrls = await getPageScriptUrls();

/**
 * Scripts of the prerendered pages that have an uploaded map, matched by the decoded path
 */
const mappedScripts = scriptUrls
  .map(url => ({
    url,
    map: maps.find(map => decodeURIComponent(map.file) === decodeURIComponent(url)),
  }))
  .filter(script => script.map !== undefined);

if (process.argv.includes('--verbose')) {
  for (const map of maps) {
    console.log(`  ${map.file}: ${getSources(map).slice(0, 3)
.join(', ')}`);
  }

  console.log(`  chunks on disk: ${[...chunkFiles].join(', ')}`);
  console.log(`  page scripts: ${scriptUrls.join(', ')}`);
}

check(new Set(mapNames).size === mapNames.length, 'source maps have unique names, so Hawk saves all of them');
check(maps.every(map => /^\/_next\/static\/.+\.js$/.test(map.file)), 'every map has `file` with the public chunk path');
check(maps.every(map => chunkFiles.has(decodeURIComponent(map.file))), 'every map `file` points to an existing chunk');
/**
 * Hawk JavaScript worker picks the first map whose `file` is a substring of the stack frame URL
 */
check(
  mappedScripts.length > 0 && mappedScripts.every(script => maps.find(map => script.url.includes(map.file)) === script.map),
  `Hawk finds the right map by URL for ${mappedScripts.length} scripts of prerendered pages`
);

if (useWebpack) {
  check(mappedScripts.some(script => script.url.includes('/%5Bslug%5D/')), 'dynamic route chunk with an encoded URL is mapped');
}

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

console.log('\nError tracking checks\n');

try {
  await checkErrorTracking(release);
} finally {
  await collector.close();
}

if (failures.length > 0) {
  console.log(`\n${failures.length} checks failed`);
  process.exit(1);
}

console.log('\nAll checks passed');
