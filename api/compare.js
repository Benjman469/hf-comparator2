import { chromium } from 'playwright';

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
        await page.goto(url, { waitUntil: 'networkidle' });

        // On attend un petit peu pour que la page soit bien chargée (optionnel)
        await page.waitForTimeout(1500);

        // Récupérer le texte des div.card-body
        const blocks = await page.$$eval('div.card-body', els => els.map(el => el.innerText));

        let points = null;
        for (const text of blocks) {
          if (text.includes('Achievement Points')) {
            console.log(`Texte complet Achievement Points pour ${character} :\n${text}`);

            // Extraire la partie après "Achievement Points"
            const after = text.split('Achievement Points')[1];
            if (after) {
              // Prendre la première ligne après "Achievement Points"
              const firstLine = after.trim().split('\n')[0];
              // Nettoyer les espaces (normaux et insécables)
              const cleaned = firstLine.replace(/[\s\u202f]/g, '');
              // Parse en nombre entier
              points = parseInt(cleaned, 10);
            }
            break;
          }
        }

        await page.close();

        if (!points) {
          console.log(`Points non trouvés pour ${character}`);
          return 'Non trouvé';
        }

        console.log(`Points pour ${character}: ${points}`);
        return points;

      } catch (error) {
        console.error(`Erreur fetchHFPoints pour ${character}:`, error);
        throw error;
      }
    }

    browser = await chromium.launch({
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
