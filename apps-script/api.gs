/**
 * API pública (GET) y de carga (POST).
 *
 * GET  ?action=data&barrio=S2&v=15   → datos públicos del barrio. Si v es la versión actual responde {notModified:true}.
 * GET  ?action=version                → {version}
 * POST (texto plano con JSON, para evitar la consulta previa de CORS):
 *   {action:"login", usuario, clave}                     → {token, barrio, rol}
 *   {action:"<acción>", token, barrio, ...}              → ver ACCIONES más abajo
 * Cada escritura usa LockService, queda en la hoja LOG y sube la versión de los datos.
 */
function doGet(e) {
  try {
    var p = (e && e.parameter) || {}, a = p.action || "data";
    if (a === "version") return out_({ version: version_() });
    if (a === "data") {
      var barrio = String(p.barrio || "S2"), v = version_();
      if (p.v && String(p.v) === String(v)) return out_({ notModified: true, version: v });
      return outText_(publicJson_(barrio, v));
    }
    return out_({ error: "Acción desconocida." });
  } catch (err) { return out_({ error: String(err && err.message || err) }); }
}

var ACCIONES = {
  preview: { fn: function (b, s) { return { preview: prepareAndStore_(parseJson_(b.json), { origen: b.pdfBase64 ? "PDF (lectura en la app)" : "JSON", archivo: b.filename || "carga manual", fileUrl: guardarPdf_(b), usuario: s.usuario }, s) }; }, escribe: false },
  commit: { fn: function (b, s) { return commit_(b.draftId, !!b.force, s); } },
  evento: { fn: function (b, s) { return evento_(b, s); } },
  nuevo_hallazgo: { fn: function (b, s) { return nuevoHallazgo_(b, s); } },
  hallazgo: { fn: function (b, s) { return editarHallazgo_(b, s); } },
  indicador: { fn: function (b, s) { return decidirIndicador_(b, s); } },
  respuesta: { fn: function (b, s) { return respuesta_(b, s); } },
  revision: { fn: function (b, s) { return revision_(b, s); } },
  comprobantes: { fn: function (b, s) { return guardarComprobantes_(b, s); } },
  movimientos: { fn: function (b, s) { return guardarMovimientos_(b, s); } },
  subir_archivo: { fn: function (b, s) { return subirArchivo_(b, s); }, escribe: false },
  documento: { fn: function (b, s) { return documento_(b, s); } },
  oportunidad: { fn: function (b, s) { return oportunidad_(b, s); } },
  reporte: { fn: function (b, s) { return reporte_(b, s); } },
  gasto: { fn: function (b, s) { return editarGasto_(b, s); } }
};

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var body = JSON.parse(e.postData.contents || "{}");
    if (body.action === "login") return out_(login_(body));
    if (body.action === "logout") return out_(logout_(body));
    var A = ACCIONES[body.action]; if (!A) return out_({ error: "Acción desconocida." });
    var ses = sesion_(body.token, body.barrio);
    if (A.escribe === false) return out_(A.fn(body, ses));
    lock.waitLock(30000);
    var res = A.fn(body, ses);
    SpreadsheetApp.flush();
    res.version = bump_();
    return out_(res);
  } catch (err) { return out_({ error: String(err && err.message || err) }); }
  finally { try { lock.releaseLock(); } catch (x) {} }
}

function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function outText_(s) { return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.JSON); }
function parseJson_(t) {
  if (typeof t !== "string") return t;
  var s = t.replace(/```json|```/g, "").trim(); var i = s.indexOf("{"), j = s.lastIndexOf("}");
  try { return JSON.parse(s.slice(i, j + 1)); } catch (e) { throw new Error("El JSON no es válido: " + e.message); }
}

/* ===================== Versión y caché ===================== */
function version_() { return +prop_("VER", "1"); }
function bump_() { var P = PropertiesService.getScriptProperties(), v = version_() + 1; P.setProperty("VER", String(v)); return v; }

/** Arma el JSON público del barrio y lo guarda en la caché en trozos de 90 KB (el límite de CacheService es 100 KB por clave). */
function publicJson_(barrio, v) {
  var C = CacheService.getScriptCache(), base = "pub_" + barrio + "_" + v, n = C.get(base + "_n");
  if (n) {
    var keys = []; for (var i = 0; i < +n; i++) keys.push(base + "_" + i);
    var got = C.getAll(keys), parts = keys.map(function (k) { return got[k]; });
    if (parts.every(function (x) { return x != null; })) return parts.join("");
  }
  var s = JSON.stringify(publicData_(barrio, v)), put = {}, CH = 90000, cnt = Math.ceil(s.length / CH);
  for (var j = 0; j < cnt; j++) put[base + "_" + j] = s.slice(j * CH, (j + 1) * CH);
  put[base + "_n"] = String(cnt);
  try { C.putAll(put, 21600); } catch (e) {}
  return s;
}
function publicData_(barrio, v) {
  var raw = {};
  Object.keys(SCHEMA).forEach(function (n) { if (SCHEMA[n].pub) raw[n] = readSheet_(n); });
  return { version: v || version_(), updated: ahora_(), barrio: barrio, sheets: publicar_(raw, barrio, SCHEMA) };
}
