# Slaviša & Ana - Fotografije sa venčanja 💍

Premium sajt za otpremanje fotografija sa venčanja, gde gosti mogu da šalju slike direktno u deljeni Google Photos album.

## Funkcionalnosti

- Romantičan, premium i responzivan UI u krem, blush i zlatnoj paleti
- Jedinstven QR kod po sesiji za brzo deljenje
- Otpremanje fotografija prevlačenjem i puštanjem
- Trake napretka za svaki fajl
- Animacija konfeta nakon uspešnog otpremanja
- Direktno otpremanje u Google Photos album: **"Slaviša & Ana Wedding"**
- Google OAuth 2.0 prijava uz podršku za refresh token

## Struktura projekta

```
wedding-photos/
├── public/
│   └── index.html
├── server.js
├── auth.js
├── .env
├── package.json
└── README.md
```

## Preduslovi

- Node.js 14+
- Google nalog
- Google Cloud projekat

## 1. Kreiranje Google Cloud projekta

1. Otvorite [Google Cloud Console](https://console.cloud.google.com/).
2. Kliknite na padajući meni za projekat gore levo.
3. Izaberite **New Project**.
4. Dajte mu ime, na primer: `wedding-photos-uploader`.
5. Kliknite **Create**.

## 2. Omogućite Google Photos Library API

1. U Google Cloud projektu otvorite **APIs & Services > Library**.
2. Potražite **Photos Library API**.
3. Otvorite ga i kliknite **Enable**.

## 3. Podesite OAuth consent screen

1. Idite na **APIs & Services > OAuth consent screen**.
2. Izaberite **External** ili **Internal** ako vaš workspace to zahteva.
3. Popunite obavezne podatke:
   - Ime aplikacije
   - Email za podršku korisnicima
   - Email za kontakt developera
4. Sačuvajte i nastavite.
5. Dodajte scope:
   - `https://www.googleapis.com/auth/photoslibrary.appendonly`
6. Ako je aplikacija u test modu, dodajte svoj Google nalog pod **Test users**.
7. Sačuvajte i objavite ili ostavite u testiranju sa svojim nalogom kao testerom.

## 4. Kreirajte OAuth 2.0 kredencijale

1. Idite na **APIs & Services > Credentials**.
2. Kliknite **Create Credentials > OAuth client ID**.
3. Izaberite **Web application**.
4. Dajte ime, na primer: `Wedding Photos Web Client`.
5. Dodajte Authorized redirect URI:
   - `http://localhost:3000/auth/callback`
6. Kliknite **Create**.
7. Kopirajte generisane vrednosti:
   - Client ID
   - Client Secret

## 5. Podesite promenljive okruženja

U fajl `.env` unesite:

```env
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/callback
GOOGLE_REFRESH_TOKEN=
SITE_URL=http://localhost:3000
PORT=3000
```

## 6. Instalirajte zavisnosti

```bash
npm install
```

## 7. Pokrenite OAuth podešavanje i uzmite refresh token

Prvo pokrenite server:

```bash
node server.js
```

U drugom terminalu pokrenite:

```bash
node auth.js
```

Zatim:

1. Kopirajte i otvorite auth URL koji se prikaže u terminalu.
2. Prijavite se svojim Google nalogom.
3. Odobrite pristup.
4. Google će vas preusmeriti na `http://localhost:3000/auth/callback`.
5. Aplikacija automatski upisuje `GOOGLE_REFRESH_TOKEN` u `.env`.

Ako je token uspešno sačuvan, spremni ste za otpremanje fotografija.

## 8. Pokrenite aplikaciju

```bash
npm install
node server.js
```

Otvorite:

- `http://localhost:3000`

## Kako radi

### QR kod

- Pri učitavanju stranice frontend kreira UUID token sesije.
- QR kod se generiše iz:
  - `SITE_URL?session=UUID`
- Koristi besplatan API:
  - `https://api.qrserver.com/v1/create-qr-code/`

### Tok otpremanja

1. Frontend šalje slike preko `multipart/form-data` na `/api/upload`.
2. Backend dobija Google access token iz refresh tokena.
3. Backend pronalazi ili kreira album:
   - `Slaviša & Ana Wedding`
4. Za svaki fajl:
   - Otpremi bajtove na Google Photos uploads endpoint i dobije `uploadToken`
   - Pozove `mediaItems.batchCreate` sa `albumId`
5. Backend vraća uspeh/neuspeh za zahtev.

## Git + GitHub Setup

1. Inicijalizujte git repozitorijum:
   - `git init`
2. Dodajte fajlove:
   - `git add .`
3. Napravite prvi commit:
   - `git commit -m "Initial commit: wedding photos app"`
4. Kreirajte prazan GitHub repo (bez README).
5. Povežite lokalni repo sa GitHub-om:
   - `git remote add origin https://github.com/<username>/<repo>.git`
6. Pošaljite kod:
   - `git branch -M main`
   - `git push -u origin main`

## Deployment na Vercel

Ovaj projekat je podešen za Vercel sa fajlovima:

- `vercel.json`
- `api/index.js`

### Koraci

1. Otvorite [Vercel](https://vercel.com/) i prijavite se.
2. Kliknite **Add New... > Project**.
3. Importujte vaš GitHub repozitorijum.
4. U **Environment Variables** dodajte:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI` (npr. `https://vas-domen.vercel.app/auth/callback`)
   - `GOOGLE_REFRESH_TOKEN`
   - `GOOGLE_ALBUM_ID` (opciono, ali preporučeno nakon prvog uspešnog upload-a)
   - `SITE_URL` (npr. `https://vas-domen.vercel.app`)
5. Kliknite **Deploy**.
6. Nakon deploy-a, u Google Cloud OAuth credentials obavezno dodajte isti produkcioni callback URL:
   - `https://vas-domen.vercel.app/auth/callback`

### Bitna napomena za OAuth token

- Vercel ne čuva izmene `.env` fajla na serveru.
- Zato `GOOGLE_REFRESH_TOKEN` generišite lokalno (`node auth.js`) i ručno unesite u Vercel Environment Variables.

## Važne napomene

- Nemojte commit-ovati `.env` u javni repozitorijum.
- Ako se `GOOGLE_REFRESH_TOKEN` istekne ili opozove, ponovo pokrenite `node auth.js`.
- Za produkciju koristite HTTPS URL-ove za OAuth redirect i `SITE_URL`.
- Google Photos API kvote zavise od vašeg Google Cloud projekta.

## Skripte

- `npm start` -> Pokreće server
- `npm run dev` -> Pokreće server preko nodemon-a
- `npm run auth` -> Pokreće pomoćni alat za OAuth podešavanje

## Rešavanje problema

### „Authentication failed”

- Proverite `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` i `GOOGLE_REDIRECT_URI` u `.env`
- Uverite se da redirect URI tačno odgovara Google Cloud kredencijalima
- Ponovo pokrenite `node auth.js` da biste dobili token

### „No files uploaded”

- Proverite da je naziv input polja `photos` (već je podešen u frontend-u)
- Proverite veličinu fajlova, maksimum je 20 MB po fajlu
- Proverite da su fajlovi slike (JPG, PNG, WEBP, GIF)

### „Album not created”

- Proverite da je Photos Library API uključen
- Proverite da je OAuth scope upravo append-only scope naveden gore
- Proverite da Google nalog ima aktiviran Google Photos

---

Napravljeno sa ljubavlju za posebni dan Slaviše i Ane ❤️
