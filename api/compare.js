import chromium from 'chrome-aws-lambda';
import playwright from 'playwright-core';

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
      await page.waitForSelector('div.card-body', { timeout: 30000 });

      const blocks = await page.$$eval('div.card-body', els => els.map(el => el.innerText));

      let points = null;
      for (const text of blocks) {
        if (text.includes("Achievement Points")) {
          const match = text.match(/Achievement Points\s*([\d\s\u202f]+)/);
          if (match && match[1]) {
            // Extraire uniquement la partie chiffre avant la virgule ou autre texte parasite
            const cleanNumber = match[1].trim().split(/\s+/).slice(0, 2).join('').replace(/[\s\u202f]/g, '');
            points = parseInt(cleanNumber, 10);
            break;
          }
        }
      }

      await page.close();

      return points ?? 'Non trouvé';
    } catch (error) {
      console.error(`Erreur récupération pour ${character}:`, error);
      throw error;
    }
  }

  try {
    const executablePath = await chromium.executablePath;

    browser = await playwright.chromium.launch({
      args: chromium.args,
      executablePath: executablePath || undefined,
      headless: chromium.headless,
    });

    const [points1, points2] = await Promise.all([
      fetchHFPoints(char1),
      fetchHFPoints(char2),
    ]);

    await browser.close();

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

    res.status(200).json(result);

  } catch (error) {
    if (browser) await browser.close();
    console.error('Erreur globale dans /api/compare:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
}
