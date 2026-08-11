import "dotenv/config";
import express from "express";
import { chromium } from "playwright";
import fs from "node:fs/promises";

const app = express();

const PORT = process.env.PORT || 3000;
const WEBHOOK = process.env.DISCORD_WEBHOOK_URL;
const MAX_PRICE = Number(process.env.MAX_PRICE_EUR || 25);
const INTERVAL = Number(process.env.POLL_INTERVAL_MS || 60000);

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

const seen = new Set();

async function sendDiscord(item) {
  if (!WEBHOOK) {
    console.log("Webhook Discord non configuré");
    return;
  }

  await fetch(WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "Nike Vinted Alert",
      embeds: [{
        title: `🆕 ${item.title}`,
        url: item.url,
        description:
          `💰 **${item.price} €**\n` +
          `🔎 ${item.search}\n\n` +
          `👉 **Ouvrir l'annonce Vinted**`,
        image: item.image ? { url: item.image } : undefined,
        footer: {
          text: "Nike Vinted Alert • ≤ 25 €"
        }
      }]
    })
  });
}

async function scan() {
  let browser;

  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    for (const search of SEARCHES) {
      const url =
        "https://www.vinted.fr/catalog?search_text=" +
        encodeURIComponent(search);

      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 30000
      });

      await page.waitForTimeout(1500);

      const items = await page.evaluate(() => {
        return [...document.querySelectorAll('a[href*="/items/"]')]
          .map(a => {
            const card = a.closest("div");
            const text = card?.innerText || a.innerText || "";
            const priceMatch = text.match(/(\\d+(?:[,.]\\d{1,2})?)\\s*€/);

            return {
              url: a.href,
              title: a.innerText?.trim() || "Nike",
              price: priceMatch
                ? Number(priceMatch[1].replace(",", "."))
                : null,
              image: card?.querySelector("img")?.src || ""
            };
          })
          .filter(x => x.url);
      });

      for (const item of items) {
        if (!item.price || item.price > MAX_PRICE) continue;

        const id = item.url;

        if (seen.has(id)) continue;

        seen.add(id);

        await sendDiscord({
          ...item,
          search
        });
      }
    }
  } catch (error) {
    console.error("Erreur:", error.message);
  } finally {
    if (browser) await browser.close();
  }
}

app.get("/", (_req, res) => {
  res.send("🟢 Nike Vinted Alert fonctionne");
});

app.listen(PORT, () => {
  console.log(`Bot lancé sur le port ${PORT}`);
  scan();
  setInterval(scan, INTERVAL);
});
