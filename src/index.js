import "dotenv/config";
import { chromium } from "playwright";

const WEBHOOK = process.env.DISCORD_WEBHOOK_URL;
const MAX_PRICE = Number(process.env.MAX_PRICE_EUR || 25);

const SEARCHES = [
  "nike trail",
  "nike trail running",
  "nike running",
  "nike phenom",
  "nike phenom elite",
  "nike storm-fit",
  "nike division",
  "nike running division",
  "nike tech",
  "nike running technique"
];

async function sendDiscord(item) {
  if (!WEBHOOK) {
    throw new Error("DISCORD_WEBHOOK_URL manquant");
  }

  const response = await fetch(WEBHOOK, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      username: "Nike Vinted Alert",
      embeds: [{
        title: `🆕 ${item.title}`,
        url: item.url,
        description:
          `💰 **${item.price.toFixed(2)} €**\n` +
          `🔎 Recherche : ${item.search}\n\n` +
          `👉 **Ouvrir l'annonce Vinted**`,
        image: item.image ? { url: item.image } : undefined,
        footer: {
          text: "Nike Vinted Alert • ≤ 25 €"
        }
      }]
    })
  });

  if (!response.ok) {
    throw new Error(`Discord HTTP ${response.status}`);
  }
}

async function scan() {
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();

    for (const search of SEARCHES) {
      console.log(`🔎 Scan : ${search}`);

      const url =
        "https://www.vinted.fr/catalog?search_text=" +
        encodeURIComponent(search);

      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 30000
      });

      await page.waitForTimeout(2000);

      const items = await page.evaluate(() => {
        const links = [...document.querySelectorAll('a[href*="/items/"]')];
        const results = [];
        const ids = new Set();

        for (const link of links) {
          const url = link.href;
          const match = url.match(/\/items\/(\d+)/);

          if (!match || ids.has(match[1])) continue;

          ids.add(match[1]);

          const card = link.closest("div");
          const text = card?.innerText || link.innerText || "";

          const priceMatch = text.match(
            /(\d+(?:[,.]\d{1,2})?)\s*€/
          );

          if (!priceMatch) continue;

          const price = Number(
            priceMatch[1].replace(",", ".")
          );

          const image = card?.querySelector("img");

          results.push({
            id: match[1],
            title:
              image?.alt ||
              link.innerText?.trim() ||
              "Nike",
            price,
            url,
            image: image?.src || ""
          });
        }

        return results;
      });

      for (const item of items) {
        if (item.price > MAX_PRICE) continue;

        await sendDiscord({
          ...item,
          search
        });

        console.log(
          `📨 Envoyé : ${item.title} — ${item.price} €`
        );
      }
    }
  } finally {
    await browser.close();
  }
}

scan()
  .then(() => {
    console.log("✅ Scan terminé");
    process.exit(0);
  })
  .catch(error => {
    console.error("❌ Erreur :", error);
    process.exit(1);
  });
