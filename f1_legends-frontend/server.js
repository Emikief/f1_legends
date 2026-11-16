const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 8001;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  let safeUrl = req.url.split("?")[0];
  if (safeUrl === "/" || safeUrl === "") {
    safeUrl = "/index.html";
  }

  const filePath = path.join(__dirname, safeUrl);

  // Sécurité anti directory-traversal
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    return res.end("403 Forbidden");
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("404 Fichier non trouvé");
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    res.writeHead(200, { "Content-Type": contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`🏁 F1 Legends Frontend disponible sur http://localhost:${PORT}`);
});
