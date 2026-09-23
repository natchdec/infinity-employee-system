import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const root = process.cwd();
const files = new Set([
  'index.html',
  'preview.css',
  'preview.js',
  'helpers.js',
  'employee-views.js',
  'travel-views.js',
  'operations-views.js',
]);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
};
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1:4310');
    let body, ext;
    if (url.pathname === '/font.css') {
      body = [400, 500, 600, 700]
        .map(
          (weight) =>
            `@font-face{font-family:EmployeeThai;font-weight:${weight};font-style:normal;font-display:swap;src:url('/fonts/noto-sans-thai-thai-${weight}-normal.woff2') format('woff2');unicode-range:U+0E01-0E5B,U+200C-200D,U+25CC}@font-face{font-family:EmployeeThai;font-weight:${weight};font-style:normal;font-display:swap;src:url('/fonts/noto-sans-thai-latin-${weight}-normal.woff2') format('woff2')}`,
        )
        .join('\n');
      ext = '.css';
    } else if (
      /^\/fonts\/noto-sans-thai-(thai|latin)-(400|500|600|700)-normal\.woff2$/.test(url.pathname)
    ) {
      body = await readFile(
        path.join(
          root,
          'node_modules/@fontsource/noto-sans-thai/files',
          path.basename(url.pathname),
        ),
      );
      ext = '.woff2';
    } else {
      const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      if (!files.has(name)) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      body = await readFile(path.join(root, 'design', name));
      ext = path.extname(name);
      if (name === 'index.html')
        body = body
          .toString()
          .replace('</head>', '<link rel="stylesheet" href="/font.css"></head>');
      if (name === 'preview.css') body = body.toString().replace(/@font-face\{[^}]*\}\n/, '');
    }
    res.writeHead(200, {
      'content-type': types[ext],
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    res.end(body);
  } catch {
    res.writeHead(500);
    res.end('Design asset unavailable');
  }
});
server.listen(4310, '127.0.0.1', () => console.log('Design prototype listening on 127.0.0.1:4310'));
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => server.close(() => process.exit(0)));
