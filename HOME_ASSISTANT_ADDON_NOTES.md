# Modificare necesara in `server.js`

Pe langa fisierele de add-on, `server.js` trebuie sa foloseasca variabila `DATA_DIR` pentru persistenta in Home Assistant.

Schimba definitia folderului de date din:

```js
const dataDir = path.join(root, "data");
```

in:

```js
const bundledDataDir = path.join(root, "data");
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : bundledDataDir;
```

Adauga si lista fisierelor incluse:

```js
const bundledDataFiles = {
  expenses: path.join(bundledDataDir, "expenses.json"),
  fuel: path.join(bundledDataDir, "fuel.json"),
  meta: path.join(bundledDataDir, "meta.json")
};
```

Inlocuieste `ensureDataFiles()` cu aceasta versiune:

```js
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
```

Si actualizeaza `writeJson()` ca sa creeze folderul tinta:

```js
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
```

Aceasta este schimbarea care face ca datele sa ramana persistente in add-on.
