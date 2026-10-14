/**
 * Funciones para ejecutar UNA VEZ desde el editor de Apps Script (menú Ejecutar).
 *
 * 1. crearPlanilla()                 crea la planilla nueva y limpia, con todas las hojas, y guarda su ID en DB_ID.
 * 2. migrarDesdePlanillaVieja()      copia los VALORES (nunca fórmulas) de la planilla vieja a la nueva y carga los catálogos iniciales.
 * 3. crearUsuario("facundo", "Facundo Vega", "S2", "ADMIN", "una-clave-larga")   crea o cambia la clave de un usuario.
 *    Para auditores de otros barrios: crearUsuario("auditor.s1", "Nombre", "S1", "AUDITOR", "clave").
 * Opcional: actualizarIPC() trae el IPC mensual del INDEC (gratis, datos.gob.ar).
 */
function crearPlanilla() {
  var P = PropertiesService.getScriptProperties();
  if (P.getProperty("DB_ID")) { Logger.log("Ya existe la planilla: " + SpreadsheetApp.openById(P.getProperty("DB_ID")).getUrl()); return; }
  var ss = SpreadsheetApp.create("Auditoría de Consorcios — datos");
  var first = ss.getSheets()[0];
  Object.keys(SCHEMA).forEach(function (n) {
    var sh = ss.insertSheet(n), cols = SCHEMA[n].cols;
    if (cols) { sh.getRange(1, 1, 1, cols.length).setValues([cols]); hdrStyle_(sh, cols.length); }
    var color = { CONFIG: "#24508F", LIQ: "#1E7A4C", PRIV: "#B42318", RESP: "#A65E00", CAT: "#59636E", AUD: "#6E40C9", REF: "#8A8F94", LOG: "#17212B" }[SCHEMA[n].g];
    if (color) sh.setTabColor(color);
    if (n === "USUARIOS" || SCHEMA[n].g === "PRIV" || n === "LOG") sh.protect().setDescription("Hoja privada: no se publica").setWarningOnly(true);
  });
  ss.deleteSheet(first);
  P.setProperty("DB_ID", ss.getId());
  P.setProperty("VER", "1");
  DB_ = ss;
  Logger.log("Planilla creada: " + ss.getUrl());
}

/** Copia la planilla vieja a la nueva. Sin parámetro usa la planilla a la que está vinculado el script. */
function migrarDesdePlanillaVieja(urlVieja) {
  var nueva = db_(), vieja = urlVieja ? SpreadsheetApp.openByUrl(urlVieja) : SpreadsheetApp.getActiveSpreadsheet();
  if (!vieja || vieja.getId() === nueva.getId()) throw new Error("Primero ejecutá crearPlanilla(). La planilla vieja y la nueva no pueden ser la misma.");
  var NO_COPIAR = { USUARIOS: 1, LOG: 1, PARAMETROS: 1, CONCEPTOS: 1, OPORTUNIDADES: 1, REPORTES: 1, INDICADORES: 1 };
  var resumen = [];
  Object.keys(SCHEMA).forEach(function (n) {
    if (NO_COPIAR[n]) return;
    var rows = readSheet_(n, vieja); if (!rows.length) { resumen.push(n + ": vacía en la planilla vieja"); return; }
    var sh = nueva.getSheetByName(n), cols = SCHEMA[n].cols || Object.keys(rows[0]);
    if (n === "PERIODOS") rows = conDeuda_(rows, vieja);
    if (n === "GASTOS") rows.forEach(function (g) { if (!g.Es_Provisorio) g.Es_Provisorio = provisorio_(g.ID_Gasto) ? "SI" : "NO"; });
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, Math.max(sh.getLastColumn(), 1)).clearContent();
    sh.getRange(1, 1, 1, cols.length).setValues([cols]); hdrStyle_(sh, cols.length);
    var vals = rows.map(function (r) { return cols.map(function (c) { var x = r[c]; return x === undefined || x === null ? "" : (typeof x === "string" && /^[=+]/.test(x) ? "'" + x : x); }); });
    escribir_(sh, 2, cols, vals);
    resumen.push(n + ": " + vals.length + " filas");
  });
  cargarCatalogos_();
  SpreadsheetApp.flush(); bump_();
  Logger.log("Migración terminada.\n" + resumen.join("\n"));
}
/** Unidades con deuda por período: sale del prorrateo privado (solo se publica la cantidad). */
function conDeuda_(periodos, vieja) {
  var pr = readSheet_("PRORRATEO", vieja), ev = readSheet_("EVOLUCION", vieja), cnt = {};
  pr.forEach(function (u) { if (num_(u.Deuda) > 1) cnt[u.ID_Periodo] = (cnt[u.ID_Periodo] || 0) + 1; });
  return periodos.map(function (p) {
    if (p.Unidades_Con_Deuda === undefined || p.Unidades_Con_Deuda === "") {
      var e = ev.filter(function (x) { return x.ID_Periodo === p.ID_Periodo; })[0];
      p.Unidades_Con_Deuda = cnt.hasOwnProperty(p.ID_Periodo) ? cnt[p.ID_Periodo] : (e && e.Unidades_Con_Deuda !== "" ? e.Unidades_Con_Deuda : (pr.length ? 0 : ND));
    }
    return p;
  });
}
function provisorio_(id) { return (SEMILLAS.provisorios || []).indexOf(id) >= 0; }
/** Catálogos iniciales (reglas de normalización nuevas, conceptos con su etiqueta, parámetros y oportunidades ya analizadas). No pisa lo que ya exista. */
function cargarCatalogos_() {
  [["NORMALIZACION", "ID_Regla", SEMILLAS.reglas], ["CONCEPTOS", "Concepto_Normalizado", SEMILLAS.conceptos], ["PARAMETROS", "Clave", SEMILLAS.parametros], ["OPORTUNIDADES", "ID_Oportunidad", SEMILLAS.oportunidades]].forEach(function (x) {
    var have = readSheet_(x[0]).map(function (r) { return String(r[x[1]]); });
    append_(x[0], (x[2] || []).filter(function (r) { return have.indexOf(String(r[x[1]])) < 0; }));
  });
}

function crearUsuario(usuario, nombre, barrio, rol, clave) {
  usuario = String(usuario || "").trim().toLowerCase(); rol = String(rol || "AUDITOR").toUpperCase(); barrio = String(barrio || "").toUpperCase();
  if (!usuario || !clave) throw new Error("Uso: crearUsuario('usuario', 'Nombre', 'S2', 'AUDITOR', 'clave')");
  if (String(clave).length < 10) throw new Error("La clave tiene que tener al menos 10 caracteres.");
  if (["AUDITOR", "ADMIN"].indexOf(rol) < 0) throw new Error("Rol: AUDITOR o ADMIN.");
  var barrios = readSheet_("BARRIOS").map(function (b) { return b.ID_Barrio; });
  if (barrio !== "*" && barrio.split(",").some(function (x) { return barrios.indexOf(x.trim()) < 0; })) throw new Error("Barrio desconocido. Opciones: " + barrios.join(", ") + " o *");
  var salt = Utilities.getUuid(), rec = { Usuario: usuario, Nombre: nombre || usuario, Barrio: barrio, Rol: rol, Clave_Hash: hash_(salt, String(clave)), Salt: salt, Activo: "SI" };
  if (!updateRow_("USUARIOS", "Usuario", usuario, rec)) append_("USUARIOS", [rec]);
  log_({ usuario: "editor" }, barrio, "USUARIO", usuario + " (" + rol + ")");
  Logger.log("Usuario listo: " + usuario + " · " + barrio + " · " + rol);
}
/** Ejemplo para no escribir la clave en el código: ejecutarla, copiar del registro y borrar. */
function ejemploCrearUsuarios() {
  // crearUsuario("facundo", "Facundo Vega", "S2", "ADMIN", "cambiar-esta-clave");
  // crearUsuario("auditor.s1", "Auditor Senderos I", "S1", "AUDITOR", "cambiar-esta-clave");
  // crearUsuario("auditor.lh", "Auditor La Huella", "LH", "AUDITOR", "cambiar-esta-clave");
}
function desactivarUsuario(usuario) { updateRow_("USUARIOS", "Usuario", String(usuario).toLowerCase(), { Activo: "NO" }); Logger.log("Desactivado: " + usuario); }

var IPC_SERIE = "148.3_INIVELNAL_DICI_M_26"; // IPC Nivel General Nacional, base dic 2016 (INDEC vía datos.gob.ar)
function actualizarIPC() {
  var r = UrlFetchApp.fetch("https://apis.datos.gob.ar/series/api/series/?ids=" + IPC_SERIE + "&format=json&last=36", { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) { Logger.log("INDEC no respondió (" + r.getResponseCode() + ")."); return; }
  var d = JSON.parse(r.getContentText()).data || []; if (!d.length) return;
  var have = {}; readSheet_("INDICES").forEach(function (x) { have[String(x.Mes).slice(0, 7)] = true; });
  var rows = []; d.forEach(function (p, i) { var m = String(p[0]).slice(0, 7); if (!have[m]) rows.push({ Mes: m, IPC_Indice: p[1], IPC_Var_Mensual: i ? p[1] / d[i - 1][1] - 1 : "", Fuente: "INDEC (datos.gob.ar)" }); });
  append_("INDICES", rows); if (rows.length) bump_();
  Logger.log("IPC: " + rows.length + " meses nuevos.");
}
/** Prueba rápida: muestra el tamaño de los datos públicos de Senderos II. */
function probar() { var s = JSON.stringify(publicData_("S2")); Logger.log("Datos públicos S2: " + Math.round(s.length / 1024) + " KB"); Logger.log(s.slice(0, 1500)); }
