const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const publicDir = path.join(root, "public");
const bundledDataDir = path.join(root, "data");
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : bundledDataDir;
const preferredPort = Number(process.env.PORT || 3000);

const dataFiles = {
  expenses: path.join(dataDir, "expenses.json"),
  fuel: path.join(dataDir, "fuel.json"),
  meta: path.join(dataDir, "meta.json")
};

const bundledDataFiles = {
  expenses: path.join(bundledDataDir, "expenses.json"),
  fuel: path.join(bundledDataDir, "fuel.json"),
  meta: path.join(bundledDataDir, "meta.json")
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

ensureDataFiles();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === "/api/data" && req.method === "GET") {
      return sendJson(res, {
        expenses: readJson(dataFiles.expenses, []),
        fuel: readJson(dataFiles.fuel, []),
        meta: readJson(dataFiles.meta, {})
      });
    }

    if (url.pathname === "/api/expenses" && req.method === "POST") {
      return saveRecord(req, res, "expenses");
    }

    if (url.pathname.startsWith("/api/expenses/") && req.method === "PUT") {
      return updateRecord(req, res, "expenses", decodeURIComponent(url.pathname.split("/").pop()));
    }

    if (url.pathname.startsWith("/api/expenses/") && req.method === "DELETE") {
      return deleteRecord(res, "expenses", decodeURIComponent(url.pathname.split("/").pop()));
    }

    if (url.pathname === "/api/fuel" && req.method === "POST") {
      return saveRecord(req, res, "fuel");
    }

    if (url.pathname.startsWith("/api/fuel/") && req.method === "PUT") {
      return updateRecord(req, res, "fuel", decodeURIComponent(url.pathname.split("/").pop()));
    }

    if (url.pathname.startsWith("/api/fuel/") && req.method === "DELETE") {
      return deleteRecord(res, "fuel", decodeURIComponent(url.pathname.split("/").pop()));
    }

    if (url.pathname === "/api/backup" && req.method === "GET") {
      return sendJson(res, {
        version: 1,
        exportedAt: new Date().toISOString(),
        expenses: readJson(dataFiles.expenses, []),
        fuel: readJson(dataFiles.fuel, []),
        meta: readJson(dataFiles.meta, {})
      });
    }

    if (url.pathname === "/api/restore" && req.method === "POST") {
      const payload = await readBody(req);
      if (!Array.isArray(payload.expenses) || !Array.isArray(payload.fuel)) {
        return sendJson(res, { error: "Fisierul nu contine un backup valid." }, 400);
      }
      writeJson(dataFiles.expenses, payload.expenses);
      writeJson(dataFiles.fuel, payload.fuel);
      writeJson(dataFiles.meta, payload.meta && typeof payload.meta === "object" ? payload.meta : {});
      return sendJson(res, { ok: true });
    }

    return serveStatic(url.pathname, res);
  } catch (error) {
    sendJson(res, { error: error.message || "Eroare neasteptata" }, 500);
  }
});

listenWithFallback(preferredPort);

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
    console.log(`Data directory: ${dataDir}`);
  });
}

function ensureDataFiles() {
  fs.mkdirSync(dataDir, { recursive: true });
  ensureDataFile("expenses", []);
  ensureDataFile("fuel", []);
  ensureDataFile("meta", {
    car: "Hyundai i20",
    initialCostLei: 0,
    currency: "lei",
    importedAt: null,
    sourceFile: "COSTURI i20.xlsx"
  });
}

function ensureDataFile(type, fallback) {
  const target = dataFiles[type];
  if (fs.existsSync(target)) return;

  const bundled = bundledDataFiles[type];
  if (path.resolve(target) !== path.resolve(bundled) && fs.existsSync(bundled)) {
    fs.copyFileSync(bundled, target);
    return;
  }

  writeJson(target, fallback);
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res, payload, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

async function saveRecord(req, res, type) {
  const payload = await readBody(req);
  const rows = readJson(dataFiles[type], []);
  const record = normalizeRecord(type, { ...payload, id: payload.id || createId(type) });
  rows.push(record);
  const nextRows = type === "fuel" ? recalculateFuelRows(rows) : sortRows(rows);
  writeJson(dataFiles[type], nextRows);
  sendJson(res, nextRows.find((row) => row.id === record.id) || record, 201);
}

async function updateRecord(req, res, type, id) {
  const payload = await readBody(req);
  const rows = readJson(dataFiles[type], []);
  const index = rows.findIndex((row) => row.id === id);
  if (index === -1) return sendJson(res, { error: "Inregistrarea nu exista" }, 404);
  rows[index] = normalizeRecord(type, { ...rows[index], ...payload, id });
  const nextRows = type === "fuel" ? recalculateFuelRows(rows) : sortRows(rows);
  writeJson(dataFiles[type], nextRows);
  sendJson(res, nextRows.find((row) => row.id === id) || rows[index]);
}

function deleteRecord(res, type, id) {
  const rows = readJson(dataFiles[type], []);
  const nextRows = rows.filter((row) => row.id !== id);
  writeJson(dataFiles[type], type === "fuel" ? recalculateFuelRows(nextRows) : nextRows);
  sendJson(res, { ok: true });
}

function normalizeRecord(type, record) {
  if (type === "fuel") {
    const liters = numberOrNull(record.liters);
    const km = numberOrNull(record.kmSinceLastFill);
    const computedConsumption = liters && km && km > 0 ? round((liters / km) * 100, 2) : null;
    return {
      id: record.id,
      date: record.date || "",
      station: cleanStationName(record.station),
      costLei: numberOrNull(record.costLei),
      priceLeiPerLiter: numberOrNull(record.priceLeiPerLiter),
      liters,
      odometerKm: numberOrNull(record.odometerKm),
      kmSinceLastFill: km,
      consumptionPer100Km: numberOrNull(record.consumptionPer100Km) ?? computedConsumption,
      importedConsumptionPer100Km: numberOrNull(record.importedConsumptionPer100Km),
      notes: record.notes || "",
      source: record.source || "manual"
    };
  }

  return {
    id: record.id,
    date: record.date || "",
    category: record.category || "Diverse",
    product: record.product || "",
    type: record.type || "",
    costLei: numberOrNull(record.costLei),
    odometerKm: numberOrNull(record.odometerKm),
    notes: record.notes || "",
    source: record.source || "manual"
  };
}

function numberOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const normalized = typeof value === "string" ? value.replace(",", ".") : value;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function cleanStationName(value) {
  return String(value || "").trim().replace(/^b-\s*/i, "");
}

function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function sortRows(rows) {
  return rows.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
}

function recalculateFuelRows(rows) {
  const sorted = sortRows(rows);
  let previousOdometer = null;

  return sorted.map((row) => {
    const odometer = numberOrNull(row.odometerKm);
    const liters = numberOrNull(row.liters);
    let km = numberOrNull(row.kmSinceLastFill);

    if ((!km || km <= 0) && odometer && previousOdometer !== null) {
      const computedKm = odometer - previousOdometer;
      if (computedKm > 0) km = round(computedKm, 0);
    }

    let consumption = numberOrNull(row.consumptionPer100Km);
    if ((!consumption || consumption <= 0) && liters && km && km > 0) {
      consumption = round((liters / km) * 100, 2);
    }

    if (odometer) previousOdometer = odometer;

    return {
      ...row,
      kmSinceLastFill: km,
      consumptionPer100Km: consumption
    };
  });
}

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function serveStatic(requestPath, res) {
  const cleanPath = requestPath === "/" ? "/index.html" : decodeURIComponent(requestPath);
  const file = path.normalize(path.join(publicDir, cleanPath));
  if (!file.startsWith(publicDir)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404);
    return res.end("Not found");
  }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}
