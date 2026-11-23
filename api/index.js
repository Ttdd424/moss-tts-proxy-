// ============================================
// Moss / mosi 语音接口 · 跨域中转站
// Base URL 填：https://你的项目名.vercel.app/api
// ============================================

import { Readable } from 'node:stream';

const UPSTREAM = 'https://api.mosi.cn';

export const config = {
  api: { bodyParser: false, responseLimit: false },
  maxDuration: 60,
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Expose-Headers': '*',
  'Access-Control-Max-Age': '86400',
};

function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// 从 ?p= 里取出真实路径（由 vercel.json 的 rewrite 传进来）
function getPath(req) {
  const p = req.query.p;
  let raw = '';

  if (Array.isArray(p)) raw = p.join('/');
  else if (typeof p === 'string') raw = p;

  if (!raw) {
    // 兜底：直接从 req.url 里扒
    const u = new URL(req.url, 'https://placeholder.local');
    raw = u.pathname.replace(/^\/api\/?/, '');
  }

  try {
    raw = decodeURIComponent(raw);
  } catch {}

  raw = raw.replace(/^\/+/, '').replace(/\/+$/, '');
  return raw ? '/' + raw : '/';
}

export default async function handler(req, res) {
  for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const pathStr = getPath(req);
  const u = new URL(req.url, 'https://placeholder.local');
  const search = u.search ? u.search.replace(/(^|[?&])p=[^&]*/, '$1').replace(/[?&]$/, '') : '';

  // 健康检查
  if (pathStr === '/' || pathStr === '/ping') {
    res.status(200).json({
      ok: true,
      service: 'moss-tts-proxy',
      hint: '中转站已上线，Base URL 填 https://你的域名.vercel.app/api',
      gotPath: pathStr,
    });
    return;
  }

  const target = UPSTREAM + pathStr + search;

  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (
      ['host', 'connection', 'accept-encoding', 'content-length', 'cf-connecting-ip', 'x-forwarded-host', 'x-forwarded-proto'].includes(k)
    ) continue;
    headers[k] = v;
  }

  let body;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const raw = await readRaw(req);
    if (raw.length > 0) body = raw;
  }

  let upstream;
  try {
    upstream = await fetch(target, { method: req.method, headers, body });
  } catch (e) {
    res.status(502).json({ error: 'upstream_unreachable', detail: String(e), target });
    return;
  }

  const ct = upstream.headers.get('content-type') || 'application/octet-stream';
  res.setHeader('X-Proxy-Upstream-Status', String(upstream.status));
  res.setHeader('X-Proxy-Target', target);
  res.setHeader('Content-Type', ct);

  if (!upstream.ok && ct.includes('application/json')) {
    const text = await upstream.text();
    res.status(upstream.status).send(text);
    return;
  }

  res.status(upstream.status);

  if (upstream.body) {
    Readable.fromWeb(upstream.body).pipe(res);
  } else {
    res.end();
  }
}
