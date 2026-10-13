import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(root, 'data');
const uploadDir = path.join(root, 'uploads');
const port = Number(process.env.PORT || 3000);
const username = process.env.CCP_USERNAME || 'username';
const password = process.env.CCP_PASSWORD;
const sessionSecret = process.env.SESSION_SECRET;
const sessionLifetimeMs = 8 * 60 * 60 * 1000;
const sessions = new Map();
const loginAttempts = new Map();
const mimeByExt = new Map([['.html','text/html; charset=utf-8'],['.css','text/css; charset=utf-8'],['.js','text/javascript; charset=utf-8'],['.jpeg','image/jpeg'],['.jpg','image/jpeg'],['.png','image/png'],['.webp','image/webp'],['.gif','image/gif'],['.pdf','application/pdf']]);
const starterImages = (await fs.readdir(path.join(root, 'gallary')).catch(() => [])).filter((name) => /\.(jpe?g|png|webp|gif)$/i.test(name)).map((name, i) => ({ id: `starter-${i}`, name, url: `/gallary/${encodeURIComponent(name)}` }));
const starterBlogs = [
  { id: 'demo-soil', title: 'Healthy soil, resilient farms', summary: 'Practical soil care can help preserve moisture, support healthy crops and strengthen long-term farm resilience.', body: 'Healthy soil is the foundation of productive farms. Practices such as adding organic matter, protecting soil cover and planning water use can help farmers care for the land season after season. This sample article is demonstration content.', date: '2026-09-20', imageUrl: '/gallary/photo_2026-10-08_22-26-58.jpg' },
  { id: 'demo-horticulture', title: 'Growing opportunities through horticulture', summary: 'Plant nurseries and local horticultural skills can create useful opportunities for members and communities.', body: 'Horticulture connects useful plants, local knowledge and enterprise. Community nurseries can help make quality planting material available while building skills and livelihoods. This sample article is demonstration content.', date: '2026-09-12', imageUrl: '/gallary/photo_2026-10-08_22-26-54.jpg' },
  { id: 'demo-green-spaces', title: 'Greener public spaces belong to everyone', summary: 'Well planned parks and public landscapes bring nature closer to daily life and build welcoming community places.', body: 'Public landscapes can support recreation, shade, biodiversity and community life. Thoughtful planting and ongoing care help these shared places remain welcoming for everyone. This sample article is demonstration content.', date: '2026-09-05', imageUrl: '/gallary/photo_2026-10-08_22-26-40.jpg' }
];
const starterNotice = { title: 'Welcome to SAHS Kerala', message: 'Updates and announcements will appear here.', linkText: 'View notices', linkUrl: 'tenders.html' };

if (!password || !sessionSecret) {
  console.error('Set CCP_PASSWORD and SESSION_SECRET before starting the server.');
  process.exit(1);
}
await fs.mkdir(dataDir, { recursive: true });
await fs.mkdir(path.join(uploadDir, 'gallery'), { recursive: true });
await fs.mkdir(path.join(uploadDir, 'tenders'), { recursive: true });

const dbFile = path.join(dataDir, 'content.json');
async function readContent() {
  let content;
  try { content = JSON.parse(await fs.readFile(dbFile, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; content = {}; }
  return { gallery: [], tenders: [], blogs: starterBlogs, notice: starterNotice, ...content };
}
async function writeContent(content) {
  const temp = `${dbFile}.tmp`;
  await fs.writeFile(temp, JSON.stringify(content, null, 2));
  await fs.rename(temp, dbFile);
}
const sendJson = (res, status, value) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(JSON.stringify(value));
};
function cookieMap(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map((part) => part.trim().split(/=(.*)/s).slice(0, 2)).filter(([key]) => key));
}
function getSession(req) {
  const token = cookieMap(req).sahs_session;
  if (!token) return null;
  const [id, signature] = token.split('.');
  const expected = id && crypto.createHmac('sha256', sessionSecret).update(id).digest('base64url');
  if (!id || !signature || signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  const session = sessions.get(id);
  if (!session || session.expires < Date.now()) { sessions.delete(id); return null; }
  return session;
}
function requireAuth(req, res) {
  if (getSession(req)) return true;
  sendJson(res, 401, { error: 'Sign in required.' });
  return false;
}
async function readRequest(req, limit) {
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > limit) throw Object.assign(new Error('File is too large.'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
function parseMultipart(buffer, boundary) {
  const marker = Buffer.from(`--${boundary}`);
  const fields = {};
  let cursor = 0;
  while (true) {
    const start = buffer.indexOf(marker, cursor);
    if (start < 0) break;
    let partStart = start + marker.length;
    if (buffer.subarray(partStart, partStart + 2).equals(Buffer.from('--'))) break;
    if (buffer.subarray(partStart, partStart + 2).equals(Buffer.from('\r\n'))) partStart += 2;
    const headerEnd = buffer.indexOf(Buffer.from('\r\n\r\n'), partStart);
    if (headerEnd < 0) break;
    const next = buffer.indexOf(marker, headerEnd + 4);
    if (next < 0) break;
    const headers = buffer.subarray(partStart, headerEnd).toString('utf8');
    const disposition = headers.match(/content-disposition:\s*form-data;\s*name="([^"]+)"(?:;\s*filename="([^"]*)")?/i);
    if (disposition) {
      const dataEnd = next >= 2 && buffer.subarray(next - 2, next).equals(Buffer.from('\r\n')) ? next - 2 : next;
      fields[disposition[1]] = { filename: disposition[2] || '', data: buffer.subarray(headerEnd + 4, dataEnd) };
    }
    cursor = next;
  }
  return fields;
}
function validImage(data) {
  return data.subarray(0, 3).equals(Buffer.from([0xff,0xd8,0xff])) || data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WEBP' || data.subarray(0, 6).toString() === 'GIF87a' || data.subarray(0, 6).toString() === 'GIF89a';
}
function validPdf(data) { return data.subarray(0, 5).toString() === '%PDF-'; }
async function saveUpload(file, folder, allowed) {
  const ext = path.extname(file.filename).toLowerCase();
  if (!file.filename || !allowed(ext, file.data)) throw Object.assign(new Error('Unsupported or invalid file.'), { status: 400 });
  const name = `${crypto.randomUUID()}${ext}`;
  await fs.writeFile(path.join(uploadDir, folder, name), file.data, { flag: 'wx' });
  return { name: file.filename.slice(0, 180), storedName: name, url: `/uploads/${folder}/${name}` };
}
function normalizeBlog(input) {
  input = input && typeof input === 'object' ? input : {};
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const summary = typeof input.summary === 'string' ? input.summary.trim() : '';
  const body = typeof input.body === 'string' ? input.body.trim() : '';
  const date = typeof input.date === 'string' ? input.date.trim() : '';
  const imageUrl = typeof input.imageUrl === 'string' ? input.imageUrl.trim() : '';
  if (!title || title.length > 140 || !summary || summary.length > 400 || !body || body.length > 6000) return { error: 'Add a title (up to 140 characters), summary (up to 400) and article text (up to 6,000).' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return { error: 'Enter a valid publication date.' };
  if (imageUrl && !/^\/(?:gallary|uploads\/gallery)\/[a-z0-9_%().-]+$/i.test(imageUrl)) return { error: 'Choose an image path from the society gallery or uploaded gallery.' };
  return { title, summary, body, date, imageUrl };
}
async function api(req, res, url) {
  if (req.method === 'POST' && url.pathname === '/api/login') {
    const ip = req.socket.remoteAddress || 'unknown';
    const attempt = loginAttempts.get(ip) || { count: 0, resetAt: Date.now() + 15 * 60 * 1000 };
    if (attempt.resetAt <= Date.now()) { attempt.count = 0; attempt.resetAt = Date.now() + 15 * 60 * 1000; }
    if (attempt.count >= 10) return sendJson(res, 429, { error: 'Too many sign-in attempts. Try again later.' });
    const body = await readRequest(req, 10_000);
    let input;
    try { input = JSON.parse(body); } catch { return sendJson(res, 400, { error: 'Invalid request.' }); }
    const userMatch = input.username === username;
    // Accept the original escaped-at spelling as well as the normal password spelling.
    const submittedPassword = typeof input.password === 'string' ? input.password.replaceAll('\\@', '@') : '';
    const configuredPassword = password.replaceAll('\\@', '@');
    const passMatch = typeof input.password === 'string' && crypto.timingSafeEqual(crypto.createHash('sha256').update(submittedPassword).digest(), crypto.createHash('sha256').update(configuredPassword).digest());
    if (!userMatch || !passMatch) { attempt.count += 1; loginAttempts.set(ip, attempt); return sendJson(res, 401, { error: 'Username or password is incorrect.' }); }
    loginAttempts.delete(ip);
    const tokenId = crypto.randomBytes(32).toString('base64url');
    const token = `${tokenId}.${crypto.createHmac('sha256', sessionSecret).update(tokenId).digest('base64url')}`;
    sessions.set(tokenId, { expires: Date.now() + sessionLifetimeMs });
    res.writeHead(200, { 'set-cookie': `sahs_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${sessionLifetimeMs / 1000}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(JSON.stringify({ ok: true }));
  }
  if (req.method === 'POST' && url.pathname === '/api/logout') {
    const token = cookieMap(req).sahs_session;
    if (token) sessions.delete(token.split('.')[0]);
    res.writeHead(200, { 'set-cookie': 'sahs_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0', 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    return res.end('{"ok":true}');
  }
  if (req.method === 'GET' && url.pathname === '/api/session') return sendJson(res, getSession(req) ? 200 : 401, { authenticated: Boolean(getSession(req)) });
  if (req.method === 'GET' && url.pathname === '/api/gallery') {
    const content = await readContent();
    return sendJson(res, 200, [...content.gallery, ...starterImages]);
  }
  if (req.method === 'GET' && url.pathname === '/api/tenders') return sendJson(res, 200, (await readContent()).tenders);
  if (req.method === 'GET' && url.pathname === '/api/blogs') return sendJson(res, 200, (await readContent()).blogs);
  if (req.method === 'GET' && url.pathname === '/api/notice') return sendJson(res, 200, (await readContent()).notice);
  if (url.pathname.startsWith('/api/admin/')) {
    if (!requireAuth(req, res)) return;
    const content = await readContent();
    if (req.method === 'GET' && url.pathname === '/api/admin/content') return sendJson(res, 200, content);
    if (req.method === 'POST' && url.pathname === '/api/admin/notice') {
      const body = await readRequest(req, 20_000);
      let input;
      try { input = JSON.parse(body); } catch { return sendJson(res, 400, { error: 'Invalid notice details.' }); }
      input = input && typeof input === 'object' ? input : {};
      const title = typeof input.title === 'string' ? input.title.trim() : '';
      const message = typeof input.message === 'string' ? input.message.trim() : '';
      const linkText = typeof input.linkText === 'string' ? input.linkText.trim() : '';
      const linkUrl = typeof input.linkUrl === 'string' ? input.linkUrl.trim() : '';
      if (!title || title.length > 100 || !message || message.length > 500 || linkText.length > 40 || linkUrl.length > 200 || (linkUrl && !/^(https?:\/\/|[a-z0-9_-]+\.html(?:#[\w-]+)?$|#)[^\s]*$/i.test(linkUrl))) return sendJson(res, 400, { error: 'Enter a title and message. Keep the title under 100 characters and message under 500.' });
      content.notice = { title, message, linkText: linkText || 'More information', linkUrl: linkUrl || '' };
      await writeContent(content); return sendJson(res, 200, content.notice);
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/blogs') {
      const body = await readRequest(req, 100_000);
      let input;
      try { input = JSON.parse(body); } catch { return sendJson(res, 400, { error: 'Invalid blog details.' }); }
      const item = normalizeBlog(input);
      if (item.error) return sendJson(res, 400, { error: item.error });
      item.id = crypto.randomUUID(); content.blogs.unshift(item); await writeContent(content);
      return sendJson(res, 201, item);
    }
    if (req.method === 'PUT' && url.pathname.startsWith('/api/admin/blogs/')) {
      const id = decodeURIComponent(url.pathname.split('/').pop());
      const index = content.blogs.findIndex((entry) => entry.id === id);
      if (index < 0) return sendJson(res, 404, { error: 'Blog not found.' });
      const body = await readRequest(req, 100_000);
      let input;
      try { input = JSON.parse(body); } catch { return sendJson(res, 400, { error: 'Invalid blog details.' }); }
      const item = normalizeBlog(input);
      if (item.error) return sendJson(res, 400, { error: item.error });
      content.blogs[index] = { ...item, id }; await writeContent(content);
      return sendJson(res, 200, content.blogs[index]);
    }
    if (req.method === 'DELETE' && url.pathname.startsWith('/api/admin/blogs/')) {
      const id = decodeURIComponent(url.pathname.split('/').pop());
      const oldLength = content.blogs.length;
      content.blogs = content.blogs.filter((entry) => entry.id !== id);
      if (content.blogs.length === oldLength) return sendJson(res, 404, { error: 'Blog not found.' });
      await writeContent(content); return sendJson(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/gallery') {
      const match = (req.headers['content-type'] || '').match(/multipart\/form-data;\s*boundary=(.+)$/i);
      if (!match) return sendJson(res, 400, { error: 'Expected multipart image upload.' });
      const parts = parseMultipart(await readRequest(req, 25 * 1024 * 1024), match[1].replace(/^"|"$/g, ''));
      const file = parts.images;
      const saved = await saveUpload(file || {}, 'gallery', (ext, data) => ['.jpg','.jpeg','.png','.webp','.gif'].includes(ext) && validImage(data));
      const item = { id: crypto.randomUUID(), ...saved };
      content.gallery.unshift(item); await writeContent(content);
      return sendJson(res, 201, item);
    }
    if (req.method === 'DELETE' && url.pathname.startsWith('/api/admin/gallery/')) {
      const id = decodeURIComponent(url.pathname.split('/').pop());
      const item = content.gallery.find((entry) => entry.id === id);
      if (!item) return sendJson(res, 404, { error: 'Image not found.' });
      content.gallery = content.gallery.filter((entry) => entry.id !== id);
      if (item.url.startsWith('/uploads/gallery/')) await fs.unlink(path.join(uploadDir, 'gallery', path.basename(item.url))).catch(() => {});
      await writeContent(content); return sendJson(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/tenders') {
      const match = (req.headers['content-type'] || '').match(/multipart\/form-data;\s*boundary=(.+)$/i);
      if (!match) return sendJson(res, 400, { error: 'Expected multipart tender form.' });
      const parts = parseMultipart(await readRequest(req, 35 * 1024 * 1024), match[1].replace(/^"|"$/g, ''));
      const heading = parts.heading?.data.toString('utf8').trim();
      const endDate = parts.endDate?.data.toString('utf8').trim();
      if (!heading || heading.length > 180 || !/^\d{4}-\d{2}-\d{2}$/.test(endDate || '')) return sendJson(res, 400, { error: 'Enter a heading and valid end date.' });
      const saved = await saveUpload(parts.pdf || {}, 'tenders', (ext, data) => ext === '.pdf' && validPdf(data));
      const item = { id: crypto.randomUUID(), heading, endDate, pdfUrl: saved.url, pdfName: saved.name };
      content.tenders.unshift(item); await writeContent(content); return sendJson(res, 201, item);
    }
    if (req.method === 'DELETE' && url.pathname.startsWith('/api/admin/tenders/')) {
      const id = decodeURIComponent(url.pathname.split('/').pop());
      const item = content.tenders.find((entry) => entry.id === id);
      if (!item) return sendJson(res, 404, { error: 'Tender not found.' });
      content.tenders = content.tenders.filter((entry) => entry.id !== id);
      if (item.pdfUrl.startsWith('/uploads/tenders/')) await fs.unlink(path.join(uploadDir, 'tenders', path.basename(item.pdfUrl))).catch(() => {});
      await writeContent(content); return sendJson(res, 200, { ok: true });
    }
  }
  return sendJson(res, 404, { error: 'Not found.' });
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/CCP' || pathname === '/CCP/') pathname = '/CCP/index.html';
    if (pathname === '/') pathname = '/index.html';
    if (pathname.split('/').some((part) => part.startsWith('.')) || /^\/(server\.mjs|package\.json|README\.md|data)(\/|$)/i.test(pathname)) return sendJson(res, 404, { error: 'Not found.' });
    const target = path.resolve(root, `.${pathname}`);
    if (!target.startsWith(`${root}${path.sep}`)) return sendJson(res, 403, { error: 'Forbidden.' });
    const data = await fs.readFile(target);
    const type = mimeByExt.get(path.extname(target).toLowerCase()) || 'application/octet-stream';
    res.writeHead(200, { 'content-type': type, 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin', 'content-security-policy': "default-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self'; frame-src https://www.youtube-nocookie.com; object-src 'none'; base-uri 'self'; frame-ancestors 'self'" });
    res.end(data);
  } catch (error) {
    if (!res.headersSent) sendJson(res, error.status || (error.code === 'ENOENT' ? 404 : 500), { error: error.status ? error.message : 'Server error.' });
    else res.destroy();
  }
});
server.listen(port, () => console.log(`SAHS site listening on http://localhost:${port}`));
