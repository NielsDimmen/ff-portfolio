# FF Dimmen op Home Assistant

De add-on is klein. De site en de foto's komen er later bij, net als bij de verhuur. Een update vervangt de code en laat `/data` staan.

Naar buiten is alleen de landing zichtbaar: de slideshow, de zin, het contact en de uitgelichte projecten. Projectpagina's blijven in het beheer, ze staan niet op de site. Lokaal met `npm run dev` blijft de hele site werken.

## Eén keer installeren

De code staat op https://github.com/NielsDimmen/ff-portfolio.

Op de Home Assistant CLI:

```bash
git clone https://github.com/NielsDimmen/ff-portfolio.git /tmp/ff-portfolio
mkdir -p /addons
cp -a /tmp/ff-portfolio/addons/ff_portfolio /addons/ff_portfolio
ls /addons/ff_portfolio/config.yaml
```

Daarna in HA: Instellingen → Add-ons → Add-onwinkel → zoeken naar updates. Onder lokaal staat **FF Dimmen**.

Vanaf de Mac, als git op de Home Assistant-machine niet kan:

```bash
./scripts/serve-ha-addon.sh
```

Laat dat venster open. Op de Home Assistant CLI, met het adres dat het script print:

```bash
mkdir -p /addons
curl -L -o /tmp/ff_portfolio-ha.zip http://<JOUW-MAC-IP>:8765/ff_portfolio-ha.zip
unzip -o /tmp/ff_portfolio-ha.zip -d /addons
ls /addons/ff_portfolio/config.yaml
```

Daarna in HA: Instellingen → Add-ons → Add-onwinkel → zoeken naar updates. Onder lokaal staat **FF Dimmen**.

Zet bij Configuratie een `admin_token` (niet `change-me-now`). `public_base` is het adres waarop jullie de site openen, zonder slash aan het eind. Dat adres gebruikt de knop Bekijk site. Start de add-on.

Cloudflare, als je een hostname wilt: die wijst naar `http://local-ff-portfolio:8080`. Het beheer gaat via het add-onpaneel, niet via die poort.

## App en inhoud

De app is een Linux-bundle. Docker bouwt `better-sqlite3` en sharp voor de Home Assistant-machine. Standaard is dat amd64. Voor een ARM-doos: `HA_ARCH=arm64`.

```bash
./scripts/prepare-ha-addon.sh
ADMIN_TOKEN=... ./scripts/deploy-ha.sh
ADMIN_TOKEN=... ./scripts/deploy-content.sh
```

`deploy-ha.sh` zet de code in `/data/app`. `deploy-content.sh` zet `db.sqlite` en `media/` in `/data`. De vertaalmodellen gaan niet mee; die komen in `/data/models` zodra je in het beheer vertaalt.

Een latere app-update is alleen `./scripts/deploy-ha.sh`. De foto's blijven. Een latere inhoud-update is alleen `./scripts/deploy-content.sh`. De code blijft.

Als Cloudflare het bestand weigert (HTTP 413), gaan de scripts zelf naar poort 9099 op dezelfde host. Handmatig: `PORTFOLIO_URL=http://10.0.30.114:9099`.

## Wat waar staat

| Pad | Inhoud |
| --- | --- |
| `/data/app` | de site, vervangen bij een app-deploy |
| `/data/db.sqlite` | projecten, teksten, instellingen |
| `/data/media` | foto's |
| `/data/models` | vertaal- en herkenmodellen |
| `/data/options.json` | `admin_token` en `public_base` |

De site luistert intern op 8081. Poort 8080 is de gateway, die blijft staan tijdens een deploy. Het beheer luistert op 8099 en is alleen via het paneel te openen.
