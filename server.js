/**
 * ============================================================
 * SERVER.JS — Server HTTP local pentru Car Cost Dashboard
 * ============================================================
 *
 * Scop: servește fișierele statice din /public și expune un API
 * REST minimal pentru citirea și scrierea datelor JSON din /data.
 *
 * Nu folosește niciun framework (Express, Fastify etc.) — doar
 * modulele native Node.js: http, fs, path. Suficient pentru o
 * aplicație personală care rulează local.
 *
 * ──────────────────────────────────────────────────────────────
 * PORNIRE:
 *   node server.js                        → port 3000, date din /data
 *   PORT=4000 node server.js              → port personalizat
 *   DATA_DIR=/alt/path node server.js     → date dintr-un director extern
 *   PORT=4000 DATA_DIR=/alt/path node server.js → combinat
 *
 * Dacă portul e ocupat și PORT nu e setat explicit, serverul
 * încearcă automat portul următor (3001, 3002 etc.).
 *
 * ──────────────────────────────────────────────────────────────
 * STRUCTURA FIȘIERELOR DE DATE:
 *
 *   Director implicit:  <proiect>/data/
 *   Director extern:    setat prin variabila DATA_DIR
 *
 *   expenses.json  → array de obiecte cheltuieli non-combustibil
 *   fuel.json      → array de obiecte alimentări
 *   meta.json      → metadate (nume mașină, monedă etc.)
 *
 *   La prima pornire cu DATA_DIR extern: dacă /data/ conține date,
 *   acestea sunt COPIATE în directorul extern. Dacă /data/ e gol,
 *   se creează fișiere goale cu valorile implicite.
 *
 * ──────────────────────────────────────────────────────────────
 * API ENDPOINTS:
 *   GET    /api/data             → toate datele (expenses + fuel + meta)
 *   POST   /api/expenses         → adaugă cheltuială nouă
 *   PUT    /api/expenses/:id     → actualizează cheltuială existentă
 *   DELETE /api/expenses/:id     → șterge cheltuială
 *   POST   /api/fuel             → adaugă alimentare nouă
 *   PUT    /api/fuel/:id         → actualizează alimentare existentă
 *   DELETE /api/fuel/:id         → șterge alimentare
 *   GET    /api/backup           → exportă toate datele ca JSON portabil
 *   POST   /api/restore          → importă un backup JSON (DISTRUCTIV)
 *
 *   Orice alt path → fișier static din /public
 * ============================================================
 */

const http = require("http");
const fs   = require("fs");
const path = require("path");


// ─── CONFIGURARE CĂI ──────────────────────────────────────────────────────────

/** Directorul rădăcină al proiectului (unde se află server.js). */
const root = __dirname;

/** Directorul cu fișierele statice servite browserului (HTML, CSS, JS, SVG). */
const publicDir = path.join(root, "public");

/**
 * Directorul BUNDLED cu datele incluse în proiect (întotdeauna /data).
 * Folosit ca sursă de copiere la prima pornire cu DATA_DIR extern,
 * și ca fallback pentru ensureDataFile().
 */
const bundledDataDir = path.join(root, "data");

/**
 * Directorul ACTIV de date — unde serverul citește și scrie efectiv.
 *
 * Logica de selecție:
 *   - Dacă variabila de mediu DATA_DIR e setată → folosim acel path
 *     (path.resolve transformă căile relative în absolute față de cwd)
 *   - Altfel → folosim bundledDataDir (directorul /data din proiect)
 *
 * Util pentru:
 *   - Separarea datelor de codul sursă (backup mai ușor)
 *   - Rularea mai multor instanțe cu date diferite
 *   - Deployment în containere (volume montat extern)
 *
 * Exemplu:
 *   DATA_DIR=~/masina-date node server.js
 */
const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : bundledDataDir;

/**
 * Portul pe care ascultă serverul.
 * Poate fi suprascris prin variabila de mediu PORT:
 *   PORT=8080 node server.js
 */
const preferredPort = Number(process.env.PORT || 3000);

/**
 * Căile complete către fișierele JSON ACTIVE (unde se scrie/citește).
 * Dacă DATA_DIR e setat, acestea sunt în directorul extern.
 * Dacă nu, sunt identice cu bundledDataFiles.
 */
const dataFiles = {
  expenses: path.join(dataDir, "expenses.json"),
  fuel:     path.join(dataDir, "fuel.json"),
  meta:     path.join(dataDir, "meta.json")
};

/**
 * Căile complete către fișierele JSON BUNDLED (din /data al proiectului).
 * Folosite ca sursă de copiere când DATA_DIR e extern și /data conține date.
 * Niciodată suprascrise dacă dataDir !== bundledDataDir.
 */
const bundledDataFiles = {
  expenses: path.join(bundledDataDir, "expenses.json"),
  fuel:     path.join(bundledDataDir, "fuel.json"),
  meta:     path.join(bundledDataDir, "meta.json")
};


// ─── TIPURI MIME ──────────────────────────────────────────────────────────────

/**
 * Map extensie → Content-Type pentru fișierele statice.
 * Dacă extensia nu e listată, se trimite "application/octet-stream"
 * (download generic). Adaugă extensii noi dacă adaugi asset-uri
 * (ex: ".png": "image/png", ".woff2": "font/woff2").
 */
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".ico":  "image/x-icon"
};


// ─── INIȚIALIZARE ─────────────────────────────────────────────────────────────

/**
 * Asigură existența fișierelor JSON înainte de pornirea serverului.
 * Apelat SINCRON — serverul nu pornește până nu e gata cu fișierele.
 * Vezi funcția ensureDataFiles() mai jos pentru detalii.
 */
ensureDataFiles();


// ─── SERVER HTTP ──────────────────────────────────────────────────────────────

/**
 * Crează serverul HTTP. Funcția callback primește (req, res) pentru
 * fiecare cerere. Toate rutele sunt gestionate prin if/else —
 * nu există router framework.
 *
 * Ordinea verificărilor:
 *   1. Rute API (pathname începe cu /api/)
 *   2. Fișiere statice (orice altceva)
 *
 * Orice eroare neașteptată e prinsă de try/catch și trimisă ca JSON 500.
 */
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    // ── GET /api/data ────────────────────────────────────────────────────────
    // Returnează un snapshot complet al bazei de date într-un singur request.
    // Front-end-ul (app.js) face TOATE calculele din acest răspuns —
    // nu există endpoint-uri separate pentru calcule sau statistici.
    if (url.pathname === "/api/data" && req.method === "GET") {
      return sendJson(res, {
        expenses: readJson(dataFiles.expenses, []),
        fuel:     readJson(dataFiles.fuel, []),
        meta:     readJson(dataFiles.meta, {})
      });
    }

    // ── POST /api/expenses ───────────────────────────────────────────────────
    // Adaugă o cheltuială nouă. Body = obiect JSON cu câmpurile formularului.
    // Server-ul generează ID unic dacă payload.id lipsește.
    // Răspuns: 201 Created + obiectul salvat (normalizat).
    if (url.pathname === "/api/expenses" && req.method === "POST") {
      return saveRecord(req, res, "expenses");
    }

    // ── PUT /api/expenses/:id ────────────────────────────────────────────────
    // Actualizează cheltuiala cu ID-ul din URL.
    // Merge între datele existente și payload (câmpurile noi suprascriu).
    // Dacă ID-ul nu există → 404.
    if (url.pathname.startsWith("/api/expenses/") && req.method === "PUT") {
      return updateRecord(req, res, "expenses",
        decodeURIComponent(url.pathname.split("/").pop())
      );
    }

    // ── DELETE /api/expenses/:id ─────────────────────────────────────────────
    // Șterge cheltuiala cu ID-ul specificat. Răspuns: { ok: true }.
    if (url.pathname.startsWith("/api/expenses/") && req.method === "DELETE") {
      return deleteRecord(res, "expenses",
        decodeURIComponent(url.pathname.split("/").pop())
      );
    }

    // ── POST /api/fuel ───────────────────────────────────────────────────────
    // Adaugă o alimentare nouă.
    // IMPORTANT: după salvare, recalculateFuelRows() reface km/plin și consumul
    // pentru TOATE alimentările (ordinea cronologică contează).
    if (url.pathname === "/api/fuel" && req.method === "POST") {
      return saveRecord(req, res, "fuel");
    }

    // ── PUT /api/fuel/:id ────────────────────────────────────────────────────
    // Actualizează alimentarea. Recalculează automat întregul set.
    if (url.pathname.startsWith("/api/fuel/") && req.method === "PUT") {
      return updateRecord(req, res, "fuel",
        decodeURIComponent(url.pathname.split("/").pop())
      );
    }

    // ── DELETE /api/fuel/:id ─────────────────────────────────────────────────
    // Șterge alimentarea și recalculează restul (lanțul km/plin se poate rupe
    // dacă elimini o alimentare din mijlocul seriei cronologice).
    if (url.pathname.startsWith("/api/fuel/") && req.method === "DELETE") {
      return deleteRecord(res, "fuel",
        decodeURIComponent(url.pathname.split("/").pop())
      );
    }

    // ── GET /api/backup ──────────────────────────────────────────────────────
    // Produce un fișier JSON portabil cu toate datele + versiune + timestamp.
    // Folosit de front-end (downloadBackup()) pentru export manual.
    // Formatul include "version" și "exportedAt" pentru compatibilitate viitoare.
    if (url.pathname === "/api/backup" && req.method === "GET") {
      return sendJson(res, {
        version:    1,
        exportedAt: new Date().toISOString(),
        expenses:   readJson(dataFiles.expenses, []),
        fuel:       readJson(dataFiles.fuel, []),
        meta:       readJson(dataFiles.meta, {})
      });
    }

    // ── POST /api/restore ────────────────────────────────────────────────────
    // ⚠ OPERAȚIE DISTRUCTIVĂ: înlocuiește COMPLET datele curente cu backup-ul.
    // Validare minimă: backup-ul trebuie să conțină array-urile expenses și fuel.
    // Meta e opțional — dacă lipsește sau nu e obiect, se salvează {} gol.
    if (url.pathname === "/api/restore" && req.method === "POST") {
      const payload = await readBody(req);
      if (!Array.isArray(payload.expenses) || !Array.isArray(payload.fuel)) {
        return sendJson(res, { error: "Fisierul nu contine un backup valid." }, 400);
      }
      writeJson(dataFiles.expenses, payload.expenses);
      writeJson(dataFiles.fuel,     payload.fuel);
      writeJson(dataFiles.meta,
        payload.meta && typeof payload.meta === "object" ? payload.meta : {}
      );
      return sendJson(res, { ok: true });
    }

    // ── FIȘIERE STATICE ──────────────────────────────────────────────────────
    // Orice alt path e tratat ca fișier static din /public.
    // "/" → "/index.html" automat.
    // Path traversal (ex: "/../secret") e blocat în serveStatic().
    return serveStatic(url.pathname, res);

  } catch (error) {
    // Erori neașteptate (JSON parse invalid, erori de disc etc.)
    sendJson(res, { error: error.message || "Eroare neasteptata" }, 500);
  }
});


// ─── PORNIRE SERVER ───────────────────────────────────────────────────────────

/**
 * Pornește serverul cu fallback automat pe portul următor dacă portul
 * solicitat e ocupat. Util când rulezi mai multe instanțe simultan local.
 *
 * Dacă PORT e setat explicit ca variabilă de mediu, NU face fallback
 * (se presupune că vrei exact acel port, ex: pentru un reverse proxy).
 */
listenWithFallback(preferredPort);


// ─── FUNCȚII DE SERVER ────────────────────────────────────────────────────────

/**
 * Pornește serverul pe `port`.
 * Dacă portul e ocupat (EADDRINUSE) și PORT nu e setat explicit,
 * încearcă `port + 1` recursiv.
 *
 * Folosim server.once("error") în loc de server.on("error") ca să nu
 * acumulăm listeneri la fiecare reîncercare recursivă.
 *
 * La pornire reușită, afișează în consolă URL-ul și directorul de date activ.
 *
 * @param {number} port - Portul pe care să asculte
 */
function listenWithFallback(port) {
  server.once("error", (error) => {
    if (error.code === "EADDRINUSE" && !process.env.PORT) {
      const nextPort = port + 1;
      console.log(`Portul ${port} este ocupat. Incerc http://localhost:${nextPort}`);
      listenWithFallback(nextPort);
      return;
    }
    console.error(error.message);
    process.exit(1);
  });

  server.listen(port, () => {
    console.log(`Car cost dashboard: http://localhost:${port}`);
    // Afișăm directorul activ de date — util pentru debugging când DATA_DIR e setat
    console.log(`Data directory: ${dataDir}`);
  });
}


// ─── INIȚIALIZARE FIȘIERE DATE ────────────────────────────────────────────────

/**
 * Verifică și creează fișierele de date necesare înainte de pornirea serverului.
 * Apelată sincron — serverul nu pornește până nu e gata.
 *
 * Creează directorul dataDir dacă nu există (recursive: true = fără eroare
 * dacă există deja, creează și directoarele părinte lipsă).
 *
 * Apoi verifică fiecare fișier prin ensureDataFile():
 *   - expenses.json → array gol dacă nu există
 *   - fuel.json     → array gol dacă nu există
 *   - meta.json     → obiect cu valorile default pentru Hyundai i20
 *
 * MODIFICARE VALORI DEFAULT META:
 *   Schimbă obiectul din al treilea ensureDataFile() pentru a personaliza
 *   datele inițiale ale mașinii (nume, cost inițial etc.)
 */
function ensureDataFiles() {
  fs.mkdirSync(dataDir, { recursive: true });
  ensureDataFile("expenses", []);
  ensureDataFile("fuel", []);
  ensureDataFile("meta", {
    car:            "Hyundai i20",  // ← numele mașinii afișat în sidebar
    initialCostLei: 0,              // ← costul de achiziție (rezervat, neutilizat)
    currency:       "lei",
    importedAt:     null,
    sourceFile:     "COSTURI i20.xlsx"
  });
}

/**
 * Asigură existența unui fișier de date individual.
 *
 * Logica în trei pași:
 *
 *   1. Dacă fișierul TARGET există deja → nu facem nimic (datele sunt ok).
 *
 *   2. Dacă TARGET !== BUNDLED și fișierul BUNDLED există:
 *      → Copiem bundled → target (migrare date la prima pornire cu DATA_DIR).
 *      Util când utilizatorul setează DATA_DIR prima dată și vrea să
 *      pornească cu datele existente din /data al proiectului.
 *
 *   3. Altfel → creăm fișierul TARGET cu valoarea `fallback` (gol/default).
 *      Cazuri: prima pornire fără date, sau bundled lipsește de asemenea.
 *
 * @param {"expenses"|"fuel"|"meta"} type     - Tipul fișierului
 * @param {Array|object}              fallback - Valoarea implicită dacă fișierul nu există
 */
function ensureDataFile(type, fallback) {
  const target  = dataFiles[type];       // calea activă (poate fi externă)
  const bundled = bundledDataFiles[type]; // calea din /data al proiectului

  // Pasul 1: fișierul există deja → nimic de făcut
  if (fs.existsSync(target)) return;

  // Pasul 2: target e diferit de bundled și bundled există → copiem datele
  // path.resolve normalizează căile înainte de comparație (evită false negatives)
  if (path.resolve(target) !== path.resolve(bundled) && fs.existsSync(bundled)) {
    fs.copyFileSync(bundled, target);
    return;
  }

  // Pasul 3: creăm fișierul cu valoarea implicită
  writeJson(target, fallback);
}


// ─── CITIRE / SCRIERE JSON ────────────────────────────────────────────────────

/**
 * Citește și parsează un fișier JSON de pe disc.
 *
 * BOM (Byte Order Mark, \uFEFF) e eliminat înainte de parsare —
 * util pentru fișiere exportate din Excel sau editoare Windows
 * care adaugă BOM la salvare UTF-8.
 *
 * Orice eroare (fișier inexistent, JSON malformat, permisiuni) returnează
 * `fallback` fără a arunca excepție. Serverul continuă să funcționeze.
 *
 * @param {string} file     - Calea completă a fișierului
 * @param {*}      fallback - Valoarea returnată la eroare (ex: [], {})
 * @returns {*} Conținutul parsat sau `fallback`
 */
function readJson(file, fallback) {
  try {
    return JSON.parse(
      fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "") // elimină BOM
    );
  } catch {
    return fallback;
  }
}

/**
 * Serializează `value` ca JSON formatat și îl scrie pe disc.
 *
 * Detalii:
 *   - Indentare 2 spații: lizibil dacă deschizi fișierele manual
 *   - Newline final: convenție POSIX (fișierele text termină cu \n)
 *   - mkdirSync recursive: creează directoarele lipsă pe calea fișierului
 *     (important când DATA_DIR e un path nou care nu există încă)
 *
 * @param {string} file  - Calea completă a fișierului de scris
 * @param {*}      value - Valoarea de serializat (array, object etc.)
 */
function writeJson(file, value) {
  // Asigurăm că directorul există (necesar când DATA_DIR e nou)
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/**
 * Citește body-ul complet al unui request HTTP și îl parsează ca JSON.
 *
 * Folosește `for await...of` pe request (Node.js IncomingMessage e un
 * async iterable de Buffer chunks). Concatenăm chunk-urile și parsăm
 * o singură dată la final pentru eficiență.
 *
 * Returnează {} gol dacă body-ul e absent (request fără body).
 *
 * @param {http.IncomingMessage} req
 * @returns {Promise<object>}
 */
async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

/**
 * Trimite un răspuns JSON cu Content-Type corect.
 * Serializăm fără indentare (răspunsurile API nu trebuie să fie lizibile
 * manual — economie de bandă/memorie).
 *
 * @param {http.ServerResponse} res
 * @param {*}      payload - Orice valoare serializabilă
 * @param {number} status  - Codul HTTP (implicit 200 OK)
 */
function sendJson(res, payload, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}


// ─── OPERAȚII CRUD ────────────────────────────────────────────────────────────

/**
 * Adaugă o înregistrare nouă în fișierul JSON specificat.
 *
 * Flux complet:
 *   1. Citim body-ul requestului (obiectul de salvat)
 *   2. Generăm ID unic dacă payload.id lipsește
 *   3. Normalizăm câmpurile (tipuri, valori default) cu normalizeRecord()
 *   4. Adăugăm la array-ul existent
 *   5. Fuel: recalculăm km/plin și consum pentru TOATE (lanț cronologic)
 *      Expenses: doar sortăm după dată
 *   6. Scriem pe disc
 *   7. Returnăm înregistrarea salvată cu status 201 Created
 *
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse}  res
 * @param {"expenses"|"fuel"}    type
 */
async function saveRecord(req, res, type) {
  const payload = await readBody(req);
  const rows    = readJson(dataFiles[type], []);
  const record  = normalizeRecord(type, {
    ...payload,
    id: payload.id || createId(type) // generăm ID dacă lipsește
  });
  rows.push(record);
  const nextRows = type === "fuel" ? recalculateFuelRows(rows) : sortRows(rows);
  writeJson(dataFiles[type], nextRows);
  // Returnăm înregistrarea din array-ul final (poate fi modificată de recalcul)
  sendJson(res, nextRows.find((row) => row.id === record.id) || record, 201);
}

/**
 * Actualizează o înregistrare existentă după ID.
 *
 * Merge strategy: { ...existing, ...payload, id } — câmpurile din payload
 * suprascriu cele existente, dar ID-ul rămâne garantat cel din URL
 * (nu poate fi schimbat prin payload).
 *
 * Dacă ID-ul nu există în array → 404 Not Found.
 *
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse}  res
 * @param {"expenses"|"fuel"}    type
 * @param {string}               id   - ID-ul înregistrării de actualizat
 */
async function updateRecord(req, res, type, id) {
  const payload = await readBody(req);
  const rows    = readJson(dataFiles[type], []);
  const index   = rows.findIndex((row) => row.id === id);

  if (index === -1) return sendJson(res, { error: "Inregistrarea nu exista" }, 404);

  rows[index] = normalizeRecord(type, { ...rows[index], ...payload, id });
  const nextRows = type === "fuel" ? recalculateFuelRows(rows) : sortRows(rows);
  writeJson(dataFiles[type], nextRows);
  sendJson(res, nextRows.find((row) => row.id === id) || rows[index]);
}

/**
 * Șterge înregistrarea cu ID-ul specificat folosind filter().
 * Nu aruncă eroare dacă ID-ul nu există — silent no-op.
 *
 * Pentru fuel: recalculează restul după ștergere.
 * De ce: dacă ștergi alimentarea N din mijlocul seriei, alimentarea N+1
 * trebuie să recalculeze km/plin față de alimentarea N-1.
 *
 * @param {http.ServerResponse} res
 * @param {"expenses"|"fuel"}   type
 * @param {string}              id
 */
function deleteRecord(res, type, id) {
  const rows     = readJson(dataFiles[type], []);
  const nextRows = rows.filter((row) => row.id !== id);
  writeJson(dataFiles[type],
    type === "fuel" ? recalculateFuelRows(nextRows) : nextRows
  );
  sendJson(res, { ok: true });
}


// ─── NORMALIZARE DATE ─────────────────────────────────────────────────────────

/**
 * Normalizează câmpurile unei înregistrări la tipurile și valorile corecte.
 *
 * De ce e necesar: datele vin din formulare HTML (strings) sau din backup-uri
 * care pot conține tipuri mixte. Normalizarea garantează că în JSON sunt
 * stocate număr|null (nu string-uri) pentru câmpurile numerice.
 *
 * Există două scheme:
 *   "fuel"    → alimentări (stație, cost, litri, odometru, km/plin, consum)
 *   altceva   → cheltuieli (categorie, produs, tip, cost)
 *
 * CÂMP SPECIAL — consumptionPer100Km (fuel):
 *   Prioritate: valoarea explicită din payload (dacă e număr finit)
 *   Fallback:   calculat din litri/km dacă ambele sunt disponibile
 *   Operator ?? (nullish coalescing): folosește fallback doar dacă explicit e null
 *
 * @param {"expenses"|"fuel"} type
 * @param {object}            record - Obiectul brut (din formular sau backup)
 * @returns {object} Înregistrarea normalizată
 */
function normalizeRecord(type, record) {
  if (type === "fuel") {
    const liters = numberOrNull(record.liters);
    const km     = numberOrNull(record.kmSinceLastFill);
    // Calculăm consumul de fallback din litri și km dacă ambele sunt valide
    const computedConsumption = (liters && km && km > 0)
      ? round((liters / km) * 100, 2)
      : null;

    return {
      id:                          record.id,
      date:                        record.date || "",
      station:                     cleanStationName(record.station),
      costLei:                     numberOrNull(record.costLei),
      priceLeiPerLiter:            numberOrNull(record.priceLeiPerLiter),
      liters,
      odometerKm:                  numberOrNull(record.odometerKm),
      kmSinceLastFill:             km,
      // ?? = folosește computedConsumption doar dacă valoarea explicită e null/undefined
      consumptionPer100Km:         numberOrNull(record.consumptionPer100Km) ?? computedConsumption,
      importedConsumptionPer100Km: numberOrNull(record.importedConsumptionPer100Km),
      notes:                       record.notes || "",
      source:                      record.source || "manual"
    };
  }

  // Schema cheltuieli non-combustibil
  return {
    id:         record.id,
    date:       record.date || "",
    category:   record.category || "Diverse",
    product:    record.product || "",
    type:       record.type || "",
    costLei:    numberOrNull(record.costLei),
    odometerKm: numberOrNull(record.odometerKm),
    notes:      record.notes || "",
    source:     record.source || "manual"
  };
}


// ─── FUNCȚII HELPER ───────────────────────────────────────────────────────────

/**
 * Convertește o valoare la număr sau null.
 *
 * Cazuri tratate:
 *   ""  / null / undefined  → null  (câmp gol de formular)
 *   "6,5"                   → 6.5   (separator zecimal românesc)
 *   "abc"                   → null  (text non-numeric)
 *   Infinity / NaN          → null  (valori invalide numeric)
 *   0 / 0.0                 → 0     (zero e valid)
 *
 * @param {*} value
 * @returns {number|null}
 */
function numberOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  // Înlocuim virgula cu punct pentru compatibilitate cu locale-ul românesc
  const normalized = typeof value === "string" ? value.replace(",", ".") : value;
  const number     = Number(normalized);
  // isFinite exclude NaN și ±Infinity
  return Number.isFinite(number) ? number : null;
}

/**
 * Curăță numele benzinăriei de prefixul "b-" care apare în date
 * importate din Excel (ex: "b-Rompetrol" → "Rompetrol").
 *
 * Regex: /^b-\s*/i
 *   ^    → doar la începutul string-ului
 *   b-   → prefixul literal (case-insensitive cu flag i)
 *   \s*  → spații opționale după prefix
 *
 * @param {*} value
 * @returns {string}
 */
function cleanStationName(value) {
  return String(value || "").trim().replace(/^b-\s*/i, "");
}

/**
 * Rotunjește un număr la `decimals` zecimale.
 *
 * Tehnica multiplicare/împărțire evită erorile clasice de floating point:
 *   Math.round(1.005 * 100) / 100 → 1.01 (corect)
 *   vs. (1.005).toFixed(2) → "1.00" (incorect în unele motoare JS)
 *
 * @param {number} value
 * @param {number} decimals - Numărul de zecimale (implicit 2)
 * @returns {number}
 */
function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Sortează un array de înregistrări crescător după câmpul `date` (string ISO).
 * Sortarea string-urilor ISO "YYYY-MM-DD" funcționează corect lexicografic
 * (ordinea lexicografică = ordinea cronologică pentru formatul ISO).
 *
 * NOTĂ: .sort() modifică array-ul in-place și îl returnează.
 * Apelantul primește același array (nu o copie) — comportament standard JS.
 *
 * @param {object[]} rows
 * @returns {object[]} Array-ul sortat
 */
function sortRows(rows) {
  return rows.sort((a, b) =>
    String(a.date || "").localeCompare(String(b.date || ""))
  );
}

/**
 * Recalculează km/plin și consumul pentru TOATE alimentările după
 * orice operație de adăugare, editare sau ștergere.
 *
 * DE CE E NECESAR:
 *   km/plin al alimentării N = odometru(N) - odometru(N-1).
 *   Dacă inserezi sau ștergi o alimentare din mijlocul seriei,
 *   toate alimentările ulterioare trebuie recalculate. Serverul
 *   face asta automat la fiecare scriere — frontend-ul nu trebuie
 *   să gestioneze această complexitate.
 *
 * LOGICĂ PAS CU PAS:
 *   1. Sortăm cronologic (ascendent)
 *   2. Iterăm secvențial, ținând minte `previousOdometer`
 *   3. Dacă km/plin lipsește sau e ≤ 0 și avem doi odometri consecutivi:
 *      → km = odometru(curent) - odometru(anterior)
 *      → recalculăm numai dacă diferența e pozitivă (sanity check)
 *   4. Dacă consumul lipsește sau e ≤ 0 și avem litri + km valizi:
 *      → consum = (litri / km) × 100
 *   5. Actualizăm previousOdometer pentru iterația următoare
 *
 * NOTĂ: Nu suprascrie km/plin dacă e deja valid (> 0) — valoarea
 * introdusă manual e respectată.
 *
 * @param {object[]} rows - Array de alimentări (pot fi neordonate)
 * @returns {object[]} Array sortat cu km/plin și consum recalculate
 */
function recalculateFuelRows(rows) {
  const sorted          = sortRows(rows);
  let   previousOdometer = null; // odometrul ultimei alimentări procesate

  return sorted.map((row) => {
    const odometer = numberOrNull(row.odometerKm);
    const liters   = numberOrNull(row.liters);
    let   km       = numberOrNull(row.kmSinceLastFill);

    // Calculăm km/plin din diferența de odometru dacă e absent sau invalid
    if ((!km || km <= 0) && odometer && previousOdometer !== null) {
      const computedKm = odometer - previousOdometer;
      if (computedKm > 0) km = round(computedKm, 0); // rotunjim la km întregi
    }

    // Calculăm consumul dacă e absent sau invalid și avem datele necesare
    let consumption = numberOrNull(row.consumptionPer100Km);
    if ((!consumption || consumption <= 0) && liters && km && km > 0) {
      consumption = round((liters / km) * 100, 2);
    }

    // Actualizăm referința pentru iterația următoare
    if (odometer) previousOdometer = odometer;

    return {
      ...row,              // păstrăm toate câmpurile originale neschimbate
      kmSinceLastFill:     km,
      consumptionPer100Km: consumption
    };
  });
}

/**
 * Generează un ID unic pentru o înregistrare nouă.
 *
 * Format: "{prefix}_{timestamp}_{random6chars}"
 * Exemplu: "fuel_1715432100000_a3f9kz"
 *
 * Componente:
 *   prefix    → tipul înregistrării ("expenses" sau "fuel") pentru lizibilitate
 *   timestamp → Date.now() în ms — garantează unicitate în timp
 *   random    → 6 caractere base36 — previne coliziunile în același ms
 *                (probabilitate de coliziune: 1/2.176.782.336 per ms)
 *
 * Suficient pentru o aplicație personală. Nu folosim UUID pentru a
 * păstra dependențele zero.
 *
 * @param {string} prefix - "expenses" sau "fuel"
 * @returns {string}
 */
function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}


// ─── FIȘIERE STATICE ──────────────────────────────────────────────────────────

/**
 * Servește un fișier static din directorul /public.
 *
 * SECURITATE — protecție path traversal:
 *   path.normalize curăță secvențele "../" din URL.
 *   Verificăm că fișierul rezolvat ÎNCEPE cu publicDir — orice
 *   tentativă de a ieși din /public returnează 403 Forbidden.
 *   Exemplu blocat: GET /../../../etc/passwd
 *
 * ROUTING:
 *   "/"  → "/index.html" (redirecție implicită pentru SPA)
 *   Orice alt path → fișierul corespunzător din /public
 *   Fișier inexistent sau director → 404 Not Found
 *
 * STREAMING:
 *   Fișierele sunt trimise ca stream (createReadStream → pipe) fără a
 *   le încărca complet în memorie. Eficient pentru fișiere mari.
 *
 * Content-Type este determinat din extensie via mimeTypes map.
 * Extensii necunoscute → "application/octet-stream" (download generic).
 *
 * @param {string}              requestPath - Path-ul din URL (ex: "/styles.css")
 * @param {http.ServerResponse} res
 */
function serveStatic(requestPath, res) {
  const cleanPath = requestPath === "/" ? "/index.html" : decodeURIComponent(requestPath);
  const file      = path.normalize(path.join(publicDir, cleanPath));

  // Blocăm path traversal — fișierul trebuie să fie în interiorul publicDir
  if (!file.startsWith(publicDir)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  // Verificăm existența și că e fișier (nu director)
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404);
    return res.end("Not found");
  }

  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    "Content-Type": mimeTypes[ext] || "application/octet-stream"
  });

  // Stream: eficient, nu încărcăm tot fișierul în memorie
  fs.createReadStream(file).pipe(res);
}
