/**
 * Qué se publica y cómo se limpia. La app la ve cualquiera con el link, así que acá se aplican las reglas de privacidad:
 *  - nunca salen USUARIOS, PADRON_PRIVADO, PRORRATEO, MOROSIDAD, CUPON_UNIDAD, RECIBOS, CONTINUIDAD, CARGAS, NORMALIZACION ni LOG;
 *  - sin deuda por unidad: se quitan los saldos por unidad y los números de lote cuando el texto habla de deuda o pagos;
 *  - sin nombres de empleados: se reemplazan por "(PERSONA EXCLUIDA)";
 *  - terceros que son personas físicas: "Persona física" y CUIT enmascarado (salvo el administrador y los emisores de factura);
 *  - sin nombres de archivo personales: la fuente de una liquidación se muestra como "Liquidación MM/AAAA".
 * publicar_() es una función pura (no usa servicios de Google): la misma lógica arma los datos de demostración de la app.
 */
var RE_EXCL_ = /\b(MENOS|SIN|EXCEPTO|EXCLUYE)\s+([A-ZÁÉÍÓÚÑ]{3,}(?:\s+[A-ZÁÉÍÓÚÑ]{3,}){1,2})(?=\s+(\$|OP\b|DE\s+\$))/g;
var SIN_BARRIO_ = { BARRIOS: 1, PARAMETROS: 1, PROVEEDORES: 1, CATEGORIAS: 1, CONCEPTOS: 1, INDICES: 1, HALLAZGOS_CALCULO: 1, PLAN_ACCION: 1, RECLAMOS: 1 };
var TODOS_LOS_BARRIOS_ = { PERIODOS: 1, GASTOS: 1, BARRIOS: 1 };   // se publican de todos los barrios para comparar
var QUITAR_COLS_ = { Drive_URL: 1, Clave: 1, Clave_Hash: 1, Salt: 1, Usuario: 1 };

function nombresExcluidosDe_(sheets, extra) {
  var out = {};
  ["GASTOS", "DETALLE_COMPONENTES", "PAGOS_PER_ANTERIORES"].forEach(function (n) {
    (sheets[n] || []).forEach(function (r) { Object.keys(r).forEach(function (k) {
      String(r[k] == null ? "" : r[k]).replace(RE_EXCL_, function (m, a, nom) { out[nom] = 1; var w = nom.split(/\s+/); if (w[w.length - 1].length >= 4) out[w[w.length - 1]] = 1; return m; });
    }); });
  });
  String(extra || "").split(",").map(function (s) { return s.trim().toUpperCase(); }).filter(function (s) { return s.length >= 4; }).forEach(function (s) { out[s] = 1; });
  return Object.keys(out).sort(function (a, b) { return b.length - a.length; });
}
function sinNombres_(t, noms) {
  var s = String(t).replace(RE_EXCL_, "$1 (PERSONA EXCLUIDA)");
  (noms || []).forEach(function (nm) { s = s.split(nm).join("(PERSONA EXCLUIDA)"); });
  return s;
}
function esPersona_(c) { return /^(20|23|24|27)\d{9}$/.test(String(c || "").replace(/\D/g, "")); }
function mask_(c) { var d = String(c || "").replace(/\D/g, ""); return d.length === 11 ? d.slice(0, 2) + "-" + d.slice(2, 6) + "****-" + d.slice(10) : ""; }
/** Enmascara CUIT de personas físicas dentro de un texto (con o sin guiones), salvo los del administrador. */
function sinCuitPersonas_(t, admins) {
  return String(t).replace(/\b(2[0347])-?(\d{8})-?(\d)\b/g, function (m, a, b, c) { var d = a + b + c; return admins.indexOf(d) >= 0 ? m : mask_(d); });
}
/** Saca números de lote o unidad de las frases que hablan de deuda, mora o pagos. */
function sinLotes_(t) {
  var partes = String(t).split(/([.;:]\s+)/);
  return partes.map(function (s) {
    if (!/moros|deud|adeud|pagaron|pag[oó]\b|previsi|atrasad/i.test(s)) return s;
    return s.replace(/\b(los\s+|las\s+|el\s+|la\s+)?(lotes?|UF|unidad(?:es)?|U)\s*\d+[A-Z]?(?:\s*(?:,|y|e)\s*\d+[A-Z]?)*/gi, function (m, art) {
      var varios = /,|\sy\s|\se\s/.test(m) || /lotes|unidades/i.test(m);
      return (art ? (varios ? "los " : "un ") : "") + (varios ? "lotes con deuda" : "lote con deuda");
    });
  }).join("");
}
function privComp_(r, admins) {
  var esAdm = function (c) { return admins.indexOf(String(c || "").replace(/\D/g, "")) >= 0; };
  ["Destinatario", "Ordenante"].forEach(function (k) { var c = r["CUIT_" + k];
    if (esPersona_(c) && !esAdm(c) && r.Tipo !== "FACTURA") { r[k] = "Persona física"; r["CUIT_" + k] = mask_(c); } });
  if (r.Tipo === "TRANSFERENCIA" && !r.CUIT_Destinatario && r.Destinatario && !/S\.?A|S\.?R\.?L|COOP|FIDEIC|BANCO|EDENOR|ARBA/i.test(r.Destinatario)) r.Destinatario = "Persona física";
}

/**
 * sheets: { HOJA: [filas] } leídas de la planilla. barrio: "S2" (o "*" para todo, solo uso interno).
 * Devuelve una copia limpia lista para publicar.
 */
function publicar_(sheets, barrio, schema) {
  schema = schema || SCHEMA;
  var admins = (sheets.BARRIOS || []).map(function (b) { return String(b.CUIT_Administrador || "").replace(/\D/g, ""); }).filter(String);
  var par = {}; (sheets.PARAMETROS || []).forEach(function (p) { par[p.Clave] = p.Valor; });
  var noms = nombresExcluidosDe_(sheets, par.Nombres_Excluir);
  var deBarrio = function (r) {
    if (barrio === "*") return true;
    if (r.Barrio !== undefined && r.Barrio !== "") return String(r.Barrio) === barrio;
    if (r.Barrios !== undefined && r.Barrios !== "") return String(r.Barrios).split(",").map(function (x) { return x.trim(); }).indexOf(barrio) >= 0;
    if (r.ID_Periodo) return String(r.ID_Periodo).indexOf(barrio + "-") === 0;
    return true;
  };
  var limpiarTxt = function (s) { return sinLotes_(sinCuitPersonas_(sinNombres_(s, noms), admins)); };
  var out = {};
  Object.keys(schema).forEach(function (n) {
    if (!schema[n].pub || !sheets[n]) return;
    var rows = sheets[n].map(function (r) { var o = {}; Object.keys(r).forEach(function (k) { if (k.charAt(0) !== "_" && !QUITAR_COLS_[k]) o[k] = r[k]; }); return o; });
    if (!SIN_BARRIO_[n] && !TODOS_LOS_BARRIOS_[n]) rows = rows.filter(deBarrio);
    if (rows.length && rows[0].hasOwnProperty("Publicable")) rows = rows.filter(function (r) { return r.Publicable !== "NO"; });
    if (n === "SALDOS_PATRIMONIO") rows = rows.filter(function (r) { return r.Bloque !== "SALDOS_PENDIENTES" && r.Bloque !== "COBROS_IDENTIFICADOS"; });
    if (n === "DOCUMENTOS") rows.forEach(function (r) { if (r.Visible_Publico !== "SI") r.URL_Publica = ""; });
    if (n === "COMPROBANTES") rows.forEach(function (r) { privComp_(r, admins); });
    if (n === "MOVIMIENTOS_BANCO") rows.forEach(function (r) {
      if (esPersona_(r.CUIT_Contraparte) && admins.indexOf(String(r.CUIT_Contraparte).replace(/\D/g, "")) < 0) { r.Contraparte = "Persona física"; r.CUIT_Contraparte = mask_(r.CUIT_Contraparte); }
    });
    if (n === "REPORTES") rows = rows.filter(function (r) { return r.Estado && r.Estado !== "BORRADOR"; });
    if (n === "CONTROL_CALIDAD" || n === "VALIDACIONES") rows = rows.filter(function (r) { return !/\bU\d|Un\.|Cup[oó]n|\b\d-\d{1,2}\b/.test(String(r.Problema || "") + " " + String(r.Dato || "") + " " + String(r.Control || "")); });
    rows.forEach(function (r) {
      Object.keys(r).forEach(function (k) {
        // El PDF de la liquidación es el cupón de un propietario: su nombre de archivo no se publica.
        var esPdfLiq = n !== "COMPROBANTES" && n !== "MOVIMIENTOS_BANCO" && typeof r[k] === "string" && /\.pdf\s*$/i.test(r[k]);
        if ((k === "Fuente_PDF" && r[k]) || esPdfLiq) {
          var m = String(r[k]).match(/(\d{4})[_-](\d{2})(?!\d)/) || String(r.Mes || r.ID_Periodo || r.Periodo || "").match(/(\d{4})-(\d{2})/);
          r[k] = m ? "Liquidación " + m[2] + "/" + m[1] : "Liquidación"; return;
        }
        if (/^CUIT/.test(k) && esPersona_(r[k]) && admins.indexOf(String(r[k]).replace(/\D/g, "")) < 0) { r[k] = mask_(r[k]); return; }
        if (typeof r[k] === "string" && r[k]) r[k] = limpiarTxt(r[k]);
      });
    });
    out[n] = rows;
  });
  return out;
}
