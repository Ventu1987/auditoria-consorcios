/**
 * Auditoría de Consorcios — backend en Google Apps Script (gratis).
 *
 * Este proyecto reemplaza al Code.gs del portal anterior y se pega en el MISMO proyecto de Apps Script,
 * así la URL de la API no cambia. Los datos viven en una planilla NUEVA (sin fórmulas): su ID queda guardado
 * en la propiedad DB_ID. Hasta que se ejecute crearPlanilla(), el script sigue leyendo la planilla vieja.
 *
 * Archivos:
 *   config.gs       esquema de hojas y utilidades de lectura/escritura
 *   api.gs          doGet / doPost, versiones por barrio y caché
 *   auth.gs         usuarios por barrio con clave (hash SHA-256 con sal), sesiones y bloqueo por intentos
 *   privacy.gs      lo que se publica y cómo se limpia (sin padrón, sin deuda por unidad, sin nombres de empleados)
 *   liquidacion.gs  lectura y controles de una liquidación (reutilizado del portal v7) y escritura
 *   auditoria.gs    hallazgos, bitácora, respuestas, comprobantes, extractos, oportunidades y reportes
 *   setup.gs        crearPlanilla(), migrarDesdePlanillaVieja(), crearUsuario(), actualizarIPC()
 */
var ND = "N/D";
var MESES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
var GM = "PAGO DE GASTOS LIQUIDADOS", RC = "RECLASIFICACIÓN DE COBROS", SD = "EGRESO SIN DETALLE DE COMPROBANTE", AJ = "AJUSTE";

/**
 * Esquema de la planilla nueva. Para cada hoja: grupo, si es pública y sus columnas.
 * cols = null → se copian todas las columnas de la planilla vieja tal cual (valores, nunca fórmulas).
 * Las columnas que antes eran fórmulas (Importe_Total, Estado_Seguimiento, Control, etc.) ya no existen: las calcula la app.
 */
var SCHEMA = {
  // Configuración
  BARRIOS: { g: "CONFIG", pub: true, cols: ["ID_Barrio", "Nombre", "Patron_En_PDF", "Lotes", "Superficie_m2", "Coef_FBV_Propios", "Coef_FBV_Comunes", "Estado", "Fuente", "CUIT_Fideicomiso", "CUIT_Administrador"] },
  USUARIOS: { g: "CONFIG", pub: false, cols: ["Usuario", "Nombre", "Barrio", "Rol", "Clave_Hash", "Salt", "Activo", "Ultimo_Ingreso"] },
  PARAMETROS: { g: "CONFIG", pub: true, cols: ["Clave", "Valor", "Descripcion"] },
  // Liquidación
  PERIODOS: { g: "LIQ", pub: true, cols: ["ID_Periodo", "Barrio", "Mes", "Periodo", "Periodo_Num", "Liquidacion", "Consorcio", "CUIT_Consorcio", "Administrador", "CUIT_Administrador", "Matricula_Admin",
    "Fecha_Emision", "Fecha_Vencimiento", "Recargo_Vencimiento", "Fecha_Cierre", "Total_Gastos_Periodo", "Base_Prorrateo_Ord", "Gastos_Particulares", "Total_Expensas", "Total_Liquidado_Con_Deudas",
    "Gastos_Ordinarios", "Gastos_Extraordinarios", "Fondo_Reserva", "Ingresos", "Egresos_Caja", "Saldo_Inicial", "Saldo_Final", "Patrimonio_Neto", "Gastos_Pendientes_Pago",
    "Pagos_Periodos_Anteriores", "Expensa_Ord_Lote_Tipo", "Coef_Lote_Tipo", "Cantidad_Unidades", "Unidades_Con_Deuda", "Titulo", "Observaciones", "Fuente_PDF", "Paginas", "Estado_Revision", "Fecha_Carga"] },
  GASTOS: { g: "LIQ", pub: true, cols: ["ID_Gasto", "ID_Periodo", "Barrio", "Mes", "Periodo", "Periodo_Num", "Fecha", "Rubro_Original", "Item", "Categoria", "Subcategoria", "Concepto_Original",
    "Concepto_Normalizado", "ID_Proveedor", "Proveedor", "Detalle", "Tipo_Gasto", "Importe", "IVA", "Ordinario_Extraordinario", "Periodo_Servicio", "Estado_Pago", "Es_Estimado", "Es_Provisorio",
    "Base_Prorrateo_Doc", "Porc_Participacion_Doc", "Medio_Pago", "Comprobante", "Observacion", "Fuente_PDF", "Pagina", "Estado_Validacion"] },
  DETALLE_COMPONENTES: { g: "LIQ", pub: true, cols: null },
  PAGOS_PER_ANTERIORES: { g: "LIQ", pub: true, cols: ["ID_Pago_Ant", "ID_Periodo", "Barrio", "Mes", "Periodo_Origen_Gasto", "ID_Gasto_Origen", "Concepto_Original", "Concepto_Normalizado", "ID_Proveedor",
    "Categoria", "Importe", "Periodo_Servicio", "Comprobante", "Observacion", "Fuente_PDF", "Pagina"] },
  INGRESOS: { g: "LIQ", pub: true, cols: null },
  EGRESOS_CAJA: { g: "LIQ", pub: true, cols: null },
  FONDOS: { g: "LIQ", pub: true, cols: ["ID_Periodo", "Barrio", "Mes", "Fondo", "Saldo_Inicial", "Saldo_Final_Documento", "Observacion"] },
  SALDOS_PATRIMONIO: { g: "LIQ", pub: true, cols: null },
  VALIDACIONES: { g: "LIQ", pub: true, cols: ["ID_Control", "ID_Periodo", "Barrio", "Mes", "Control", "Importe_Documento", "Importe_Calculado", "Tolerancia", "Nivel_Si_Falla", "Pagina", "Observacion"] },
  CONTROL_CALIDAD: { g: "LIQ", pub: true, cols: null },
  CARGAS: { g: "LIQ", pub: false, cols: ["Fecha_Carga", "ID_Periodo", "Barrio", "Mes", "Origen", "Archivo", "Controles_OK", "Controles_Con_Diferencias", "Observaciones_Generadas", "Estado", "Detalle", "Usuario"] },
  // Privadas: nunca salen de la planilla
  PADRON_PRIVADO: { g: "PRIV", pub: false, cols: null },
  PRORRATEO: { g: "PRIV", pub: false, cols: null },
  CONTINUIDAD: { g: "PRIV", pub: false, cols: null },
  MOROSIDAD: { g: "PRIV", pub: false, cols: null },
  CUPON_UNIDAD: { g: "PRIV", pub: false, cols: null },
  RECIBOS: { g: "PRIV", pub: false, cols: null },
  // Respaldo
  COMPROBANTES: { g: "RESP", pub: true, cols: ["ID_Comprobante", "ID_Periodo", "Barrio", "Mes", "Archivo", "Pagina", "Tipo", "Subtipo", "Es_Fiscal", "Revision", "Emisor", "CUIT_Emisor", "Receptor", "CUIT_Receptor",
    "Numero", "Fecha", "Importe", "Periodo_Servicio", "Ordenante", "CUIT_Ordenante", "Cuenta_Debito", "Destinatario", "CUIT_Destinatario", "Concepto_Pago", "ID_Gasto", "ID_Pago_Ant", "Rubro_Archivo",
    "Importe_Archivo", "Nota", "Detalle_JSON", "Drive_URL", "Fecha_Carga"] },
  MOVIMIENTOS_BANCO: { g: "RESP", pub: true, cols: ["ID_Mov", "Barrio", "Banco", "Cuenta", "Nombre_Cuenta", "Fecha", "Tipo", "Descripcion", "Debito", "Credito", "Saldo", "Mismo_Titular", "CUIT_Contraparte",
    "Contraparte", "Identificable", "Archivo", "Nota", "Clave"] },
  DOCUMENTOS: { g: "RESP", pub: true, cols: ["ID_Documento", "ID_Periodo", "Barrio", "Mes", "Tipo", "Titulo", "Archivo", "Drive_URL", "URL_Publica", "Fecha_Carga", "Paginas", "Visible_Publico", "Observacion"] },
  // Catálogos
  NORMALIZACION: { g: "CAT", pub: false, cols: null },
  PROVEEDORES: { g: "CAT", pub: true, cols: ["ID_Proveedor", "Proveedor", "Nombre_Original", "CUIT", "Categoria", "Observaciones"] },
  CATEGORIAS: { g: "CAT", pub: true, cols: ["ID_Categoria", "Categoria", "Subcategoria", "Descripcion", "Recurrente_Esperado"] },
  CONCEPTOS: { g: "CAT", pub: true, cols: ["Concepto_Normalizado", "Etiqueta", "Es_Servicio", "Rubro_Modelo", "Notas"] },
  // Auditoría
  HALLAZGOS: { g: "AUD", pub: true, cols: null },
  HALLAZGOS_CALCULO: { g: "AUD", pub: true, cols: null },
  INDICADORES: { g: "AUD", pub: true, cols: ["Clave", "Barrio", "Mes", "Titulo", "Decision", "ID_Hallazgo", "Nota", "Usuario", "Fecha"] },
  BITACORA: { g: "AUD", pub: true, cols: null },
  RESPUESTAS_ADMIN: { g: "AUD", pub: true, cols: ["ID_Respuesta", "Fecha", "Barrio", "Dijo", "Documentos_Muestran", "Estado", "ID_Hallazgo", "Publicable"] },
  RECLAMOS: { g: "AUD", pub: true, cols: null },
  PLAN_ACCION: { g: "AUD", pub: true, cols: null },
  OPORTUNIDADES: { g: "AUD", pub: true, cols: ["ID_Oportunidad", "Barrio", "Mes", "Tipo", "Concepto", "Hoy", "Propuesta", "Ahorro_Mensual", "Prioridad", "Estado", "Origen", "Regla",
    "Aplicar_En_Modelo", "Ajuste_Titulo", "Ajuste_Detalle", "ID_Hallazgo", "Actualizado", "Usuario"] },
  REPORTES: { g: "AUD", pub: true, cols: ["ID_Reporte", "Barrio", "Fecha_Envio", "Para", "Asunto", "Tono", "Plazo_Dias", "Vence", "Puntos", "Cuerpo", "Estado", "Fecha_Respuesta", "Nota", "Usuario"] },
  // Referencia
  INDICES: { g: "REF", pub: true, cols: ["Mes", "IPC_Indice", "IPC_Var_Mensual", "Fuente"] },
  FBV_ORDENES_PAGO: { g: "REF", pub: true, cols: null },
  FBV_REPARTO: { g: "REF", pub: true, cols: null },
  COMPARATIVO_AUDITORIA: { g: "REF", pub: true, cols: null },
  // Registro de cambios
  LOG: { g: "LOG", pub: false, cols: ["Fecha", "Usuario", "Barrio", "Accion", "Detalle"] }
};

/* ===================== Planilla ===================== */
var DB_ = null;
function prop_(k, d) { return PropertiesService.getScriptProperties().getProperty(k) || d; }
/** Planilla de datos: la nueva (DB_ID) o, si todavía no se creó, la planilla a la que está vinculado el script. */
function db_() {
  if (DB_) return DB_;
  var id = prop_("DB_ID", "");
  DB_ = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!DB_) throw new Error("No hay planilla de datos. Ejecutá crearPlanilla() desde el editor.");
  return DB_;
}
function ss_() { return db_(); }
function tz_() { return db_().getSpreadsheetTimeZone(); }
function hoy_() { return Utilities.formatDate(new Date(), tz_(), "yyyy-MM-dd"); }
function ahora_() { return Utilities.formatDate(new Date(), tz_(), "yyyy-MM-dd HH:mm:ss"); }
function fechaOk_(f) { return /^\d{4}-\d{2}-\d{2}$/.test(String(f || "")) ? String(f) : hoy_(); }

/** Lee una hoja como lista de objetos. Las fechas salen como texto AAAA-MM-DD. */
function readSheet_(name, ssOpt) {
  var ss = ssOpt || db_(), sh = ss.getSheetByName(name); if (!sh || sh.getLastRow() < 2) return [];
  var v = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues(), h = v[0], tz = ss.getSpreadsheetTimeZone();
  return v.slice(1).map(function (r) { var o = {}; h.forEach(function (k, i) { if (k === "") return; var x = r[i]; o[k] = x instanceof Date ? Utilities.formatDate(x, tz, "yyyy-MM-dd") : x; }); return normMes_(o); })
    .filter(function (o) { return Object.keys(o).some(function (k) { return o[k] !== ""; }); });
}
/**
 * El mes siempre como texto AAAA-MM. Sheets a veces guarda "2026-10" como fecha (serial 46296) o como "2026-10-01":
 * si la fila tiene ID_Periodo (S2-2026-10) manda ese; si no, se convierte el serial o la fecha.
 */
function normMes_(o) {
  if (!o.hasOwnProperty("Mes")) return o;
  var m = String(o.ID_Periodo || "").match(/-(\d{4}-\d{2})$/);
  if (m) { o.Mes = m[1]; return o; }
  var x = o.Mes;
  if (typeof x === "number" || /^\d{5}(\.\d+)?$/.test(String(x))) { var n = Number(x); if (n > 30000 && n < 80000) { var d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 864e5); o.Mes = d.getUTCFullYear() + "-" + ("0" + (d.getUTCMonth() + 1)).slice(-2); } }
  else if (/^\d{4}-\d{2}-\d{2}/.test(String(x))) o.Mes = String(x).slice(0, 7);
  return o;
}
function headers_(name) {
  var sh = db_().getSheetByName(name); if (!sh) throw new Error("No existe la hoja " + name + ". Ejecutá crearPlanilla().");
  return sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
}
/** Agrega filas por nombre de columna. Solo valores: la planilla nueva no tiene fórmulas. Si llega una columna nueva, se agrega al final. */
function append_(name, recs) {
  if (!recs || !recs.length) return;
  var sh = db_().getSheetByName(name); if (!sh) throw new Error("No existe la hoja " + name);
  var hd = headers_(name).filter(function (h) { return h !== ""; }), extra = [];
  recs.forEach(function (r) { Object.keys(r).forEach(function (k) { if (k.charAt(0) !== "_" && hd.indexOf(k) < 0 && extra.indexOf(k) < 0) extra.push(k); }); });
  if (extra.length) { sh.getRange(1, hd.length + 1, 1, extra.length).setValues([extra]).setFontWeight("bold"); hd = hd.concat(extra); }
  var vals = recs.map(function (r) { return hd.map(function (h) { var x = r.hasOwnProperty(h) ? r[h] : ""; return x === null || x === undefined ? "" : (typeof x === "string" && /^[=+]/.test(x) ? "'" + x : x); }); });
  escribir_(sh, sh.getLastRow() + 1, hd, vals);
}
/** Columnas que se guardan como texto, para que Sheets no convierta "2026-10" o "10/2026" en fechas. */
function esTexto_(h) { return h !== "Periodo_Num" && /^(Mes|Fecha.*|Vence|Liquidacion|ID_.*|Periodo.*|Numero|Pagina|Item|Comprobante|Cuenta.*|CUIT.*|Clave|Rubro_Archivo|Puntos|Barrios?)$/.test(h); }
function escribir_(sh, fila, hd, vals) {
  if (!vals.length) return;
  hd.forEach(function (h, i) { if (esTexto_(h)) sh.getRange(fila, i + 1, vals.length, 1).setNumberFormat("@"); });
  sh.getRange(fila, 1, vals.length, hd.length).setValues(vals.map(function (r) { return r.map(function (x, i) { return esTexto_(hd[i]) && x !== "" && !(x instanceof Date) ? String(x) : x; }); }));
}
/** Actualiza campos de la fila cuya columna keyCol vale keyVal. Devuelve la fila anterior (para el LOG) o null. */
function updateRow_(name, keyCol, keyVal, fields) {
  var sh = db_().getSheetByName(name), hd = headers_(name), k = hd.indexOf(keyCol);
  if (k < 0) throw new Error("La hoja " + name + " no tiene la columna " + keyCol);
  var n = Math.max(sh.getLastRow() - 1, 1), vals = sh.getRange(2, 1, n, hd.length).getValues();
  for (var i = 0; i < vals.length; i++) if (String(vals[i][k]) === String(keyVal)) {
    var antes = {}; hd.forEach(function (h, j) { antes[h] = vals[i][j]; });
    Object.keys(fields).forEach(function (f) { var c = hd.indexOf(f); if (c < 0) { sh.getRange(1, hd.length + 1).setValue(f).setFontWeight("bold"); hd.push(f); c = hd.length - 1; } sh.getRange(i + 2, c + 1).setValue(fields[f]); });
    return antes;
  }
  return null;
}
function nextId_(rows, key, prefix, width) {
  var m = rows.reduce(function (a, r) { return Math.max(a, +String(r[key] || "").replace(/\D/g, "") || 0); }, 0);
  return prefix + ("000000" + (m + 1)).slice(-width);
}
function num_(v) { return v === null || v === undefined || v === "" ? 0 : Number(v); }
function r2_(v) { return Math.round(v * 100) / 100; }
function pad_(n) { return ("00" + n).slice(-3); }
function norm_(s) { return String(s || "").toUpperCase().replace(/\s+/g, " ").trim(); }
function labelP_(id) { var p = id.split("-"); return MESES[+p[1]] + " " + p[0]; }
function toDate_(s) { if (!s || s === ND) return ND; var p = String(s).split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
function moneyTxt_(v) { return "$ " + Number(v).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, "."); }
function hdrStyle_(sh, n) { sh.getRange(1, 1, 1, n).setFontWeight("bold").setBackground("#17212B").setFontColor("#FFFFFF"); sh.setFrozenRows(1); }
function folder_(name) {
  var id = prop_("DRIVE_FOLDER_ID", "");
  var root = id ? DriveApp.getFolderById(id) : DriveApp.getRootFolder();
  var it = root.getFoldersByName(name); return it.hasNext() ? it.next() : root.createFolder(name);
}
function log_(user, barrio, accion, detalle) {
  try { append_("LOG", [{ Fecha: ahora_(), Usuario: user ? user.usuario : "sistema", Barrio: barrio || "", Accion: accion, Detalle: String(typeof detalle === "string" ? detalle : JSON.stringify(detalle)).slice(0, 45000) }]); } catch (e) {}
}
