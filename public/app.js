const state = {
  expenses: [],
  fuel: [],
  meta: {},
  view: "dashboard",
  filters: {
    start: "",
    end: "",
    category: "",
    search: ""
  }
};

const categoryColors = {
  "Acte": "#2f7fb8",
  "Piese + scule": "#c49a2f",
  "Consumabile + diverse": "#3a9b74",
  "Manopera": "#8a65b8",
  "Combustibil": "#d0673f",
  "Întreținere": "#c49a2f",
  "Consumabile": "#3a9b74",
  "Consum mediu": "#9b6b42",
  "Cost/km": "#5968b3"
};

// Titlurile și subtitlurile sunt ținute centralizat ca schimbarea unei pagini
// să nu ceară căutări prin HTML. Cheia trebuie să corespundă cu data-view.
const titles = {
  dashboard: ["Dashboard", "Privire rapidă peste costuri, consum și kilometri."],
  fuel: ["Combustibil", "Alimentări, costuri, litri, kilometri și consum calculat automat."],
  expenses: ["Cheltuieli", "Acte, piese, consumabile, manoperă și alte costuri."],
  edit: ["Adaugă / Editează", "Introdu date noi sau modifică înregistrări existente."],
  backup: ["Backup / Restore", "Salvează sau încarcă baza JSON a aplicației."]
};

// Fiecare grafic canvas își înregistrează aici zonele sensibile la hover.
// Astfel tooltip-ul poate fi calculat fără biblioteci externe de grafice.
const chartRegions = new Map();

document.addEventListener("DOMContentLoaded", () => {
  applyTheme(localStorage.getItem("carDashboardTheme") || "light");
  populateYearFilters();
  bindEvents();
  loadData();
});

async function loadData() {
  const response = await fetch("api/data");
  const data = await response.json();
  state.expenses = data.expenses || [];
  state.fuel = data.fuel || [];
  state.meta = data.meta || {};
  render();
}

function bindEvents() {
  // Navigația este controlată prin data-view; fiecare buton activează secțiunea
  // cu id-ul format din numele view-ului plus sufixul "View".
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });

  // Filtrele sunt globale pentru dashboard, combustibil și cheltuieli.
  // Pe paginile administrative sunt ascunse, dar valorile rămân păstrate.
  ["filterStart", "filterEnd", "filterCategory", "filterSearch"].forEach((id) => {
    document.getElementById(id).addEventListener("input", updateFilters);
  });
  document.getElementById("clearFilters").addEventListener("click", clearFilters);
  document.querySelectorAll("[data-open-form]").forEach((button) => {
    button.addEventListener("click", () => {
      resetForm(button.dataset.openForm === "fuel" ? "fuelForm" : "expenseForm");
      switchView("edit");
    });
  });

  document.getElementById("expenseForm").addEventListener("submit", saveExpense);
  document.getElementById("fuelForm").addEventListener("submit", saveFuel);
  ["date", "liters", "odometerKm"].forEach((name) => {
    document.getElementById("fuelForm").elements[name].addEventListener("input", updateFuelDerivedFields);
  });
  document.getElementById("fuelForm").elements.kmSinceLastFill.addEventListener("input", (event) => {
    delete event.currentTarget.dataset.auto;
    updateFuelDerivedFields();
  });
  document.getElementById("fuelForm").elements.consumptionPer100Km.addEventListener("input", (event) => {
    delete event.currentTarget.dataset.auto;
  });
  document.getElementById("resetExpense").addEventListener("click", () => resetForm("expenseForm"));
  document.getElementById("resetFuel").addEventListener("click", () => resetForm("fuelForm"));
  document.getElementById("downloadBackup").addEventListener("click", downloadBackup);
  document.getElementById("restoreBackup").addEventListener("click", restoreBackup);
  document.getElementById("themeToggle").addEventListener("click", toggleTheme);
  document.getElementById("readmeTrigger").addEventListener("click", openReadme);
  document.getElementById("readmeClose").addEventListener("click", closeReadme);
  document.getElementById("readmeBackdrop").addEventListener("click", closeReadme);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeReadme();
  });
  bindChartTooltips();
}

function populateYearFilters() {
  const options = [`<option value="">Toți anii</option>`];
  for (let year = 2021; year <= 2035; year += 1) {
    options.push(`<option value="${year}">${year}</option>`);
  }
  document.getElementById("filterStart").innerHTML = options.join("");
  document.getElementById("filterEnd").innerHTML = options.join("");
}

function toggleTheme() {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(nextTheme);
  localStorage.setItem("carDashboardTheme", nextTheme);
  drawCharts();
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === "dark" ? "dark" : "light";
}

function switchView(view) {
  // Sincronizează meniul, secțiunea vizibilă, titlul paginii și vizibilitatea filtrelor.
  state.view = view;
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  document.querySelectorAll(".view").forEach((section) => {
    section.classList.toggle("active", section.id === `${view}View`);
  });
  document.querySelector(".filters").classList.toggle("hidden", !["dashboard", "fuel", "expenses"].includes(view));
  document.getElementById("pageTitle").textContent = titles[view][0];
  document.getElementById("pageSubtitle").textContent = titles[view][1];
  if (view === "dashboard") setTimeout(drawCharts, 30);
  renderHeaderBadge();
}

function updateFilters() {
  state.filters.start = document.getElementById("filterStart").value;
  state.filters.end = document.getElementById("filterEnd").value;
  state.filters.category = document.getElementById("filterCategory").value;
  state.filters.search = document.getElementById("filterSearch").value.trim().toLowerCase();
  render();
}

function clearFilters() {
  document.getElementById("filterStart").value = "";
  document.getElementById("filterEnd").value = "";
  document.getElementById("filterCategory").value = "";
  document.getElementById("filterSearch").value = "";
  updateFilters();
}

function filteredExpenses() {
  return state.expenses.filter((row) => matchesDate(row.date) && matchesCategory(row.category) && matchesSearch([row.category, row.product, row.type, row.notes]));
}

function filteredFuel() {
  return state.fuel.filter((row) => matchesDate(row.date) && matchesCategory("Combustibil") && matchesSearch([row.station, row.notes]));
}

function matchesDate(date) {
  const range = selectedDateRange();
  if (range.start && date < range.start) return false;
  if (range.end && date > range.end) return false;
  return true;
}

function selectedDateRange() {
  let startYear = Number(state.filters.start) || null;
  let endYear = Number(state.filters.end) || null;
  if (startYear && endYear && startYear > endYear) {
    [startYear, endYear] = [endYear, startYear];
  }
  return {
    start: startYear ? `${startYear}-01-01` : "",
    end: endYear ? `${endYear}-12-31` : "",
    hasYearFilter: Boolean(startYear || endYear)
  };
}

function matchesCategory(category) {
  return !state.filters.category || category === state.filters.category;
}

function matchesSearch(values) {
  if (!state.filters.search) return true;
  return values.some((value) => String(value || "").toLowerCase().includes(state.filters.search));
}

function render() {
  renderMeta();
  renderCategoryOptions();
  renderDashboard();
  renderHeaderBadge();
  renderFuelTable();
  renderExpenseTable();
}

function renderMeta() {
  document.getElementById("carName").textContent = state.meta.car || "Hyundai i20";
}

function renderCategoryOptions() {
  const categories = [...new Set([...state.expenses.map((row) => row.category).filter((item) => item && item !== "Masina"), "Combustibil"])].sort();
  const filter = document.getElementById("filterCategory");
  const current = filter.value;
  filter.innerHTML = `<option value="">Toate</option>${categories.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join("")}`;
  filter.value = current;
  document.getElementById("categoryList").innerHTML = categories.map((item) => `<option value="${escapeHtml(item)}"></option>`).join("");
}

function renderDashboard() {
  // KPI-urile respectă filtrele curente, cu excepția totalului din sidebar.
  // Totalul din sidebar este întotdeauna calculat pe toată baza de date.
  const expenses = filteredExpenses();
  const fuel = filteredFuel();
  const allCosts = [...expenses.map(toCostRow), ...fuel.map(toFuelCostRow)];
  const totalAll = sum(state.expenses, "costLei") + sum(state.fuel, "costLei");
  const totalExpenses = sum(expenses, "costLei") + sum(fuel, "costLei");
  const totalFuel = sum(fuel, "costLei");
  const latestKm = max(state.fuel.map((row) => row.odometerKm));
  const kmStats = periodKilometerStats(state.fuel);
  const periodKm = kmStats.distanceKm;
  const fuelLiters = sum(fuel, "liters");
  const avgConsumption = kmStats.hasYearFilter && periodKm && fuelLiters
    ? (fuelLiters / periodKm) * 100
    : weightedAverageConsumption(fuel);
  const costPerKm = periodKm ? totalExpenses / periodKm : 0;
  const consumptionNote = kmStats.hasYearFilter
    ? `km perioadă: ${formatNumber(periodKm, 0)}`
    : `km actuali: ${formatNumber(latestKm, 0)}`;

  const cards = [
    ["Acte", formatMoney(sum(expenses.filter((row) => row.category === "Acte"), "costLei")), "RCA, viniete, ITP, revizii", "Acte"],
    ["Întreținere", formatMoney(sum(expenses.filter((row) => ["Piese + scule", "Manopera"].includes(row.category)), "costLei")), "piese, scule și manoperă", "Întreținere"],
    ["Consumabile", formatMoney(sum(expenses.filter((row) => row.category === "Consumabile + diverse"), "costLei")), "curățare și diverse", "Consumabile"],
    ["Combustibil", formatMoney(totalFuel), `${fuel.length} alimentări`, "Combustibil"],
    ["Consum mediu", `${formatNumber(avgConsumption, 2)} l/100`, consumptionNote, "Consum mediu"],
    ["Cost/km", `${formatNumber(costPerKm, 2)} lei`, `${formatNumber(periodKm, 0)} km parcurși`, "Cost/km"]
  ];

  document.getElementById("kpiGrid").innerHTML = cards.map(([label, value, note, colorKey]) => `
    <article class="kpi-card" style="--card-accent: ${categoryColor(colorKey)}">
      <span>${label}</span>
      <strong>${value}</strong>
      <small>${note}</small>
    </article>
  `).join("");
  document.getElementById("sideTotal").textContent = formatMoney(totalAll);
  document.getElementById("sideUpdated").textContent = `ultima actualizare: ${formatDate(latestRecordDate()) || "-"}`;
  renderRecent("recentExpenses", expenses.slice().sort(descDate).slice(0, 8), (row) => `
    <td>${formatDate(row.date)}</td><td>${escapeHtml(row.category)}</td><td>${escapeHtml(row.product)}</td><td class="number">${formatMoney(row.costLei)}</td>
  `);
  renderRecent("recentFuel", fuel.slice().sort(descDate).slice(0, 8), (row) => `
    <td>${formatDate(row.date)}</td><td>${escapeHtml(row.station)}</td><td class="number">${formatNumber(row.liters, 1)}</td><td class="number">${formatNumber(row.consumptionPer100Km, 2)}</td>
  `);
  setTimeout(drawCharts, 30);
}

function renderHeaderBadge() {
  const badge = document.getElementById("kmBadge");
  const fuelBadge = document.getElementById("fuelLitersBadge");
  const latestKm = max(state.fuel.map((row) => row.odometerKm));
  badge.classList.toggle("hidden", state.view !== "dashboard");
  badge.querySelector("strong").textContent = formatNumber(latestKm, 0);
  fuelBadge.classList.toggle("hidden", state.view !== "fuel");
  fuelBadge.querySelector("strong").textContent = formatNumber(sum(filteredFuel(), "liters"), 0);
}

function latestRecordDate() {
  return [...state.expenses, ...state.fuel]
    .map((row) => row.date)
    .filter(Boolean)
    .sort()
    .pop() || "";
}

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
      <td><div class="row-actions"><button class="row-button" title="Editează" onclick="editFuel('${row.id}')">✎</button><button class="row-button danger" title="Șterge" onclick="deleteFuel('${row.id}')">×</button></div></td>
    </tr>
  `).join("");
}

function renderExpenseTable() {
  const rows = filteredExpenses().slice().sort(descDate);
  document.getElementById("expenseTable").innerHTML = rows.map((row) => `
    <tr>
      <td>${formatDate(row.date)}</td>
      <td>${escapeHtml(row.category)}</td>
      <td>${escapeHtml(row.product)}</td>
      <td>${escapeHtml(row.type)}</td>
      <td class="number">${formatMoney(row.costLei)}</td>
      <td><div class="row-actions"><button class="row-button" title="Editează" onclick="editExpense('${row.id}')">✎</button><button class="row-button danger" title="Șterge" onclick="deleteExpense('${row.id}')">×</button></div></td>
    </tr>
  `).join("");
}

function renderRecent(target, rows, template) {
  document.getElementById(target).innerHTML = rows.map((row) => `<tr>${template(row)}</tr>`).join("");
}

function drawCharts() {
  // Graficele sunt redesenate după fiecare schimbare de date sau filtre.
  // Nu folosim o bibliotecă externă, ca aplicația să rămână complet locală.
  if (state.view !== "dashboard") return;
  const expenses = filteredExpenses();
  const fuel = filteredFuel();
  const costs = [...expenses.map(toCostRow), ...fuel.map(toFuelCostRow)];
  drawBarChart("monthlyChart", groupByMonth(costs), themeColor("--chart-bars"));
  drawDonutChart("categoryChart", groupByCategory(expenses, fuel));
  drawLineChart("consumptionChart", fuel.filter((row) => row.consumptionPer100Km > 0).sort(ascDate).map((row) => ({ label: shortDate(row.date), date: row.date, value: row.consumptionPer100Km })), themeColor("--chart-consumption"));
  drawLineChart("priceChart", fuel.filter((row) => row.priceLeiPerLiter > 0).sort(ascDate).map((row) => ({ label: shortDate(row.date), date: row.date, value: row.priceLeiPerLiter })), themeColor("--chart-price"));
}

function drawBarChart(id, data, color) {
  const canvas = setupCanvas(id);
  const ctx = canvas.getContext("2d");
  clearCanvas(ctx, canvas);
  chartRegions.set(id, []);
  if (!data.length) return drawEmpty(ctx, canvas);
  const pad = 42;
  const bottomPad = 48;
  const maxValue = Math.max(...data.map((item) => item.value), 1);
  const width = (canvas.width - pad * 2) / data.length;
  const labelStep = Math.max(1, Math.ceil(data.length / 14));
  drawAxis(ctx, canvas, pad, bottomPad);
  data.forEach((item, index) => {
    const barHeight = ((canvas.height - pad - bottomPad) * item.value) / maxValue;
    const x = pad + index * width + width * 0.18;
    const y = canvas.height - bottomPad - barHeight;
    ctx.fillStyle = color;
    const barWidth = Math.max(8, width * 0.64);
    ctx.fillRect(x, y, barWidth, barHeight);
    chartRegions.get(id).push({ type: "rect", x, y, width: barWidth, height: barHeight, title: item.label, value: formatMoney(item.value) });
    if (index % labelStep === 0 || index === data.length - 1) {
      ctx.fillStyle = themeColor("--canvas-muted");
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(item.label, x + barWidth / 2, canvas.height - 18);
    }
  });
  ctx.textAlign = "left";
}

function drawLineChart(id, data, color) {
  const canvas = setupCanvas(id);
  const ctx = canvas.getContext("2d");
  clearCanvas(ctx, canvas);
  chartRegions.set(id, []);
  if (data.length < 2) return drawEmpty(ctx, canvas);
  const pad = 36;
  const leftPad = 54;
  const bottomPad = 36;
  const topPad = 18;
  const decimals = id === "priceChart" ? 2 : 1;
  const values = data.map((item) => item.value);
  const min = Math.min(...values);
  const maxValue = Math.max(...values);
  const axisConfig = getLineAxisConfig(id, min, maxValue);
  const axisMin = axisConfig.min;
  const axisMax = axisConfig.max;
  const range = axisMax - axisMin || 1;
  drawAxis(ctx, canvas, leftPad, bottomPad);
  drawYAxisLabels(ctx, canvas, axisConfig.ticks, leftPad, topPad, bottomPad, decimals);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  data.forEach((item, index) => {
    const x = leftPad + ((canvas.width - leftPad - pad) * index) / (data.length - 1);
    const y = canvas.height - bottomPad - ((canvas.height - topPad - bottomPad) * (item.value - axisMin)) / range;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  data.forEach((item, index) => {
    const x = leftPad + ((canvas.width - leftPad - pad) * index) / (data.length - 1);
    const y = canvas.height - bottomPad - ((canvas.height - topPad - bottomPad) * (item.value - axisMin)) / range;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
    chartRegions.get(id).push({ type: "circle", x, y, radius: 9, title: formatDate(item.date || item.label), value: formatNumber(item.value, 2) });
  });
}

function getLineAxisConfig(id, min, maxValue) {
  if (id === "priceChart") {
    return { min: 5, max: 10, ticks: createTicks(5, 10, 0.5) };
  }
  if (id === "consumptionChart") {
    return { min: 3, max: 11, ticks: createTicks(3, 11, 2) };
  }
  return { min, max: maxValue, ticks: createTicks(min, maxValue, (maxValue - min || 1) / 4) };
}

function createTicks(start, end, step) {
  const ticks = [];
  for (let value = start; value <= end + step / 10; value += step) {
    ticks.push(Math.round(value * 100) / 100);
  }
  return ticks;
}

function drawYAxisLabels(ctx, canvas, ticks, leftPad, topPad, bottomPad, decimals) {
  const min = ticks[0];
  const maxValue = ticks[ticks.length - 1];
  const range = maxValue - min || 1;
  ctx.save();
  ctx.font = "11px sans-serif";
  ctx.fillStyle = themeColor("--canvas-muted");
  ctx.strokeStyle = themeColor("--canvas-grid");
  ctx.lineWidth = 1;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (const value of ticks) {
    const y = canvas.height - bottomPad - ((canvas.height - topPad - bottomPad) * (value - min)) / range;
    ctx.beginPath();
    ctx.moveTo(leftPad, y);
    ctx.lineTo(canvas.width - 12, y);
    ctx.stroke();
    ctx.fillText(formatNumber(value, decimals), leftPad - 8, y);
  }
  ctx.restore();
}

function drawDonutChart(id, data) {
  const canvas = setupCanvas(id);
  const ctx = canvas.getContext("2d");
  clearCanvas(ctx, canvas);
  chartRegions.set(id, []);
  if (!data.length) return drawEmpty(ctx, canvas);
  const total = sum(data, "value");
  const cx = canvas.width / 2 + 100;
  const cy = canvas.height / 2 - 2;
  const radius = Math.min(canvas.width, canvas.height) / 2.1;
  let angle = -Math.PI / 2;
  data.forEach((item, index) => {
    const slice = (item.value / total) * Math.PI * 2;
    const startAngle = angle;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, angle, angle + slice);
    ctx.closePath();
    ctx.fillStyle = categoryColor(item.label, index);
    ctx.fill();
    chartRegions.get(id).push({
      type: "slice",
      cx,
      cy,
      innerRadius: radius * 0.55,
      outerRadius: radius,
      startAngle,
      endAngle: angle + slice,
      title: item.label,
      value: `${formatMoney(item.value)} · ${formatNumber((item.value / total) * 100, 1)}%`
    });
    angle += slice;
  });
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#1b2623";
  ctx.font = "12px sans-serif";
  data.slice(0, 5).forEach((item, index) => {
    const percent = total ? (item.value / total) * 100 : 0;
    const y = canvas.height - 72 + index * 14;
    ctx.fillStyle = categoryColor(item.label, index);
    ctx.fillRect(12, y, 9, 9);
    ctx.fillStyle = themeColor("--canvas-ink");
    ctx.textAlign = "left";
    const labelX = 30;
    const valueX = 220;
    const percentX = 280;
    ctx.fillText(item.label, labelX, y + 9);
    ctx.textAlign = "right";
    ctx.fillText(formatMoney(item.value), valueX, y + 9);
    ctx.fillText(`${formatNumber(percent, 1)}%`, percentX, y + 9);
  });
  ctx.textAlign = "left";
}

function bindChartTooltips() {
  document.querySelectorAll("canvas").forEach((canvas) => {
    canvas.addEventListener("mousemove", (event) => showChartTooltip(event, canvas));
    canvas.addEventListener("mouseleave", hideChartTooltip);
  });
}

function showChartTooltip(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const hit = (chartRegions.get(canvas.id) || []).find((region) => isChartHit(region, x, y));
  const tooltip = document.getElementById("chartTooltip");
  if (!hit) return hideChartTooltip();
  tooltip.innerHTML = `<strong>${escapeHtml(hit.title)}</strong><span>${escapeHtml(hit.value)}</span>`;
  tooltip.style.left = `${event.clientX + 14}px`;
  tooltip.style.top = `${event.clientY + 14}px`;
  tooltip.classList.add("show");
}

function hideChartTooltip() {
  document.getElementById("chartTooltip").classList.remove("show");
}

function isChartHit(region, x, y) {
  if (region.type === "rect") {
    return x >= region.x && x <= region.x + region.width && y >= region.y && y <= region.y + region.height;
  }
  if (region.type === "circle") {
    return Math.hypot(x - region.x, y - region.y) <= region.radius;
  }
  if (region.type === "slice") {
    const dx = x - region.cx;
    const dy = y - region.cy;
    const distance = Math.hypot(dx, dy);
    if (distance < region.innerRadius || distance > region.outerRadius) return false;
    let angle = Math.atan2(dy, dx);
    if (angle < -Math.PI / 2) angle += Math.PI * 2;
    return angle >= region.startAngle && angle <= region.endAngle;
  }
  return false;
}

function setupCanvas(id) {
  const canvas = document.getElementById(id);
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.max(320, Math.floor(rect.width * scale));
  canvas.height = Math.floor(Number(canvas.getAttribute("height")) * scale);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  canvas.width = Math.max(320, Math.floor(rect.width));
  canvas.height = Number(canvas.getAttribute("height"));
  return canvas;
}

function clearCanvas(ctx, canvas) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function drawAxis(ctx, canvas, pad, bottomPad = pad) {
  ctx.strokeStyle = themeColor("--canvas-axis");
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, 16);
  ctx.lineTo(pad, canvas.height - bottomPad);
  ctx.lineTo(canvas.width - 12, canvas.height - bottomPad);
  ctx.stroke();
}

function drawEmpty(ctx, canvas) {
  ctx.fillStyle = themeColor("--canvas-muted");
  ctx.font = "14px sans-serif";
  ctx.fillText("Nu există date pentru filtrul curent.", 18, 36);
}

async function saveExpense(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = formToObject(form);
  const id = payload.id;
  const response = await fetch(id ? `api/expenses/${encodeURIComponent(id)}` : "api/expenses", {
    method: id ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) return toast("Cheltuiala nu a putut fi salvată.");
  resetForm("expenseForm");
  toast("Cheltuială salvată.");
  await loadData();
}

async function saveFuel(event) {
  event.preventDefault();
  const form = event.currentTarget;
  updateFuelDerivedFields();
  const payload = formToObject(form);
  const id = payload.id;
  const response = await fetch(id ? `api/fuel/${encodeURIComponent(id)}` : "api/fuel", {
    method: id ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) return toast("Alimentarea nu a putut fi salvată.");
  resetForm("fuelForm");
  toast("Alimentare salvată.");
  await loadData();
}

window.editExpense = function editExpense(id) {
  const row = state.expenses.find((item) => item.id === id);
  if (!row) return;
  fillForm("expenseForm", row);
  document.getElementById("expenseFormTitle").textContent = "Editează cheltuiala";
  switchView("edit");
};

window.editFuel = function editFuel(id) {
  const row = state.fuel.find((item) => item.id === id);
  if (!row) return;
  fillForm("fuelForm", row);
  document.getElementById("fuelFormTitle").textContent = "Editează alimentare";
  switchView("edit");
};

window.deleteExpense = async function deleteExpense(id) {
  if (!confirm("Ștergi această cheltuială?")) return;
  await fetch(`api/expenses/${encodeURIComponent(id)}`, { method: "DELETE" });
  toast("Cheltuială ștearsă.");
  loadData();
};

window.deleteFuel = async function deleteFuel(id) {
  if (!confirm("Ștergi această alimentare?")) return;
  await fetch(`api/fuel/${encodeURIComponent(id)}`, { method: "DELETE" });
  toast("Alimentare ștearsă.");
  loadData();
};

async function downloadBackup() {
  // Endpoint-ul dedicat este preferat, dar există fallback către api/data
  // pentru cazul în care serverul nu a fost repornit după un update de cod.
  const response = await fetch("api/backup");
  const backup = response.ok
    ? await response.json()
    : { version: 1, exportedAt: new Date().toISOString(), ...(await (await fetch("api/data")).json()) };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `backup-cheltuieli-auto-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  toast("Backup descărcat.");
}

async function restoreBackup() {
  const input = document.getElementById("restoreFile");
  const file = input.files[0];
  if (!file) return toast("Alege un fișier JSON.");
  if (!confirm("Datele curente vor fi înlocuite cu backup-ul selectat.")) return;
  try {
    const payload = JSON.parse(await file.text());
    const response = await fetch("api/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) await restoreWithExistingApi(payload);
    toast("Backup încărcat.");
    await loadData();
    switchView("dashboard");
  } catch (error) {
    toast(error.message);
  }
}

async function openReadme() {
  const modal = document.getElementById("readmeModal");
  const content = document.getElementById("readmeContent");
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
  if (!content.dataset.loaded) {
    try {
      const markdown = await (await fetch("readme.md")).text();
      content.innerHTML = renderMarkdown(markdown);
      content.dataset.loaded = "true";
    } catch {
      content.innerHTML = "<p>Documentația nu a putut fi încărcată.</p>";
    }
  }
}

function closeReadme() {
  const modal = document.getElementById("readmeModal");
  modal.classList.remove("show");
  modal.setAttribute("aria-hidden", "true");
}

function renderMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/);
  const html = [];
  let inList = false;
  let inCode = false;
  let codeLines = [];
  const closeList = () => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  };

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCode) {
        html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = [];
        inCode = false;
      } else {
        closeList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }
    if (line.startsWith("# ")) {
      closeList();
      html.push(`<h1>${formatInline(line.slice(2))}</h1>`);
    } else if (line.startsWith("## ")) {
      closeList();
      html.push(`<h2>${formatInline(line.slice(3))}</h2>`);
    } else if (line.startsWith("- ")) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${formatInline(line.slice(2))}</li>`);
    } else if (line.trim()) {
      closeList();
      html.push(`<p>${formatInline(line)}</p>`);
    } else {
      closeList();
    }
  }
  closeList();
  return html.join("");
}

function formatInline(text) {
  return escapeHtml(text).replace(/`([^`]+)`/g, "<code>$1</code>");
}

async function restoreWithExistingApi(payload) {
  if (!Array.isArray(payload.expenses) || !Array.isArray(payload.fuel)) {
    throw new Error("Fișierul nu conține un backup valid.");
  }
  const current = await (await fetch("api/data")).json();
  await Promise.all((current.expenses || []).map((row) => fetch(`api/expenses/${encodeURIComponent(row.id)}`, { method: "DELETE" })));
  await Promise.all((current.fuel || []).map((row) => fetch(`api/fuel/${encodeURIComponent(row.id)}`, { method: "DELETE" })));
  for (const row of payload.expenses) {
    await fetch("api/expenses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(row) });
  }
  for (const row of payload.fuel) {
    await fetch("api/fuel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(row) });
  }
}

function formToObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function fillForm(id, row) {
  const form = document.getElementById(id);
  if (id === "fuelForm") clearFuelAutoFlags(form);
  Object.entries(row).forEach(([key, value]) => {
    const input = form.elements[key];
    if (input) input.value = value ?? "";
  });
  if (id === "fuelForm") updateFuelDerivedFields();
}

function resetForm(id) {
  const form = document.getElementById(id);
  form.reset();
  form.elements.id.value = "";
  if (id === "expenseForm") document.getElementById("expenseFormTitle").textContent = "Cheltuială";
  if (id === "fuelForm") {
    clearFuelAutoFlags(form);
    document.getElementById("fuelFormTitle").textContent = "Alimentare";
  }
}

function clearFuelAutoFlags(form) {
  delete form.elements.kmSinceLastFill.dataset.auto;
  delete form.elements.consumptionPer100Km.dataset.auto;
}

function updateFuelDerivedFields() {
  const form = document.getElementById("fuelForm");
  const id = form.elements.id.value;
  const date = form.elements.date.value;
  const odometer = parseFormNumber(form.elements.odometerKm.value);
  const liters = parseFormNumber(form.elements.liters.value);
  const kmInput = form.elements.kmSinceLastFill;
  const consumptionInput = form.elements.consumptionPer100Km;
  let km = parseFormNumber(kmInput.value);

  if ((!km || km <= 0 || kmInput.dataset.auto === "true") && odometer && date) {
    const previous = previousFuelFor(date, id);
    if (previous) {
      const computedKm = odometer - Number(previous.odometerKm || 0);
      if (computedKm > 0) {
        km = Math.round(computedKm);
        kmInput.value = km;
        kmInput.dataset.auto = "true";
      }
    }
  }

  const consumption = parseFormNumber(consumptionInput.value);
  if ((!consumption || consumption <= 0 || consumptionInput.dataset.auto === "true") && liters && km && km > 0) {
    consumptionInput.value = formatPlainNumber((liters / km) * 100, 2);
    consumptionInput.dataset.auto = "true";
  }
}

function previousFuelFor(date, currentId) {
  const currentTime = dateToTime(date);
  return state.fuel
    .filter((row) => row.id !== currentId && row.date && row.odometerKm > 0 && dateToTime(row.date) < currentTime)
    .slice()
    .sort(descDate)[0];
}

function toCostRow(row) {
  return { date: row.date, category: row.category, value: Number(row.costLei || 0) };
}

function toFuelCostRow(row) {
  return { date: row.date, category: "Combustibil", value: Number(row.costLei || 0) };
}

function groupByMonth(rows) {
  const grouped = new Map();
  rows.forEach((row) => {
    if (!row.date) return;
    const key = row.date.slice(0, 7);
    grouped.set(key, (grouped.get(key) || 0) + Number(row.value || 0));
  });
  return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([label, value]) => ({ label, value }));
}

function groupByCategory(expenses, fuel) {
  const grouped = new Map();
  expenses.forEach((row) => grouped.set(row.category, (grouped.get(row.category) || 0) + Number(row.costLei || 0)));
  grouped.set("Combustibil", sum(fuel, "costLei"));
  return [...grouped.entries()].filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
}

function categoryColor(label, fallbackIndex = 0) {
  const fallback = ["#2f7fb8", "#d0673f", "#c49a2f", "#3a9b74", "#8a65b8", "#5968b3"];
  return categoryColors[label] || fallback[fallbackIndex % fallback.length];
}

function themeColor(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function weightedAverageConsumption(fuel) {
  const valid = fuel.filter((row) => row.liters > 0 && row.kmSinceLastFill > 0);
  const liters = sum(valid, "liters");
  const km = sum(valid, "kmSinceLastFill");
  return km ? (liters / km) * 100 : 0;
}

function periodKilometerStats(fuel) {
  const range = selectedDateRange();
  const rows = fuel
    .filter((row) => row.date && Number.isFinite(Number(row.odometerKm)))
    .slice()
    .sort(ascDate);

  if (!rows.length) {
    return { distanceKm: 0, hasYearFilter: range.hasYearFilter };
  }

  const startRow = range.start ? closestFuelByDate(rows, range.start) : rows[0];
  const endRow = range.end ? closestFuelByDate(rows, range.end) : rows[rows.length - 1];
  const startKm = Number(startRow?.odometerKm || 0);
  const endKm = Number(endRow?.odometerKm || 0);

  return {
    distanceKm: Math.max(0, endKm - startKm),
    startKm,
    endKm,
    hasYearFilter: range.hasYearFilter
  };
}

function closestFuelByDate(rows, targetDate) {
  const target = dateToTime(targetDate);
  return rows.reduce((closest, row) => {
    const currentDistance = Math.abs(dateToTime(row.date) - target);
    const closestDistance = Math.abs(dateToTime(closest.date) - target);
    return currentDistance < closestDistance ? row : closest;
  }, rows[0]);
}

function dateToTime(value) {
  const time = new Date(`${value}T00:00:00`).getTime();
  return Number.isFinite(time) ? time : 0;
}

function parseFormNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

function formatPlainNumber(value, decimals = 2) {
  return String(Math.round(Number(value || 0) * (10 ** decimals)) / (10 ** decimals));
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + Number(row[key] || 0), 0);
}

function max(values) {
  return values.filter((value) => Number.isFinite(Number(value))).reduce((current, value) => Math.max(current, Number(value)), 0);
}

function ascDate(a, b) {
  return String(a.date || "").localeCompare(String(b.date || ""));
}

function descDate(a, b) {
  return String(b.date || "").localeCompare(String(a.date || ""));
}

function formatMoney(value) {
  return `${formatNumber(value, 0)} lei`;
}

function formatNumber(value, decimals = 0) {
  const number = Number(value || 0);
  return new Intl.NumberFormat("ro-RO", { maximumFractionDigits: decimals, minimumFractionDigits: decimals }).format(number);
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ro-RO");
}

function shortDate(value) {
  return value ? value.slice(5) : "";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function toast(message) {
  const element = document.getElementById("toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("show"), 2600);
}
