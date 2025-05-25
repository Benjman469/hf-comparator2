import chromium from 'chrome-aws-lambda';
import puppeteer from 'puppeteer-core';

export default async function handler(req, res) {
  const { char1, char2, realm = 'Archimonde', region = 'EU' } = req.query;

  if (!char1 || !char2) {
    return res.status(400).json({ error: 'Paramètres requis : char1, char2' });
  }

  let browser = null;

  async function fetchHFPoints(character) {
    const url = `https://www.dataforazeroth.com/characters/${region}/${realm}/${character}`;

    try {
      const page = await browser.newPage();

      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('h1.text-nowrap', { timeout: 30000 });

      const textBlocks = await page.$$eval('div.card-body', blocks =>
        blocks.map(b => b.innerText)
      );

      let points = null;
      for (const block of textBlocks) {
        if (block.includes("Achievement Points")) {
          const match = block.match(/Achievement Points\s*([\d\s\u202f]+)/);
          if (match && match[1]) {
            points = match[1].trim();
            break;
          }
        }
      }

      if (!points) return 'Non trouvé';

      const firstPart = points.split(/\s+/).slice(0, 2).join(' ');
      const cleanNumber = firstPart.replace(/[\s\u202f]/g, '');
      const number = parseInt(cleanNumber, 10);

      await page.close();

      return number;
    } catch (error) {
      return 'Non trouvé';
    }
  }

  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath,
      headless: chromium.headless,
    });

    const [points1, points2] = await Promise.all([
      fetchHFPoints(char1),
      fetchHFPoints(char2),
    ]);

    const result = {
      region,
      realm,
      characters: [
        { name: char1, points: points1 },
        { name: char2, points: points2 },
      ],
    };

    if (typeof points1 === 'number' && typeof points2 === 'number') {
      result.winner = points1 === points2 ? 'Egalité' : (points1 > points2 ? char1 : char2);
    }

    await browser.close();

    res.status(200).json(result);
  } catch (error) {
    if (browser) await browser.close();
    res.status(500).json({ error: error.message });
  }
}
