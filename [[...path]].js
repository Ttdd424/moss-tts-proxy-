// ============================================
// Moss / mosi 语音接口 · 跨域中转站（Vercel 版 · 流式转发）
// 部署后，语音配置里的 Base URL 填：
// https://你的项目名.vercel.app/api
// ============================================

import { Readable } from 'node:stream';

const UPSTREAM = 'https://api.mosi.cn';

// bodyParser: false → 不解析请求体，原样转发（JSON 和音频都能过）
// responseLimit: false → 不限制响应大小
// maxDuration: 60 → 最多允许等 60 秒，避免音频没生成完就被掐断
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

export default async function handler(req, res) {
  // 先把跨域头挂上，无论成功失败浏览器都不会拦
  for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v);

  // 浏览器的预检请求，直接放行
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const u = new URL(req.url, 'https://placeholder.local');
  const segs = req.query.path;
  const pathStr = segs ? '/' + (Array.isArray(segs) ? segs.join('/') : segs) : '';

  // 根路径：健康检查
  if (!pathStr || pathStr === '/') {
    res.status(200).json({
      ok: true,
      service: 'moss-tts-proxy',
      hint: '部署成功！Base URL 请填 https://你的域名.vercel.app/api',
    });
    return;
  }

  // 拼出真实的上游地址
  const target = UPSTREAM + pathStr + (u.search || '');

  // 原样带上请求头（含 Authorization、Content-Type）
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (['host', 'connection', 'accept-encoding', 'content-length', 'cf-connecting-ip'].includes(k)) continue;
    headers[k] = v;
  }

  // 原样带上请求体
  let body;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const raw = await readRaw(req);
    if (raw.length > 0) body = raw;
  }

  let upstream;
  try {
    upstream = await fetch(target, { method: req.method, headers, body });
  } catch (e) {
    res.status(502).json({
      error: 'upstream_unreachable',
      detail: String(e),
      target,
    });
    return;
  }

  const ct = upstream.headers.get('content-type') || 'application/octet-stream';

  // 把上游状态码暴露出来，方便排查（浏览器里能看到）
  res.setHeader('X-Proxy-Upstream-Status', String(upstream.status));
  res.setHeader('Content-Type', ct);

  // 上游明确报错且返回的是 JSON：读完直接给你看真实错误
  if (!upstream.ok && ct.includes('application/json')) {
    const text = await upstream.text();
    res.status(upstream.status).send(text);
    return;
  }

  res.status(upstream.status);

  // 关键改动：流式转发，边收边发，不再等整段音频
  if (upstream.body) {
    Readable.fromWeb(upstream.body).pipe(res);
  } else {
    res.end();
  }
}
