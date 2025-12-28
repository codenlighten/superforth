import { createServer } from 'http';
import { readFile, stat } from 'fs/promises';
import path from 'path';
import url from 'url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', 'site');
const port = process.env.PORT || 8080;

const types = {
  '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.txt':'text/plain; charset=utf-8'
};

function safeJoin(base, requested){
  const p = path.normalize(path.join(base, requested));
  if(!p.startsWith(base)) throw new Error('Invalid path');
  return p;
}

const server = createServer(async (req, res)=>{
  try {
    const u = new URL(req.url, `http://${req.headers.host}`);
    let pathname = decodeURIComponent(u.pathname);
    if(pathname === '/') pathname = '/index.html';
    const filePath = safeJoin(root, pathname);
    const info = await stat(filePath);
    if(info.isDirectory()){
      return res.writeHead(301, { Location: pathname.replace(/\/$/, '') + '/index.html' }).end();
    }
    const ext = path.extname(filePath).toLowerCase();
    const body = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control':'no-store' });
    res.end(body);
  } catch (e) {
    if(e.code === 'ENOENT' || e.message === 'Invalid path'){
      res.writeHead(404, { 'Content-Type':'text/plain; charset=utf-8' });
      res.end('404 Not Found');
    } else {
      res.writeHead(500, { 'Content-Type':'text/plain; charset=utf-8' });
      res.end('500 Internal Server Error');
    }
  }
});

server.listen(port, ()=>{
  console.log(`SuperForth site listening on http://localhost:${port}`);
});
