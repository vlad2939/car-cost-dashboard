# Evidență Cheltuieli Auto — Documentație Completă

Aplicație web locală pentru urmărirea riguroasă a tuturor costurilor unui Hyundai i20. Datele sunt stocate permanent în fișiere JSON locale, fără baze de date externe, fără conturi cloud, fără dependențe de internet. Serverul Node.js inclus servește interfața și gestionează citirea și scrierea datelor. Aplicația rulează complet offline și poate fi găzduită pe un Raspberry Pi pentru acces din rețeaua locală.

## Tehnologii și arhitectură

Stiva tehnologică este intenționat minimalistă: Node.js nativ (fără framework), HTML/CSS/JS static, fișiere JSON ca bază de date. Nu există npm install, bundlere, transpilere sau dependențe de producție. Fonturile Barlow și Barlow Condensed sunt încărcate de la Google Fonts la prima accesare; ulterior, browserul le pune în cache.

- `server.js`: server HTTP scris cu modulele native `http`, `fs` și `path`. Expune API-ul REST și servește fișierele statice din `public`.
- `public/index.html`: structura completă a interfeței — sidebar, secțiuni, formulare, modal documentație.
- `public/app.js`: logica clientului — navigație, filtre, calcule KPI, grafice canvas, formulare, backup.
- `public/styles.css`: tema vizuală Asphalt & Steel, layout responsive, ambele moduri de culoare.
- `data/expenses.json`: cheltuielile non-combustibil (52 de înregistrări la data documentației).
- `data/fuel.json`: alimentările (71 de înregistrări la data documentației).
- `data/meta.json`: metadate despre mașină și import.

## Cerințe de sistem

Node.js versiunea 18 sau mai nouă este singura dependență externă. Nu sunt necesare alte pachete. Pentru verificarea versiunii instalate:

```bash
node --version
```

Pe Raspberry Pi se recomandă Node.js 20 LTS, disponibil prin NodeSource sau via `nvm`.

## Pornire rapidă

Clonează sau copiază folderul proiectului, apoi pornește serverul:

```bash
npm start
```

Sau direct:

```bash
node server.js
```

Serverul pornește implicit pe portul 3000. Dacă portul 3000 este ocupat și variabila de mediu `PORT` nu este setată manual, serverul încearcă automat portul următor (3001, 3002 etc.) până găsește unul disponibil. Adresa este afișată în consolă la pornire.

```text
Car cost dashboard: http://localhost:3000
```

Pentru un port specific:

```bash
PORT=8080 npm start
```

## Structura completă a proiectului

```text
car-cost-dashboard/
├── server.js           — server HTTP, API REST, normalizare date
├── package.json        — configurare Node, script start
├── README.md           — această documentație (copie externă)
├── public/
│   ├── index.html      — structura HTML a aplicației
│   ├── app.js          — logica clientului JavaScript
│   ├── styles.css      — tema Asphalt & Steel, layout, responsive
│   ├── readme.md       — această documentație (afișată în popup)
│   └── hyundai-logo.svg — sigla Hyundai folosită în sidebar
└── data/
    ├── expenses.json   — cheltuieli non-combustibil
    ├── fuel.json       — alimentări
    └── meta.json       — metadate mașină
```

Directorul `data` este creat automat la prima pornire dacă nu există. Fișierele JSON sunt create cu valori implicite dacă lipsesc.

## Tema vizuală: Asphalt & Steel

Interfața folosește o temă inspirată din estetica automotive de performanță. Sidebar-ul este permanent întunecat (navy adânc `#0c1320`) indiferent de modul selectat — creează un contrast puternic cu conținutul principal. Accentul principal este portocaliu racing (`#cf4e00` în modul luminos, `#f97316` în cel întunecat).

Fontul `Barlow Condensed` (weight 600–800) este folosit pentru titluri, valori numerice mari și KPI-uri — condensat, tehnic, lizibil la dimensiuni mari. `Barlow` regulat (weight 400–600) gestionează textul de interfață, etichetele și tabelele.

Cardurile KPI au câte o dungă colorată de 3px în partea superioară și un glow ambient generat din culoarea specifică categoriei, folosind funcția CSS `color-mix()`. Culoarea dungii corespunde categoriei de cheltuială afișate.

Butonul de comutare temă (sus dreapta, în topbar) salvează alegerea în `localStorage` sub cheia `carDashboardTheme`. La reîncărcare, tema este restaurată automat înainte ca paginea să fie randată.

## Secțiunile interfeței

## Dashboard

Pagina principală oferă o privire de ansamblu completă asupra costurilor, consumului și kilometrilor. Se încarcă implicit la pornire.

Secțiunea KPI conține șase carduri:

- `Acte`: suma cheltuielilor din categoria Acte (RCA, viniete, ITP).
- `Întreținere`: suma cheltuielilor din categoriile Piese + scule și Manopera.
- `Consumabile`: suma cheltuielilor din categoria Consumabile + diverse.
- `Combustibil`: suma tuturor costurilor de alimentare filtrate.
- `Consum mediu`: consumul mediu ponderat în litri la 100 km (calculat diferit cu sau fără filtru de perioadă — detaliat mai jos).
- `Cost/km`: raportul dintre totalul cheltuielilor filtrate și kilometrii estimați pentru perioada respectivă.

Sub KPI-uri se află patru grafice canvas:

- `Cheltuieli lunare`: grafic de bare pe luni calendaristice, combină cheltuielile și combustibilul.
- `Categorii`: grafic donut cu ponderea fiecărei categorii. Legenda este desenată direct pe canvas, cu valoare absolută și procent.
- `Consum`: grafic linie cu evoluția consumului (l/100 km) per alimentare, sortat cronologic.
- `Preț benzină`: grafic linie cu evoluția prețului (lei/litru) per alimentare, sortat cronologic.

La baza paginii se află două tabele compacte cu ultimele 8 înregistrări: cheltuielile recente și alimentările recente, ambele sortate descrescător după dată.

## Combustibil

Afișează tabelul complet al alimentărilor, filtrat și sortat descrescător după dată. Coloanele sunt: Data, Benzinărie, Cost (lei), Preț (lei/l), Litri, Km total (odometru), Km/plin (distanță parcursă față de alimentarea precedentă), Consum (l/100 km). Fiecare rând are butoane de editare și ștergere. Butonul `+ Nou` din header-ul panoului deschide formularul de alimentare din secțiunea Adaugă / Editează și resetează câmpurile.

Badge-ul din topbar afișează `TOTAL LITRI` în loc de `KM TOTAL` când această secțiune este activă.

## Cheltuieli

Afișează tabelul complet al cheltuielilor non-combustibil, filtrat și sortat descrescător după dată. Coloanele sunt: Data, Categorie, Produs, Tip (dimensiune, specificație), Cost (lei). Fiecare rând are butoane de editare și ștergere. Butonul `+ Nou` din header funcționează identic cu cel din secțiunea Combustibil, dar pentru formularul de cheltuieli.

Categoriile existente în baza de date curentă sunt: `Acte`, `Piese + scule`, `Consumabile + diverse` și `Manopera`.

## Adaugă / Editează

Afișează simultan două formulare: formularul de cheltuială (stânga) și formularul de alimentare (dreapta). Ambele funcționează în mod adăugare (câmpurile sunt goale) sau mod editare (câmpurile sunt pre-completate cu datele înregistrării selectate din tabel).

Formularul de cheltuială are câmpurile: Data, Categorie (cu autocomplete din datalist), Produs, Tip, Cost lei, Km total (opțional), Note (textarea).

Formularul de alimentare are câmpurile: Data, Benzinărie, Cost lei, Lei/l, Litri, Km total (odometru), Km/plin, Consum (l/100 km), Note. Câmpurile `Km/plin` și `Consum` sunt calculate automat de client când sunt disponibile `Km total`, `Data` și `Litri` — câmpul primește atributul `data-auto="true"` pentru a putea fi suprascris manual fără a fi recalculat la fiecare modificare.

Butoanele `Resetează` curăță formularul fără a naviga în altă secțiune. Butoanele `Salvează` trimit datele la server prin `POST` (înregistrare nouă) sau `PUT` (editare).

## Backup / Restore

Permite exportul și importul complet al bazei de date locale.

`Descarcă backup JSON` apelează endpoint-ul `/api/backup`, care returnează un obiect cu câmpurile `version`, `exportedAt`, `expenses`, `fuel` și `meta`. Fișierul se salvează local cu numele `backup-cheltuieli-auto-YYYY-MM-DD.json`.

`Încarcă backup` citește fișierul JSON selectat, cere confirmare și trimite datele la endpoint-ul `/api/restore`. Serverul validează că payload-ul conține array-urile `expenses` și `fuel` înainte de a suprascrie fișierele. Dacă endpoint-ul `/api/restore` nu este disponibil (server pornit din cod vechi), clientul cade pe un fallback care șterge și reînscrie înregistrările individual prin API-ul CRUD existent.

## Filtrele globale

Bara de filtre apare în secțiunile Dashboard, Combustibil și Cheltuieli. Este ascunsă automat în Adaugă / Editează și Backup / Restore.

- `De la` și `Până la`: selectoare de an (2021–2035). Dacă `De la` este mai mare decât `Până la`, valorile sunt interschimbate automat. Un singur an selectat la ambele câmpuri filtrează exact acel an.
- `Categorie`: filtrează după categoria cheltuielii. Include automat toate categoriile distincte din baza de date plus `Combustibil`.
- `Căutare`: filtrează text-liber în câmpurile categorie, produs, tip, note (cheltuieli) sau benzinărie, note (alimentări). Comparația este case-insensitive.
- `Șterge filtre`: resetează toate câmpurile și re-randează cu datele complete.

Panoul `TOTAL` din sidebar afișează întotdeauna suma totală a tuturor datelor, indiferent de filtrele active. Cardurile KPI și graficele respectă filtrele.

## Formule și calcule

## Consum mediu

Fără filtru de perioadă, consumul mediu este calculat ponderat: suma tuturor litrilor din alimentările valide (cu litri și km/plin cunoscuți) împărțită la suma tuturor kilometrilor parcurși aferenți, înmulțit cu 100. Aceasta evită eroarea medie aritmetică simplă când plinurile au dimensiuni diferite.

```text
Consum_mediu = (Σ litri / Σ km_parcursi) × 100
```

Cu filtru de perioadă activ, consumul se calculează din datele filtrate: litri consumați în perioadă împărțiți la distanța estimată a perioadei (diferența dintre odometrele alimentărilor cele mai apropiate de capetele intervalului), înmulțit cu 100.

## Cost per kilometru

Cost/km împarte totalul cheltuielilor filtrate (combustibil + toate celelalte categorii) la distanța estimată pentru perioada selectată. Distanța se determină prin `periodKilometerStats`: se găsește alimentarea cea mai apropiată de data de start și cea mai apropiată de data de end ale filtrului, și se calculează diferența odometrelor.

```text
Cost/km = (Σ cheltuieli_filtrate + Σ combustibil_filtrat) / (odometru_end − odometru_start)
```

## Km/plin și consum per alimentare

La adăugarea sau editarea unei alimentări, câmpul `Km/plin` este calculat automat de client: se caută cea mai recentă alimentare anterioară datei introduse (cu odometru valid, ignorând înregistrarea curentă dacă e editare), și se calculează `odometru_curent − odometru_anterior`. Câmpul `Consum` se calculează din `(litri / km) × 100`.

Serverul recalculează aceste câmpuri pentru întregul array `fuel.json` de fiecare dată când o alimentare este adăugată, editată sau ștearsă — `recalculateFuelRows()` sortează cronologic, parcurge secvențial și completează `kmSinceLastFill` și `consumptionPer100Km` acolo unde lipsesc sau sunt zero, pe baza odometrelor consecutive.

## Grafice canvas

Toate graficele sunt desenate direct pe elemente `<canvas>` fără nicio bibliotecă externă. Sunt patru tipuri implementate manual în `app.js`:

- `drawBarChart`: bare verticale cu scală liniară, etichete pe axa X la fiecare N pași (adaptat la numărul de bare), hover pe fiecare bară.
- `drawLineChart`: linie continuă cu puncte circulare, axă Y configurabilă per grafic (`getLineAxisConfig`), grid orizontal, etichete axă Y, hover pe fiecare punct.
- `drawDonutChart`: donut cu segmente proporționale, gaură centrală, legendă cu culoare, valoare și procent pentru primele 5 categorii.
- `drawEmpty`: mesaj text când nu există date pentru filtrul curent.

Zonele sensibile la hover sunt înregistrate în `chartRegions` (Map keyed by canvas id). La mousemove, se detectează geometric intersecția cu regiunile (rect pentru bare, circle pentru puncte, slice pentru donut) și se afișează tooltip-ul poziționat la coordonatele cursorului.

Culoarea fiecărui grafic este citită din variabilele CSS curente via `themeColor(variabila)` — la comutarea temei, graficele sunt redesenate cu noile culori.

## API REST — referință completă

Toate endpoint-urile returnează JSON. Erorile sunt returnate cu statusul HTTP corespunzător și un câmp `error` în payload.

## GET /api/data

Returnează snapshot-ul complet al bazei de date. Frontend-ul face toate calculele pe baza acestui răspuns.

```json
{
  "expenses": [ ... ],
  "fuel": [ ... ],
  "meta": { ... }
}
```

## POST /api/expenses

Adaugă o cheltuială nouă. Payload: obiect cheltuială (fără `id` — generat de server). Răspuns 201 cu înregistrarea salvată.

## PUT /api/expenses/:id

Actualizează cheltuiala cu id-ul specificat. Payload: câmpurile de actualizat (merged cu înregistrarea existentă). Răspuns 200 cu înregistrarea actualizată. 404 dacă id-ul nu există.

## DELETE /api/expenses/:id

Șterge cheltuiala cu id-ul specificat. Răspuns `{ ok: true }`.

## POST /api/fuel

Adaugă o alimentare nouă. Serverul recalculează `kmSinceLastFill` și `consumptionPer100Km` pentru toate alimentările după inserție. Răspuns 201.

## PUT /api/fuel/:id

Actualizează o alimentare. Recalculare completă a tuturor alimentărilor după modificare. Răspuns 200.

## DELETE /api/fuel/:id

Șterge o alimentare. Recalculare completă după ștergere. Răspuns `{ ok: true }`.

## GET /api/backup

Returnează backup-ul complet cu metadate de export:

```json
{
  "version": 1,
  "exportedAt": "2026-05-14T10:30:00.000Z",
  "expenses": [ ... ],
  "fuel": [ ... ],
  "meta": { ... }
}
```

## POST /api/restore

Înlocuiește complet baza de date cu conținutul primit. Validare minimă: payload-ul trebuie să conțină array-urile `expenses` și `fuel`. Câmpul `meta` este opțional — dacă lipsește sau nu este obiect, este salvat ca `{}`. Răspuns `{ ok: true }` sau `{ error: "..." }` cu status 400.

## Modele de date

## Cheltuială (expenses.json)

```json
{
  "id": "expenses_1234567890_abc123",
  "date": "2026-05-05",
  "category": "Consumabile + diverse",
  "product": "lichid parbriz",
  "type": "5 l",
  "costLei": 45,
  "odometerKm": null,
  "notes": "",
  "source": "manual"
}
```

- `id`: identificator unic generat de server (`prefix_timestamp_random`). Înregistrările importate din Excel au id-uri cu sufixe din adresa celulei originale (`expense_actel12`).
- `date`: dată în format ISO 8601 (`YYYY-MM-DD`).
- `category`: una din valorile existente sau orice valoare nouă introdusă manual. Categoriile curente: `Acte`, `Piese + scule`, `Consumabile + diverse`, `Manopera`.
- `product`: descrierea produsului sau serviciului.
- `type`: specificație suplimentară (dimensiune, cantitate, detaliu tehnic). Câmp opțional.
- `costLei`: cost numeric în lei, stocat ca număr. Null dacă nu e completat.
- `odometerKm`: kilometrajul odometrului la data cheltuielii. Opțional, null dacă nu e relevantă.
- `notes`: câmp liber pentru observații.
- `source`: `"manual"` pentru înregistrări introduse din aplicație, sau referința celulei Excel pentru datele importate inițial (`"Excel:L10-O10"`).

## Alimentare (fuel.json)

```json
{
  "id": "fuel_1234567890_abc123",
  "date": "2026-04-28",
  "station": "Rompetrol",
  "costLei": 200,
  "priceLeiPerLiter": 5.88,
  "liters": 34.01,
  "odometerKm": 42818,
  "kmSinceLastFill": 672,
  "consumptionPer100Km": 5.06,
  "importedConsumptionPer100Km": 0,
  "notes": "",
  "source": "manual"
}
```

- `station`: numele benzinăriei, normalizat de server (prefixul `b-` este eliminat automat dacă există — provine din formatul datelor Excel importate).
- `priceLeiPerLiter`: prețul pe litru la momentul alimentării.
- `liters`: numărul de litri.
- `odometerKm`: citirea odometrului la alimentare. Esențial pentru calculul automat al consumului.
- `kmSinceLastFill`: kilometri parcurși față de alimentarea precedentă. Calculat automat de server la fiecare modificare a array-ului fuel, pe baza odometrelor consecutive. Poate fi completat manual în formular și va fi păstrat dacă este nenul și pozitiv.
- `consumptionPer100Km`: consumul calculat pentru plina curentă. Calculat din `(liters / kmSinceLastFill) × 100`. Valoare 0 sau null înseamnă că nu a putut fi calculat (lipsă date odometru sau kilometri).
- `importedConsumptionPer100Km`: valoarea de consum importată din Excel, păstrată ca referință istorică. Nu este recalculată.

## Metadate (meta.json)

```json
{
  "car": "HYUNDAI i20",
  "initialCostLei": null,
  "acquisitionAdjustmentLei": null,
  "currency": "lei",
  "importedAt": "2026-05-14T01:03:49",
  "sourceFile": "COSTURI i20.xlsx",
  "totalExpensesLei": 37414
}
```

Câmpul `car` este afișat în sidebar ca titlul mașinii. `importedAt` și `sourceFile` documentează migrarea inițială din Excel. Câmpurile financiare (`initialCostLei`, `acquisitionAdjustmentLei`) sunt rezervate pentru extensii viitoare.

## Arhitectura serverului (server.js)

Serverul folosește exclusiv modulele native ale Node.js. Nu există framework, router sau middleware extern.

`ensureDataFiles()` este apelat la pornire și creează directorul `data` și fișierele JSON lipsă cu valori implicite. Această funcție face serverul rezistent la instalări noi sau la ștergeri accidentale ale datelor.

`listenWithFallback(port)` înregistrează un listener pentru eroarea `EADDRINUSE` și încearcă recursiv portul următor. Opreste recursivitatea dacă variabila `PORT` a fost setată explicit de utilizator — în acel caz, eșuează cu eroare.

`normalizeRecord(type, record)` transformă payload-ul brut al formularului în formatul corect pentru stocare. Convertește string-urile numerice în numere (sau null), elimină câmpurile necunoscute și calculează consumul dacă sunt disponibili litri și kilometri. Numele benzinăriei este curățat de prefixul `b-` prin `cleanStationName()`.

`recalculateFuelRows(rows)` sortează cronologic toate alimentările și recalculează `kmSinceLastFill` și `consumptionPer100Km` secvențial, propagând odometrul anterior. Această recalculare completă asigură consistența datelor după orice modificare.

`createId(prefix)` generează identificatori unici din timestamp și 6 caractere random base36: `prefix_timestamp_random`. Coliziunile sunt practic imposibile în contextul volumului de date al unei aplicații personale.

Fișierele statice sunt servite cu protecție path traversal: calea normalizată trebuie să înceapă cu `publicDir`. O cerere la `/../server.js` ar fi respinsă cu 403. Tipurile MIME sunt mapate explicit pentru extensiile `.html`, `.css`, `.js`, `.json`, `.svg`, `.ico`.

## Arhitectura clientului (app.js)

Aplicația clientului folosește JavaScript ES2020+ fără transpilare. Starea globală este un obiect `state` cu proprietățile `expenses`, `fuel`, `meta`, `view` și `filters`.

`loadData()` face un singur `fetch` la `/api/data` și populează `state`. Randarea completă (`render()`) este apelată după fiecare modificare a datelor sau a filtrelor.

`render()` apelează în ordine: `renderMeta()`, `renderCategoryOptions()`, `renderDashboard()`, `renderHeaderBadge()`, `renderFuelTable()`, `renderExpenseTable()`. Graficele sunt redesenate cu `drawCharts()` via `setTimeout(drawCharts, 30)` — întârzierea permite browser-ului să calculeze layout-ul canvas înainte de desenare.

`filteredExpenses()` și `filteredFuel()` aplică filtrele active pe state. `matchesDate()` compară string-urile ISO (`YYYY-MM-DD`) direct — comparația lexicografică este corectă pentru acest format. `matchesCategory()` verifică egalitatea exactă. `matchesSearch()` verifică includerea string-ului de căutare în oricare din câmpurile relevante.

`categoryColors` este un obiect cu culorile fixe ale categoriilor, folosit de graficul donut și de culorile KPI. Categoriile necunoscute primesc o culoare din array-ul fallback ciclic.

`chartRegions` este un `Map` keyed by canvas id care stochează array-uri de zone sensibile la hover. Fiecare regiune este un obiect cu `type` (`rect`, `circle`, `slice`) și coordonatele geometrice necesare pentru detecția coliziunii.

`updateFuelDerivedFields()` este apelat la fiecare modificare a câmpurilor Data, Litri, Km total sau Km/plin din formularul de alimentare. Logica de autocomplete: dacă `Km/plin` nu a fost completat manual (absența `dataset.auto` sau prezența `data-auto="true"`), calculează din odometrele consecutive. Similar pentru `Consum`. Câmpul primește `data-auto="true"` când este calculat automat, și îl pierde când utilizatorul intervine manual.

## Gestionarea și persistența datelor

Datele sunt scrise pe disc imediat după fiecare operație CRUD, fără buffer sau queue. `writeJson()` scrie întreg array-ul la fiecare modificare — potrivit pentru volumul unei aplicații personale (sute de înregistrări, nu milioane).

Codificarea este UTF-8 fără BOM. La citire, `readJson()` elimină BOM-ul dacă există (`replace(/^\uFEFF/, "")`) — util pentru fișierele generate pe Windows.

Fișierele sunt formatate cu `JSON.stringify(value, null, 2)` — indentate cu 2 spații, lizibile cu orice editor de text.

Nu există tranzacții sau blocare optimistă. Modificările concurente (două tab-uri deschise simultan) pot produce suprascrierea datelor. Aplicația este proiectată pentru un singur utilizator simultan.

## Backup și restore — ghid complet

Backup-ul trebuie efectuat înainte de orice modificare majoră: adăugare de multe înregistrări, editare în masă sau actualizare a codului aplicației.

Fișierul de backup conține toate cele trei seturi de date (`expenses`, `fuel`, `meta`) plus câmpurile `version` (întotdeauna `1`) și `exportedAt` (timestamp ISO). Este un fișier JSON standard, editabil cu orice editor.

Restore-ul înlocuiește complet baza curentă. Nu există merge sau deduplicare — toate datele existente sunt suprascrise. Aplicația afișează un dialog de confirmare înainte de execuție.

Fallback-ul clientului la restore: dacă serverul nu suportă `/api/restore` (versiune mai veche), clientul șterge individual toate cheltuielile și alimentările existente prin `DELETE`, apoi le re-adaugă pe rând prin `POST`. Este mai lent dar funcțional.

Strategie recomandată de backup: descarcă un backup după fiecare sesiune de introducere date, salvează în cloud (Google Drive, Dropbox) sau pe un stick USB. Fișierul de backup din ziua curentă poate fi recuperat complet în 30 de secunde via Restore.

## Deployment pe Raspberry Pi

Aplicația rulează nativ pe Raspberry Pi OS (Debian). Se recomandă Node.js 20 LTS. Pașii complet pentru instalare pe un Pi proaspăt:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

Verificare:

```bash
node --version
npm --version
```

Copierea fișierelor pe Pi (de pe calculator local):

```bash
scp -r ./car-cost-dashboard pi@raspberrypi.local:~/
```

Pornire manuală pentru testare:

```bash
cd ~/car-cost-dashboard
node server.js
```

Rulare permanentă ca serviciu systemd. Creează fișierul de serviciu:

```bash
sudo nano /etc/systemd/system/car-dashboard.service
```

Conținut:

```text
[Unit]
Description=Car Cost Dashboard
After=network.target

[Service]
ExecStart=/usr/bin/node /home/pi/car-cost-dashboard/server.js
WorkingDirectory=/home/pi/car-cost-dashboard
Restart=always
User=pi
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
```

Activare și pornire:

```bash
sudo systemctl daemon-reload
sudo systemctl enable car-dashboard
sudo systemctl start car-dashboard
sudo systemctl status car-dashboard
```

Verificare log-uri:

```bash
journalctl -u car-dashboard -f
```

## Configurare NGINX (acces din rețeaua locală)

Dacă Pi-ul are NGINX instalat și aplicațiile sunt organizate pe sub-căi, adaugă un bloc `location` în configurația site-ului:

```text
location /auto/ {
    proxy_pass http://127.0.0.1:3000/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

Reîncarcă NGINX:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Aplicația devine accesibilă la `http://raspberrypi.local/auto/` sau la IP-ul fix al Pi-ului.

## Actualizare aplicație pe Pi

Procedura pentru aplicarea modificărilor de cod fără pierdere de date:

- 1. Din aplicație: Backup / Restore → Descarcă backup JSON.
- 2. Copiază fișierele actualizate pe Pi (exclude folderul `data`).
- 3. Repornește serviciul: `sudo systemctl restart car-dashboard`.
- 4. Verifică aplicația în browser.
- 5. Dacă ceva nu funcționează: restaurează backup-ul din pasul 1.

## Personalizare

## Schimbarea numelui mașinii

Editează direct `data/meta.json`:

```json
{
  "car": "Dacia Duster"
}
```

Reîncarcă aplicația în browser — sidebar-ul afișează noul nume.

## Adăugarea de categorii noi

Categoriile sunt definite de datele din `expenses.json`. Orice valoare nouă introdusă în câmpul Categorie din formular devine o categorie validă. Nu există liste predefinite în cod — autocomplete-ul este populat dinamic din datele existente.

## Modificarea intervalului de ani al filtrelor

Funcția `populateYearFilters()` din `app.js` generează opțiunile de la 2021 la 2035. Modifică valorile direct în cod pentru a extinde intervalul.

## Modificarea culorilor categoriilor

Obiectul `categoryColors` din `app.js` mapează fiecare categorie la o culoare hex. Adaugă sau modifică intrările pentru a personaliza culorile graficului donut și ale cardurilor KPI.

## Adăugarea unui nou câmp

La adăugarea unui câmp nou în formular: actualizează `normalizeRecord()` în `server.js` să includă câmpul, adaugă input-ul în `public/index.html`, actualizează `fillForm()` în `app.js` pentru editare, și adaugă coloana în tabelul relevant din `renderFuelTable()` sau `renderExpenseTable()`.

## Depanare

`Portul X este ocupat`: serverul încearcă automat portul următor dacă `PORT` nu e setat. Dacă dorești un port specific, setează variabila de mediu explicit.

`Nu se salvează date`: verifică permisiunile de scriere ale directorului `data`. Pe Linux: `ls -la data/` și, dacă e nevoie, `chmod 755 data/ && chmod 644 data/*.json`.

`Graficele nu apar`: graficele sunt desenate pe canvas după ce layout-ul este calculat. Dacă sunt complet goale, redu browser-ul și mărește-l la loc pentru a forța un reflow, sau navighează în altă secțiune și înapoi la Dashboard.

`Datele nu apar după restore`: verifică că fișierul JSON selectat conține câmpurile `expenses` și `fuel` ca array-uri. Fișierele de backup exportate de aplicație au formatul corect. Un fișier alterat manual poate eșua validarea serverului.

`Fonturile nu se încarcă`: aplicația folosește Google Fonts printr-un `@import` în CSS. Dacă rețeaua nu are acces la internet, browserul va folosi fontul de sistem (`system-ui`, `-apple-system`). Interfața rămâne funcțională, doar tipografia diferă.

## Referință rapidă

- Pornire server: `npm start` sau `node server.js`
- Port implicit: 3000 (auto-fallback pe porturile următoare)
- Date stocate: `data/expenses.json`, `data/fuel.json`, `data/meta.json`
- Tema salvată: `localStorage["carDashboardTheme"]` (`light` sau `dark`)
- ID-uri generate: `prefix_timestamp_random` (ex: `expenses_1715688000000_ab12cd`)
- Categorii cheltuieli curente: Acte, Piese + scule, Consumabile + diverse, Manopera
- Surse date: manual (formular) sau Excel (import inițial, arhivat)
- Backup: format JSON portabil cu version, exportedAt, expenses, fuel, meta
- Documentație popup: `public/readme.md` (apăsați link-ul din footer-ul sidebar-ului)
