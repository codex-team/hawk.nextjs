import * as Hawk from '@hawk.so/nextjs';

/**
 * Sends an error manually from the Edge runtime and waits for the delivery before responding
 */
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  Hawk.send(new Error('Hawk Next.js example edge message'), { source: 'edge-send' });
  await Hawk.flush();

  return new Response('Sent');
}
