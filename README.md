# Ľubietová Monitor 🛰️

Nezávislý monitorovací dashboard obce **Ľubietová** (okres Banská Bystrica) —
všetky voľne dostupné (OSINT) údaje o obci na jednom mieste, v reálnom čase.

## Čo zobrazuje

| Karta | Zdroj | Obnovovanie |
|---|---|---|
| Počasie + 48 h graf + 7-dňová predpoveď | [Open-Meteo](https://open-meteo.com/) | 15 min (live v prehliadači) |
| Kvalita ovzdušia (EAQI, PM2.5, PM10, O₃…) | Open-Meteo / CAMS | 20 min (live) |
| Meteorologické výstrahy pre okres | [Meteoalarm](https://meteoalarm.org/) | hodinovo |
| Lietadlá nad obcou (živá mapa + zoznam) | [adsb.lol](https://adsb.lol/), [airplanes.live](https://airplanes.live/) | 45 s (live) |
| Satelity nad obzorom + viditeľnosť voľným okom | [CelesTrak](https://celestrak.org/) TLE + SGP4 v prehliadači | 10 s (výpočet) |
| Obloha teraz (slnko, mesiac, planéty, Kp index) | astronomy-engine + [NOAA SWPC](https://www.swpc.noaa.gov/) | 30 s (výpočet) |
| Zemetrasenia do 150 km | [USGS](https://earthquake.usgs.gov/) | 30 min (live) |
| Správy o obci | Google News RSS | hodinovo |
| Aktuality a úradná tabuľa obce | [lubietova.sk](https://www.lubietova.sk/) | hodinovo |
| Zmluvy obce | [CRZ](https://www.crz.gov.sk/) | hodinovo |
| Hospodárenie (účtovné závierky) | [RegisterUZ](https://www.registeruz.sk/) | hodinovo |
| Počet obyvateľov (časový rad) | [ŠÚ SR DataCube](https://data.statistics.sk/) | hodinovo |
| Webkamery v okolí | konfigurovateľné v `config.json` | hodinovo |

## Architektúra

- **Statická stránka** (vanilla JS, žiadny build) hosťovaná na **GitHub Pages**.
- **GitHub Actions** (`.github/workflows/update.yml`) každú hodinu stiahne dáta
  zo zdrojov bez CORS do `data/*.json` a nasadí čerstvý Pages artifact.
- CORS-friendly API (počasie, lietadlá, zemetrasenia…) volá prehliadač priamo.
- Každý zdroj zlyháva samostatne — výpadok jedného nezhodí dashboard.

## Lokálny vývoj

```bash
node scripts/fetch/all.mjs   # vygeneruje data/*.json (vyžaduje internet)
python3 -m http.server 8000  # alebo ľubovoľný statický server
```

Konfigurácia (súradnice, IČO, webkamery) je v [`config.json`](config.json).

---
Toto nie je oficiálna stránka obce Ľubietová. Všetky dáta pochádzajú
z verejne dostupných zdrojov uvedených vyššie.
