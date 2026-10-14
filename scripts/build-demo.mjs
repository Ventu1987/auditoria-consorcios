/**
 * Arma los datos de demostración pasando por el MISMO backend que en producción (apps-script/*.gs, con el simulador):
 *  1. Planilla vieja = copia local con las fórmulas resueltas (tests/fixtures/snapshot_raw.json) + reglas de normalización.
 *  2. crearPlanilla() y migrarDesdePlanillaVieja().
 *  3. Carga cada liquidación leída del PDF (tests/fixtures/liq/<BARRIO>_<AAAA-MM>.json) con preview → commit, como el asistente.
 *  4. Publica cada barrio con la función de privacidad del backend.
 * Salidas: public/demo/<barrio>.json, apps-script/semillas.gs y tests/fixtures/db.json (la planilla simulada, privada).
 * tests/fixtures no se sube al repositorio: tiene datos por unidad.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as seeds from "./seeds.mjs";
import { entorno } from "./gas-sim.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fx = (p) => path.join(root, "tests/fixtures", p);
const raw = JSON.parse(fs.readFileSync(fx("snapshot_raw.json"), "utf8")).sheets;
raw.NORMALIZACION = JSON.parse(fs.readFileSync(fx("normalizacion.json"), "utf8"));

// semillas (deben existir antes de cargar el backend)
const provisorios = (raw.GASTOS || []).filter((g) => g.Barrio === "S2" && g.Concepto_Normalizado === "Electricidad - EDENOR" && ["2026-08", "2026-09"].includes(g.Mes)).map((g) => g.ID_Gasto);
const sem = { conceptos: seeds.conceptos, parametros: seeds.parametros, oportunidades: seeds.oportunidades, reglas: seeds.reglas, provisorios };
fs.writeFileSync(path.join(root, "apps-script/semillas.gs"),
  "/* Catálogos iniciales generados por scripts/build-demo.mjs. Los carga migrarDesdePlanillaVieja() (no pisa lo existente). */\nvar SEMILLAS = " + JSON.stringify(sem, null, 1) + ";\n");

const E = entorno(raw, path.join(root, "apps-script"));
E.g.crearPlanilla();
E.g.migrarDesdePlanillaVieja();
E.g.crearUsuario("demo.admin", "Armado de la demostración", "*", "ADMIN", "solo-para-el-simulador");
const ses = E.post({ action: "login", usuario: "demo.admin", clave: "solo-para-el-simulador" });
if (ses.error) throw new Error(ses.error);

const dirLiq = fx("liq");
const liqs = fs.existsSync(dirLiq) ? fs.readdirSync(dirLiq).filter((f) => f.endsWith(".json")).sort((a, b) => a.slice(-12).localeCompare(b.slice(-12))) : [];
for (const f of liqs) {
  const json = JSON.parse(fs.readFileSync(path.join(dirLiq, f), "utf8"));
  const r = E.post({ action: "preview", token: ses.token, barrio: f.slice(0, 2), json, filename: f.replace(".json", ".pdf") });
  if (r.error) { console.log(f, "ERROR", r.error); continue; }
  const p = r.preview, malos = p.controles.filter((c) => !c.ok);
  console.log(`\n== ${f}: ${p.barrioNombre} ${p.periodo} · ${p.controles.length - malos.length}/${p.controles.length} controles OK · ${p.observaciones.length} observaciones`);
  malos.forEach((c) => console.log(`   ✗ ${c.control}: doc ${c.documento} calc ${c.calculado} dif ${c.diferencia}`));
  p.bloqueos.forEach((b) => console.log("   BLOQUEO", b));
  p.gastos.filter((g) => g.sin_regla).forEach((g) => console.log("   SIN REGLA", g.concepto_original.slice(0, 90)));
  const c = E.post({ action: "commit", token: ses.token, barrio: p.barrio, draftId: p.draftId, force: true });
  if (c.error) console.log("   COMMIT ERROR", c.error);
}

const db = E.hojas();
delete db.USUARIOS; delete db.LOG;
fs.writeFileSync(fx("db.json"), JSON.stringify({ sheets: db }));
fs.mkdirSync(path.join(root, "public/demo"), { recursive: true });
for (const b of ["S2", "S1", "LH"]) {
  const pub = E.get({ action: "data", barrio: b });
  pub.version = 0; pub.updated = "2026-10-14 12:00:00"; pub.demo = true;
  fs.writeFileSync(path.join(root, `public/demo/${b}.json`), JSON.stringify(pub));
  console.log(b, Math.round(JSON.stringify(pub).length / 1024) + " KB", (pub.sheets.PERIODOS || []).filter((p) => p.Barrio === b).map((p) => p.Mes).join(","));
}
