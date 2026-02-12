import http from 'http';

const hostname = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT) || 7788;

const server = http.createServer((req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain');
  res.end('Agent service is running\n');
});

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});