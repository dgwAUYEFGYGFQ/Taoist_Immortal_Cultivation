// Simple no-deps mock server for local development
// Usage: node scripts/mock-server.js  (PORT defaults to 3000)

const http = require('http');
const url = require('url');

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  const { pathname } = url.parse(req.url, true);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-openid,x-role');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  if (req.method === 'GET' && pathname === '/me/info') {
    const openid = req.headers['x-openid'] || 'dev-openid-001';
    const role = req.headers['x-role'] || 'DAO_FRIEND';
    const body = {
      code: 'OK', message: 'ok',
      data: { openid, role, nickname: '道友·开发', virtueBalance: 120, contribBalance: 45 }
    };
    res.writeHead(200);
    return res.end(JSON.stringify(body));
  }

  if (req.method === 'GET' && pathname === '/health') {
    res.writeHead(200);
    return res.end(JSON.stringify({ status: 'ok' }));
  }

  res.writeHead(404);
  res.end(JSON.stringify({ code: 404, message: 'Not Found', data: null }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Mock server listening on http://127.0.0.1:${PORT}`);
});

