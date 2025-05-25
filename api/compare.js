import puppeteer from 'puppeteer';

export default async function handler(req, res) {
  console.log('Début handler /api/compare');
  let browser = null;

  try {
    const { char1, char2, realm = 'Archimonde', region = 'EU' } = req.query;
    console.log('Params reçus:', { char1, char2, realm, region });

    if (!char1 || !char2) {
      console.log('Paramètres manquants');
      return res.status(400).json({ error: 'Paramètres requis : char1, char2' });
    }

    async function fetchHFPoints(character) {
      const url = `https://www.dataforazeroth.com/characters/${region}/${realm}/${character}`;
      console.log(`Récupération points pour ${character} via ${url}`);

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

        if (!points) {
          console.log(`Points non trouvés pour ${character}`);
          return 'Non trouvé';
        }

        const firstPart = points.split(/\s+/).slice(0, 2).join(' ');
        const cleanNumber = firstPart.replace(/[\s\u202f]/g, '');
        const number = parseInt(cleanNumber, 10);

        await page.close();

        console.log(`Points pour ${character}: ${number}`);
        return number;
      } catch (error) {
        console.error(`Erreur fetchHFPoints pour ${character}:`, error);
        throw error;
      }
    }

    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
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

    console.log('Résultat final:', result);
    res.status(200).json(result);

  } catch (error) {
    console.error('Erreur globale dans /api/compare:', error);
    if (browser) await browser.close();
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
}
