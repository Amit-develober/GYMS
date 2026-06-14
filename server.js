const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  // Normalize path and remove query parameters/hashes from URL
  const cleanUrl = req.url.split('?')[0].split('#')[0];
  let filePath = cleanUrl === '/' || cleanUrl === '' ? '/index.html' : cleanUrl;
  filePath = path.join(__dirname, filePath);
  
  // Prevent directory traversal
  if (!filePath.startsWith(__dirname)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }
  
  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.statusCode = 404;
        res.end('404 File Not Found');
      } else {
        res.statusCode = 500;
        res.end(`Internal Server Error: ${err.code}`);
      }
    } else {
      const ext = path.extname(filePath).toLowerCase();
      res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
      // Set headers for testing and security
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(data);
    }
  });
});

server.listen(PORT, () => {
  console.log(`[SUCCESS] Gym SPA Server listening at http://localhost:${PORT}/`);
  console.log(`[ROUTE] Serve index.html at http://localhost:${PORT}/index.html`);
});
