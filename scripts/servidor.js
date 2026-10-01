const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '..');
const PORTA = Number(process.env.PORT) || 5173;
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

http
  .createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const arquivo = path.join(RAIZ, url === '/' ? 'index.html' : url);
    if (!arquivo.startsWith(RAIZ + path.sep) && arquivo !== RAIZ) {
      res.writeHead(403).end();
      return;
    }
    fs.readFile(arquivo, (erro, conteudo) => {
      if (erro) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Não encontrado');
        return;
      }
      res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arquivo)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(conteudo);
    });
  })
  .listen(PORTA, () => console.log(`Carteira IRPF rodando em http://localhost:${PORTA}`));
