const express = require('express');
const bodyParser = require('body-parser');
const puppeteer = require('puppeteer');

const app = express();
const PORT = 3000;

app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

const clients = [];

app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const clientId = Date.now();
  const newClient = { id: clientId, res };
  clients.push(newClient);

  req.on('close', () => {
    clients.splice(clients.indexOf(newClient), 1);
  });
});

function sendEventsToAll(data) {
  clients.forEach(client => client.res.write(`data: ${JSON.stringify(data)}\n\n`));
}

function getWindowPositions(count, layout) {
  const screenWidth = 1920;
  const screenHeight = 1080;

  let positions = [];

  if (layout === 'cascade') {
    for (let i = 0; i < count; i++) {
      positions.push({
        x: 30 * i,
        y: 30 * i,
        width: 800,
        height: 600,
      });
    }
  } else if (layout === 'grid') {
    const cols = 3;
    const rows = Math.ceil(count / cols);
    const winW = Math.floor(screenWidth / cols);
    const winH = Math.floor(screenHeight / rows);

    for (let i = 0; i < count; i++) {
      let row = Math.floor(i / cols);
      let col = i % cols;
      positions.push({
        x: col * winW,
        y: row * winH,
        width: winW,
        height: winH,
      });
    }
  }
  return positions;
}

function isYouTube(url) {
  return /youtube\.com|youtu\.be/.test(url);
}

async function runBot(index, url, pos) {
  try {
    const browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: [
        `--window-size=${pos.width},${pos.height}`,
        `--window-position=${pos.x},${pos.y}`,
      ],
    });

    const [page] = await browser.pages();

    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 }); // tăng timeout lên 60s
    } catch (gotoError) {
      console.warn(`Bot ${index + 1} - Lỗi tải trang (có thể timeout):`, gotoError.message);
      // Có thể vẫn tiếp tục xử lý hoặc đóng bot nếu muốn
      // return; // nếu muốn dừng bot này
    }

    console.log(`Bot ${index + 1} đã mở trang ${url}`);
    sendEventsToAll({ bot: index + 1, status: 'Mở trang', url });

    // Chờ video xuất hiện (timeout nhỏ hơn để không chờ lâu)
    await page.waitForSelector('video', { timeout: 10000 });

    // Play video nếu có
    await page.evaluate(() => {
      const video = document.querySelector('video');
      if (video) {
        video.muted = true;
        video.play().catch(() => {
          const playBtn = document.querySelector('.ytp-play-button');
          if (playBtn) playBtn.click();
        });
      }
    });

    sendEventsToAll({ bot: index + 1, status: 'Video đã bắt đầu chạy' });

  } catch (err) {
    console.error(`Lỗi bot ${index + 1}:`, err);
    sendEventsToAll({ bot: index + 1, status: 'Lỗi: ' + err.message });
  }
}


app.post('/start', (req, res) => {
  const url = req.body.url;
  const count = parseInt(req.body.count) || 1;
  const layout = req.body.layout || 'cascade';

  if (!url) return res.status(400).send('Vui lòng nhập URL.');

  const positions = getWindowPositions(count, layout);

  res.redirect('/');

  for (let i = 0; i < count; i++) {
    runBot(i, url, positions[i]);
  }
});

app.listen(PORT, () => {
  console.log(`Server chạy tại http://localhost:${PORT}`);
});
