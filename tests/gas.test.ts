/* Simulador de Google Apps Script en memoria: corre el backend real (apps-script/*.gs) de punta a punta.
   crearPlanilla → migrar desde la planilla vieja → crear usuarios → ingresar → leer datos públicos → escribir con permisos por barrio. */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";

type Cell = any;
class Sheet {
  v: Cell[][] = []; fmt: Record<string, string> = {};
  constructor(public name: string) {}
  getLastRow() { let n = this.v.length; while (n && this.v[n - 1].every((x) => x === "" || x == null)) n--; return n; }
  getLastColumn() { return Math.max(0, ...this.v.map((r) => { let n = r.length; while (n && (r[n - 1] === "" || r[n - 1] == null)) n--; return n; })); }
  getMaxRows() { return 1000; }
  getRange(r: number, c: number, nr = 1, nc = 1) { return new Range(this, r, c, nr, nc); }
  setFrozenRows() {} setTabColor() {} protect() { return { setDescription: () => ({ setWarningOnly: () => {} }) }; }
}
class Range {
  constructor(public s: Sheet, public r: number, public c: number, public nr: number, public nc: number) {}
  getValues() { const o: Cell[][] = []; for (let i = 0; i < this.nr; i++) { const row: Cell[] = []; for (let j = 0; j < this.nc; j++) row.push(this.s.v[this.r - 1 + i]?.[this.c - 1 + j] ?? ""); o.push(row); } return o; }
  setValues(vals: Cell[][]) { vals.forEach((row, i) => row.forEach((x, j) => { const R = this.r - 1 + i; while (this.s.v.length <= R) this.s.v.push([]); this.s.v[R][this.c - 1 + j] = x; })); return this; }
  setValue(x: Cell) { return this.setValues([[x]]); }
  clearContent() { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) if (this.s.v[this.r - 1 + i]) this.s.v[this.r - 1 + i][this.c - 1 + j] = ""; return this; }
  setNumberFormat() { return this; } setFontWeight() { return this; } setBackground() { return this; } setFontColor() { return this; }
}
class SS {
  sheets: Sheet[] = []; constructor(public id: string) {}
  getSheetByName(n: string) { return this.sheets.find((s) => s.name === n) || null; }
  insertSheet(n: string) { const s = new Sheet(n); this.sheets.push(s); return s; }
  getSheets() { return this.sheets; } deleteSheet(s: Sheet) { this.sheets = this.sheets.filter((x) => x !== s); }
  getId() { return this.id; } getUrl() { return "https://docs/" + this.id; } getSpreadsheetTimeZone() { return "America/Argentina/Buenos_Aires"; }
}

function entorno() {
  const vieja = new SS("vieja"), raw = JSON.parse(fs.readFileSync(new URL("../public/demo/S2.json", import.meta.url), "utf8")).sheets;
  for (const [n, rows] of Object.entries<any[]>(raw)) { if (!rows.length) continue; const s = vieja.insertSheet(n), h = Object.keys(rows[0]); s.v = [h, ...rows.map((r) => h.map((k) => r[k]))]; }
  const all: Record<string, SS> = { vieja }, props: Record<string, string> = {}, cache: Record<string, string> = {};
  const g: any = {
    SpreadsheetApp: { getActiveSpreadsheet: () => vieja, openById: (id: string) => all[id], openByUrl: () => vieja, create: () => { const s = new SS("nueva"); s.insertSheet("Hoja 1"); all.nueva = s; return s; }, flush() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props[k] ?? null, setProperty: (k: string, v: string) => { props[k] = v; } }) },
    CacheService: { getScriptCache: () => ({ get: (k: string) => cache[k] ?? null, put: (k: string, v: string) => { cache[k] = v; }, remove: (k: string) => { delete cache[k]; }, getAll: (ks: string[]) => Object.fromEntries(ks.map((k) => [k, cache[k]])), putAll: (o: any) => Object.assign(cache, o) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: {
      formatDate: (d: Date, _tz: string, f: string) => (f === "yyyy-MM-dd" ? d.toISOString().slice(0, 10) : d.toISOString().replace("T", " ").slice(0, 19)),
      getUuid: () => crypto.randomUUID(), DigestAlgorithm: { SHA_256: "sha256" }, Charset: { UTF_8: "utf8" },
      computeDigest: (_a: string, s: string) => [...crypto.createHash("sha256").update(s, "utf8").digest()].map((b) => (b > 127 ? b - 256 : b)),
      newBlob: () => ({}), base64Decode: () => [],
    },
    ContentService: { createTextOutput: (s: string) => ({ s, setMimeType() { return this; } }), MimeType: { JSON: "json" } },
    Logger: { log() {} }, DriveApp: {}, UrlFetchApp: {}, console,
  };
  const ctx = vm.createContext(g);
  const dir = new URL("../apps-script/", import.meta.url);
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".gs"))) vm.runInContext(fs.readFileSync(new URL(f, dir), "utf8"), ctx, { filename: f });
  const get = (q: any) => JSON.parse(g.doGet({ parameter: q }).s);
  const post = (b: any) => JSON.parse(g.doPost({ postData: { contents: JSON.stringify(b) } }).s);
  return { g, all, get, post, props };
}

describe("backend de Apps Script (simulado)", () => {
  const E = entorno();
  it("crea la planilla nueva y migra solo valores", () => {
    E.g.crearPlanilla();
    expect(E.props.DB_ID).toBe("nueva");
    E.g.migrarDesdePlanillaVieja();
    const n = E.all.nueva, gastos = n.getSheetByName("GASTOS")!;
    expect(gastos.getLastRow()).toBe(1 + (JSON.parse(fs.readFileSync(new URL("../public/demo/S2.json", import.meta.url), "utf8")).sheets.GASTOS.length));
    expect(gastos.v[0]).not.toContain("Estado_Seguimiento");
    const txt = JSON.stringify(n.sheets.map((s) => s.v));
    expect(txt).not.toMatch(/"=[A-Z]/);
    const per = E.g.readSheet_("PERIODOS").find((p: any) => p.ID_Periodo === "S2-2026-10");
    expect(per.Unidades_Con_Deuda).toBe(4);
    expect(E.g.readSheet_("OPORTUNIDADES").length).toBe(7);
  });
  it("usuarios por barrio y datos públicos", () => {
    E.g.crearUsuario("facundo", "Facundo Vega", "S2", "AUDITOR", "clave-larga-123");
    E.g.crearUsuario("aud.s1", "Auditor S1", "S1", "AUDITOR", "otra-clave-456");
    expect(E.post({ action: "login", usuario: "facundo", clave: "mal" }).error).toMatch(/incorrectos/);
    const s = E.post({ action: "login", usuario: "facundo", clave: "clave-larga-123" });
    expect(s.token).toBeTruthy();
    expect(s.barrio).toBe("S2");
    const d = E.get({ action: "data", barrio: "S2" });
    expect(d.sheets.USUARIOS).toBeUndefined();
    expect(d.sheets.PRORRATEO).toBeUndefined();
    expect(JSON.stringify(d)).not.toMatch(/facundovega|Clave_Hash/);
    expect(E.get({ action: "data", barrio: "S2", v: d.version }).notModified).toBe(true);
  });
  it("escrituras con permiso por barrio, LOG y versión", () => {
    const s = E.post({ action: "login", usuario: "facundo", clave: "clave-larga-123" });
    const s1 = E.post({ action: "login", usuario: "aud.s1", clave: "otra-clave-456" });
    const v0 = E.get({ action: "version" }).version;
    const r = E.post({ action: "oportunidad", token: s.token, barrio: "S2", fila: { ID_Oportunidad: "O001", Estado: "ACEPTADA" } });
    expect(r.ok).toBe(true);
    expect(r.version).toBe(v0 + 1);
    expect(E.post({ action: "oportunidad", token: s1.token, barrio: "S2", fila: { ID_Oportunidad: "O001", Estado: "RECHAZADA" } }).error).toMatch(/no puede/);
    const h = E.post({ action: "nuevo_hallazgo", token: s.token, barrio: "S2", titulo: "Prueba", conclusion: "Dato de prueba", gravedad: "A REVISAR" });
    expect(h.id).toMatch(/^H\d+/);
    const m = E.post({ action: "reporte", token: s.token, barrio: "S2", fila: { Fecha_Envio: "2026-10-14", Para: "RyM", Asunto: "x", Plazo_Dias: 10, Vence: "2026-10-28", Puntos: "H23,H26", Cuerpo: "..." } });
    expect(m.id).toBe("M001");
    const log = E.g.readSheet_("LOG");
    expect(log.some((l: any) => l.Accion === "EDITA OPORTUNIDAD" && /PLANTEADA/.test(l.Detalle))).toBe(true);
    const d = E.get({ action: "data", barrio: "S2" });
    expect(d.sheets.REPORTES[0].Usuario).toBeUndefined();
    expect(d.sheets.BITACORA.filter((e: any) => e.Tipo === "ENVIADO EN MAIL").length).toBe(2);
  });
});
