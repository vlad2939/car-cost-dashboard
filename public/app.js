/**
 * ============================================================
 * APP.JS — Logica front-end pentru Car Cost Dashboard
 * ============================================================
 *
 * Structura fișierului (în ordine):
 *   1. STATE          — starea globală a aplicației
 *   2. CONSTANTE      — culori, titluri, map-ul regiunilor de tooltip
 *   3. INIȚIALIZARE   — DOMContentLoaded: temă, filtre, events, date
 *   4. DATE           — loadData() și render() (dispatcher general)
 *   5. EVENIMENTE     — bindEvents() — leagă toți listenerii
 *   6. NAVIGAȚIE      — switchView(), titluri, filtre
 *   7. FILTRE         — updateFilters, clearFilters, funcții de filtrare
 *   8. RENDER         — renderMeta, renderDashboard, renderTables
 *   9. GRAFICE        — drawCharts, drawBarChart, drawLineChart, drawDonutChart
 *  10. TOOLTIP        — hover pe canvas
 *  11. FORMULARE      — saveExpense, saveFuel, editExpense, editFuel
 *  12. BACKUP/RESTORE — downloadBackup, restoreBackup
 *  13. README MODAL   — openReadme, closeReadme, renderMarkdown
 *  14. UTILITARE      — calcule, formatare, sortare, HTML escape
 *
 * ────────────────────────────────────────────────────────────
 * PRINCIPII DE DESIGN:
 *  - Fără biblioteci externe: tot codul rulează offline.
 *  - State-ul e un obiect unic; UI-ul e re-randat complet la fiecare
 *    schimbare (simplu, fără Virtual DOM sau reactivity framework).
 *  - Graficele sunt desenate pe <canvas> cu Canvas 2D API nativ.
 *  - Persistența e pe server (fișiere JSON); browserul nu stochează
 *    date (excepție: preferința de temă în localStorage).
 * ============================================================
 */


// ══════════════════════════════════════════════════════════════════════════════
// 1. STATE — starea globală a aplicației
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Obiectul central de stare. Toate datele și preferințele UI sunt stocate
 * aici. Nicio funcție nu ar trebui să citească direct din DOM pentru date —
 * citește din `state` și scrie în DOM la render.
 *
 * Câmpuri:
 *   expenses  → array cu toate cheltuielile, citite din /api/data
 *   fuel      → array cu toate alimentările, citite din /api/data
 *   meta      → obiect cu metadate (nume mașină, monedă etc.)
 *   view      → view-ul activ curent ("dashboard", "fuel" etc.)
 *   filters   → valorile filtrelor active (an start/end, categorie, text)
 */
const state = {
  expenses: [],
  fuel:     [],
  meta:     {},
  view:     "dashboard",
  filters: {
    start:    "",   // an de start (ex: "2023"); gol = fără limită inferioară
    end:      "",   // an de end;  gol = fără limită superioară
    category: "",   // categoria exactă sau gol = toate
    search:   ""    // text lower-case pentru căutare full-text
  }
};


// ══════════════════════════════════════════════════════════════════════════════
// 2. CONSTANTE
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Culorile categoriilor în grafice și KPI carduri.
 * Cheia e exact string-ul categoriei din baza de date.
 * Dacă o categorie nouă nu apare aici, se folosesc culorile din
 * array-ul `fallback` din funcția `categoryColor()`.
 *
 * Modifică valorile hex pentru a schimba culorile în grafice.
 */
const categoryColors = {
  "Acte":                  "#2f7fb8",  // albastru — documente oficiale
  "Piese + scule":         "#c49a2f",  // galben-auriu — piese auto
  "Consumabile + diverse": "#3a9b74",  // verde — consumabile
  "Manopera":              "#8a65b8",  // violet — manoperă service
  "Combustibil":           "#d0673f",  // portocaliu — combustibil
  "Întreținere":           "#c49a2f",  // același cu Piese + scule
  "Consumabile":           "#3a9b74",  // același cu Consumabile + diverse
  "Consum mediu":          "#9b6b42",  // maro — KPI consum
  "Cost/km":               "#5968b3"   // indigo — KPI cost per km
};

/**
 * Titlurile și subtitlurile fiecărui view, afișate în header-ul principal.
 * Cheia corespunde cu atributul `data-view` din HTML și cu `state.view`.
 * Formatul: [titlu_h1, subtitlu_p]
 *
 * Modifică textele de aici pentru a schimba ce apare în header la navigare.
 */
const titles = {
  dashboard: ["Dashboard",         "Privire rapidă peste costuri, consum și kilometri."],
  fuel:      ["Combustibil",       "Alimentări, costuri, litri, kilometri și consum calculat automat."],
  expenses:  ["Cheltuieli",        "Acte, piese, consumabile, manoperă și alte costuri."],
  edit:      ["Adaugă / Editează", "Introdu date noi sau modifică înregistrări existente."],
  backup:    ["Backup / Restore",  "Salvează sau încarcă baza JSON a aplicației."]
};

/**
 * Map care stochează regiunile interactive ale graficelor canvas.
 * Cheie: id-ul canvas-ului (string)
 * Valoare: array de obiecte regiune { type, ...coords, title, value }
 *
 * Populat la fiecare redesenare a graficelor în funcțiile draw*Chart().
 * Citit în showChartTooltip() pentru a detecta hover-ul utilizatorului.
 *
 * Tipuri de regiuni suportate:
 *   "rect"  → dreptunghi (bare chart): { x, y, width, height }
 *   "circle"→ cerc (puncte line chart): { x, y, radius }
 *   "slice" → sector donut: { cx, cy, innerRadius, outerRadius, startAngle, endAngle }
 */
const chartRegions = new Map();


// ══════════════════════════════════════════════════════════════════════════════
// 3. INIȚIALIZARE
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Punctul de intrare al aplicației. Rulat o singură dată când DOM-ul e gata.
 *
 * Ordinea de inițializare este importantă:
 *   1. applyTheme  — aplică tema salvată ÎNAINTE de orice render (evită flash)
 *   2. populateYearFilters — populează selecturile de an (static, o singură dată)
 *   3. bindEvents  — atașează toți event listenerii
 *   4. loadData    — încarcă datele de la server și randează UI-ul
 */
document.addEventListener("DOMContentLoaded", () => {
  // Citim preferința de temă din localStorage; implicit "light"
  applyTheme(localStorage.getItem("carDashboardTheme") || "light");
  populateYearFilters();
  bindEvents();
  loadData();
});


// ══════════════════════════════════════════════════════════════════════════════
// 4. DATE
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Încarcă toate datele de la server prin GET /api/data și actualizează state-ul.
 * Apelată la inițializare și după orice operație de scriere (save, delete, restore).
 *
 * Server-ul returnează un singur obiect JSON cu expenses, fuel și meta.
 * Frontend-ul face toate calculele derivate din aceste date brute.
 */
async function loadData() {
  const response  = await fetch("api/data");
  const data      = await response.json();
  state.expenses  = data.expenses || [];
  state.fuel      = data.fuel     || [];
  state.meta      = data.meta     || {};
  render();
}

/**
 * Dispatcher principal de render. Apelat după orice schimbare de date sau filtre.
 * Apelează toate funcțiile de render în ordine; fiecare actualizează o zonă a UI-ului.
 *
 * Nu face diff/patch — rescrie complet innerHTML acolo unde e relevant.
 * Performanța e suficientă pentru dimensiunea datelor dintr-o aplicație personală.
 */
function render() {
  renderMeta();             // actualizează numele mașinii din sidebar
  renderCategoryOptions();  // actualizează dropdown-ul de categorii și datalist
  renderDashboard();        // KPI carduri + tabele recente (graficele sunt async)
  renderHeaderBadge();      // badge-urile km/litri din topbar
  renderFuelTable();        // tabelul complet de alimentări
  renderExpenseTable();     // tabelul complet de cheltuieli
}


// ══════════════════════════════════════════════════════════════════════════════
// 5. EVENIMENTE
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Atașează toți event listenerii. Apelată o singură dată la inițializare.
 *
 * Organizare:
 *   - Navigație
 *   - Filtre
 *   - Butoane "Nou" (deschid formularul edit)
 *   - Formulare (submit + câmpuri derivate combustibil)
 *   - Backup/Restore
 *   - Temă
 *   - Modal README
 *   - Tooltip grafice
 */
function bindEvents() {

  // ── Navigație ──────────────────────────────────────────────────────────────
  // Fiecare buton .nav-button are data-view cu numele secțiunii țintă.
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });

  // ── Filtre ─────────────────────────────────────────────────────────────────
  // Orice schimbare pe oricare filtru declanșează updateFilters() → render().
  ["filterStart", "filterEnd", "filterCategory", "filterSearch"].forEach((id) => {
    document.getElementById(id).addEventListener("input", updateFilters);
  });
  document.getElementById("clearFilters").addEventListener("click", clearFilters);

  // ── Butoane "Nou" ──────────────────────────────────────────────────────────
  // Butoanele cu data-open-form resetează formularul corespunzător și
  // navighează la view-ul "edit".
  document.querySelectorAll("[data-open-form]").forEach((button) => {
    button.addEventListener("click", () => {
      resetForm(button.dataset.openForm === "fuel" ? "fuelForm" : "expenseForm");
      switchView("edit");
    });
  });

  // ── Formulare ──────────────────────────────────────────────────────────────
  document.getElementById("expenseForm").addEventListener("submit", saveExpense);
  document.getElementById("fuelForm").addEventListener("submit", saveFuel);

  // Câmpurile date, liters, odometerKm din formularul de alimentare
  // declanșează recalculul automat al km/plin și consum.
  ["date", "liters", "odometerKm"].forEach((name) => {
    document.getElementById("fuelForm").elements[name]
      .addEventListener("input", updateFuelDerivedFields);
  });

  // Dacă utilizatorul modifică manual kmSinceLastFill, ștergem flag-ul
  // "auto" ca să nu fie suprascris la recalcul.
  document.getElementById("fuelForm").elements.kmSinceLastFill
    .addEventListener("input", (event) => {
      delete event.currentTarget.dataset.auto; // dezactivează calculul automat
      updateFuelDerivedFields();
    });

  // La fel pentru consumptionPer100Km: manual → nu mai recalculăm.
  document.getElementById("fuelForm").elements.consumptionPer100Km
    .addEventListener("input", (event) => {
      delete event.currentTarget.dataset.auto;
    });

  // Butoane reset formulare
  document.getElementById("resetExpense")
    .addEventListener("click", () => resetForm("expenseForm"));
  document.getElementById("resetFuel")
    .addEventListener("click", () => resetForm("fuelForm"));

  // ── Backup / Restore ───────────────────────────────────────────────────────
  document.getElementById("downloadBackup").addEventListener("click", downloadBackup);
  document.getElementById("restoreBackup").addEventListener("click", restoreBackup);

  // ── Temă ───────────────────────────────────────────────────────────────────
  document.getElementById("themeToggle").addEventListener("click", toggleTheme);

  // ── Modal README ───────────────────────────────────────────────────────────
  document.getElementById("readmeTrigger").addEventListener("click", openReadme);
  document.getElementById("readmeClose").addEventListener("click", closeReadme);
  document.getElementById("readmeBackdrop").addEventListener("click", closeReadme);
  // Tasta Escape închide modalul dacă e deschis
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeReadme();
  });

  // ── Tooltip grafice canvas ─────────────────────────────────────────────────
  bindChartTooltips();
}


// ══════════════════════════════════════════════════════════════════════════════
// 6. NAVIGAȚIE
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Populează selecturile de an pentru filtrele "De la" și "Până la".
 * Intervalul hard-codat: 2021–2035. Modifică `year <= 2035` pentru a extinde.
 * Apelată o singură dată la inițializare (intervalul nu se schimbă dinamic).
 */
function populateYearFilters() {
  const options = [`<option value="">Toți anii</option>`];
  for (let year = 2021; year <= 2035; year += 1) {
    options.push(`<option value="${year}">${year}</option>`);
  }
  document.getElementById("filterStart").innerHTML = options.join("");
  document.getElementById("filterEnd").innerHTML   = options.join("");
}

/**
 * Comută tema între "light" și "dark".
 * Salvează preferința în localStorage (cheie: "carDashboardTheme").
 * Redesenează graficele imediat pentru că folosesc culori CSS custom properties.
 */
function toggleTheme() {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(nextTheme);
  localStorage.setItem("carDashboardTheme", nextTheme);
  drawCharts(); // graficele citesc culorile din CSS → trebuie redesenate
}

/**
 * Aplică o temă setând atributul `data-theme` pe elementul <html>.
 * CSS-ul reacționează la `:root[data-theme="dark"]` și schimbă variabilele.
 *
 * @param {"light"|"dark"} theme
 */
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === "dark" ? "dark" : "light";
}

/**
 * Navighează la view-ul specificat.
 * Actualizează simultan:
 *   - state.view
 *   - clasa .active pe butoanele de navigare
 *   - clasa .active pe secțiunile .view
 *   - vizibilitatea barei de filtre (ascunsă pe Edit și Backup)
 *   - titlul și subtitlul din header
 *   - badge-urile din topbar
 *
 * La navigarea pe Dashboard, graficele sunt redesenate cu un delay de 30ms
 * pentru că canvas-ul are nevoie de o buclă de render completă ca să
 * obțină dimensiunile corecte din layout.
 *
 * @param {string} view - Numele view-ului ("dashboard"|"fuel"|"expenses"|"edit"|"backup")
 */
function switchView(view) {
  state.view = view;

  // Actualizare butoane navigare
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });

  // Afișare/ascundere secțiuni — doar cea cu id={view}View e vizibilă
  document.querySelectorAll(".view").forEach((section) => {
    section.classList.toggle("active", section.id === `${view}View`);
  });

  // Bara de filtre e relevantă doar pentru dashboard, fuel, expenses
  document.querySelector(".filters")
    .classList.toggle("hidden", !["dashboard", "fuel", "expenses"].includes(view));

  // Titlu și subtitlu din obiectul `titles`
  document.getElementById("pageTitle").textContent    = titles[view][0];
  document.getElementById("pageSubtitle").textContent = titles[view][1];

  // Delay pentru grafice (layout reflow necesar pentru dimensiunile canvas)
  if (view === "dashboard") setTimeout(drawCharts, 30);

  renderHeaderBadge();
}


// ══════════════════════════════════════════════════════════════════════════════
// 7. FILTRE
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Citește valorile curente ale tuturor filtrelor din DOM și le salvează
 * în state.filters, apoi declanșează un render complet.
 * Legată la evenimentul "input" pe toate câmpurile de filtrare.
 */
function updateFilters() {
  state.filters.start    = document.getElementById("filterStart").value;
  state.filters.end      = document.getElementById("filterEnd").value;
  state.filters.category = document.getElementById("filterCategory").value;
  state.filters.search   = document.getElementById("filterSearch").value.trim().toLowerCase();
  render();
}

/**
 * Resetează toate filtrele la valorile implicite (goale) și redesenează UI-ul.
 * Resetează atât DOM-ul cât și state.filters prin apelarea updateFilters().
 */
function clearFilters() {
  document.getElementById("filterStart").value    = "";
  document.getElementById("filterEnd").value      = "";
  document.getElementById("filterCategory").value = "";
  document.getElementById("filterSearch").value   = "";
  updateFilters();
}

/**
 * Returnează cheltuielile filtrate după data, categorie și search.
 * Folosită în renderDashboard(), renderExpenseTable(), drawCharts().
 *
 * @returns {object[]} Array de cheltuieli care îndeplinesc toate filtrele
 */
function filteredExpenses() {
  return state.expenses.filter((row) =>
    matchesDate(row.date) &&
    matchesCategory(row.category) &&
    matchesSearch([row.category, row.product, row.type, row.notes])
  );
}

/**
 * Returnează alimentările filtrate.
 * Categoria "Combustibil" e verificată contra filtrului de categorie —
 * dacă filtrul e setat pe altceva, combustibilul e exclus.
 *
 * @returns {object[]} Array de alimentări filtrate
 */
function filteredFuel() {
  return state.fuel.filter((row) =>
    matchesDate(row.date) &&
    matchesCategory("Combustibil") &&
    matchesSearch([row.station, row.notes])
  );
}

/**
 * Verifică dacă o dată (string "YYYY-MM-DD") e în intervalul selectat.
 * Comparația string e validă pentru formatul ISO — ordine lexicografică = cronologică.
 *
 * @param {string} date
 * @returns {boolean}
 */
function matchesDate(date) {
  const range = selectedDateRange();
  if (range.start && date < range.start) return false;
  if (range.end   && date > range.end)   return false;
  return true;
}

/**
 * Calculează intervalul de date din filtrele de an selectate.
 * Dacă startYear > endYear, le inversează automat.
 *
 * Returnează:
 *   start         → "YYYY-01-01" sau "" dacă nu e selectat
 *   end           → "YYYY-12-31" sau "" dacă nu e selectat
 *   hasYearFilter → true dacă cel puțin un an e selectat (folosit în KPI)
 *
 * @returns {{ start: string, end: string, hasYearFilter: boolean }}
 */
function selectedDateRange() {
  let startYear = Number(state.filters.start) || null;
  let endYear   = Number(state.filters.end)   || null;

  // Inversare automată dacă start > end
  if (startYear && endYear && startYear > endYear) {
    [startYear, endYear] = [endYear, startYear];
  }

  return {
    start:         startYear ? `${startYear}-01-01` : "",
    end:           endYear   ? `${endYear}-12-31`   : "",
    hasYearFilter: Boolean(startYear || endYear)
  };
}

/**
 * Verifică dacă categoria unei înregistrări corespunde filtrului activ.
 * Dacă filtrul e gol, toate categoriile trec.
 *
 * @param {string} category
 * @returns {boolean}
 */
function matchesCategory(category) {
  return !state.filters.category || category === state.filters.category;
}

/**
 * Verifică dacă cel puțin unul din câmpurile furnizate conține textul căutat.
 * Căutarea e case-insensitive (state.filters.search e deja lowercase).
 *
 * @param {string[]} values - Câmpurile în care se caută (ex: [row.product, row.type])
 * @returns {boolean}
 */
function matchesSearch(values) {
  if (!state.filters.search) return true;
  return values.some((value) =>
    String(value || "").toLowerCase().includes(state.filters.search)
  );
}


// ══════════════════════════════════════════════════════════════════════════════
// 8. RENDER
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Actualizează numele mașinii din sidebar.
 * Citit din state.meta.car, setat de server din data/meta.json.
 *
 * NOTĂ: Folosim .textContent (nu .innerHTML) deci HTML entities sunt ignorate.
 * Pentru spații suplimentare în nume, folosește CSS `word-spacing` pe `.brand strong`.
 */
function renderMeta() {
  document.getElementById("carName").textContent = state.meta.car || "Hyundai i20";
}

/**
 * Populează dropdown-ul de filtrare pe categorie și datalist-ul de autocomplete.
 * Extrage categoriile unice din cheltuieli, adaugă "Combustibil" manual,
 * sortează alfabetic. Ignoră categoria "Masina" (categorie de import legacy).
 *
 * Păstrează valoarea selectată curentă în dropdown după re-populare.
 */
function renderCategoryOptions() {
  const categories = [
    ...new Set([
      ...state.expenses
        .map((row) => row.category)
        .filter((item) => item && item !== "Masina"),
      "Combustibil"
    ])
  ].sort();

  const filter  = document.getElementById("filterCategory");
  const current = filter.value; // salvăm valoarea curentă

  filter.innerHTML = `<option value="">Toate</option>` +
    categories.map((item) =>
      `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`
    ).join("");

  filter.value = current; // restaurăm valoarea (dacă mai există în lista nouă)

  // Datalist pentru autocomplete în formularul de cheltuieli
  document.getElementById("categoryList").innerHTML =
    categories.map((item) => `<option value="${escapeHtml(item)}"></option>`).join("");
}

/**
 * Randează view-ul Dashboard:
 *   1. Calculează toate metricile (KPI-uri, sume, consum, cost/km)
 *   2. Generează HTML-ul pentru cele 6 carduri KPI
 *   3. Actualizează totalul și data din sidebar
 *   4. Populează tabelele "Ultimele cheltuieli" și "Ultimele alimentări"
 *   5. Programează redesenarea graficelor (async, după layout reflow)
 *
 * ─────────────────────────────────────────────────────────────
 * CALCULUL CONSUMULUI MEDIU — două moduri:
 *
 *   a) Cu filtru de an activ:
 *      Consum = (total litri filtrați / km parcurși în perioadă) × 100
 *      km parcurși = odometru final - odometru inițial al perioadei
 *
 *   b) Fără filtru de an:
 *      Consum = medie ponderată din toate alimentările cu km/plin valid
 *      (total litri / total km) × 100, ignorând alimentările fără km
 *
 * ─────────────────────────────────────────────────────────────
 * COST PER KM:
 *   costPerKm = (total cheltuieli filtrate) / (km perioadă)
 *   Dacă nu avem km, costPerKm = 0
 */
function renderDashboard() {
  const expenses       = filteredExpenses();
  const fuel           = filteredFuel();

  // Combinăm cheltuielile și combustibilul într-un singur array de cost rows
  // pentru graficul lunar (fiecare element are: date, category, value)
  const allCosts       = [...expenses.map(toCostRow), ...fuel.map(toFuelCostRow)];

  // Total pe toată baza de date (ignoră filtrele) — pentru sidebar
  const totalAll       = sum(state.expenses, "costLei") + sum(state.fuel, "costLei");

  // Total filtrat (respectă filtrele active) — pentru KPI-uri
  const totalExpenses  = sum(expenses, "costLei") + sum(fuel, "costLei");
  const totalFuel      = sum(fuel, "costLei");

  // Cel mai mare odometru din TOATE alimentările (nu filtrate)
  const latestKm       = max(state.fuel.map((row) => row.odometerKm));

  // Statistici km pentru perioada filtrată
  const kmStats        = periodKilometerStats(state.fuel);
  const periodKm       = kmStats.distanceKm;
  const fuelLiters     = sum(fuel, "liters");

  // Consum mediu: formula diferă în funcție de prezența filtrului de an
  const avgConsumption = kmStats.hasYearFilter && periodKm && fuelLiters
    ? (fuelLiters / periodKm) * 100
    : weightedAverageConsumption(fuel);

  const costPerKm      = periodKm ? totalExpenses / periodKm : 0;

  // Nota de sub KPI-ul "Consum mediu" — diferă cu/fără filtru
  const consumptionNote = kmStats.hasYearFilter
    ? `km perioadă: ${formatNumber(periodKm, 0)}`
    : `km actuali: ${formatNumber(latestKm, 0)}`;

  /**
   * Definițiile celor 6 carduri KPI.
   * Format: [label, valoare, notă, cheie_culoare]
   *
   * Adaugă/scoate elemente din array pentru a modifica numărul de carduri.
   * Adaugă cheia în categoryColors dacă vrei o culoare specifică.
   */
  const cards = [
    ["Acte",        formatMoney(sum(expenses.filter((row) => row.category === "Acte"), "costLei")),                                               "RCA, viniete, ITP, revizii",         "Acte"],
    ["Întreținere", formatMoney(sum(expenses.filter((row) => ["Piese + scule", "Manopera"].includes(row.category)), "costLei")),                  "piese, scule și manoperă",  "Întreținere"],
    ["Consumabile", formatMoney(sum(expenses.filter((row) => row.category === "Consumabile + diverse"), "costLei")),                              "curățare și diverse",       "Consumabile"],
    ["Combustibil", formatMoney(totalFuel),                                                                                                        `${fuel.length} alimentări`, "Combustibil"],
    ["Consum mediu",`${formatNumber(avgConsumption, 2)} l/100`,                                                                                   consumptionNote,             "Consum mediu"],
    ["Cost/km",     `${formatNumber(costPerKm, 2)} lei`,                                                                                          `${formatNumber(periodKm, 0)} km parcurși`, "Cost/km"]
  ];

  // Generăm HTML-ul cardurilor. CSS variabila --card-accent setează
  // culoarea de accent (border-top și gradient) pentru fiecare card.
  document.getElementById("kpiGrid").innerHTML = cards.map(
    ([label, value, note, colorKey]) => `
      <article class="kpi-card" style="--card-accent: ${categoryColor(colorKey)}">
        <span>${label}</span>
        <strong>${value}</strong>
        <small>${note}</small>
      </article>
    `
  ).join("");

  // Sidebar: total general + data ultimei înregistrări
  document.getElementById("sideTotal").textContent   = formatMoney(totalAll);
  document.getElementById("sideUpdated").textContent =
    `ultima actualizare: ${formatDate(latestRecordDate()) || "-"}`;

  // Tabelul "Ultimele cheltuieli" — ultimele 8, sortate desc după dată
  renderRecent("recentExpenses",
    expenses.slice().sort(descDate).slice(0, 8),
    (row) => `
      <td>${formatDate(row.date)}</td>
      <td>${escapeHtml(row.category)}</td>
      <td>${escapeHtml(row.product)}</td>
      <td class="number">${formatMoney(row.costLei)}</td>
    `
  );

  // Tabelul "Ultimele alimentări" — ultimele 8
  renderRecent("recentFuel",
    fuel.slice().sort(descDate).slice(0, 8),
    (row) => `
      <td>${formatDate(row.date)}</td>
      <td>${escapeHtml(row.station)}</td>
      <td class="number">${formatNumber(row.liters, 1)}</td>
      <td class="number">${formatNumber(row.consumptionPer100Km, 2)}</td>
    `
  );

  // Graficele au nevoie de 30ms delay pentru a obține dimensiunile corecte din CSS layout
  setTimeout(drawCharts, 30);
}

/**
 * Actualizează badge-urile din topbar în funcție de view-ul curent.
 *
 * - #kmBadge        → vizibil NUMAI pe Dashboard; afișează max odometru
 * - #fuelLitersBadge→ vizibil NUMAI pe Combustibil; afișează total litri filtrați
 *
 * Clasa `.hidden` controlează vizibilitatea (CSS: display: none).
 */
function renderHeaderBadge() {
  const badge      = document.getElementById("kmBadge");
  const fuelBadge  = document.getElementById("fuelLitersBadge");
  const latestKm   = max(state.fuel.map((row) => row.odometerKm));

  badge.classList.toggle("hidden", state.view !== "dashboard");
  badge.querySelector("strong").textContent = formatNumber(latestKm, 0);

  fuelBadge.classList.toggle("hidden", state.view !== "fuel");
  fuelBadge.querySelector("strong").textContent =
    formatNumber(sum(filteredFuel(), "liters"), 0);
}

/**
 * Returnează data (string "YYYY-MM-DD") celei mai recente înregistrări
 * din combinația expenses + fuel. Folosit pentru "ultima actualizare" din sidebar.
 *
 * @returns {string} Data ISO sau "" dacă nu există înregistrări
 */
function latestRecordDate() {
  return [...state.expenses, ...state.fuel]
    .map((row) => row.date)
    .filter(Boolean)
    .sort()
    .pop() || "";
}

/**
 * Randează tabelul complet de alimentări în #fuelTable.
 * Sortate descrescător după dată (cea mai recentă prima).
 * Butoanele de editare/ștergere apelează funcții globale (window.editFuel/deleteFuel).
 */
function renderFuelTable() {
  const rows = filteredFuel().slice().sort(descDate);
  document.getElementById("fuelTable").innerHTML = rows.map((row) => `
    <tr>
      <td>${formatDate(row.date)}</td>
      <td>${escapeHtml(row.station)}</td>
      <td class="number">${formatMoney(row.costLei)}</td>
      <td class="number">${formatNumber(row.priceLeiPerLiter, 2)}</td>
      <td class="number">${formatNumber(row.liters, 2)}</td>
      <td class="number">${formatNumber(row.odometerKm, 0)}</td>
      <td class="number">${formatNumber(row.kmSinceLastFill, 0)}</td>
      <td class="number">${formatNumber(row.consumptionPer100Km, 2)}</td>
      <td>
        <div class="row-actions">
          <button class="row-button"        title="Editează" onclick="editFuel('${row.id}')">✎</button>
          <button class="row-button danger" title="Șterge"   onclick="deleteFuel('${row.id}')">×</button>
        </div>
      </td>
    </tr>
  `).join("");
}

/**
 * Randează tabelul complet de cheltuieli în #expenseTable.
 * Similar cu renderFuelTable().
 */
function renderExpenseTable() {
  const rows = filteredExpenses().slice().sort(descDate);
  document.getElementById("expenseTable").innerHTML = rows.map((row) => `
    <tr>
      <td>${formatDate(row.date)}</td>
      <td>${escapeHtml(row.category)}</td>
      <td>${escapeHtml(row.product)}</td>
      <td>${escapeHtml(row.type)}</td>
      <td class="number">${formatMoney(row.costLei)}</td>
      <td>
        <div class="row-actions">
          <button class="row-button"        title="Editează" onclick="editExpense('${row.id}')">✎</button>
          <button class="row-button danger" title="Șterge"   onclick="deleteExpense('${row.id}')">×</button>
        </div>
      </td>
    </tr>
  `).join("");
}

/**
 * Helper generic pentru tabelele "recente" din Dashboard.
 * Injectează rânduri HTML în tbody-ul cu id-ul specificat.
 *
 * @param {string}   target   - id-ul elementului tbody
 * @param {object[]} rows     - Array de înregistrări de randat
 * @param {Function} template - Funcție (row) => string HTML cu celulele td (fără tr)
 */
function renderRecent(target, rows, template) {
  document.getElementById(target).innerHTML =
    rows.map((row) => `<tr>${template(row)}</tr>`).join("");
}


// ══════════════════════════════════════════════════════════════════════════════
// 9. GRAFICE
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Redesenează toate cele 4 grafice din Dashboard.
 * Apelată la: navigare pe Dashboard, schimbare filtre, schimbare temă.
 *
 * Graficele citesc culorile din CSS custom properties via `themeColor()`,
 * deci trebuie redesenate la schimbarea temei.
 *
 * Guard: dacă nu suntem pe Dashboard, ieșim imediat (economie de CPU).
 *
 * Graficele desenate:
 *   monthlyChart     → bar chart: cheltuieli totale grupate pe lună
 *   categoryChart    → donut chart: distribuție pe categorii
 *   consumptionChart → line chart: consum l/100km per alimentare
 *   priceChart       → line chart: prețul lei/litru per alimentare
 */
function drawCharts() {
  if (state.view !== "dashboard") return;

  const expenses = filteredExpenses();
  const fuel     = filteredFuel();
  // Combinăm cheltuielile și combustibilul pentru graficul lunar
  const costs    = [...expenses.map(toCostRow), ...fuel.map(toFuelCostRow)];

  drawBarChart("monthlyChart",
    groupByMonth(costs),
    themeColor("--chart-bars")
  );

  drawDonutChart("categoryChart",
    groupByCategory(expenses, fuel)
  );

  drawLineChart("consumptionChart",
    fuel
      .filter((row) => row.consumptionPer100Km > 0) // ignorăm alimentările fără consum
      .sort(ascDate)
      .map((row) => ({ label: shortDate(row.date), date: row.date, value: row.consumptionPer100Km })),
    themeColor("--chart-consumption")
  );

  drawLineChart("priceChart",
    fuel
      .filter((row) => row.priceLeiPerLiter > 0) // ignorăm alimentările fără preț/l
      .sort(ascDate)
      .map((row) => ({ label: shortDate(row.date), date: row.date, value: row.priceLeiPerLiter })),
    themeColor("--chart-price")
  );
}

/**
 * Desenează un bar chart vertical pe canvas-ul cu id-ul specificat.
 *
 * Parametrii vizuali (modifică direct în cod):
 *   pad = 42         → padding stânga (spațiu pentru axa Y)
 *   bottomPad = 48   → padding jos (spațiu pentru etichetele lunii)
 *   width * 0.64     → lățimea barei ca fracție din slot (0.64 = 64%)
 *   labelStep        → afișează o etichetă la fiecare N bare (auto-calculat)
 *
 * Fiecare bară înregistrează o regiune "rect" în chartRegions pentru tooltip.
 *
 * @param {string}   id    - id-ul canvas-ului HTML
 * @param {object[]} data  - Array de { label: string, value: number }
 * @param {string}   color - Culoarea CSS a barelor (hex sau rgb)
 */
function drawBarChart(id, data, color) {
  const canvas = setupCanvas(id);
  const ctx    = canvas.getContext("2d");
  clearCanvas(ctx, canvas);
  chartRegions.set(id, []);

  if (!data.length) return drawEmpty(ctx, canvas);

  const pad       = 42;
  const bottomPad = 48;
  const maxValue  = Math.max(...data.map((item) => item.value), 1);
  const width     = (canvas.width - pad * 2) / data.length;

  // Afișăm o etichetă de lună la fiecare `labelStep` bare pentru a evita
  // suprapunerea când sunt mulți ani de date.
  const labelStep = Math.max(1, Math.ceil(data.length / 14));

  drawAxis(ctx, canvas, pad, bottomPad);

  data.forEach((item, index) => {
    const barHeight = ((canvas.height - pad - bottomPad) * item.value) / maxValue;
    const x        = pad + index * width + width * 0.18;
    const y        = canvas.height - bottomPad - barHeight;
    const barWidth = Math.max(8, width * 0.64); // minimum 8px pentru bare înguste

    ctx.fillStyle = color;
    ctx.fillRect(x, y, barWidth, barHeight);

    // Înregistrăm zona pentru tooltip
    chartRegions.get(id).push({
      type: "rect", x, y, width: barWidth, height: barHeight,
      title: item.label,
      value: formatMoney(item.value)
    });

    // Etichetă de lună (afișată selectiv pentru a evita aglomerarea)
    if (index % labelStep === 0 || index === data.length - 1) {
      ctx.fillStyle  = themeColor("--canvas-muted");
      ctx.font       = "11px sans-serif";
      ctx.textAlign  = "center";
      ctx.fillText(item.label, x + barWidth / 2, canvas.height - 18);
    }
  });

  ctx.textAlign = "left"; // resetăm aliniamentul implicit
}

/**
 * Desenează un line chart cu puncte pe canvas-ul specificat.
 * Folosit pentru consum și prețul carburantului.
 *
 * Configurare axe Y:
 *   priceChart       → fix: 5–10 lei/l, ticks la 0.5
 *   consumptionChart → fix: 3–11 l/100, ticks la 2
 *   altele           → dinamic din datele actuale
 * Modifică `getLineAxisConfig()` pentru a schimba scalele.
 *
 * Necesită minim 2 puncte — afișează mesaj "Nu există date" altfel.
 *
 * @param {string}   id    - id-ul canvas-ului
 * @param {object[]} data  - Array de { label, date, value }
 * @param {string}   color - Culoarea liniei și punctelor
 */
function drawLineChart(id, data, color) {
  const canvas = setupCanvas(id);
  const ctx    = canvas.getContext("2d");
  clearCanvas(ctx, canvas);
  chartRegions.set(id, []);

  if (data.length < 2) return drawEmpty(ctx, canvas);

  const pad       = 36;
  const leftPad   = 54; // spațiu pentru etichetele axei Y
  const bottomPad = 36;
  const topPad    = 18;
  const decimals  = id === "priceChart" ? 2 : 1;
  const values    = data.map((item) => item.value);
  const min       = Math.min(...values);
  const maxValue  = Math.max(...values);

  const axisConfig = getLineAxisConfig(id, min, maxValue);
  const axisMin    = axisConfig.min;
  const axisMax    = axisConfig.max;
  const range      = axisMax - axisMin || 1;

  drawAxis(ctx, canvas, leftPad, bottomPad);
  drawYAxisLabels(ctx, canvas, axisConfig.ticks, leftPad, topPad, bottomPad, decimals);

  // Desenăm linia principală
  ctx.strokeStyle = color;
  ctx.lineWidth   = 3;
  ctx.beginPath();
  data.forEach((item, index) => {
    const x = leftPad + ((canvas.width - leftPad - pad) * index) / (data.length - 1);
    const y = canvas.height - bottomPad -
      ((canvas.height - topPad - bottomPad) * (item.value - axisMin)) / range;
    if (index === 0) ctx.moveTo(x, y);
    else             ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Desenăm punctele și înregistrăm regiunile de tooltip
  data.forEach((item, index) => {
    const x = leftPad + ((canvas.width - leftPad - pad) * index) / (data.length - 1);
    const y = canvas.height - bottomPad -
      ((canvas.height - topPad - bottomPad) * (item.value - axisMin)) / range;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2); // punct cu raza 4px
    ctx.fill();

    // Zona de hover e mai mare decât punctul vizual (raza 9px) pentru ușurință
    chartRegions.get(id).push({
      type: "circle", x, y, radius: 9,
      title: formatDate(item.date || item.label),
      value: formatNumber(item.value, 2)
    });
  });
}

/**
 * Returnează configurația axei Y (min, max, ticks) pentru un line chart.
 *
 * Scalele fixe pentru price și consumption asigură comparabilitate
 * în timp indiferent de datele actuale.
 *
 * MODIFICARE SCALE: schimbă valorile din if-urile de mai jos.
 *
 * @param {string} id       - id-ul canvas-ului
 * @param {number} min      - valoarea minimă din date
 * @param {number} maxValue - valoarea maximă din date
 * @returns {{ min, max, ticks: number[] }}
 */
function getLineAxisConfig(id, min, maxValue) {
  if (id === "priceChart") {
    // Prețul benzinei în România: scala 5–10 lei/l, pas 0.5
    return { min: 5, max: 10, ticks: createTicks(5, 10, 0.5) };
  }
  if (id === "consumptionChart") {
    // Consum: scala 3–11 l/100km, pas 2
    return { min: 3, max: 11, ticks: createTicks(3, 11, 2) };
  }
  // Alte grafice line: scalare dinamică din date
  return {
    min, max: maxValue,
    ticks: createTicks(min, maxValue, (maxValue - min || 1) / 4)
  };
}

/**
 * Generează un array de valori la interval egal pentru tick-urile axei Y.
 * Adaugă o toleranță mică (step/10) la condiția de oprire pentru erori float.
 *
 * @param {number} start
 * @param {number} end
 * @param {number} step
 * @returns {number[]}
 */
function createTicks(start, end, step) {
  const ticks = [];
  for (let value = start; value <= end + step / 10; value += step) {
    ticks.push(Math.round(value * 100) / 100); // elimină erorile floating point
  }
  return ticks;
}

/**
 * Desenează etichetele și liniile de grilă orizontale ale axei Y.
 * Fiecare tick primește: linie de grilă gri deschis + text aliniat dreapta.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLCanvasElement}        canvas
 * @param {number[]} ticks      - Valorile pentru care se desenează linii
 * @param {number}   leftPad    - Offset stânga (spațiu pentru text)
 * @param {number}   topPad     - Offset sus
 * @param {number}   bottomPad  - Offset jos (spațiu pentru etichetele X)
 * @param {number}   decimals   - Zecimale pentru formatarea textului
 */
function drawYAxisLabels(ctx, canvas, ticks, leftPad, topPad, bottomPad, decimals) {
  const min      = ticks[0];
  const maxValue = ticks[ticks.length - 1];
  const range    = maxValue - min || 1;

  ctx.save();
  ctx.font          = "11px sans-serif";
  ctx.fillStyle     = themeColor("--canvas-muted");
  ctx.strokeStyle   = themeColor("--canvas-grid");
  ctx.lineWidth     = 1;
  ctx.textAlign     = "right";
  ctx.textBaseline  = "middle";

  for (const value of ticks) {
    const y = canvas.height - bottomPad -
      ((canvas.height - topPad - bottomPad) * (value - min)) / range;

    // Linia de grilă orizontală
    ctx.beginPath();
    ctx.moveTo(leftPad, y);
    ctx.lineTo(canvas.width - 12, y);
    ctx.stroke();

    // Eticheta valorii la stânga axei
    ctx.fillText(formatNumber(value, decimals), leftPad - 8, y);
  }

  ctx.restore(); // restaurăm starea canvas-ului salvată cu save()
}

/**
 * Desenează un donut chart (cerc cu gaură) pe canvas.
 * Include o legendă text cu primele 5 categorii (label, valoare, procent).
 *
 * Tehnica "gaurii": desenăm cercul complet, apoi aplicăm un arc cu
 * `globalCompositeOperation = "destination-out"` (șterge pixelii) pentru
 * a crea golul din mijloc. Raza gaurii = radius * 0.45.
 *
 * Legenda e poziționată în stânga sus, graficul e deplasat spre dreapta
 * (cx = canvas.width / 2 + 100) pentru a lăsa spațiu legendei.
 *
 * @param {string}   id   - id-ul canvas-ului
 * @param {object[]} data - Array de { label: string, value: number }, sortat desc
 */
function drawDonutChart(id, data) {
  const canvas = setupCanvas(id);
  const ctx    = canvas.getContext("2d");
  clearCanvas(ctx, canvas);
  chartRegions.set(id, []);

  if (!data.length) return drawEmpty(ctx, canvas);

  const total  = sum(data, "value");
  // Centrul donut-ului — deplasat spre dreapta pentru spațiul legendei
  const cx     = canvas.width / 2 + 100;
  const cy     = canvas.height / 2 - 2;
  const radius = Math.min(canvas.width, canvas.height) / 2.1;
  let   angle  = -Math.PI / 2; // începem de sus (−90°)

  // Desenăm fiecare sector
  data.forEach((item, index) => {
    const slice      = (item.value / total) * Math.PI * 2; // unghi sector în radiani
    const startAngle = angle;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, angle, angle + slice);
    ctx.closePath();
    ctx.fillStyle = categoryColor(item.label, index);
    ctx.fill();

    // Înregistrăm sectorul pentru tooltip
    chartRegions.get(id).push({
      type: "slice",
      cx, cy,
      innerRadius: radius * 0.55, // radius-ul interior al inelului
      outerRadius: radius,
      startAngle,
      endAngle:    angle + slice,
      title:       item.label,
      value:       `${formatMoney(item.value)} · ${formatNumber((item.value / total) * 100, 1)}%`
    });

    angle += slice;
  });

  // Creăm gaura din mijloc prin composite operation "destination-out"
  // — pixelii desenați acum "șterg" pixelii existenți
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over"; // restaurăm modul normal

  // ── Legenda (primele 5 categorii, în colțul stâng) ─────────────────────
  ctx.fillStyle = "#1b2623"; // culoare placeholder — suprascrisă imediat
  ctx.font      = "16px sans-serif";

  data.slice(0, 5).forEach((item, index) => {
    const percent = total ? (item.value / total) * 100 : 0;
    const y       = canvas.height - 90 + index * 20; // rânduri la 14px distanță

    // Pătrat colorat (indicator categorie)
    ctx.fillStyle = categoryColor(item.label, index);
    ctx.fillRect(12, y, 9, 9);

    // Text: label, valoare, procent
    ctx.fillStyle  = themeColor("--canvas-ink");
    ctx.textAlign  = "left";
    ctx.fillText(item.label, 28, y + 9);

    ctx.textAlign = "right";
    ctx.fillText(formatMoney(item.value), 250, y + 9);
    ctx.fillText(`${formatNumber(percent, 1)}%`, 310, y + 9);
  });

  ctx.textAlign = "left"; // resetăm
}


// ══════════════════════════════════════════════════════════════════════════════
// 10. TOOLTIP GRAFICE
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Atașează listeneri de mousemove și mouseleave pe toate canvas-urile.
 * Apelată o singură dată în bindEvents().
 */
function bindChartTooltips() {
  document.querySelectorAll("canvas").forEach((canvas) => {
    canvas.addEventListener("mousemove",  (event) => showChartTooltip(event, canvas));
    canvas.addEventListener("mouseleave", hideChartTooltip);
  });
}

/**
 * La mișcarea mouse-ului pe un canvas, calculează poziția relativă și
 * caută o regiune intersectată în chartRegions. Dacă găsește una,
 * afișează tooltip-ul cu conținutul ei.
 *
 * Tooltip-ul e poziționat la cursorul mouse-ului + offset (14px) pentru
 * a nu acoperi punctul/bara hover-it.
 *
 * @param {MouseEvent}       event
 * @param {HTMLCanvasElement} canvas
 */
function showChartTooltip(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  const x    = event.clientX - rect.left;  // coordonate relative la canvas
  const y    = event.clientY - rect.top;

  const hit     = (chartRegions.get(canvas.id) || []).find((region) => isChartHit(region, x, y));
  const tooltip = document.getElementById("chartTooltip");

  if (!hit) return hideChartTooltip();

  tooltip.innerHTML = `<strong>${escapeHtml(hit.title)}</strong><span>${escapeHtml(hit.value)}</span>`;
  tooltip.style.left = `${event.clientX + 14}px`;
  tooltip.style.top  = `${event.clientY + 14}px`;
  tooltip.classList.add("show");
}

/** Ascunde tooltip-ul eliminând clasa .show. */
function hideChartTooltip() {
  document.getElementById("chartTooltip").classList.remove("show");
}

/**
 * Testează dacă un punct (x, y) se află în interiorul unei regiuni.
 * Suportă trei tipuri de regiuni:
 *
 *   "rect"  → testul clasic de bounding box
 *   "circle"→ distanța Euclidiană față de centru ≤ radius
 *   "slice" → verifica distanța față de centru (inel) ȘI unghiul față de startAngle
 *
 * @param {object} region - Obiectul regiune din chartRegions
 * @param {number} x      - Coordonata X a cursorului (relativă la canvas)
 * @param {number} y      - Coordonata Y
 * @returns {boolean}
 */
function isChartHit(region, x, y) {
  if (region.type === "rect") {
    return x >= region.x &&
           x <= region.x + region.width &&
           y >= region.y &&
           y <= region.y + region.height;
  }

  if (region.type === "circle") {
    return Math.hypot(x - region.x, y - region.y) <= region.radius;
  }

  if (region.type === "slice") {
    const dx       = x - region.cx;
    const dy       = y - region.cy;
    const distance = Math.hypot(dx, dy);

    // Verificăm că suntem în inelul dintre innerRadius și outerRadius
    if (distance < region.innerRadius || distance > region.outerRadius) return false;

    // Calculăm unghiul și îl normalizăm la [−π/2, 3π/2] pentru a
    // corespunde cu sistemul de coordonate al graficului (pornind de la −π/2)
    let angle = Math.atan2(dy, dx);
    if (angle < -Math.PI / 2) angle += Math.PI * 2;

    return angle >= region.startAngle && angle <= region.endAngle;
  }

  return false;
}


// ══════════════════════════════════════════════════════════════════════════════
// 11. CANVAS HELPERS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Pregătește un canvas pentru desenare:
 *   - Citește dimensiunea CSS actuală (rect.width)
 *   - Setează dimensiunile în pixeli CSS (nu device pixels — DPR ignorat)
 *   - Resetează transformarea la identitate
 *
 * Înălțimea vine din atributul HTML `height` al canvas-ului.
 * Lățimea vine din CSS (100% din containerul parent).
 *
 * NOTĂ: Dacă vrei support HiDPI (Retina), decomentează liniile cu scale.
 *
 * @param {string} id - id-ul canvas-ului
 * @returns {HTMLCanvasElement}
 */
function setupCanvas(id) {
  const canvas = document.getElementById(id);
  const rect   = canvas.getBoundingClientRect();
  // Decomentează pentru DPR support:
  // const scale = window.devicePixelRatio || 1;
  // canvas.width = Math.max(320, Math.floor(rect.width * scale));
  // canvas.height = Number(canvas.getAttribute("height")) * scale;
  // canvas.getContext("2d").setTransform(scale, 0, 0, scale, 0, 0);
  canvas.width  = Math.max(320, Math.floor(rect.width));
  canvas.height = Number(canvas.getAttribute("height"));
  return canvas;
}

/** Șterge complet conținutul unui canvas. */
function clearCanvas(ctx, canvas) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

/**
 * Desenează axele X și Y (două linii: verticală și orizontală).
 * Axa Y pornește de sus (y=16) și coboară până la axa X.
 * Axa X pornește din originea Y și merge până la dreapta canvas-ului.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLCanvasElement}        canvas
 * @param {number} pad       - Padding stânga (originea axei Y)
 * @param {number} bottomPad - Padding jos (originea axei X)
 */
function drawAxis(ctx, canvas, pad, bottomPad = pad) {
  ctx.strokeStyle = themeColor("--canvas-axis");
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(pad, 16);                              // vârful axei Y
  ctx.lineTo(pad, canvas.height - bottomPad);       // originea axelor
  ctx.lineTo(canvas.width - 12, canvas.height - bottomPad); // capătul axei X
  ctx.stroke();
}

/**
 * Afișează mesajul "Nu există date" pe canvas când nu sunt date de randat.
 * Mesajul apare în colțul stâng-sus al zonei de grafic.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLCanvasElement}        canvas
 */
function drawEmpty(ctx, canvas) {
  ctx.fillStyle = themeColor("--canvas-muted");
  ctx.font      = "14px sans-serif";
  ctx.fillText("Nu există date pentru filtrul curent.", 18, 36);
}


// ══════════════════════════════════════════════════════════════════════════════
// 12. FORMULARE
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Salvează o cheltuială nouă sau actualizează una existentă.
 * Comportamentul (POST vs PUT) e determinat de câmpul hidden `id`:
 *   - Gol    → POST /api/expenses (creare nouă, status 201)
 *   - Cu val → PUT  /api/expenses/:id (actualizare)
 *
 * După salvare: resetează formularul, afișează toast, reîncarcă datele.
 *
 * @param {SubmitEvent} event
 */
async function saveExpense(event) {
  event.preventDefault(); // prevenim reîncărcarea paginii
  const form    = event.currentTarget;
  const payload = formToObject(form);
  const id      = payload.id;

  const response = await fetch(
    id ? `api/expenses/${encodeURIComponent(id)}` : "api/expenses",
    {
      method:  id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload)
    }
  );

  if (!response.ok) return toast("Cheltuiala nu a putut fi salvată.");
  resetForm("expenseForm");
  toast("Cheltuială salvată.");
  await loadData();
}

/**
 * Salvează o alimentare nouă sau actualizează una existentă.
 * Apelează `updateFuelDerivedFields()` înainte de salvare pentru a
 * asigura că km/plin și consumul calculat automat sunt incluse în payload.
 *
 * @param {SubmitEvent} event
 */
async function saveFuel(event) {
  event.preventDefault();
  const form = event.currentTarget;

  // Actualizăm câmpurile derivate (km/plin, consum) înainte de a citi formularul
  updateFuelDerivedFields();

  const payload = formToObject(form);
  const id      = payload.id;

  const response = await fetch(
    id ? `api/fuel/${encodeURIComponent(id)}` : "api/fuel",
    {
      method:  id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload)
    }
  );

  if (!response.ok) return toast("Alimentarea nu a putut fi salvată.");
  resetForm("fuelForm");
  toast("Alimentare salvată.");
  await loadData();
}

/**
 * Pre-completează formularul de cheltuieli cu datele unui rând existent
 * și navighează la view-ul Edit. Titlul panoului se schimbă în "Editează cheltuiala".
 *
 * Expusă pe window pentru că e apelată din onclick="editExpense('id')" generat în HTML.
 * Nu e posibil altfel fără un event delegation suplimentar pe tbody.
 *
 * @param {string} id - ID-ul înregistrării de editat
 */
window.editExpense = function editExpense(id) {
  const row = state.expenses.find((item) => item.id === id);
  if (!row) return;
  fillForm("expenseForm", row);
  document.getElementById("expenseFormTitle").textContent = "Editează cheltuiala";
  switchView("edit");
};

/**
 * Pre-completează formularul de alimentare. Similar cu editExpense.
 *
 * @param {string} id
 */
window.editFuel = function editFuel(id) {
  const row = state.fuel.find((item) => item.id === id);
  if (!row) return;
  fillForm("fuelForm", row);
  document.getElementById("fuelFormTitle").textContent = "Editează alimentare";
  switchView("edit");
};

/**
 * Șterge o cheltuială după confirmare explicită.
 * Apelează DELETE /api/expenses/:id, afișează toast, reîncarcă datele.
 *
 * @param {string} id
 */
window.deleteExpense = async function deleteExpense(id) {
  if (!confirm("Ștergi această cheltuială?")) return;
  await fetch(`api/expenses/${encodeURIComponent(id)}`, { method: "DELETE" });
  toast("Cheltuială ștearsă.");
  loadData();
};

/**
 * Șterge o alimentare după confirmare.
 * Server-ul recalculează automat km/plin și consumul pentru restul alimentărilor.
 *
 * @param {string} id
 */
window.deleteFuel = async function deleteFuel(id) {
  if (!confirm("Ștergi această alimentare?")) return;
  await fetch(`api/fuel/${encodeURIComponent(id)}`, { method: "DELETE" });
  toast("Alimentare ștearsă.");
  loadData();
};

/**
 * Serializează toate câmpurile unui formular într-un obiect simplu.
 * Folosește FormData nativ — include câmpurile hidden (id).
 *
 * @param {HTMLFormElement} form
 * @returns {object} { fieldName: fieldValue, ... }
 */
function formToObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}

/**
 * Completează un formular cu valorile unui obiect (rând din baza de date).
 * Pentru fuelForm, curăță flag-urile "auto" înainte de completare și
 * recalculează câmpurile derivate după completare.
 *
 * @param {string} id  - id-ul formularului ("expenseForm" sau "fuelForm")
 * @param {object} row - Obiectul cu datele de completat
 */
function fillForm(id, row) {
  const form = document.getElementById(id);
  if (id === "fuelForm") clearFuelAutoFlags(form); // curăță flag-urile auto
  Object.entries(row).forEach(([key, value]) => {
    const input = form.elements[key];
    if (input) input.value = value ?? ""; // null/undefined → string gol
  });
  if (id === "fuelForm") updateFuelDerivedFields();
}

/**
 * Resetează un formular la starea goală.
 * Setează câmpul hidden `id` la gol (forțând POST la salvare).
 * Resetează titlul panoului la valoarea implicită.
 *
 * @param {string} id - id-ul formularului ("expenseForm" sau "fuelForm")
 */
function resetForm(id) {
  const form = document.getElementById(id);
  form.reset();
  form.elements.id.value = ""; // asigurăm că nu rămâne un ID vechi

  if (id === "expenseForm") {
    document.getElementById("expenseFormTitle").textContent = "Cheltuială";
  }
  if (id === "fuelForm") {
    clearFuelAutoFlags(form);
    document.getElementById("fuelFormTitle").textContent = "Alimentare";
  }
}

/**
 * Elimină flag-urile `data-auto` de pe câmpurile kmSinceLastFill și
 * consumptionPer100Km. Aceste flag-uri indică că valoarea a fost
 * calculată automat și poate fi suprascrisă la recalcul.
 *
 * Când utilizatorul editează manual unul din câmpuri, flag-ul e șters
 * de listenerii din bindEvents(), protejând valoarea introdusă manual.
 *
 * @param {HTMLFormElement} form
 */
function clearFuelAutoFlags(form) {
  delete form.elements.kmSinceLastFill.dataset.auto;
  delete form.elements.consumptionPer100Km.dataset.auto;
}

/**
 * Calculează și completează automat km/plin și consumul în formularul
 * de alimentare, pe baza datelor introduse și a alimentării precedente.
 *
 * Logica pentru km/plin:
 *   - Dacă câmpul e gol SAU a fost completat automat (data-auto="true"):
 *     → calculăm ca (odometru curent) − (odometru alimentare precedentă)
 *   - Dacă utilizatorul a completat manual (fără data-auto): nu suprascriom
 *
 * Logica pentru consum:
 *   - Dacă câmpul e gol SAU auto și avem litri + km valizi:
 *     → consumPer100 = (litri / km) × 100
 *
 * Alimentarea "precedentă" = cea mai recentă alimentare cu dată < dată curentă
 * și odometru valid, din `state.fuel`.
 */
function updateFuelDerivedFields() {
  const form            = document.getElementById("fuelForm");
  const id              = form.elements.id.value;
  const date            = form.elements.date.value;
  const odometer        = parseFormNumber(form.elements.odometerKm.value);
  const liters          = parseFormNumber(form.elements.liters.value);
  const kmInput         = form.elements.kmSinceLastFill;
  const consumptionInput= form.elements.consumptionPer100Km;
  let   km              = parseFormNumber(kmInput.value);

  // Calculăm km/plin dacă câmpul e gol sau calculat automat anterior
  if ((!km || km <= 0 || kmInput.dataset.auto === "true") && odometer && date) {
    const previous = previousFuelFor(date, id);
    if (previous) {
      const computedKm = odometer - Number(previous.odometerKm || 0);
      if (computedKm > 0) {
        km              = Math.round(computedKm);
        kmInput.value   = km;
        kmInput.dataset.auto = "true"; // marcăm că e calculat automat
      }
    }
  }

  // Calculăm consumul dacă avem litri și km valizi
  const consumption = parseFormNumber(consumptionInput.value);
  if ((!consumption || consumption <= 0 || consumptionInput.dataset.auto === "true") &&
       liters && km && km > 0) {
    consumptionInput.value        = formatPlainNumber((liters / km) * 100, 2);
    consumptionInput.dataset.auto = "true";
  }
}

/**
 * Găsește alimentarea imediat anterioară datei curente (pentru calculul km/plin).
 * Exclude alimentarea cu id-ul curent (evitarea auto-referinței la editare).
 *
 * @param {string} date      - Data alimentării curente ("YYYY-MM-DD")
 * @param {string} currentId - ID-ul alimentării curente (exclus din căutare)
 * @returns {object|undefined} Alimentarea precedentă sau undefined
 */
function previousFuelFor(date, currentId) {
  const currentTime = dateToTime(date);
  return state.fuel
    .filter((row) =>
      row.id !== currentId &&
      row.date &&
      row.odometerKm > 0 &&
      dateToTime(row.date) < currentTime
    )
    .slice()
    .sort(descDate)[0]; // cea mai recentă de dinaintea datei curente
}


// ══════════════════════════════════════════════════════════════════════════════
// 13. BACKUP / RESTORE
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Descarcă un fișier JSON cu toate datele aplicației.
 * Încearcă endpoint-ul dedicat GET /api/backup (care include version + timestamp).
 * Fallback: GET /api/data dacă serverul e mai vechi și nu are /api/backup.
 *
 * Fișierul descărcat primește numele:
 *   backup-cheltuieli-auto-YYYY-MM-DD.json
 */
async function downloadBackup() {
  const response = await fetch("api/backup");
  const backup   = response.ok
    ? await response.json()
    : { version: 1, exportedAt: new Date().toISOString(),
        ...(await (await fetch("api/data")).json()) };

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href     = URL.createObjectURL(blob);
  link.download = `backup-cheltuieli-auto-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href); // eliberăm memoria alocată pentru blob URL
  toast("Backup descărcat.");
}

/**
 * Restaurează datele dintr-un fișier JSON de backup.
 * ATENȚIE: operație DISTRUCTIVĂ — datele curente sunt înlocuite complet.
 *
 * Flux:
 *   1. Citim fișierul selectat cu input[type=file]
 *   2. Parsăm JSON-ul
 *   3. Cerem confirmare explicită
 *   4. POST /api/restore (server înlocuiește fișierele JSON)
 *   5. Fallback: dacă serverul nu suportă /api/restore, folosim API-ul vechi
 *      (ștergem toate + inserăm unul câte unul)
 *   6. Reîncărcăm datele și navigăm la Dashboard
 */
async function restoreBackup() {
  const input = document.getElementById("restoreFile");
  const file  = input.files[0];
  if (!file) return toast("Alege un fișier JSON.");
  if (!confirm("Datele curente vor fi înlocuite cu backup-ul selectat.")) return;

  try {
    const payload  = JSON.parse(await file.text());
    const response = await fetch("api/restore", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload)
    });

    // Fallback pentru servere fără endpoint /api/restore
    if (!response.ok) await restoreWithExistingApi(payload);

    toast("Backup încărcat.");
    await loadData();
    switchView("dashboard");
  } catch (error) {
    toast(error.message);
  }
}

/**
 * Fallback pentru restore când serverul nu are endpoint-ul /api/restore.
 * Șterge toate înregistrările existente una câte una, apoi inserează
 * toate înregistrările din backup una câte una.
 *
 * LENT pentru seturi mari de date. Recomandat să actualizezi serverul.
 *
 * @param {object} payload - Obiectul backup parsat (cu expenses și fuel)
 */
async function restoreWithExistingApi(payload) {
  if (!Array.isArray(payload.expenses) || !Array.isArray(payload.fuel)) {
    throw new Error("Fișierul nu conține un backup valid.");
  }

  const current = await (await fetch("api/data")).json();

  // Ștergem toate înregistrările existente în paralel
  await Promise.all(
    (current.expenses || []).map((row) =>
      fetch(`api/expenses/${encodeURIComponent(row.id)}`, { method: "DELETE" })
    )
  );
  await Promise.all(
    (current.fuel || []).map((row) =>
      fetch(`api/fuel/${encodeURIComponent(row.id)}`, { method: "DELETE" })
    )
  );

  // Inserăm backup-ul secvențial (ordinea contează pentru calculele fuel)
  for (const row of payload.expenses) {
    await fetch("api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(row)
    });
  }
  for (const row of payload.fuel) {
    await fetch("api/fuel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(row)
    });
  }
}


// ══════════════════════════════════════════════════════════════════════════════
// 14. README MODAL
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Deschide modalul cu documentația proiectului.
 * Conținutul readme.md este încărcat LAZY (o singură dată, la primul click)
 * via fetch() și randat ca HTML simplu prin renderMarkdown().
 *
 * `data-loaded` pe elementul content previne re-fetch la deschideri ulterioare.
 */
async function openReadme() {
  const modal   = document.getElementById("readmeModal");
  const content = document.getElementById("readmeContent");

  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");

  if (!content.dataset.loaded) {
    try {
      const markdown       = await (await fetch("readme.md")).text();
      content.innerHTML    = renderMarkdown(markdown);
      content.dataset.loaded = "true"; // flag: nu mai fetch-uim data viitoare
    } catch {
      content.innerHTML = "<p>Documentația nu a putut fi încărcată.</p>";
    }
  }
}

/** Închide modalul README. */
function closeReadme() {
  const modal = document.getElementById("readmeModal");
  modal.classList.remove("show");
  modal.setAttribute("aria-hidden", "true");
}

/**
 * Conversie simplă Markdown → HTML.
 * Suportă: H1 (#), H2 (##), liste (- item), paragrafe, blocuri de cod (```),
 * și cod inline (`code`).
 *
 * NU suportă: tabele, link-uri, imagini, bold/italic, HTML înglobat.
 * Suficient pentru documentația simplă a proiectului.
 *
 * @param {string} markdown - Conținutul fișierului readme.md
 * @returns {string} HTML renderizat
 */
function renderMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/);
  const html  = [];
  let inList  = false;
  let inCode  = false;
  let codeLines = [];

  const closeList = () => {
    if (inList) { html.push("</ul>"); inList = false; }
  };

  for (const line of lines) {
    // Bloc de cod: deschide sau închide la ```
    if (line.startsWith("```")) {
      if (inCode) {
        html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = [];
        inCode    = false;
      } else {
        closeList();
        inCode = true;
      }
      continue;
    }

    if (inCode) { codeLines.push(line); continue; }

    if      (line.startsWith("# "))  { closeList(); html.push(`<h1>${formatInline(line.slice(2))}</h1>`); }
    else if (line.startsWith("## ")) { closeList(); html.push(`<h2>${formatInline(line.slice(3))}</h2>`); }
    else if (line.startsWith("- ")) {
      if (!inList) { html.push("<ul>"); inList = true; }
      html.push(`<li>${formatInline(line.slice(2))}</li>`);
    }
    else if (line.trim()) { closeList(); html.push(`<p>${formatInline(line)}</p>`); }
    else                  { closeList(); }
  }

  closeList();
  return html.join("");
}

/**
 * Formatează o linie de markdown pentru cod inline: `text` → <code>text</code>.
 * Aplică și HTML escape pentru a preveni XSS.
 *
 * @param {string} text
 * @returns {string}
 */
function formatInline(text) {
  return escapeHtml(text).replace(/`([^`]+)`/g, "<code>$1</code>");
}


// ══════════════════════════════════════════════════════════════════════════════
// 15. FUNCȚII DE TRANSFORMARE DATE
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Convertește un rând de cheltuială într-un "cost row" folosit de grafice.
 * Formatul: { date, category, value }
 *
 * @param {object} row - Cheltuială din state.expenses
 * @returns {{ date: string, category: string, value: number }}
 */
function toCostRow(row) {
  return { date: row.date, category: row.category, value: Number(row.costLei || 0) };
}

/**
 * Similar cu toCostRow, dar pentru alimentări.
 * Categoria e forțată la "Combustibil" indiferent de datele din row.
 *
 * @param {object} row - Alimentare din state.fuel
 * @returns {{ date: string, category: string, value: number }}
 */
function toFuelCostRow(row) {
  return { date: row.date, category: "Combustibil", value: Number(row.costLei || 0) };
}

/**
 * Grupează un array de cost rows pe luni și sumează valorile.
 * Returnează array sortat cronologic, cu label = "YYYY-MM".
 *
 * Exemplu output: [{ label: "2024-03", value: 450 }, ...]
 *
 * @param {object[]} rows - Array de { date, value }
 * @returns {{ label: string, value: number }[]}
 */
function groupByMonth(rows) {
  const grouped = new Map();
  rows.forEach((row) => {
    if (!row.date) return;
    const key = row.date.slice(0, 7); // "YYYY-MM"
    grouped.set(key, (grouped.get(key) || 0) + Number(row.value || 0));
  });
  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, value]) => ({ label, value }));
}

/**
 * Grupează cheltuielile și alimentările pe categorii și sumează costurile.
 * Sortează descrescător după valoare (categoria cu cel mai mare cost prima).
 *
 * @param {object[]} expenses - Cheltuieli filtrate
 * @param {object[]} fuel     - Alimentări filtrate
 * @returns {{ label: string, value: number }[]}
 */
function groupByCategory(expenses, fuel) {
  const grouped = new Map();
  expenses.forEach((row) =>
    grouped.set(row.category, (grouped.get(row.category) || 0) + Number(row.costLei || 0))
  );
  grouped.set("Combustibil", sum(fuel, "costLei"));
  return [...grouped.entries()]
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value }));
}

/**
 * Returnează culoarea CSS pentru o categorie.
 * Încearcă mai întâi în `categoryColors`, dacă nu găsește
 * folosește o culoare din paleta fallback bazată pe index.
 *
 * @param {string} label         - Numele categoriei
 * @param {number} fallbackIndex - Indexul în paleta fallback (default 0)
 * @returns {string} Culoare CSS (hex)
 */
function categoryColor(label, fallbackIndex = 0) {
  const fallback = ["#2f7fb8", "#d0673f", "#c49a2f", "#3a9b74", "#8a65b8", "#5968b3"];
  return categoryColors[label] || fallback[fallbackIndex % fallback.length];
}

/**
 * Citește valoarea curentă a unei CSS custom property de pe :root.
 * Folosit pentru a obține culorile temei active în graficele canvas.
 * Culorile canvas nu pot folosi var() direct — trebuie citite via JS.
 *
 * @param {string} name - Numele variabilei CSS (ex: "--chart-bars")
 * @returns {string} Valoarea curentă a variabilei
 */
function themeColor(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}


// ══════════════════════════════════════════════════════════════════════════════
// 16. CALCULE STATISTICE
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Calculează consumul mediu ponderat din toate alimentările cu date complete.
 * Formula: (total litri) / (total km parcurși) × 100
 *
 * "Ponderat" înseamnă că alimentările cu mai mulți km/litri au mai multă
 * influență — mai corect decât media aritmetică a consumurilor.
 *
 * Ignoră alimentările fără litri sau km/plin valid.
 *
 * @param {object[]} fuel - Array de alimentări
 * @returns {number} Consum mediu ponderat (l/100km) sau 0
 */
function weightedAverageConsumption(fuel) {
  const valid  = fuel.filter((row) => row.liters > 0 && row.kmSinceLastFill > 0);
  const liters = sum(valid, "liters");
  const km     = sum(valid, "kmSinceLastFill");
  return km ? (liters / km) * 100 : 0;
}

/**
 * Calculează distanța parcursă în perioada selectată de filtre.
 * Distanța = (odometru la ultima alimentare din perioadă) − (odometru la prima)
 *
 * Dacă nu există filtru de an, folosește toate alimentările (prima → ultima).
 *
 * Returnează și flag-ul `hasYearFilter` pentru a adapta modul de calcul
 * al consumului mediu în renderDashboard().
 *
 * @param {object[]} fuel - Array de alimentări (nefiltrate, din state.fuel)
 * @returns {{ distanceKm: number, startKm: number, endKm: number, hasYearFilter: boolean }}
 */
function periodKilometerStats(fuel) {
  const range = selectedDateRange();
  const rows  = fuel
    .filter((row) => row.date && Number.isFinite(Number(row.odometerKm)))
    .slice()
    .sort(ascDate);

  if (!rows.length) return { distanceKm: 0, hasYearFilter: range.hasYearFilter };

  // Găsim alimentarea cea mai apropiată de data de start/end a filtrului
  const startRow = range.start ? closestFuelByDate(rows, range.start) : rows[0];
  const endRow   = range.end   ? closestFuelByDate(rows, range.end)   : rows[rows.length - 1];

  return {
    distanceKm:    Math.max(0, Number(endRow?.odometerKm || 0) - Number(startRow?.odometerKm || 0)),
    startKm:       Number(startRow?.odometerKm || 0),
    endKm:         Number(endRow?.odometerKm   || 0),
    hasYearFilter: range.hasYearFilter
  };
}

/**
 * Găsește alimentarea cu data cel mai apropiată de o dată țintă.
 * Folosit pentru a determina odometrul de start/end al perioadei filtrate.
 *
 * @param {object[]} rows       - Alimentări sortate ascending
 * @param {string}   targetDate - Data țintă "YYYY-MM-DD"
 * @returns {object} Alimentarea cea mai apropiată
 */
function closestFuelByDate(rows, targetDate) {
  const target = dateToTime(targetDate);
  return rows.reduce((closest, row) => {
    const curr = Math.abs(dateToTime(row.date) - target);
    const best = Math.abs(dateToTime(closest.date) - target);
    return curr < best ? row : closest;
  }, rows[0]);
}


// ══════════════════════════════════════════════════════════════════════════════
// 17. FUNCȚII UTILITARE
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Convertește un string de dată "YYYY-MM-DD" în timestamp Unix (ms).
 * Adaugă "T00:00:00" pentru a forța timezone-ul local (fără asta,
 * `new Date("YYYY-MM-DD")` returnează miezul nopții UTC, nu local).
 *
 * @param {string} value
 * @returns {number} Timestamp sau 0 dacă data e invalidă
 */
function dateToTime(value) {
  const time = new Date(`${value}T00:00:00`).getTime();
  return Number.isFinite(time) ? time : 0;
}

/**
 * Parsează un string numeric dintr-un câmp de formular.
 * Acceptă virgula ca separator zecimal (ro-RO convention).
 * String gol, null, undefined → null.
 *
 * @param {string|null|undefined} value
 * @returns {number|null}
 */
function parseFormNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

/**
 * Formatează un număr ca string simplu (fără separator de mii).
 * Folosit pentru a seta valorile câmpurilor de formular (nu pentru display).
 *
 * @param {*}      value
 * @param {number} decimals - Numărul de zecimale (default 2)
 * @returns {string}
 */
function formatPlainNumber(value, decimals = 2) {
  return String(
    Math.round(Number(value || 0) * (10 ** decimals)) / (10 ** decimals)
  );
}

/**
 * Sumează valorile unui câmp numeric dintr-un array de obiecte.
 * Tratează valorile lipsă/null ca 0.
 *
 * @param {object[]} rows - Array de obiecte
 * @param {string}   key  - Numele câmpului de sumat
 * @returns {number}
 */
function sum(rows, key) {
  return rows.reduce((total, row) => total + Number(row[key] || 0), 0);
}

/**
 * Returnează valoarea maximă dintr-un array de valori numerice.
 * Ignoră valorile non-finite (null, undefined, NaN, Infinity).
 * Returnează 0 dacă array-ul e gol sau fără valori finite.
 *
 * @param {*[]} values
 * @returns {number}
 */
function max(values) {
  return values
    .filter((value) => Number.isFinite(Number(value)))
    .reduce((current, value) => Math.max(current, Number(value)), 0);
}

/**
 * Comparator pentru sortare ASCENDENTĂ după câmpul `date` (string ISO).
 * Folosit cu Array.sort() pentru sortare cronologică.
 *
 * @param {{ date?: string }} a
 * @param {{ date?: string }} b
 * @returns {number}
 */
function ascDate(a, b) {
  return String(a.date || "").localeCompare(String(b.date || ""));
}

/**
 * Comparator pentru sortare DESCENDENTĂ după `date`.
 * Folosit cu Array.sort() pentru a afișa cele mai recente prima.
 *
 * @param {{ date?: string }} a
 * @param {{ date?: string }} b
 * @returns {number}
 */
function descDate(a, b) {
  return String(b.date || "").localeCompare(String(a.date || ""));
}

/**
 * Formatează o sumă monetară: număr rotund + " lei".
 * Folosește Intl.NumberFormat cu locale ro-RO (separator mii = ".")
 * Exemplu: 12450 → "12.450 lei"
 *
 * @param {*} value
 * @returns {string}
 */
function formatMoney(value) {
  return `${formatNumber(value, 0)} lei`;
}

/**
 * Formatează un număr cu separatoare de mii conform locale-ului ro-RO.
 * Exemplu: 12450.5 cu decimals=2 → "12.450,50"
 *
 * @param {*}      value
 * @param {number} decimals - Min și max zecimale (default 0)
 * @returns {string}
 */
function formatNumber(value, decimals = 0) {
  const number = Number(value || 0);
  return new Intl.NumberFormat("ro-RO", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals
  }).format(number);
}

/**
 * Formatează o dată ISO "YYYY-MM-DD" în formatul românesc "DD.MM.YYYY".
 * Returnează string-ul original dacă parsarea eșuează.
 * Returnează "" dacă value e null/undefined/gol.
 *
 * @param {string} value - Data în format "YYYY-MM-DD"
 * @returns {string}
 */
function formatDate(value) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value; // dată invalidă → returnăm as-is
  return date.toLocaleDateString("ro-RO");
}

/**
 * Returnează doar luna și ziua dintr-o dată ISO ("YYYY-MM-DD" → "MM-DD").
 * Folosit pentru etichetele axei X din graficele line chart.
 *
 * @param {string} value
 * @returns {string}
 */
function shortDate(value) {
  return value ? value.slice(5) : ""; // "2024-03-15" → "03-15"
}

/**
 * Escape-uiește caracterele speciale HTML pentru a preveni XSS.
 * Apelat pe orice valoare text înainte de a fi injectată ca innerHTML.
 *
 * Caracterele escapate: & < > " '
 *
 * @param {*} value - Orice valoare (convertită la string)
 * @returns {string} String-ul safe pentru HTML
 */
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&":  "&amp;",
    "<":  "&lt;",
    ">":  "&gt;",
    '"':  "&quot;",
    "'":  "&#039;"
  })[char]);
}

/**
 * Afișează o notificare temporară în colțul din dreapta-jos.
 * Animată via CSS (clasa .show adaugă opacity + transform).
 * Dispare automat după 2600ms.
 *
 * Apeluri consecutive resetează timer-ul (nu se acumulează).
 * Folosit pentru confirmare operații: "Salvat", "Șters", erori.
 *
 * @param {string} message - Textul notificării
 */
function toast(message) {
  const element = document.getElementById("toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toast.timer); // anulăm dispariția anterioară dacă era în curs
  toast.timer = setTimeout(() => element.classList.remove("show"), 2600);
}
