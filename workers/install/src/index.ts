const SCRIPT_URL = 'https://raw.githubusercontent.com/opensauria/sauria/main/scripts/install.sh';

const CACHE_TTL = 3600;

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname !== '/' && url.pathname !== '/install') {
      return new Response('Not found', { status: 404 });
    }

    if (request.method === 'HEAD') {
      return new Response(null, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }

    const upstream = await fetch(SCRIPT_URL, {
      cf: { cacheTtl: CACHE_TTL, cacheEverything: true },
    });

    if (!upstream.ok) {
      return new Response('Failed to fetch install script', { status: 502 });
    }

    return new Response(upstream.body, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': `public, max-age=${CACHE_TTL}`,
      },
    });
  },
} satisfies ExportedHandler;
