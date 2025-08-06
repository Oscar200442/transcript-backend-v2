const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const translate = require('translate');

const app = express();
app.use(cors({ origin: ['https://oscar200442.github.io'] }));
app.use(express.json());

async function scrapeYouTubeTranscript(videoUrl) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  try {
    await page.goto(videoUrl, { waitUntil: 'networkidle2' });

    // Click "...more" to expand description
    await page.waitForSelector('#expand');
    await page.click('#expand');

    // Wait for and click "Show transcript" button
    await page.waitForSelector('button[aria-label="Show transcript"]', { timeout: 10000 });
    await page.click('button[aria-label="Show transcript"]');

    // Wait for transcript to load
    await page.waitForSelector('.ytd-transcript-segment-renderer', { timeout: 10000 });

    // Extract transcript
    const transcript = await page.evaluate(() => {
      const segments = Array.from(document.querySelectorAll('.ytd-transcript-segment-renderer'));
      return segments.map(segment => {
        const time = segment.querySelector('.segment-timestamp')?.innerText || '';
        const text = segment.querySelector('.segment-text')?.innerText || '';
        return `${time} --> ${text}`;
      }).join('\n');
    });

    await browser.close();
    return transcript || 'No transcript available';
  } catch (error) {
    await browser.close();
    return `Error: ${error.message}`;
  }
}

app.post('/transcripts', async (req, res) => {
  const { urls, targetLang = 'en' } = req.body;
  const transcripts = {};

  for (const url of urls) {
    const videoId = url.match(/(?:v=)([^&=?\s]{11})/)?.[1];
    if (!videoId) {
      transcripts[url] = 'Invalid YouTube URL';
      continue;
    }

    try {
      let transcriptText = await scrapeYouTubeTranscript(url);
      if (targetLang !== 'en' && transcriptText !== 'No transcript available') {
        const lines = transcriptText.split('\n');
        const translatedLines = [];
        for (let i = 0; i < lines.length; i++) {
          const [time, text] = lines[i].split(' --> ');
          if (text) {
            const translatedText = await translate(text, { to: targetLang });
            translatedLines.push(`${time} --> ${translatedText}`);
          } else {
            translatedLines.push(lines[i]);
          }
        }
        transcriptText = translatedLines.join('\n');
      }
      transcripts[url] = transcriptText;
    } catch (error) {
      transcripts[url] = `Error: ${error.message}`;
    }
  }
  res.json(transcripts);
});

app.get('/transcripts', (req, res) => {
  res.json({ message: 'GET request received. Use POST to fetch transcripts.' });
});

module.exports = app;
