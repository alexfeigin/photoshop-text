import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export function serveStatic(rootDir) {
  const server = createServer(async (req, res) => {
    try {
      const urlPath = (req.url || '/').split('?')[0];
      const safePath = urlPath === '/' ? '/index.html' : urlPath;
      const resolved = path.resolve(rootDir, '.' + safePath);

      if (!resolved.startsWith(rootDir)) {
        res.statusCode = 403;
        res.end('Forbidden');
        return;
      }

      const data = await readFile(resolved);

      const ext = path.extname(resolved).toLowerCase();
      const contentType =
        ext === '.html'
          ? 'text/html; charset=utf-8'
          : ext === '.js'
            ? 'text/javascript; charset=utf-8'
            : ext === '.css'
              ? 'text/css; charset=utf-8'
              : ext === '.png'
                ? 'image/png'
                : ext === '.otf'
                  ? 'font/otf'
                  : 'application/octet-stream';

      res.statusCode = 200;
      res.setHeader('Content-Type', contentType);
      res.end(data);
    } catch {
      res.statusCode = 404;
      res.end('Not found');
    }
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}
