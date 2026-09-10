const http = require('http');
const fs = require('fs');
const path = require('path');

loadEnv(path.join(__dirname, '.env'));

const PORT = Number(process.env.PORT || 4173);
const API_KEY = process.env.YOUTUBE_API_KEY || '';
const PUBLIC = path.join(__dirname, 'dist');
const clients = new Set();
const userCooldowns = new Map();
let pollTimer = null;
let active = { videoId: '', liveChatId: '', title: '', pageToken: '', connected: false, error: '' };

const commandAliases = new Map([
  ['!회복', 'heal'], ['!힐', 'heal'], ['!보급', 'supply'], ['!실드', 'shield'],
  ['!러시', 'horde'], ['!몹', 'horde'], ['!정예', 'elite'], ['!보스', 'boss'],
  ['!암전', 'blackout'], ['!둔화', 'slow'], ['!봉인', 'jam'], ['!텔포', 'teleport'], ['!지뢰', 'minefield'], ['!혼란', 'confuse'],
  ['!1', 'vote1'], ['!2', 'vote2'], ['!3', 'vote3']
]);
const commandCooldown = { heal: 8000, supply: 12000, shield: 15000, horde: 6000, elite: 12000, boss: 30000, blackout: 16000, slow: 14000, jam: 18000, teleport: 20000, minefield: 16000, confuse: 18000, vote1: 15000, vote2: 15000, vote3: 15000 };

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function broadcast(type, payload) {
  const data = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of clients) client.write(data);
}

function extractVideoId(value) {
  const raw = String(value || '').trim();
  if (/^[\w-]{11}$/.test(raw)) return raw;
  try {
    const url = new URL(raw);
    if (url.hostname === 'youtu.be') return url.pathname.split('/')[1] || '';
    if (url.pathname.startsWith('/live/')) return url.pathname.split('/')[2] || '';
    return url.searchParams.get('v') || '';
  } catch { return ''; }
}

async function youtube(endpoint, params) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
  Object.entries({ ...params, key: API_KEY }).forEach(([key, value]) => value && url.searchParams.set(key, value));
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message || `YouTube API 오류 (${response.status})`);
  return body;
}

async function connectToBroadcast(input) {
  if (!API_KEY) throw new Error('.env에 YOUTUBE_API_KEY가 없습니다.');
  const videoId = extractVideoId(input);
  if (!videoId) throw new Error('올바른 YouTube 라이브 URL 또는 영상 ID를 입력하세요.');
  clearTimeout(pollTimer);
  const data = await youtube('videos', { part: 'snippet,liveStreamingDetails', id: videoId });
  const video = data.items?.[0];
  if (!video) throw new Error('영상을 찾지 못했습니다. API 키 제한과 영상 공개 상태를 확인하세요.');
  const liveChatId = video.liveStreamingDetails?.activeLiveChatId;
  if (!liveChatId) throw new Error('현재 진행 중이며 실시간 채팅이 활성화된 방송이 아닙니다.');
  active = { videoId, liveChatId, title: video.snippet?.title || 'YouTube Live', pageToken: '', connected: true, error: '' };
  userCooldowns.clear();
  broadcast('status', publicStatus());
  pollChat(true);
  return publicStatus();
}

async function pollChat(first = false) {
  if (!active.connected) return;
  try {
    const data = await youtube('liveChat/messages', {
      liveChatId: active.liveChatId,
      part: 'id,snippet,authorDetails',
      maxResults: '200',
      pageToken: active.pageToken
    });
    const initialHistory = first && !active.pageToken;
    active.pageToken = data.nextPageToken || active.pageToken;
    if (!initialHistory) for (const item of data.items || []) handleMessage(item);
    const wait = Math.max(2000, Number(data.pollingIntervalMillis || 5000));
    pollTimer = setTimeout(() => pollChat(false), wait);
  } catch (error) {
    active.connected = false;
    active.error = error.message;
    broadcast('status', publicStatus());
  }
}

function handleMessage(item) {
  if (item.snippet?.type !== 'textMessageEvent') return;
  const text = String(item.snippet?.displayMessage || '').trim();
  const firstWord = text.split(/\s+/)[0].toLowerCase();
  const command = commandAliases.get(firstWord);
  const authorId = item.authorDetails?.channelId || item.id;
  const author = item.authorDetails?.displayName || '시청자';
  broadcast('chat', { id: item.id, author, text });
  if (!command) return;
  const key = `${authorId}:${command}`;
  const now = Date.now();
  if ((userCooldowns.get(key) || 0) > now) return;
  userCooldowns.set(key, now + commandCooldown[command]);
  broadcast('command', { command, author, text, id: item.id });
}

function publicStatus() {
  return { configured: Boolean(API_KEY), connected: active.connected, videoId: active.videoId, title: active.title, error: active.error };
}

function serveStatic(req, res) {
  const pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.resolve(PUBLIC, relative);
  if (!file.startsWith(path.resolve(PUBLIC) + path.sep) && file !== path.join(PUBLIC, 'index.html')) return json(res, 403, { error: 'Forbidden' });
  fs.readFile(file, (error, content) => {
    if (error) return json(res, 404, { error: 'Not found' });
    const ext = path.extname(file);
    const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'GET' && url.pathname === '/api/status') return json(res, 200, publicStatus());
  if (req.method === 'GET' && url.pathname === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' });
    res.write(`event: status\ndata: ${JSON.stringify(publicStatus())}\n\n`);
    clients.add(res); req.on('close', () => clients.delete(res)); return;
  }
  if (req.method === 'POST' && url.pathname === '/api/connect') {
    let body = '';
    req.on('data', chunk => { if (body.length < 10_000) body += chunk; });
    req.on('end', async () => {
      try { const payload = JSON.parse(body || '{}'); json(res, 200, await connectToBroadcast(payload.video)); }
      catch (error) { json(res, 400, { error: error.message }); }
    }); return;
  }
  serveStatic(req, res);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`CHAT//SURVIVOR running at http://127.0.0.1:${PORT}`);
  console.log(API_KEY ? 'YouTube API key loaded.' : 'Add YOUTUBE_API_KEY to .env to enable live chat.');
});
