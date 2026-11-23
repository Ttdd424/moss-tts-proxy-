// ============================================
// Moss / mosi 语音接口 · 跨域中转（Vercel 版）
// 部署成功后，语音配置里的 Base URL 填：
// https://你的项目名.vercel.app/api
// ============================================

const UPSTREAM = 'https://api.mosi.cn';

// 关键：不解析 body，原样转发（TTS 的 JSON 和 STT 的音频文件都能过）
export const config = { api: { bodyParser: false } };

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
  // 1) 先把跨域头挂上，这样无论成功失败浏览器都不会拦
  for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v);

  // 2) 预检请求直接放行
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const u = new URL(req.url, 'https://placeholder.local');
  const segs = req.query.path;
  const pathStr = segs ? '/' + (Array.isArray(segs) ? segs.join('/') : segs) : '';

  // 3) 根路径：健康检查，用来确认部署成功
  if (!pathStr || pathStr === '/') {
    res.status(200).json({
      ok: true,
      service: 'moss-tts-proxy',
      hint: '部署成功！Base URL 请填 https://你的域名.vercel.app/api',
    });
    return;
  }

  // 4) 拼出真实的上游地址
  const target = UPSTREAM + pathStr + (u.search || '');

  // 5) 原样带上请求头（含 Authorization、Content-Type）
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (['host', 'connection', 'accept-encoding', 'cf-connecting-ip'].includes(k)) continue;
    headers[k] = v;
  }

  // 6) 原样带上请求体
  let body;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const raw = await readRaw(req);
    if (raw.length > 0) body = raw;
  }

  let upstream;
  try {
    upstream = await fetch(target, { method: req.method, headers, body });
  } catch (e) {
    res.status(502).json({ error: 'upstream_unreachable', detail: String(e) });
    return;
  }

  // 7) 原样把结果（音频 / JSON）吐回去
  const buf = Buffer.from(await upstream.arrayBuffer());
  res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
  res.status(upstream.status).send(buf);
}
