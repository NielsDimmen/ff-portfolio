# FF DIMMEN huisstijl

FF DIMMEN werkt aan shows op tour, festivals en live events. Het merk is rustig en donker, met veel ruimte. Het werk zelf mag spreken.

## Het idee: dimmen

Het logo begint vol (FF DIM in Extrabold), zakt bij de tweede M en dimt uit naar EN in Light. Dat idee draagt alles:

- **Kleur** zijn dimstanden van een en dezelfde inkt: `ink-100`, `ink-60`, `ink-25`. Geen palet van losse kleuren.
- **Typografie** volgt de dikte van het logo. Belangrijk is Extrabold, ondersteunend is Light.
- **Beweging** is een fade. Dingen dimmen op of af, ze vliegen niet.
- **Een accent:** `glow`, de warme gloed van een halogeenlamp die uitdimt. Spaarzaam.

## Stem

We praten zoals op de vloer: direct, informeel, kort.

- Schrijf in de "we"-vorm. "We draaien de media servers." Niet "FF DIMMEN verzorgt".
- Spreek klanten aan met "jullie". Alleen in formele stukken "u".
- Korte zinnen achter elkaar. Geen opsommingen van features of merknamen om indruk te maken.
- Verkoop het vakmanschap, niet de spullen.
- Pijlen → voor een gevolg of een volgende stap. Geen emoji.
- Zelfverzekerd, zonder op te scheppen. "We reageren dezelfde dag" mag. "Wij zijn de beste" niet.
- Voorbeeld: "Drie dagen opbouw, vier shows. We stonden er van de eerste kabel tot de laatste buiging."

## Logo

- Gebruik altijd de bestanden onder Assets → Logos of de Logo-component. Nooit zelf zetten in een font.
- Inkt op grond: `ink-100` op `ground`. In drukwerk `print-black`. Nooit in `glow` of een andere kleur.
- Vrije ruimte rondom: de hoogte van het logo. Minimaal 120px breed op een scherm, 30mm in drukwerk.
- Kleiner of vierkant → het FF-monogram. Het app-icoon (monogram in een vlak) is voor favicon, avatar en het HA add-on icoon.

## Kleur

Twee thema's met dezelfde tokens.

- **Podium** (donker) is de standaard voor de website, social en video. Het is de zaal voordat het licht aangaat.
- **Papier** (licht) is voor offertes, facturen, briefpapier en de lichte modus van de site. `ground` is off-white #F4F4F1, niet puur wit.
- Tekst: koppen en broodtekst in `ink-100`, secundair in `ink-60`. `ink-25` is nooit tekst.
- `glow` alleen als vlak met `on-glow` erop: hover van een knop, de actieve filtertag. Als tekst `glow-text` voor links. Maximaal een prominente gloei per scherm.
- `line` voor haarlijnen, altijd 1px.
- Kleurparen voldoen aan WCAG AA in beide thema's. De ratio's staan bij elk token.

## Typografie

- **Web:** Montserrat, self-hosted uit `brand/fonts/`. Lijkt sterk op Proxima Nova en is vrij te gebruiken.
- **Drukwerk:** Proxima Nova (`print`-familie), zoals in het bestaande briefpapier. Voor het web heb je daar een aparte licentie voor nodig.
- **Labels:** Montserrat Semibold in kleine hoofdletters met wat extra spatiëring (`label`). Voor feiten en filtertags.
- Gewicht volgt het belang: `display` en `h1` Extrabold 800, `h2` en `h3` Semibold 600, `body` 400, `lead` Light 300.
- `display` altijd in hoofdletters, zoals het logo. De rest in zinsvorm.
- Regels lopende tekst maximaal 65 tekens breed.

## Ruimte en layout

- 4px-raster: `space-1` (4) tot `space-10` (128).
- Veel lucht. Secties `space-9` uit elkaar op desktop, `space-8` op mobiel.
- Zijmarge `space-4` op mobiel, `space-7` op desktop.
- Hoeken zijn recht (`radius-0`). Knoppen `radius-sm`. Alleen filtertags zijn een pil (`radius-pill`).
- Geen schaduwen. Scheiding met `line` of met ruimte.

## Beeld

- Alleen echte foto's van shows en opbouw. Geen stock, geen renders.
- Donker en contrastrijk. Het licht van de show is het licht in de foto.
- De show staat centraal: het podium, het licht, het publiek. Geen close-ups van apparatuur.
- In het grid staan foto's op `dim-80` en dimmen ze op naar `dim-100` bij hover.
- Fotocredit altijd in `small`, `ink-60`.

## Beweging

- Een curve voor alles: de dimcurve, `cubic-bezier(.2,.7,.2,1)`. 400ms voor knoppen en links, 600ms voor foto's.
- Bij het laden van de site dimt het logo op van links naar rechts: FF DIM eerst, MEN als laatste.
- Niks schuift, stuitert of schaalt. Respecteer `prefers-reduced-motion`: dan geen animatie.

## Toepassingen

- **Website:** podium-thema, ProjectCard-grid met Tag-filters, FactsRow op projectpagina's, ContactBlock onderaan.
- **Offertes en facturen:** Briefpapier, papier-thema, Proxima Nova.
- **Instagram:** donkere foto's, logo wit linksonder of rechtsonder met vrije ruimte. Avatar: `ff-icoon-donker`. Tags #FFDimmen en @nielsslein1.
- **Home Assistant add-on:** `ff-icoon-donker` als icon.png en logo.png.
