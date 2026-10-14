/**
 * Escrituras del auditor. Cada función verifica que el usuario pueda tocar el barrio del registro
 * (no solo el barrio que dice el pedido) y deja constancia en LOG.
 * Circuito: indicador automático (lo calcula la app) → el auditor lo confirma o descarta (INDICADORES)
 *           → si lo confirma nace un HALLAZGO → entra al mail (REPORTES) → se sigue en BITACORA y RESPUESTAS_ADMIN.
 */
function exigir_(ses, barrio) { if (!puede_(ses, barrio)) throw new Error("Tu usuario no puede modificar datos de " + barrio + "."); }
function texto_(v, max) { return String(v == null ? "" : v).trim().slice(0, max || 2000); }

var TIPOS_EVENTO = ["COMENTARIO", "ACLARACIÓN", "RESPUESTA ADMINISTRACIÓN", "EN GESTIÓN", "SOLUCIONADO", "REABIERTO", "DESCARTADO", "ENVIADO EN MAIL"];
function evento_(b, ses) {
  var h = readSheet_("HALLAZGOS").filter(function (x) { return x.ID_Hallazgo === b.idHallazgo; })[0];
  if (!h) throw new Error("No se encontró el hallazgo " + b.idHallazgo + ".");
  exigir_(ses, h.Barrios);
  var tipo = String(b.tipo || "").toUpperCase(); if (TIPOS_EVENTO.indexOf(tipo) < 0) throw new Error("Tipo de registro no válido.");
  var texto = texto_(b.texto); if (!texto) throw new Error("Escribí el comentario.");
  var f = fechaOk_(b.fecha), ev = readSheet_("BITACORA");
  append_("BITACORA", [{ ID_Evento: nextId_(ev, "ID_Evento", "E", 3), Fecha: f, ID_Hallazgo: h.ID_Hallazgo, Tipo: tipo, Texto: texto, Autor: texto_(b.autor || ses.nombre, 80), Barrios: h.Barrios, Publicable: b.publicable === "NO" ? "NO" : "SI" }]);
  var upd = { Ultima_Actualizacion: f };
  if (tipo === "SOLUCIONADO") { upd.Estado = "SOLUCIONADO"; upd.Fecha_Solucion = f; upd.Como_Se_Resolvio = texto; }
  if (tipo === "REABIERTO") { upd.Estado = "ABIERTO"; upd.Fecha_Solucion = ""; }
  if (tipo === "EN GESTIÓN") upd.Estado = "EN GESTIÓN";
  if (tipo === "DESCARTADO") { upd.Estado = "DESCARTADO"; upd.Fecha_Solucion = f; upd.Como_Se_Resolvio = texto; }
  if (tipo === "RESPUESTA ADMINISTRACIÓN") { upd.Respuesta_Administracion = texto; upd.Estado_Reclamo = "RESPONDIDO"; }
  updateRow_("HALLAZGOS", "ID_Hallazgo", h.ID_Hallazgo, upd);
  log_(ses, h.Barrios, "EVENTO " + tipo, h.ID_Hallazgo + ": " + texto);
  return { ok: true };
}

var GRAVEDADES = ["CRÍTICO", "IMPORTANTE", "A REVISAR"];
function nuevoHallazgo_(b, ses) {
  var barrios = texto_(b.barrios || b.barrio, 20); exigir_(ses, barrios);
  var titulo = texto_(b.titulo, 200), desc = texto_(b.conclusion);
  if (!titulo || !desc) throw new Error("Completá el título y la conclusión en simple.");
  var hs = readSheet_("HALLAZGOS"), id = nextId_(hs, "ID_Hallazgo", "H", 2), f = fechaOk_(b.fecha);
  var orden = hs.reduce(function (a, x) { return Math.max(a, +x.Orden || 0); }, 0) + 1, monto = Number(b.monto) || 0;
  var imp = { Impacto_S1: 0, Impacto_S2: 0, Impacto_LH: 0 }; if (imp.hasOwnProperty("Impacto_" + b.barrio)) imp["Impacto_" + b.barrio] = Number(b.impacto) || monto;
  append_("HALLAZGOS", [{ ID_Hallazgo: id, Orden: orden, Gravedad: GRAVEDADES.indexOf(b.gravedad) >= 0 ? b.gravedad : "A REVISAR", Titulo: titulo, Conclusion_Simple: desc,
    Detalle_Tecnico: texto_(b.detalle, 5000), Barrios: barrios, Monto_Total: monto, Impacto_S1: imp.Impacto_S1, Impacto_S2: imp.Impacto_S2, Impacto_LH: imp.Impacto_LH,
    Tipo_Impacto: texto_(b.tipoImpacto || (monto ? "A RECUPERAR" : "NINGUNO"), 40), Recurrencia: "", Periodo_Afectado: texto_(b.periodo, 60), Verificacion: b.origen === "INDICADOR" ? "VERIFICADO POR EL AUDITOR" : "INFORMADO",
    Estado_Reclamo: "PENDIENTE DE RECLAMAR", Respuesta_Administracion: "", Que_Pedir: texto_(b.pedir), Proximo_Paso: "", Fuentes: texto_(b.fuentes || "Registro en la app", 500),
    Mes: texto_(b.mes || f.slice(0, 7), 7), Publicable: b.publicable === "NO" ? "NO" : "SI", Estado: "ABIERTO", Categoria_Problema: texto_(b.categoria || "OTROS", 40).toUpperCase(),
    Origen: texto_(b.origen || "AUDITORÍA", 40).toUpperCase(), Fecha_Alta: f, Fecha_Solucion: "", Como_Se_Resolvio: "", Ultima_Actualizacion: f }]);
  var ev = readSheet_("BITACORA");
  append_("BITACORA", [{ ID_Evento: nextId_(ev, "ID_Evento", "E", 3), Fecha: f, ID_Hallazgo: id, Tipo: "COMENTARIO", Texto: "Alta del hallazgo: " + desc, Autor: ses.nombre, Barrios: barrios, Publicable: "SI" }]);
  log_(ses, barrios, "NUEVO HALLAZGO", id + ": " + titulo);
  return { ok: true, id: id };
}
var CAMPOS_HALLAZGO = ["Gravedad", "Titulo", "Conclusion_Simple", "Detalle_Tecnico", "Que_Pedir", "Proximo_Paso", "Fuentes", "Monto_Total", "Publicable", "Estado", "Estado_Reclamo", "Tipo_Impacto"];
function editarHallazgo_(b, ses) {
  var h = readSheet_("HALLAZGOS").filter(function (x) { return x.ID_Hallazgo === b.id; })[0];
  if (!h) throw new Error("No se encontró el hallazgo " + b.id + "."); exigir_(ses, h.Barrios);
  var f = {}; CAMPOS_HALLAZGO.forEach(function (k) { if (b.campos && b.campos.hasOwnProperty(k)) f[k] = k === "Monto_Total" ? Number(b.campos[k]) || 0 : texto_(b.campos[k], 5000); });
  f.Ultima_Actualizacion = hoy_();
  var antes = updateRow_("HALLAZGOS", "ID_Hallazgo", b.id, f);
  log_(ses, h.Barrios, "EDITA HALLAZGO", { id: b.id, antes: pick_(antes, Object.keys(f)), despues: f });
  return { ok: true };
}
function pick_(o, ks) { var r = {}; (ks || []).forEach(function (k) { if (o && o.hasOwnProperty(k)) r[k] = o[k]; }); return r; }

/** Confirmar o descartar un indicador automático. Confirmar crea el hallazgo con los datos que calculó la app. */
function decidirIndicador_(b, ses) {
  exigir_(ses, b.barrio);
  var dec = String(b.decision || "").toUpperCase(); if (["CONFIRMADO", "DESCARTADO", "PENDIENTE"].indexOf(dec) < 0) throw new Error("Decisión no válida.");
  var clave = texto_(b.clave, 300); if (!clave) throw new Error("Falta la clave del indicador.");
  var idH = "";
  if (dec === "CONFIRMADO" && b.hallazgo) { var h = b.hallazgo; h.barrio = b.barrio; h.barrios = h.barrios || b.barrio; h.origen = "INDICADOR"; idH = nuevoHallazgo_(h, ses).id; }
  var ex = readSheet_("INDICADORES").filter(function (r) { return r.Clave === clave && r.Barrio === b.barrio; })[0];
  var rec = { Clave: clave, Barrio: b.barrio, Mes: texto_(b.mes, 7), Titulo: texto_(b.titulo, 200), Decision: dec, ID_Hallazgo: idH || (ex ? ex.ID_Hallazgo : ""), Nota: texto_(b.nota, 500), Usuario: ses.usuario, Fecha: hoy_() };
  if (ex) updateRow_("INDICADORES", "Clave", clave, rec); else append_("INDICADORES", [rec]);
  log_(ses, b.barrio, "INDICADOR " + dec, clave);
  return { ok: true, id: idH };
}

var ESTADOS_RESP = ["PENDIENTE", "CUMPLIDO", "CUMPLIDO TARDE", "PARCIAL", "NO CUMPLIDO", "CONTRADICHO", "SIN RESPUESTA", "NO APLICA"];
function respuesta_(b, ses) {
  exigir_(ses, b.barrio);
  if (!texto_(b.dijo)) throw new Error("Falta lo que dijo la administración.");
  var rows = readSheet_("RESPUESTAS_ADMIN"), id = nextId_(rows, "ID_Respuesta", "R", 3);
  append_("RESPUESTAS_ADMIN", [{ ID_Respuesta: id, Fecha: fechaOk_(b.fecha), Barrio: b.barrio, Dijo: texto_(b.dijo, 600), Documentos_Muestran: texto_(b.muestran, 900),
    Estado: ESTADOS_RESP.indexOf(b.estado) >= 0 ? b.estado : "PENDIENTE", ID_Hallazgo: texto_(b.idHallazgo, 10), Publicable: "SI" }]);
  log_(ses, b.barrio, "RESPUESTA ADMINISTRACIÓN", id);
  return { ok: true, id: id };
}

var REVISIONES = ["FACTURA", "TICKET_FISCAL", "NO_FISCAL", "PRESUPUESTO", "TRANSFERENCIA", "REFERENCIA", "IGNORAR", "PENDIENTE"];
function revision_(b, ses) {
  if (REVISIONES.indexOf(b.revision) < 0) throw new Error("Revisión no válida.");
  var c = readSheet_("COMPROBANTES").filter(function (x) { return x.ID_Comprobante === b.id; })[0]; if (!c) throw new Error("No se encontró el comprobante.");
  exigir_(ses, c.Barrio);
  var f = { Revision: b.revision }; if (b.importe !== undefined && b.importe !== "" && b.importe !== null) f.Importe = Number(b.importe);
  if (b.idGasto !== undefined) f.ID_Gasto = texto_(b.idGasto, 40); if (b.nota) f.Nota = texto_(b.nota, 300);
  if (b.revision === "FACTURA" || b.revision === "TICKET_FISCAL") f.Es_Fiscal = "SI"; else if (b.revision !== "PENDIENTE") f.Es_Fiscal = "NO";
  var antes = updateRow_("COMPROBANTES", "ID_Comprobante", b.id, f);
  log_(ses, c.Barrio, "REVISIÓN COMPROBANTE", { id: b.id, antes: pick_(antes, Object.keys(f)), despues: f });
  return { ok: true };
}
function guardarComprobantes_(b, ses) {
  exigir_(ses, b.barrio);
  var items = (b.items || []).filter(function (it) { return it.Barrio === b.barrio; }); if (!items.length) return { ok: true, nuevos: 0 };
  var cols = SCHEMA.COMPROBANTES.cols, ex = readSheet_("COMPROBANTES"), key = function (r) { return [r.ID_Periodo, r.Archivo, r.Pagina, r.Tipo, r.Numero, r.Importe].join("|"); }, have = {};
  ex.forEach(function (r) { have[key(r)] = 1; });
  var n0 = ex.reduce(function (a, r) { return Math.max(a, +String(r.ID_Comprobante || "").replace(/\D/g, "") || 0); }, 0), nuevos = [];
  items.forEach(function (it) { if (have[key(it)]) return; have[key(it)] = 1; n0++; var r = {}; cols.forEach(function (h) { if (it[h] !== undefined && it[h] !== null) r[h] = it[h]; });
    r.ID_Comprobante = "C" + ("00000" + n0).slice(-5); r.Fecha_Carga = hoy_(); if (it.Detalle) r.Detalle_JSON = JSON.stringify(it.Detalle); if (!r.Revision) r.Revision = r.Es_Fiscal === "REVISAR" ? "PENDIENTE" : ""; nuevos.push(r); });
  append_("COMPROBANTES", nuevos);
  log_(ses, b.barrio, "CARGA COMPROBANTES", nuevos.length + " nuevos");
  return { ok: true, nuevos: nuevos.length, repetidos: items.length - nuevos.length };
}
function guardarMovimientos_(b, ses) {
  exigir_(ses, b.barrio);
  var movs = b.movs || []; if (!movs.length) return { ok: true, nuevos: 0 };
  var cols = SCHEMA.MOVIMIENTOS_BANCO.cols, ex = readSheet_("MOVIMIENTOS_BANCO"), have = {}; ex.forEach(function (r) { have[r.Clave] = 1; });
  var n0 = ex.reduce(function (a, r) { return Math.max(a, +String(r.ID_Mov || "").replace(/\D/g, "") || 0); }, 0), nuevos = [], occ = {};
  movs.forEach(function (m) { var k0 = [m.Banco, m.Cuenta, m.Fecha, m.Descripcion, m.Debito, m.Credito, m.Saldo].join("|"); occ[k0] = (occ[k0] || 0) + 1; var k = k0 + "#" + occ[k0]; if (have[k]) return; have[k] = 1; n0++;
    var r = {}; cols.forEach(function (h) { if (m[h] !== undefined && m[h] !== null) r[h] = m[h]; }); r.ID_Mov = "M" + ("000000" + n0).slice(-6); r.Barrio = b.barrio; r.Clave = k; nuevos.push(r); });
  append_("MOVIMIENTOS_BANCO", nuevos);
  log_(ses, b.barrio, "CARGA EXTRACTO", nuevos.length + " movimientos nuevos");
  return { ok: true, nuevos: nuevos.length, repetidos: movs.length - nuevos.length };
}
function subirArchivo_(b, ses) {
  exigir_(ses, b.barrio);
  if (!b.base64 || !b.name) throw new Error("Falta el archivo.");
  var f = folder_("Auditoría - Respaldos"), sub = String(b.barrio) + " " + String(b.mes || "sin-mes");
  var it = f.getFoldersByName(sub), d = it.hasNext() ? it.next() : f.createFolder(sub);
  var same = d.getFilesByName(b.name); if (same.hasNext()) return { ok: true, url: same.next().getUrl(), existia: true };
  var blob = Utilities.newBlob(Utilities.base64Decode(b.base64), b.mime || "application/octet-stream", b.name);
  return { ok: true, url: d.createFile(blob).getUrl() };
}
function documento_(b, ses) {
  exigir_(ses, b.barrio);
  var titulo = texto_(b.titulo, 200), url = texto_(b.url, 500);
  if (!titulo || !/^https:\/\//.test(url)) throw new Error("Completá el título y un link que empiece con https://");
  var ds = readSheet_("DOCUMENTOS"), pub = b.publico === "SI";
  append_("DOCUMENTOS", [{ ID_Documento: nextId_(ds, "ID_Documento", "D", 3), ID_Periodo: b.mes ? b.barrio + "-" + b.mes : "", Barrio: b.barrio, Mes: texto_(b.mes, 7),
    Archivo: titulo, Titulo: titulo, Tipo: texto_(b.tipo || "OTRO", 30).toUpperCase(), Drive_URL: url, URL_Publica: pub ? url : "", Fecha_Carga: hoy_(), Visible_Publico: pub ? "SI" : "NO", Observacion: texto_(b.nota, 300) }]);
  log_(ses, b.barrio, "DOCUMENTO", titulo);
  return { ok: true };
}

var CAMPOS_OPORT = ["Mes", "Tipo", "Concepto", "Hoy", "Propuesta", "Ahorro_Mensual", "Prioridad", "Estado", "Origen", "Regla", "Aplicar_En_Modelo", "Ajuste_Titulo", "Ajuste_Detalle", "ID_Hallazgo"];
/** Alta o edición de una oportunidad de ahorro (pestaña 4). Con b.borrar = true se marca como DESCARTADA. */
function oportunidad_(b, ses) {
  exigir_(ses, b.barrio);
  var o = b.fila || {}, rows = readSheet_("OPORTUNIDADES"), ex = o.ID_Oportunidad ? rows.filter(function (r) { return r.ID_Oportunidad === o.ID_Oportunidad; })[0] : null;
  if (ex && ex.Barrio !== b.barrio) throw new Error("La oportunidad es de otro barrio.");
  var f = {}; CAMPOS_OPORT.forEach(function (k) { if (o.hasOwnProperty(k)) f[k] = k === "Ahorro_Mensual" ? (o[k] === "" || o[k] == null ? "" : Number(o[k])) : texto_(o[k], 1000); });
  if (b.borrar) f.Estado = "DESCARTADA";
  f.Actualizado = hoy_(); f.Usuario = ses.usuario;
  if (ex) { var antes = updateRow_("OPORTUNIDADES", "ID_Oportunidad", ex.ID_Oportunidad, f); log_(ses, b.barrio, "EDITA OPORTUNIDAD", { id: ex.ID_Oportunidad, antes: pick_(antes, Object.keys(f)), despues: f }); return { ok: true, id: ex.ID_Oportunidad }; }
  if (!f.Concepto) throw new Error("Falta el concepto.");
  f.ID_Oportunidad = nextId_(rows, "ID_Oportunidad", "O", 3); f.Barrio = b.barrio; f.Origen = f.Origen || "AUDITOR"; f.Tipo = f.Tipo || "AHORRO"; f.Estado = f.Estado || "PROPUESTA";
  append_("OPORTUNIDADES", [f]);
  log_(ses, b.barrio, "NUEVA OPORTUNIDAD", f.ID_Oportunidad + ": " + f.Concepto);
  return { ok: true, id: f.ID_Oportunidad };
}

/** Guarda un mail como enviado (o actualiza su seguimiento). Queda público sin la firma. */
function reporte_(b, ses) {
  exigir_(ses, b.barrio);
  var r = b.fila || {}, rows = readSheet_("REPORTES");
  if (r.ID_Reporte) {
    var ex = rows.filter(function (x) { return x.ID_Reporte === r.ID_Reporte; })[0]; if (!ex || ex.Barrio !== b.barrio) throw new Error("No se encontró el reporte.");
    var f = {}; ["Estado", "Fecha_Respuesta", "Nota"].forEach(function (k) { if (r.hasOwnProperty(k)) f[k] = texto_(r[k], 2000); });
    updateRow_("REPORTES", "ID_Reporte", r.ID_Reporte, f); log_(ses, b.barrio, "SEGUIMIENTO REPORTE", r.ID_Reporte + " " + JSON.stringify(f)); return { ok: true, id: r.ID_Reporte };
  }
  var id = nextId_(rows, "ID_Reporte", "M", 3);
  append_("REPORTES", [{ ID_Reporte: id, Barrio: b.barrio, Fecha_Envio: fechaOk_(r.Fecha_Envio), Para: texto_(r.Para, 200), Asunto: texto_(r.Asunto, 300), Tono: texto_(r.Tono, 20),
    Plazo_Dias: Number(r.Plazo_Dias) || 10, Vence: texto_(r.Vence, 10), Puntos: texto_(r.Puntos, 2000), Cuerpo: texto_(r.Cuerpo, 45000), Estado: "ENVIADO", Fecha_Respuesta: "", Nota: "", Usuario: ses.usuario }]);
  // cada hallazgo incluido queda registrado en su bitácora
  var ids = String(r.Puntos || "").split(",").map(function (x) { return x.trim(); }).filter(String), hs = readSheet_("HALLAZGOS"), ev = readSheet_("BITACORA"), add = [];
  ids.forEach(function (hid) { var h = hs.filter(function (x) { return x.ID_Hallazgo === hid; })[0]; if (!h) return;
    add.push({ ID_Evento: nextId_(ev.concat(add), "ID_Evento", "E", 3), Fecha: fechaOk_(r.Fecha_Envio), ID_Hallazgo: hid, Tipo: "ENVIADO EN MAIL", Texto: "Incluido en el mail " + id + " (vence " + (r.Vence || "s/d") + ").", Autor: ses.nombre, Barrios: h.Barrios, Publicable: "SI" }); });
  append_("BITACORA", add);
  log_(ses, b.barrio, "MAIL ENVIADO", id + ": " + ids.length + " puntos");
  return { ok: true, id: id };
}

var CAMPOS_GASTO = ["Es_Estimado", "Es_Provisorio", "Ordinario_Extraordinario", "Observacion", "Estado_Pago"];
/** Corrección puntual de un gasto ya cargado (por ejemplo, marcar un importe como provisorio). Queda en LOG con el valor anterior. */
function editarGasto_(b, ses) {
  var g = readSheet_("GASTOS").filter(function (x) { return x.ID_Gasto === b.id; })[0]; if (!g) throw new Error("No se encontró el gasto.");
  exigir_(ses, g.Barrio);
  var f = {}; CAMPOS_GASTO.forEach(function (k) { if (b.campos && b.campos.hasOwnProperty(k)) f[k] = texto_(b.campos[k], 500); });
  var antes = updateRow_("GASTOS", "ID_Gasto", b.id, f);
  log_(ses, g.Barrio, "EDITA GASTO", { id: b.id, antes: pick_(antes, Object.keys(f)), despues: f });
  return { ok: true };
}

/** Cambia el nombre con el que se muestra una liquidación (no toca ningún importe). */
function editarPeriodo_(b, ses) {
  var p = readSheet_("PERIODOS").filter(function (x) { return x.ID_Periodo === b.id; })[0]; if (!p) throw new Error("No se encontró la liquidación " + b.id + ".");
  exigir_(ses, p.Barrio);
  var t = texto_(b.titulo, 80); if (!t) throw new Error("Escribí un nombre.");
  var antes = updateRow_("PERIODOS", "ID_Periodo", b.id, { Titulo: t });
  log_(ses, p.Barrio, "NOMBRE LIQUIDACIÓN", { id: b.id, antes: antes ? antes.Titulo : "", despues: t });
  return { ok: true };
}
