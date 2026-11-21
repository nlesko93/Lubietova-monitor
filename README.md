# Ľubietová naživo 🛰️

### 👉 Beží tu: **<https://nlesko93.github.io/Lubietova-monitor/>**

[![Otvoriť dashboard](https://img.shields.io/badge/Otvori%C5%A5-dashboard-2f7d4f?style=for-the-badge)](https://nlesko93.github.io/Lubietova-monitor/)

Nezávislý „živý" prehľad obce **Ľubietová** (okres Banská Bystrica) —
všetky voľne dostupné (OSINT) údaje o obci na jednom mieste, v reálnom čase.
Svetlá, prírodná téma je predvolená; tmavý „mission-control" režim je na
prepínač (aj podľa nastavenia systému).

## Čo zobrazuje

### 🚌 Doprava a cesta
| Karta | Zdroj | Obnovovanie |
|---|---|---|
| Autobusy — linka 610 (odchody + polohy na mape po ceste) | [SAD Zvolen](https://www.sadzv.sk/) PDF cestovné poriadky (`pdftotext`) + [OSRM](https://project-osrm.org/) geometria cesty | hodinovo + výpočet polôh v prehliadači |
| Cesta do Banskej Bystrice (čas, vzdialenosť, živé mapy) | [OSRM](https://project-osrm.org/) + odkazy na Google/Waze | hodinovo |

### 🏛 Obec a samospráva
| Karta | Zdroj | Obnovovanie |
|---|---|---|
| Zber odpadu (kalendár) | Google Calendar ICS (v `config.json`) | hodinovo |
| Odstávky elektriny | [SSD](https://www.ssd.sk/) / oznamy obce | hodinovo |
| Otváracie hodiny (obecný úrad, pošta, Jednota, lekáreň) | statické v `config.json` + „otvorené teraz" v prehliadači | 1 min (výpočet) |
| Úradná tabuľa, oznamy, podujatia a dokumenty zastupiteľstva | [lubietova.sk](https://www.lubietova.sk/) | pri každom behu |
| Správy o obci | Google News RSS | hodinovo |
| Voľby v obci (komunálne 2026 — starosta + všetci kandidáti na poslancov, NRSR 2023, prezident 2024, EP 2024, komunálne 2022) | [volby.statistics.sk](https://volby.statistics.sk/) (CSV exporty) + statická záloha v `config.json` | hodinovo |
| Zmluvy obce, Obecných lesov a Obecnej píly — kde sú objednávateľom aj dodávateľom, zmluvy medzi sebou, ročné súčty, najväčší dodávatelia, skrytie hrobových miest | [CRZ](https://www.crz.gov.sk/) | 3 h |
| Hospodárenie obce, Obecných lesov a Obecnej píly — výnosy / čistý obrat, výsledok hospodárenia, majetok po rokoch | [RegisterUZ](https://www.registeruz.sk/) | denne |
| Počet obyvateľov + pohyb obyvateľstva | [ŠÚ SR DataCube](https://data.statistics.sk/) | hodinovo |

### 🌤 Počasie a príroda
| Karta | Zdroj | Obnovovanie |
|---|---|---|
| Počasie + 48 h graf + 7-dňová predpoveď | [Open-Meteo](https://open-meteo.com/) | 15 min (live) |
| Kvalita ovzdušia — meranie zo senzora v obci (ak je dostupný), inak model | [AirGradient](https://www.airgradient.com/map/) verejné senzory / vlastný senzor cez secret `AIRGRADIENT_TOKEN`, [Sensor.Community](https://sensor.community/), model [Open-Meteo/CAMS](https://open-meteo.com/) | senzor pri každom behu, model 20 min |
| Meteorologické výstrahy pre okres | [Meteoalarm](https://meteoalarm.org/) | hodinovo |
| Vodné stavy riek | [SHMÚ](https://www.shmu.sk/) | hodinovo |
| Zemetrasenia do 150 km | [USGS](https://earthquake.usgs.gov/) | 30 min (live) |

### 🛰 Nebo nad obcou
| Karta | Zdroj | Obnovovanie |
|---|---|---|
| Lietadlá nad obcou (živá mapa + zoznam) | [adsb.lol](https://adsb.lol/), [airplanes.live](https://airplanes.live/) | 45 s (live) |
| Satelity nad obzorom + typ/účel + odkaz na detaily | [CelesTrak](https://celestrak.org/) TLE + SGP4 v prehliadači, [N2YO](https://www.n2yo.com/) | 10 s (výpočet) |
| Obloha teraz (slnko, mesiac, planéty, Kp index) | astronomy-engine + [NOAA SWPC](https://www.swpc.noaa.gov/) | 30 s (výpočet) |

### 📷 Ďalšie
| Karta | Zdroj | Obnovovanie |
|---|---|---|
| Webkamery v okolí (Donovaly, Slovenská Ľupča…) | konfigurovateľné v `config.json` | 1 min (obnova snímky) |
| Fotogaléria obce | [Wikimedia Commons](https://commons.wikimedia.org/) | pri načítaní |
| Šport — FK Baník Ľubietová | odkazy na [Futbalnet](https://sportnet.sme.sk/futbalnet/) (tabuľka, výsledky, súpiska) | statické odkazy |
| Inzeráty v okolí — PSČ 976 55 | [Bazoš.sk](https://www.bazos.sk/) | hodinovo |

## Inštalácia ako aplikácia (PWA)

Stránku si môžeš pridať na plochu telefónu alebo počítača ako aplikáciu:
tlačidlo **⬇ Inštalovať** v hlavičke (Chrome, Edge, Android), na iPhone
v Safari cez **Zdieľať → Pridať na plochu**. Aplikácia sa otvára bez
lišty prehliadača a bez internetu ukáže posledný načítaný stav
(`manifest.webmanifest`, `sw.js`).

## Architektúra

- **Statická stránka** (vanilla JS, žiadny build) hosťovaná na **GitHub Pages**.
- **GitHub Actions** (`.github/workflows/update.yml`) stiahne dáta zo zdrojov
  bez CORS do `data/*.json` a nasadí čerstvý Pages artifact.
  Runner má `poppler-utils` (`pdftotext` na cestovné poriadky) a `unzip`
  (CSV zipy volieb).
- CORS-friendly API (počasie, lietadlá, zemetrasenia, satelity…) volá prehliadač
  priamo; polohy autobusov a satelitov sa počítajú v prehliadači.
- Každý zdroj zlyháva samostatne — výpadok jedného nezhodí dashboard. Karty
  bez dát sa zlúčia do riadku „nedostupné zdroje" a karty so starými dátami
  (viac než 3 h) sa označia.
- **Cache pomalých zdrojov:** účtovné závierky, voľby, demografia (24 h),
  cestovný poriadok (12 h), zmluvy a dráhy satelitov (3 h) sa neťahajú pri
  každom behu — ako cache slúži naposledy nasadená stránka (`lib.mjs → cached`).
  Vynútiť čerstvé stiahnutie: spustiť workflow ručne so zaškrtnutým „no_cache" alebo zvýšiť
  číslo verzie pri volaní `cached()`.

### Ako často sa dáta obnovujú

Workflow má tri pokusy za hodinu (`cron: '7,27,47 * * * *'`), ale GitHub
naplánované behy pri vyťažení odkladá alebo vynecháva — v praxi to bývalo
raz za niekoľko hodín. Stránka preto v páse „Dnes v obci" ukazuje, kedy
prebehla posledná aktualizácia.

**Spoľahlivé hodinové obnovovanie** sa dá zabezpečiť externým spúšťačom,
ktorý zavolá `workflow_dispatch`:

1. Na GitHube vytvor *fine-grained personal access token* len pre tento
   repozitár s oprávnením **Actions: Read and write**.
2. V bezplatnej službe typu [cron-job.org](https://cron-job.org/) nastav
   každých 30–60 minút požiadavku:

   ```
   POST https://api.github.com/repos/nlesko93/Lubietova-monitor/actions/workflows/update.yml/dispatches
   Authorization: Bearer <token>
   Accept: application/vnd.github+json
   Content-Type: application/json

   {"ref":"claude/lubietova-osint-dashboard-reycfe"}
   ```

Token nikdy neukladaj do repozitára.

## Lokálny vývoj

```bash
node scripts/fetch/all.mjs   # vygeneruje data/*.json (vyžaduje internet + pdftotext, unzip)
python3 -m http.server 8000  # alebo ľubovoľný statický server
```

Konfigurácia (súradnice, IČO, zastávky, webkamery, otváracie hodiny, voľby,
inzeráty, šport) je v [`config.json`](config.json).

---
Toto nie je oficiálna stránka obce Ľubietová. Všetky dáta pochádzajú
z verejne dostupných zdrojov uvedených vyššie.
