import { Buffer } from 'node:buffer';
import http from 'node:http';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

/**
 * Release request received by the mock collector
 *
 * @typedef {object} CollectorRequest
 * @property {string | undefined} authorization - Authorization header
 * @property {string | null} release - `release` form field
 * @property {{ field: string, name: string, content: string }[]} files - uploaded files
 * @property {unknown[] | undefined} commits - parsed `commits` form field
 */

/**
 * Parses multipart body of the request
 *
 * @param {http.IncomingMessage} req - incoming request
 * @returns {Promise<CollectorRequest>}
 */
async function parseRequest(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const form = await new Request('http://collector.local/release', {
    method: 'POST',
    headers: { 'content-type': req.headers['content-type'] ?? '' },
    body: Buffer.concat(chunks),
  }).formData();

  const files = [];

  for (const [field, value] of form.entries()) {
    if (typeof value !== 'string') {
      files.push({
        field,
        name: value.name,
        content: await value.text(),
      });
    }
  }

  const commits = form.get('commits');

  return {
    authorization: req.headers.authorization,
    release: form.get('release'),
    files,
    commits: typeof commits === 'string' ? JSON.parse(commits) : undefined,
  };
}

/**
 * Starts a local HTTP server that accepts release requests like the Hawk collector
 *
 * @param {number} [port] - port to listen, random free port by default
 * @param {(request: CollectorRequest) => void} [onRequest] - called for every accepted request
 * @returns {Promise<{ url: string, requests: CollectorRequest[], close: () => Promise<void> }>}
 */
export async function startMockCollector(port = 0, onRequest = () => {}) {
  const requests = [];

  const server = http.createServer((req, res) => {
    parseRequest(req)
      .then((request) => {
        requests.push(request);
        onRequest(request);
        res.writeHead(200, { 'content-type': 'text/json; charset=utf8' });
        res.end(JSON.stringify({
          code: 200,
          error: false,
          message: 'OK',
        }));
      })
      .catch((error) => {
        res.writeHead(400, { 'content-type': 'text/json; charset=utf8' });
        res.end(JSON.stringify({
          code: 400,
          error: true,
          message: error.message,
        }));
      });
  });

  await new Promise((resolve) => {
    server.listen(port, '127.0.0.1', resolve);
  });

  return {
    url: `http://127.0.0.1:${server.address().port}/release`,
    requests,
    close: () => new Promise((resolve) => {
      server.close(() => resolve());
    }),
  };
}

/**
 * Run as a standalone server: node scripts/mock-collector.mjs [port]
 */
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const collector = await startMockCollector(Number(process.argv[2] ?? 3999), (request) => {
    const files = request.files.map(file => file.name).join(', ');

    console.log(`release=${request.release} files=[${files}] commits=${request.commits?.length ?? 0}`);
  });

  console.log(`Mock Hawk collector is listening on ${collector.url}`);
}
