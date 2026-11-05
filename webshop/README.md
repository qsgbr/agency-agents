# 🛍️ Ladenzeile – Webshop

Ein vollständiger, kleiner Webshop: Produkte ansehen, in den Warenkorb legen, bestellen –
und im Admin-Bereich die Bestellungen bearbeiten und **fertigstellen**.
Keine externen Abhängigkeiten, nur Node.js (ab Version 18).

## Starten

```bash
cd webshop
ADMIN_TOKEN=mein-passwort npm start
```

- Shop: <http://localhost:3000>
- Admin-Bereich: <http://localhost:3000/admin> (Passwort = `ADMIN_TOKEN`, Standard: `admin`)

## Funktionen

**Für Kunden**
- Produktübersicht mit Kategorien-Filter und Lagerbestand
- Warenkorb (bleibt im Browser gespeichert), Mengen ändern, entfernen
- Kasse mit Adresse, Zahlungsart (Rechnung, Vorkasse, PayPal, Nachnahme) und Anmerkung
- Versand 4,90 €, ab 50 € kostenlos
- Bestellbestätigung mit Bestellnummer

**Für den Shop-Betreiber (`/admin`)**
- Übersicht: Anzahl Bestellungen, offene, fertige, Umsatz
- Filter nach Status: Neu · In Bearbeitung · Versendet · Fertig · Storniert
- Status pro Bestellung ändern oder mit einem Klick auf **Fertig** setzen
- **„Alle offenen fertigstellen“** – markiert alle offenen Bestellungen auf einmal als fertig
- Stornieren bucht den Lagerbestand automatisch zurück

## Sicherheit

- Preise und Summen werden ausschließlich auf dem Server berechnet
- Eingaben werden geprüft; Mengen über dem Lagerbestand werden abgelehnt
- Admin-API ist per Passwort (`Authorization: Bearer …`) geschützt
- Die öffentliche Bestellabfrage zeigt keine Adress- oder E-Mail-Daten

## Anpassen

- **Produkte:** `data/products.json` bearbeiten (Name, Beschreibung, Preis, Kategorie, Emoji, Bestand)
- **Bestellungen** werden in `data/orders.json` gespeichert (Ordner per `DATA_DIR` änderbar)
- **Port:** `PORT=8080 npm start`

## Tests

```bash
npm test
```

## API

| Methode | Pfad | Beschreibung |
|---|---|---|
| GET | `/api/products` | Alle Produkte |
| POST | `/api/orders` | Bestellung aufgeben |
| GET | `/api/orders/:id` | Bestellstatus abfragen |
| GET | `/api/admin/orders` | Alle Bestellungen (Admin) |
| PATCH | `/api/admin/orders/:id` | Status ändern (Admin) |
| POST | `/api/admin/orders/complete-all` | Alle offenen fertigstellen (Admin) |

## Hinweis für den Echtbetrieb

Zahlungen werden nicht echt abgewickelt und es werden keine E-Mails verschickt.
Für einen echten Shop braucht es zusätzlich Impressum, Datenschutzerklärung, AGB,
Widerrufsbelehrung, HTTPS sowie die Anbindung eines Zahlungsanbieters.
