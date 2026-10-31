# FF Dimmen schermbeveiliging

Showfoto's uit de portfolio, vol beeld. In het midden het woordmerk en de zin "Your partner in performer tracking." Rechtsonder, klein en rustig, de titel van het project en daaronder klant, locatie en jaar als die er zijn.

## Geïnstalleerd

Het bestand staat hier:

`~/Library/Screen Savers/FF Dimmen.saver`

Foto's, titels en uitsnede komen uit `/Users/niels/Portofolio/.data` (de database en de map `media`). De website hoeft niet aan te staan. Een nieuw gepubliceerd project verschijnt de volgende keer dat de schermbeveiliging start.

## Aanzetten

1. Open Systeeminstellingen.
2. Zoek op Schermbeveiliging.
3. Kies **FF Dimmen**.

Stond dat venster al open, sluit het en open het opnieuw. Zet een eventuele systeemklok uit als macOS die over het beeld legt.

## Opnieuw bouwen

```bash
screensaver/build.sh
```

Dat bouwt de saver, zet hem op dezelfde plek, en controleert of de fotovolgorde dezelfde spreiding heeft als de site.

Montserrat komt uit `brand/fonts` (Light 300 en ExtraBold 800, plus de woff2-bestanden). De schermbeveiliging tekent met Core Text, en die leest geen woff2. Het bouwscript maakt er daarom een ttf van. Dezelfde letters.
