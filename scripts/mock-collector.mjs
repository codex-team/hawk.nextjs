import { Buffer } from 'node:buffer';
import http from 'node:http';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';

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
 * Error event received by the mock collector
 *
 * @typedef {object} CollectorEvent
 * @property {'http' | 'ws'} transport - `http` for server catchers, `ws` for the browser one
 * @property {string} token - Integration Token of the event
 * @property {string} catcherType - e.g. `errors/javascript`
 * @property {Record<string, any>} payload - event data: title, backtrace, release, addons and so on
 */

/**
 * Returns the request body
 *
 * @param {http.IncomingMessage} req - incoming request
 * @returns {Promise<Buffer>}
 */
async function readBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

/**
 * Parses multipart body of the release request
 *
 * @param {http.IncomingMessage} req - incoming request
 * @param {Buffer} body - request body
 * @returns {Promise<CollectorRequest>}
 */
async function parseRelease(req, body) {
  const form = await new Request('http://collector.local/release', {
    method: 'POST',
    headers: { 'content-type': req.headers['content-type'] ?? '' },
    body,
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
 * Starts a local server that accepts releases and error events like the Hawk collector:
 * releases are multipart requests to `/release`, server events are JSON requests to `/`,
 * browser events come over a WebSocket at `/ws`
 *
 * @param {number} [port] - port to listen, random free port by default
 * @param {object} [callbacks] - called for every accepted request
 * @param {(request: CollectorRequest) => void} [callbacks.onRelease] - called for release requests
 * @param {(event: CollectorEvent) => void} [callbacks.onEvent] - called for error events
 * @returns {Promise<{ url: string, eventsUrl: string, wsUrl: string, requests: CollectorRequest[], events: CollectorEvent[], close: () => Promise<void> }>}
 */
export async function startMockCollector(port = 0, { onRelease = () => {}, onEvent = () => {} } = {}) {
  const requests = [];
  const events = [];

  /**
   * Saves the event
   *
   * @param {'http' | 'ws'} transport - how the event was received
   * @param {string} data - JSON with the token, catcher type and payload
   */
  const acceptEvent = (transport, data) => {
    const event = {
      transport,
      ...JSON.parse(data),
    };

    events.push(event);
    onEvent(event);
  };

  const server = http.createServer((req, res) => {
    const reply = (status, message) => {
      res.writeHead(status, { 'content-type': 'text/json; charset=utf8' });
      res.end(JSON.stringify({
        code: status,
        error: status !== 200,
        message,
      }));
    };

    readBody(req)
      .then(async (body) => {
        if (req.headers['content-type']?.startsWith('application/json')) {
          acceptEvent('http', body.toString('utf8'));
        } else {
          const request = await parseRelease(req, body);

          requests.push(request);
          onRelease(request);
        }

        reply(200, 'OK');
      })
      .catch(error => reply(400, error.message));
  });

  const sockets = new WebSocketServer({
    server,
    path: '/ws',
  });

  sockets.on('connection', (socket) => {
    socket.on('message', data => acceptEvent('ws', data.toString()));
  });

  await new Promise((resolve) => {
    server.listen(port, '127.0.0.1', resolve);
  });

  const origin = `127.0.0.1:${server.address().port}`;

  return {
    url: `http://${origin}/release`,
    eventsUrl: `http://${origin}/`,
    wsUrl: `ws://${origin}/ws`,
    requests,
    events,
    close: async () => {
      for (const client of sockets.clients) {
        client.terminate();
      }

      await new Promise((resolve) => {
        sockets.close(() => resolve());
      });
      await new Promise((resolve) => {
        server.close(() => resolve());
      });
    },
  };
}

/**
 * Run as a standalone server: node scripts/mock-collector.mjs [port]
 */
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const collector = await startMockCollector(Number(process.argv[2] ?? 3999), {
    onRelease: (request) => {
      const files = request.files.map(file => file.name).join(', ');

      console.log(`release=${request.release} files=[${files}] commits=${request.commits?.length ?? 0}`);
    },
    onEvent: (event) => {
      console.log(`${event.transport} ${event.catcherType} "${event.payload.title}" release=${event.payload.release}`, event.payload.addons?.nextjs ?? '');
    },
  });

  console.log(`Mock Hawk collector is listening on ${collector.url}`);
  console.log(`Server events: ${collector.eventsUrl}, browser events: ${collector.wsUrl}`);
}
