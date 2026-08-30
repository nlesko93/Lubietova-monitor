# Ľubietová naživo 🛰️

Nezávislý „živý" prehľad obce **Ľubietová** (okres Banská Bystrica) —
všetky voľne dostupné (OSINT) údaje o obci na jednom mieste, v reálnom čase.
Svetlá, prírodná téma je predvolená; tmavý „mission-control" režim je na
prepínač (aj podľa nastavenia systému).

**Naživo:** <https://nlesko93.github.io/Lubietova-monitor/>

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
| Obecný úrad — aktuality a úradná tabuľa | [lubietova.sk](https://www.lubietova.sk/) | hodinovo |
| Správy o obci | Google News RSS | hodinovo |
| Voľby v obci (NRSR 2023, prezident 2024, EP 2024, komunálne 2022) | [volby.statistics.sk](https://volby.statistics.sk/) + komunálne staticky v `config.json` | hodinovo |
| Zmluvy obce | [CRZ](https://www.crz.gov.sk/) | hodinovo |
| Hospodárenie (účtovné závierky) | [RegisterUZ](https://www.registeruz.sk/) | hodinovo |
| Počet obyvateľov + pohyb obyvateľstva | [ŠÚ SR DataCube](https://data.statistics.sk/) | hodinovo |

### 🌤 Počasie a príroda
| Karta | Zdroj | Obnovovanie |
|---|---|---|
| Počasie + 48 h graf + 7-dňová predpoveď | [Open-Meteo](https://open-meteo.com/) | 15 min (live) |
| Kvalita ovzdušia (EAQI, PM2.5, PM10, O₃…) | Open-Meteo / CAMS | 20 min (live) |
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

## Architektúra

- **Statická stránka** (vanilla JS, žiadny build) hosťovaná na **GitHub Pages**.
- **GitHub Actions** (`.github/workflows/update.yml`) každú hodinu stiahne dáta
  zo zdrojov bez CORS do `data/*.json` a nasadí čerstvý Pages artifact.
  Runner má `poppler-utils` (`pdftotext` na cestovné poriadky) a `unzip`
  (CSV zipy volieb).
- CORS-friendly API (počasie, lietadlá, zemetrasenia, satelity…) volá prehliadač
  priamo; polohy autobusov a satelitov sa počítajú v prehliadači.
- Každý zdroj zlyháva samostatne — výpadok jedného nezhodí dashboard.

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
