/**
 * Simulador de Google Apps Script en memoria. Corre el backend real (apps-script/*.gs) sin Google:
 * lo usan las pruebas y el armado de los datos de demostración, así lo publicado sale por el mismo camino que en producción.
 */
import fs from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";
import path from "node:path";

class Sheet {
  constructor(name) { this.name = name; this.v = []; }
  getLastRow() { let n = this.v.length; while (n && this.v[n - 1].every((x) => x === "" || x == null)) n--; return n; }
  getLastColumn() { return Math.max(0, ...this.v.map((r) => { let n = r.length; while (n && (r[n - 1] === "" || r[n - 1] == null)) n--; return n; })); }
  getMaxRows() { return 1000; }
  getRange(r, c, nr = 1, nc = 1) { return new Range(this, r, c, nr, nc); }
  setFrozenRows() {} setTabColor() {}
  protect() { return { setDescription: () => ({ setWarningOnly: () => {} }) }; }
}
class Range {
  constructor(s, r, c, nr, nc) { Object.assign(this, { s, r, c, nr, nc }); }
  getValues() { const o = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push(this.s.v[this.r - 1 + i]?.[this.c - 1 + j] ?? ""); o.push(row); } return o; }
  setValues(vals) { vals.forEach((row, i) => row.forEach((x, j) => { const R = this.r - 1 + i; while (this.s.v.length <= R) this.s.v.push([]); this.s.v[R][this.c - 1 + j] = x; })); return this; }
  setValue(x) { return this.setValues([[x]]); }
  clearContent() { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) if (this.s.v[this.r - 1 + i]) this.s.v[this.r - 1 + i][this.c - 1 + j] = ""; return this; }
  setNumberFormat() { return this; } setFontWeight() { return this; } setBackground() { return this; } setFontColor() { return this; }
}
class SS {
  constructor(id) { this.id = id; this.sheets = []; }
  getSheetByName(n) { return this.sheets.find((s) => s.name === n) || null; }
  insertSheet(n) { const s = new Sheet(n); this.sheets.push(s); return s; }
  getSheets() { return this.sheets; } deleteSheet(s) { this.sheets = this.sheets.filter((x) => x !== s); }
  getId() { return this.id; } getUrl() { return "https://docs/" + this.id; } getSpreadsheetTimeZone() { return "America/Argentina/Buenos_Aires"; }
}

/** rawSheets: { HOJA: [filas] } de la planilla vieja. Devuelve funciones para llamar al backend. */
export function entorno(rawSheets, dirGs) {
  const vieja = new SS("vieja");
  for (const [n, rows] of Object.entries(rawSheets)) { if (!rows || !rows.length) continue; const s = vieja.insertSheet(n), h = [...new Set(rows.flatMap((r) => Object.keys(r)))]; s.v = [h, ...rows.map((r) => h.map((k) => r[k] ?? ""))]; }
  const all = { vieja }, props = {}, cache = {}, drive = {};
  const file = (id, content) => ({ getId: () => id, getUrl: () => "https://drive/" + id, getBlob: () => ({ getDataAsString: () => content }), setTrashed: () => { delete drive[id]; } });
  const folder = { createFile: (name, content) => { const id = "f" + Object.keys(drive).length + "_" + name; drive[id] = typeof content === "string" ? content : ""; return file(id, drive[id]); }, getFoldersByName: () => ({ hasNext: () => true, next: () => folder }), createFolder: () => folder, getFilesByName: () => ({ hasNext: () => false }) };
  const g = {
    SpreadsheetApp: { getActiveSpreadsheet: () => vieja, openById: (id) => all[id], openByUrl: () => vieja, create: () => { const s = new SS("nueva"); s.insertSheet("Hoja 1"); all.nueva = s; return s; }, flush() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) },
    CacheService: { getScriptCache: () => ({ get: (k) => cache[k] ?? null, put: (k, v) => { cache[k] = v; }, remove: (k) => { delete cache[k]; }, getAll: (ks) => Object.fromEntries(ks.map((k) => [k, cache[k]])), putAll: (o) => Object.assign(cache, o) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: {
      formatDate: (d, _tz, f) => { const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString(); return f === "yyyy-MM-dd" ? x.slice(0, 10) : x.replace("T", " ").slice(0, 19); },
      getUuid: () => crypto.randomUUID(), DigestAlgorithm: { SHA_256: "sha256" }, Charset: { UTF_8: "utf8" },
      computeDigest: (_a, s) => [...crypto.createHash("sha256").update(s, "utf8").digest()].map((b) => (b > 127 ? b - 256 : b)),
      newBlob: () => ({}), base64Decode: () => [],
    },
    DriveApp: { getRootFolder: () => folder, getFolderById: () => folder, getFileById: (id) => file(id, drive[id]) },
    ContentService: { createTextOutput: (s) => ({ s, setMimeType() { return this; } }), MimeType: { JSON: "json" } },
    Logger: { log() {} }, UrlFetchApp: {}, console,
  };
  const ctx = vm.createContext(g);
  for (const f of fs.readdirSync(dirGs).filter((f) => f.endsWith(".gs"))) vm.runInContext(fs.readFileSync(path.join(dirGs, f), "utf8"), ctx, { filename: f });
  const get = (q) => JSON.parse(g.doGet({ parameter: q }).s);
  const post = (b) => JSON.parse(g.doPost({ postData: { contents: JSON.stringify(b) } }).s);
  /** Hojas de la planilla nueva como objetos (igual que readSheet_). */
  const hojas = () => Object.fromEntries(all.nueva.sheets.map((s) => [s.name, g.readSheet_(s.name)]));
  return { g, all, get, post, props, hojas };
}
