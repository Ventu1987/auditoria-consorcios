/**
 * Lectura y controles de una liquidación.
 * prepare_() y sus funciones auxiliares se copiaron sin cambios de lógica del portal v7 (ya probadas con las liquidaciones 05 a 10/2026).
 * Lo nuevo: el borrador guarda quién lo cargó, commit_() escribe solo valores (sin fórmulas) y calcula
 * Unidades_Con_Deuda (dato agregado, público) a partir del prorrateo (privado).
 */
function context_() {
  return { periodos: readSheet_("PERIODOS"), gastos: readSheet_("GASTOS"), reglas: readSheet_("NORMALIZACION"), proveedores: readSheet_("PROVEEDORES"),
           fondos: readSheet_("FONDOS"), cc: readSheet_("CONTROL_CALIDAD"), barrios: readSheet_("BARRIOS") };
}
function classify_(texto, reglas, provs) {
  var t = norm_(texto), best = null;
  reglas.forEach(function (r) { var k = norm_(r.Texto_Clave_Contiene); if (k && t.indexOf(k) >= 0 && (!best || k.length > norm_(best.Texto_Clave_Contiene).length)) best = r; });
  if (best) { var pv = provs.filter(function (p) { return p.ID_Proveedor === best.ID_Proveedor; })[0];
    return { concepto: best.Concepto_Normalizado, categoria: best.Categoria, sub: best.Subcategoria, tipo: best.Tipo_Gasto, idProv: best.ID_Proveedor, prov: pv ? pv.Proveedor : best.ID_Proveedor, regla: true }; }
  var nombre = String(texto).split(/ \(| - /)[0].trim();
  return { concepto: "SIN CLASIFICAR: " + nombre.slice(0, 40), categoria: "OTROS", sub: "Otros", tipo: "A DETERMINAR", idProv: "", prov: nombre, regla: false };
}
function comprobante_(t) {
  var s = norm_(t), m;
  if ((m = s.match(/CUOTA (\d+)/))) return "Cuota " + m[1];
  if ((m = s.match(/P[ÓO]LIZA (\d+)/))) return "Póliza " + m[1];
  if ((m = s.match(/\bFC\.?\s?([A-Z0-9][A-Z0-9\-]*)/))) { var r = m[1].replace(/^FC/, ""); return /^[A-Z]/.test(r) ? "FC " + r : "FC" + r; }
  return ND;
}
function periodoServicio_(t, periodo) {
  var s = norm_(t), m, y = +periodo.slice(0, 4), pm = +periodo.slice(5, 7);
  if ((m = s.match(/(\d{1,2})\/(\d{4}) \(\d{1,2}\/\d{4}\)/))) return m[2] + "-" + ("0" + m[1]).slice(-2);
  if ((m = s.match(/MES DE (ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|SETIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)/))) {
    var k = ["ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO","JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE"].indexOf(m[1] === "SETIEMBRE" ? "SEPTIEMBRE" : m[1]) + 1;
    return (k > pm ? y - 1 : y) + "-" + ("0" + k).slice(-2);
  }
  return ND;
}
function tipoEgreso_(c) {
  var s = norm_(c);
  if (s.indexOf("EGRESOS POR GASTOS") === 0) return GM;
  if (s.indexOf("COBROS IDENTIFICADOS") === 0) return RC;
  if (s.indexOf("AJUSTE") >= 0 || s.indexOf("DIFERENCIA") >= 0) return AJ;
  return SD;
}
function origenIngreso_(c) {
  var s = norm_(c);
  if (s.indexOf("NO IDENTIFICADO") >= 0) return "Cobros no identificados";
  if (s.indexOf("INTERES") >= 0) return "Intereses por mora";
  if (s.indexOf("ADEUDAD") >= 0) return "Expensas adeudadas";
  if (s.indexOf("TÉRMINO") >= 0 || s.indexOf("TERMINO") >= 0) return "Expensas en término";
  return "Otros ingresos";
}
function matchPendientes_(gastos, pend) {
  var used = {};
  pend.forEach(function (p) {
    var imp = Math.abs(num_(p.importe)), pre = norm_(p.concepto_original).slice(0, 30);
    var cand = gastos.map(function (g, i) { return i; }).filter(function (i) { return !used[i] && Math.abs(num_(gastos[i].importe) - imp) < 0.005; });
    var best = cand.filter(function (i) { var t = norm_(gastos[i].concepto_original); return t.indexOf(pre) === 0 || pre.indexOf(t.slice(0, 30)) === 0; })[0];
    if (best === undefined) best = cand[0];
    if (best !== undefined) used[best] = true;
  });
  return used;
}

function prepare_(liq, meta, ctx) {
  var p = String(liq.periodo || ""); if (!/^\d{4}-\d{2}$/.test(p)) throw new Error("El período leído no es válido: " + p);
  var bloqueos = [], obs = [];
  var bt = String(liq.barrio_texto || "").toLowerCase(), B0 = null;
  ctx.barrios.forEach(function (b) { if (!B0 && b.Patron_En_PDF && new RegExp(b.Patron_En_PDF, "i").test(bt)) B0 = b; });
  if (!B0) { bloqueos.push("No se reconoció el barrio de la liquidación ('" + (liq.barrio_texto || "sin texto") + "'). Agregalo en la hoja BARRIOS con un patrón que lo identifique."); B0 = { ID_Barrio: "XX", Nombre: liq.barrio_texto || "Desconocido" }; }
  var bid = B0.ID_Barrio, idP = bid + "-" + p, pnum = +p.replace("-", ""), pdf = meta.archivo;
  var esB = function (r) { return r.Barrio === bid; };
  var periodos = ctx.periodos.filter(esB).sort(function (a, b) { return a.Periodo_Num - b.Periodo_Num; });
  if (periodos.some(function (x) { return x.ID_Periodo === idP; })) bloqueos.push("La liquidación " + p + " de " + B0.Nombre + " ya está cargada en la base.");
  var prev = periodos.filter(function (x) { return x.Periodo_Num < pnum; }).pop();
  var prevId = prev ? prev.ID_Periodo : null;
  var lastGastos = periodos.filter(function (x) { return x.Periodo_Num < pnum && num_(x.Total_Gastos_Periodo) > 1; }).pop();
  var gastosB = ctx.gastos.filter(esB);
  var gs = liq.gastos || [], pend = liq.gastos_pendientes || [], used = matchPendientes_(gs, pend);
  if (pend.length && Object.keys(used).length !== pend.length) obs.push(cc_("Gastos pendientes", "No se pudo vincular " + (pend.length - Object.keys(used).length) + " gasto(s) pendiente(s) con los ítems liquidados.", "🟡 REVISAR", "Verificar el estado de pago en el PDF.", "CÁLCULO"));
  var G = gs.map(function (g, i) {
    var c = classify_(g.concepto_original, ctx.reglas, ctx.proveedores), est = /ESTIMADO/i.test(g.concepto_original);
    if (!c.regla) obs.push(cc_("Concepto sin clasificar", "No hay regla de normalización para: " + String(g.concepto_original).slice(0, 120), "🟡 REVISAR", "Agregar una regla en NORMALIZACION y corregir Categoría/Concepto en GASTOS.", "DATO"));
    return { ID_Gasto: idP + "-G" + pad_(i + 1), ID_Periodo: idP, Barrio: bid, Mes: p, Periodo: labelP_(p), Periodo_Num: pnum, Fecha: ND, Rubro_Original: g.rubro, Item: g.item || "",
      Categoria: c.categoria, Subcategoria: c.sub, Concepto_Original: g.concepto_original, Concepto_Normalizado: c.concepto, ID_Proveedor: c.idProv, Proveedor: c.prov,
      Detalle: "", Tipo_Gasto: c.tipo, Importe: num_(g.importe), IVA: ND, Ordinario_Extraordinario: g.columna === "EXT" ? "EXTRAORDINARIO" : "ORDINARIO",
      Periodo_Servicio: periodoServicio_(g.concepto_original, p), Estado_Pago: used[i] ? "PENDIENTE" : "PAGADO EN PERÍODO", Es_Estimado: est ? "SI" : "NO",
      Base_Prorrateo_Doc: g.base_calculo == null ? "" : num_(g.base_calculo), Porc_Participacion_Doc: g.porcentaje == null ? "" : num_(g.porcentaje),
      Medio_Pago: ND, Comprobante: comprobante_(g.concepto_original), Observacion: c.regla ? "" : "Sin regla de normalización.", Fuente_PDF: pdf,
      Pagina: String(g.pagina || ""), Estado_Validacion: c.regla && !est ? "VALIDADO (carga automática)" : "REVISAR", _sinRegla: !c.regla };
  });
  var tg = r2_(G.reduce(function (a, g) { return a + g.Importe; }, 0));
  // pagos de períodos anteriores
  var PA = (liq.pagos_periodos_anteriores || []).map(function (x, i) {
    var c = classify_(x.concepto_original, ctx.reglas, ctx.proveedores);
    var origP = bid + "-" + x.periodo_origen;
    var orig = gastosB.filter(function (g) { return g.ID_Periodo === origP && Math.abs(num_(g.Importe) - num_(x.importe)) < 0.005; });
    var o = orig.filter(function (g) { return g.Concepto_Normalizado === c.concepto; })[0] || orig[0];
    if (!o) obs.push(cc_("Pago de período anterior", "No se encontró el gasto de origen de: " + String(x.concepto_original).slice(0, 100) + " (" + moneyTxt_(x.importe) + ").", "🟡 REVISAR", "Verificar si ese gasto fue liquidado con otro importe.", "CÁLCULO"));
    return { ID_Pago_Ant: idP + "-PA" + pad_(i + 1), ID_Periodo: idP, Barrio: bid, Mes: p, Periodo_Origen_Gasto: bid + "-" + x.periodo_origen, ID_Gasto_Origen: o ? o.ID_Gasto : "", Concepto_Original: x.concepto_original,
      Concepto_Normalizado: c.concepto, ID_Proveedor: c.idProv, Categoria: c.categoria, Importe: num_(x.importe), Periodo_Servicio: periodoServicio_(x.concepto_original, x.periodo_origen || p),
      Comprobante: comprobante_(x.concepto_original), Observacion: /ESTIMADO/i.test(x.concepto_original) ? "Se paga un importe ESTIMADO." : "", Fuente_PDF: pdf, Pagina: "" };
  });
  var ING = (liq.ingresos || []).filter(function (x) { return num_(x.importe) !== 0; }).map(function (x, i) {
    return { ID_Ingreso: idP + "-I" + pad_(i + 1), ID_Periodo: idP, Barrio: bid, Mes: p, Fecha: ND, Concepto: x.concepto, Origen: origenIngreso_(x.concepto), Fondo: x.fondo || "ORDINARIO", Importe: num_(x.importe), Observacion: "", Fuente_PDF: pdf, Pagina: "" }; });
  var EGR = (liq.egresos || []).filter(function (x) { return num_(x.importe) !== 0; }).map(function (x, i) {
    return { ID_Egreso: idP + "-E" + pad_(i + 1), ID_Periodo: idP, Barrio: bid, Mes: p, Fecha: ND, Concepto: x.concepto, Fondo: x.fondo || "ORDINARIO", Tipo_Egreso: tipoEgreso_(x.concepto), Importe: num_(x.importe),
      Observacion: tipoEgreso_(x.concepto) === SD ? "Sin gasto liquidado asociado en la liquidación." : (tipoEgreso_(x.concepto) === AJ ? "Motivo no informado en liquidación." : ""), Fuente_PDF: pdf, Pagina: "" }; });
  var F = liq.fondos || {}, B = liq.banco || {}, PT = liq.patrimonio || {}, T = liq.prorrateo_totales || {}, U = liq.prorrateo || [];
  var FON = ["ORDINARIO", "EXTRAORDINARIO", "TOTAL"].map(function (f) { var x = F[f] || {}; return { ID_Periodo: idP, Barrio: bid, Mes: p, Fondo: f, Saldo_Inicial: num_(x.saldo_inicial), Saldo_Final_Documento: num_(x.saldo_final), Observacion: f === "ORDINARIO" && num_(x.saldo_final) < 0 ? "Ord. negativo al cierre" : "" }; });
  var cierre = toDate_(liq.fecha_cierre);
  var SP = [["COMPOSICION_SALDO", "Cuenta corriente", ND, num_((liq.composicion_saldo || {}).cuenta_corriente)],
    ["RESUMEN_BANCARIO", "Saldo inicial", ND, num_(B.saldo_inicial)], ["RESUMEN_BANCARIO", "Ingresos", ND, num_(B.ingresos)], ["RESUMEN_BANCARIO", "Egresos", ND, num_(B.egresos)], ["RESUMEN_BANCARIO", "Saldo al cierre", cierre, num_(B.saldo_cierre)],
    ["ESTADO_PATRIMONIAL", "Saldo de disponibilidades al cierre", cierre, num_(PT.disponibilidades)], ["ESTADO_PATRIMONIAL", "Expensas y otros conceptos a cobrar", ND, num_(PT.expensas_a_cobrar)],
    ["ESTADO_PATRIMONIAL", "Deudas a cobrar", ND, num_(PT.deudas_a_cobrar)], ["ESTADO_PATRIMONIAL", "Intereses a cobrar", ND, num_(PT.intereses_a_cobrar)], ["ESTADO_PATRIMONIAL", "Redondeo liquidación", ND, num_(PT.redondeo)],
    ["ESTADO_PATRIMONIAL", "Gastos devengados pendientes de pago del periodo actual", ND, num_(PT.gastos_pendientes)], ["ESTADO_PATRIMONIAL", "Patrimonio neto al cierre", cierre, num_(PT.patrimonio_neto)]]
    .concat((liq.cobros_no_identificados || []).map(function (x) { return ["COBROS_NO_IDENTIFICADOS", "Cobro no identificado " + (x.detalle || ""), ND, num_(x.importe)]; }))
    .concat((liq.cobros_identificados || []).map(function (x) { return ["COBROS_IDENTIFICADOS", x.unidad, ND, num_(x.importe)]; }))
    .concat((liq.saldos_pendientes || []).map(function (x) { return ["SALDOS_PENDIENTES", x.unidad, ND, num_(x.importe)]; }))
    .concat(liq.saldos_pendientes_total != null ? [["SALDOS_PENDIENTES_TOTAL", "Total saldos pendientes de pago", ND, num_(liq.saldos_pendientes_total)]] : [])
    .map(function (x, i) { return { ID_Saldo: idP + "-S" + pad_(i + 1), ID_Periodo: idP, Barrio: bid, Mes: p, Bloque: x[0], Concepto: x[1], Fecha: x[2], Importe: x[3], Observacion: "", Pagina: "" }; });
  var PR = U.map(function (u) { return { ID_Periodo: idP, Barrio: bid, Mes: p, Lote: num_(u.lote), Unidad: u.unidad, Coeficiente_Ord: num_(u.coeficiente), Saldo_Anterior: num_(u.saldo_anterior), Pagos: num_(u.pagos), Deuda: num_(u.deuda),
    Interes: num_(u.interes), Gastos_Ord: num_(u.gastos_ord), Gasto_Particular: num_(u.gasto_particular), Redondeo: num_(u.redondeo), Total_Documento: num_(u.total),
    Observacion: "Importes por unidad visualizados sin decimales en el PDF; diferencias de centavos esperables.", Pagina: "" }; });
  var CO = prevId ? U.map(function (u) { return { ID_Periodo: idP, ID_Periodo_Anterior: prevId, Unidad: u.unidad, Barrio: bid, Mes: p }; }) : [];
  var spl = {}; (liq.saldos_pendientes || []).forEach(function (x) { spl[x.unidad] = num_(x.importe); });
  var MO = U.filter(function (u) { return num_(u.deuda) > 1; }).map(function (u) { return { ID_Periodo: idP, Barrio: bid, Mes: p, Periodo: labelP_(p), Unidad: u.unidad, Propietario: "PRIVADO (ver PADRON_PRIVADO)",
    Saldo_Pendiente_Listado: spl[u.unidad] != null ? spl[u.unidad] : ND, Antiguedad: ND, Estado: "CON DEUDA", Observacion: "Antigüedad no informada. Deuda = capital; Intereses = acumulado." }; });
  var cu = liq.cupon, CU = cu ? [{ ID_Periodo: idP, Barrio: bid, Mes: p, Unidad: cu.unidad, Saldo_Anterior: num_(cu.saldo_anterior), Saldo_Ant_Ord: num_(cu.saldo_ant_ord), Saldo_Ant_Ext: num_(cu.saldo_ant_ext),
    Gastos_Ord: num_(cu.gastos_ord), Gastos_Particulares: num_(cu.gastos_particulares), Interes_Mora: num_(cu.interes), Interes_Ord: num_(cu.interes_ord), Interes_Ext: num_(cu.interes_ext),
    Redondeo: num_(cu.redondeo), Total_A_Pagar: num_(cu.total_a_pagar), Fecha_Vencimiento: toDate_(cu.fecha_vencimiento), Recargo: cu.recargo == null ? ND : num_(cu.recargo),
    Total_Con_Recargo_Doc: num_(cu.total_con_recargo), Fuente_PDF: pdf, Pagina: "1" }] : [];
  var REC = (liq.recibos || []).map(function (r) { return { Barrio: bid, Mes: r.periodo, ID_Recibo: "R-" + bid + "-" + r.periodo + "-" + r.unidad, Nro_Recibo: r.nro, Periodo_Recibo: r.periodo, Unidad: r.unidad, Saldo: num_(r.saldo),
    Fecha_Pago: toDate_(r.fecha_pago), Importe_Pagado: num_(r.importe_pagado), Saldo_A_Favor: num_(r.saldo_a_favor), Deuda: num_(r.deuda), Expensas_Ord: num_(r.expensas_ord),
    Expensas_Ext: num_(r.expensas_ext), Intereses_Mora: num_(r.intereses), Total: num_(r.total), Forma_Pago: r.forma_pago || "", Fuente_PDF: pdf, Pagina: "",
    Observacion: "Recibo del período " + r.periodo + " incluido en el PDF de " + p + ". Registrado con su propio período." }; });
  var DCP = []; gs.forEach(function (g, i) { (g.componentes || []).forEach(function (c, j) { DCP.push({ ID_Componente: idP + "-C" + pad_(DCP.length + 1), ID_Gasto: G[i].ID_Gasto, ID_Periodo: idP, Barrio: bid, Mes: p, Grupo: "COMPONENTE", Concepto: c.concepto, Importe: num_(c.importe), Observacion: "", Pagina: String(g.pagina || "") }); }); });

  // ---------- controles ----------
  var V = [];
  var chk = function (control, doc, calc, tol, nivel, critico) { var d = r2_(num_(calc) - num_(doc)); var ok = Math.abs(d) <= tol; V.push({ control: control, documento: r2_(num_(doc)), calculado: r2_(num_(calc)), diferencia: d, tolerancia: tol, nivel: nivel, ok: ok }); if (!ok && critico) bloqueos.push("No cierra: " + control + " (diferencia " + moneyTxt_(d) + ")."); return ok; };
  (liq.rubros || []).forEach(function (rb) { chk("Total " + rb.rubro, rb.total, G.filter(function (g) { return g.Rubro_Original === rb.rubro; }).reduce(function (a, g) { return a + g.Importe; }, 0), 0.01, "🔴 CRÍTICO", true); });
  chk("TOTAL DE GASTOS del período", liq.total_gastos, tg, 0.01, "🔴 CRÍTICO", true);
  var base = num_(T.gastos_ord);
  chk("Base prorrateada (Gastos Ord. prorrateo) vs TOTAL DE GASTOS", liq.total_gastos, base, 0.01, Math.abs(base - tg) > 1000 ? "🔴 CRÍTICO" : "🟡 REVISAR", false);
  var sumU = function (k) { return U.reduce(function (a, u) { return a + num_(u[k]); }, 0); };
  [["Saldo Anterior", "saldo_anterior", 9], ["Pagos", "pagos", 9], ["Deuda", "deuda", 9], ["Interés", "interes", 9], ["Gastos Ord.", "gastos_ord", 9], ["Gasto Particular", "gasto_particular", 0.5]]
    .forEach(function (x) { chk("Prorrateo: total columna " + x[0], T[x[1]], sumU(x[1]), x[2], "🟡 REVISAR", false); });
  chk("Total liquidado = Deudas + Intereses + Ord + Part + Redondeo", T.total, num_(PT.deudas_a_cobrar) + num_(PT.intereses_a_cobrar) + base + num_(T.gasto_particular) + num_(PT.redondeo), 1, "🟠 IMPORTANTE", false);
  ["ORDINARIO", "EXTRAORDINARIO", "TOTAL"].forEach(function (f) {
    var ii = ING.filter(function (x) { return f === "TOTAL" || x.Fondo === f; }).reduce(function (a, x) { return a + x.Importe; }, 0);
    var ee = EGR.filter(function (x) { return f === "TOTAL" || x.Fondo === f; }).reduce(function (a, x) { return a + x.Importe; }, 0);
    chk("Fondo " + f + ": saldo inicial + ingresos + egresos = saldo final", (F[f] || {}).saldo_final, num_((F[f] || {}).saldo_inicial) + ii + ee, 0.01, "🔴 CRÍTICO", true);
  });
  if (prevId) { var pf = ctx.fondos.filter(function (x) { return x.ID_Periodo === prevId && x.Fondo === "TOTAL"; })[0];
    if (pf) chk("Continuidad: saldo inicial = saldo final de " + prevId, num_((F.TOTAL || {}).saldo_inicial), num_(pf.Saldo_Final_Documento), 0.01, "🔴 CRÍTICO", true); }
  chk("Resumen bancario: inicial + ingresos + egresos = cierre", B.saldo_cierre, num_(B.saldo_inicial) + num_(B.ingresos) + num_(B.egresos), 0.01, "🔴 CRÍTICO", true);
  chk("Ingresos bancarios = suma de ingresos", B.ingresos, ING.reduce(function (a, x) { return a + x.Importe; }, 0), 0.01, "🔴 CRÍTICO", false);
  chk("Egresos bancarios = suma de egresos", B.egresos, EGR.reduce(function (a, x) { return a + x.Importe; }, 0), 0.01, "🔴 CRÍTICO", false);
  if (U.length) chk("Pagos de unidades = ingresos de expensas e intereses", -num_(T.pagos), ING.filter(function (x) { return x.Origen !== "Cobros no identificados"; }).reduce(function (a, x) { return a + x.Importe; }, 0), 0.01, "🟠 IMPORTANTE", false);
  var gm = EGR.filter(function (x) { return x.Tipo_Egreso === GM; })[0];
  if (gm) chk("Egresos 'Gastos Ord.' = pagos de períodos anteriores + gastos del período pagados", -gm.Importe, PA.reduce(function (a, x) { return a + x.Importe; }, 0) + G.filter(function (g) { return g.Estado_Pago !== "PENDIENTE"; }).reduce(function (a, g) { return a + g.Importe; }, 0), 0.01, "🟠 IMPORTANTE", false);
  chk("Gastos pendientes de pago = suma de gastos pendientes", -num_(PT.gastos_pendientes), G.filter(function (g) { return g.Estado_Pago === "PENDIENTE"; }).reduce(function (a, g) { return a + g.Importe; }, 0), 0.01, "🟠 IMPORTANTE", false);
  if (liq.pagos_periodos_anteriores_total != null) chk("Gastos pagados de períodos anteriores - total", liq.pagos_periodos_anteriores_total, PA.reduce(function (a, x) { return a + x.Importe; }, 0), 0.01, "🔴 CRÍTICO", false);
  chk("Expensas a cobrar = Ord. prorrateado + Particulares", PT.expensas_a_cobrar, base + num_(T.gasto_particular), 1, "🟠 IMPORTANTE", false);
  chk("Patrimonio neto al cierre", PT.patrimonio_neto, num_(PT.disponibilidades) + num_(PT.expensas_a_cobrar) + num_(PT.deudas_a_cobrar) + num_(PT.intereses_a_cobrar) + num_(PT.redondeo) + num_(PT.gastos_pendientes), 0.01, "🔴 CRÍTICO", false);
  if (liq.saldos_pendientes_total != null) chk("Saldos pendientes de pago: suma del listado = total", liq.saldos_pendientes_total, (liq.saldos_pendientes || []).reduce(function (a, x) { return a + num_(x.importe); }, 0), 0.01, "🟠 IMPORTANTE", false);
  G.filter(function (g) { return g.Base_Prorrateo_Doc !== "" && g.Porc_Participacion_Doc !== ""; }).forEach(function (g) { chk(g.Concepto_Normalizado + ": base x % = importe liquidado", g.Importe, r2_(g.Base_Prorrateo_Doc * g.Porc_Participacion_Doc), 0.01, "🟡 REVISAR", false); });
  if (cu) {
    chk("Cupón " + cu.unidad + ": total a pagar = componentes", cu.total_a_pagar, num_(cu.saldo_anterior) + num_(cu.gastos_ord) + num_(cu.gastos_particulares) + num_(cu.interes) + num_(cu.redondeo), 0.01, "🟠 IMPORTANTE", false);
    if (cu.recargo != null) chk("Cupón " + cu.unidad + ": 1er vencimiento = total + recargo redondeado hacia arriba", cu.total_con_recargo, num_(cu.total_a_pagar) + Math.ceil(num_(cu.total_a_pagar) * num_(cu.recargo) - 1e-9), 0.01, "🟡 REVISAR", false);
  }
  // ---------- observaciones automáticas ----------
  if (tg > 1 && Math.abs(base - tg) > 1000) obs.push(cc_("Base de prorrateo", "Lo prorrateado entre unidades (" + moneyTxt_(base) + ") difiere del TOTAL DE GASTOS (" + moneyTxt_(tg) + ") en " + moneyTxt_(base - tg) + ".", "🔴 CRÍTICO", "Pedir a la administración la composición de la base de prorrateo. No implica irregularidad.", "CÁLCULO"));
  var sd = EGR.filter(function (x) { return x.Tipo_Egreso === SD; }), sdT = -sd.reduce(function (a, x) { return a + x.Importe; }, 0);
  if (sd.length) obs.push(cc_("Egresos sin detalle de comprobante", "Egresos por " + moneyTxt_(sdT) + " sin gasto liquidado asociado: " + sd.map(function (x) { return x.Concepto + " " + moneyTxt_(-x.Importe); }).join("; ") + ".", sdT > tg * 0.1 ? "🔴 CRÍTICO" : "🟠 IMPORTANTE", "NO SE PUEDE DETERMINAR CON LA INFORMACIÓN DISPONIBLE a qué gastos corresponden. Solicitar comprobantes.", "DATO"));
  EGR.filter(function (x) { return x.Tipo_Egreso === AJ; }).forEach(function (x) { obs.push(cc_(x.Concepto, "Ajuste por " + moneyTxt_(-x.Importe) + " sin explicación en la liquidación.", "🟠 IMPORTANTE", "Motivo no informado en liquidación. Pedir detalle.", "DATO")); });
  if (num_((F.ORDINARIO || {}).saldo_final) < 0) obs.push(cc_("Fondo ordinario negativo", "El fondo ordinario cerró en " + moneyTxt_((F.ORDINARIO || {}).saldo_final) + ".", "🔴 CRÍTICO", "Consultar cómo se financia el faltante.", "DATO"));
  var fijos = { HONORARIO: 1, SEGURO: 1, ABONO: 1 };
  G.forEach(function (g) {
    if (fijos[g.Tipo_Gasto] || !g.Importe) return;
    var d = gastosB.filter(function (o) { return o.Concepto_Normalizado === g.Concepto_Normalizado && Math.abs(num_(o.Importe) - g.Importe) < 0.005 && o.Comprobante === g.Comprobante; })[0];
    if (d) { obs.push(cc_(g.Concepto_Normalizado, "Mismo concepto, importe (" + moneyTxt_(g.Importe) + ") y comprobante (" + g.Comprobante + ") que en " + d.ID_Periodo + ".", "🟠 IMPORTANTE", "POSIBLE DUPLICACIÓN — REQUIERE REVISIÓN. Verificar la factura.", "CÁLCULO")); g.Estado_Validacion = "REVISAR"; }
  });
  var estim = G.filter(function (g) { return g.Es_Estimado === "SI"; });
  if (estim.length) obs.push(cc_("Gastos estimados", "Liquidados como ESTIMADO: " + estim.map(function (g) { return g.Concepto_Normalizado + " " + moneyTxt_(g.Importe); }).join("; ") + ".", "🟡 REVISAR", "Verificar factura real y ajuste posterior.", "DATO"));
  (liq.cobros_no_identificados || []).forEach(function (x) { obs.push(cc_("Cobro no identificado", moneyTxt_(x.importe) + " (" + (x.detalle || "") + ") sin imputar a una unidad.", "🟡 REVISAR", "Seguir en próximas liquidaciones.", "DATO")); });
  V.filter(function (v) { return !v.ok && v.control.indexOf("Base prorrateada") !== 0; }).forEach(function (v) { obs.push(cc_(v.control, "Liquidación " + moneyTxt_(v.documento) + " vs calculado " + moneyTxt_(v.calculado) + " (diferencia " + moneyTxt_(v.diferencia) + ").", v.nivel, "Verificar en el PDF original.", "CÁLCULO")); });
  (liq.dudas || []).forEach(function (d) { if (d && d.detalle) obs.push(cc_("Lectura: " + (d.campo || "dato"), d.detalle, "🟡 REVISAR", "Verificar en el PDF, página " + (d.pagina || "s/d") + ".", "DATO")); });

  var cnt = {}; U.forEach(function (u) { var k = String(num_(u.coeficiente)); cnt[k] = (cnt[k] || 0) + 1; });
  var modeK = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; })[0], coefTipo = num_(modeK);
  var cuU = cu ? U.filter(function (u) { return u.unidad === cu.unidad; })[0] : null;
  var lote = (cuU && Math.abs(num_(cuU.coeficiente) - coefTipo) < 1e-9) ? num_(cu.gastos_ord) : num_((U.filter(function (u) { return Math.abs(num_(u.coeficiente) - coefTipo) < 1e-9; })[0] || {}).gastos_ord);
  var ref = prev || ctx.periodos.filter(function (x) { return x.Administrador; }).pop(); // datos del administrador: del mes anterior o de otro barrio
  var PER = { ID_Periodo: idP, Barrio: bid, Mes: p, Coef_Lote_Tipo: coefTipo, Periodo: labelP_(p), Periodo_Num: pnum, Liquidacion: liq.liquidacion || "", Consorcio: prev ? prev.Consorcio : ("Barrio " + B0.Nombre), CUIT_Consorcio: prev ? prev.CUIT_Consorcio : "",
    Administrador: ref ? ref.Administrador : "", CUIT_Administrador: ref ? ref.CUIT_Administrador : "", Matricula_Admin: ref ? ref.Matricula_Admin : "",
    Fecha_Emision: liq.fecha_emision ? toDate_(liq.fecha_emision) : ND, Fecha_Vencimiento: toDate_(liq.fecha_vencimiento), Recargo_Vencimiento: liq.recargo_vencimiento == null ? ND : num_(liq.recargo_vencimiento),
    Fecha_Cierre: cierre, Total_Gastos_Periodo: num_(liq.total_gastos), Base_Prorrateo_Ord: base, Gastos_Particulares: num_(T.gasto_particular), Total_Expensas: num_(PT.expensas_a_cobrar),
    Total_Liquidado_Con_Deudas: num_(T.total), Gastos_Ordinarios: num_(liq.total_gastos) - num_(liq.gastos_extraordinarios), Gastos_Extraordinarios: num_(liq.gastos_extraordinarios),
    Fondo_Reserva: liq.fondo_reserva == null ? ND : num_(liq.fondo_reserva), Ingresos: num_(B.ingresos), Egresos_Caja: num_(B.egresos), Saldo_Inicial: num_((F.TOTAL || {}).saldo_inicial),
    Saldo_Final: num_((F.TOTAL || {}).saldo_final), Patrimonio_Neto: num_(PT.patrimonio_neto), Gastos_Pendientes_Pago: -num_(PT.gastos_pendientes),
    Pagos_Periodos_Anteriores: PA.reduce(function (a, x) { return a + x.Importe; }, 0), Expensa_Ord_Lote_Tipo: num_(lote), Cantidad_Unidades: U.length,
    Observaciones: "Cargado desde la app (" + meta.origen + ").", Fuente_PDF: pdf, Paginas: liq.paginas || "", Estado_Revision: obs.length ? "CON OBSERVACIONES" : "SIN OBSERVACIONES" };
  var VAL = V.map(function (v, i) { return { ID_Control: idP + "-V" + ("0" + (i + 1)).slice(-2), ID_Periodo: idP, Barrio: bid, Mes: p, Control: v.control, Importe_Documento: v.documento, Importe_Calculado: v.calculado,
    Tolerancia: v.tolerancia, Nivel_Si_Falla: v.nivel, Pagina: "", Observacion: "Calculado por la app al cargar." }; });
  var prevLote = lastGastos ? num_(lastGastos.Expensa_Ord_Lote_Tipo) : 0, prevTg = lastGastos ? num_(lastGastos.Total_Gastos_Periodo) : 0;
  return {
    periodo: p, barrio: bid, barrioNombre: B0.Nombre, idPeriodo: idP, bloqueos: bloqueos,
    resumen: { "Barrio": B0.Nombre, "Período": labelP_(p), "Archivo": pdf, "Origen": meta.origen, "Total de gastos": tg, "Variación de gastos": prevTg ? ((tg / prevTg - 1) * 100).toFixed(1).replace(".", ",") + "%" : "s/d",
      "Prorrateado entre unidades": base, "Expensa lote común": num_(lote), "Variación lote común": prevLote ? ((lote / prevLote - 1) * 100).toFixed(1).replace(".", ",") + "%" : "s/d",
      "Caja al cierre": num_((F.TOTAL || {}).saldo_final), "Ítems de gasto": String(G.length), "Unidades": String(U.length) },
    controles: V, gastos: G.map(function (g) { return { concepto_original: g.Concepto_Original, concepto_normalizado: g.Concepto_Normalizado, categoria: g.Categoria, importe: g.Importe, sin_regla: g._sinRegla }; }),
    observaciones: obs.map(function (o) { return { importancia: o.Importancia, dato: o.Dato, problema: o.Problema }; }), dudas: liq.dudas || [],
    _rows: { PERIODOS: [PER], GASTOS: G.map(function (g) { delete g._sinRegla; return g; }), DETALLE_COMPONENTES: DCP, PAGOS_PER_ANTERIORES: PA, INGRESOS: ING, EGRESOS_CAJA: EGR, FONDOS: FON,
      SALDOS_PATRIMONIO: SP, PRORRATEO: PR, CONTINUIDAD: CO, MOROSIDAD: MO, CUPON_UNIDAD: CU, RECIBOS: REC, VALIDACIONES: VAL, _CC: obs },
    _meta: meta
  };
}
function cc_(dato, problema, imp, obsv, tipo) { return { Dato: dato, Problema: problema, Importancia: imp, Estado: "PENDIENTE", Observacion: obsv, Tipo_Informacion: tipo }; }

/* ===================== Borrador y escritura (nuevo) ===================== */
function guardarPdf_(b) {
  if (!b.pdfBase64) return "";
  var blob = Utilities.newBlob(Utilities.base64Decode(b.pdfBase64), "application/pdf", b.filename || "liquidacion.pdf");
  return folder_("Auditoría - Liquidaciones").createFile(blob).getUrl();
}
function prepareAndStore_(liq, meta, ses) {
  var prep = prepare_(liq, meta, context_());
  if (ses && prep.barrio !== "XX" && !puede_(ses, prep.barrio)) prep.bloqueos.unshift("Tu usuario no puede cargar liquidaciones de " + prep.barrioNombre + ".");
  prep._ses = ses ? { usuario: ses.usuario, barrio: ses.barrio, rol: ses.rol } : null;
  var f = folder_("Auditoría - Borradores").createFile("borrador_" + prep.idPeriodo + "_" + Date.now() + ".json", JSON.stringify(prep), "application/json");
  prep.draftId = f.getId();
  var pub = {}; Object.keys(prep).forEach(function (k) { if (k.charAt(0) !== "_") pub[k] = prep[k]; });
  return pub;
}
function commit_(draftId, force, ses, titulo) {
  var prep = JSON.parse(DriveApp.getFileById(draftId).getBlob().getDataAsString());
  if (!puede_(ses, prep.barrio)) throw new Error("Tu usuario no puede cargar liquidaciones de " + prep.barrioNombre + ".");
  var ctx = context_(), p = prep.idPeriodo, mes = prep.periodo, bid = prep.barrio;
  if (ctx.periodos.some(function (x) { return x.ID_Periodo === p; })) throw new Error("La liquidación " + p + " ya está cargada.");
  if (prep.bloqueos.length && !force) throw new Error("Hay controles críticos que no cierran. Marcá la casilla para incorporar igual.");
  var R = prep._rows, pdf = prep._meta.archivo;
  var revive = function (o) { ["Fecha_Emision", "Fecha_Vencimiento", "Fecha_Cierre", "Fecha", "Fecha_Pago"].forEach(function (k) { if (typeof o[k] === "string" && /^\d{4}-\d{2}-\d{2}T/.test(o[k])) { var d = new Date(o[k]); o[k] = Utilities.formatDate(d, tz_(), "yyyy-MM-dd"); } }); return o; };
  // proveedores nuevos
  var provs = ctx.proveedores, maxId = provs.reduce(function (a, x) { return Math.max(a, +String(x.ID_Proveedor).replace(/\D/g, "") || 0); }, 0), nuevos = [];
  R.GASTOS.forEach(function (g) {
    if (g.ID_Proveedor) return;
    var ex = provs.concat(nuevos).filter(function (x) { return norm_(x.Proveedor) === norm_(g.Proveedor); })[0];
    if (!ex) { maxId++; var cuit = (String(g.Concepto_Original).match(/\((\d{2})-?(\d{8})-?(\d)\)/) || []); ex = { ID_Proveedor: "PRV" + pad_(maxId), Proveedor: g.Proveedor, Nombre_Original: g.Proveedor,
      CUIT: cuit.length ? cuit[1] + "-" + cuit[2] + "-" + cuit[3] : ND, Categoria: g.Categoria, Observaciones: "Alta automática al cargar " + p + ". Revisar." }; nuevos.push(ex); }
    g.ID_Proveedor = ex.ID_Proveedor;
  });
  append_("PROVEEDORES", nuevos);
  // dato agregado público: cuántas unidades tienen deuda (sin decir cuáles)
  var per = R.PERIODOS[0];
  per.Unidades_Con_Deuda = (R.PRORRATEO || []).length ? R.PRORRATEO.filter(function (u) { return num_(u.Deuda) > 1; }).length : ND;
  per.Fecha_Carga = hoy_();
  per.Titulo = String(titulo || "").trim().slice(0, 80) || per.Periodo; // nombre que se muestra; se puede cambiar después
  ["PERIODOS", "GASTOS", "DETALLE_COMPONENTES", "PAGOS_PER_ANTERIORES", "INGRESOS", "EGRESOS_CAJA", "FONDOS", "SALDOS_PATRIMONIO", "PRORRATEO", "CONTINUIDAD", "MOROSIDAD", "CUPON_UNIDAD", "RECIBOS", "VALIDACIONES"]
    .forEach(function (n) { append_(n, (R[n] || []).map(revive)); });
  // conceptos nuevos: se agregan al catálogo con una etiqueta provisoria que el auditor puede corregir
  var conc = readSheet_("CONCEPTOS").map(function (c) { return c.Concepto_Normalizado; }), addC = [];
  R.GASTOS.forEach(function (g) { if (conc.indexOf(g.Concepto_Normalizado) < 0) { conc.push(g.Concepto_Normalizado);
    addC.push({ Concepto_Normalizado: g.Concepto_Normalizado, Etiqueta: g.Concepto_Normalizado, Es_Servicio: /SERVICIOS/.test(g.Categoria) ? "SI" : "NO", Rubro_Modelo: "", Notas: "Alta automática al cargar " + p }); } });
  append_("CONCEPTOS", addC);
  // observaciones
  var maxCC = ctx.cc.reduce(function (a, x) { return Math.max(a, +String(x.ID).replace(/\D/g, "") || 0); }, 0);
  append_("CONTROL_CALIDAD", R._CC.map(function (o, i) { return { ID: "CC" + ("0" + (maxCC + i + 1)).slice(-2), Periodo: p, Barrio: bid, Mes: mes, Dato: o.Dato, Problema: o.Problema, Fuente: pdf, Pagina: "",
    Importancia: o.Importancia, Estado: "PENDIENTE", Observacion: o.Observacion, Tipo_Informacion: o.Tipo_Informacion, Publicable: /\bU\d|Un\.|Cup[oó]n|\b\d-\d{1,2}\b/.test(o.Dato + " " + o.Problema) ? "NO" : "SI" }; }));
  var ds = readSheet_("DOCUMENTOS");
  append_("DOCUMENTOS", [{ ID_Documento: nextId_(ds, "ID_Documento", "D", 3), ID_Periodo: p, Barrio: bid, Mes: mes, Tipo: "LIQUIDACIÓN", Titulo: "Liquidación " + mes, Archivo: pdf, Drive_URL: prep._meta.fileUrl || "",
    URL_Publica: "", Fecha_Carga: hoy_(), Paginas: per.Paginas, Visible_Publico: "NO", Observacion: "" }]);
  var ok = prep.controles.filter(function (c) { return c.ok; }).length;
  append_("CARGAS", [{ Fecha_Carga: ahora_(), ID_Periodo: p, Barrio: bid, Mes: mes, Origen: prep._meta.origen, Archivo: pdf, Controles_OK: ok, Controles_Con_Diferencias: prep.controles.length - ok,
    Observaciones_Generadas: R._CC.length, Estado: force && prep.bloqueos.length ? "INCORPORADO CON BLOQUEOS (forzado)" : "INCORPORADO", Detalle: prep.bloqueos.join(" | "), Usuario: ses.usuario }]);
  log_(ses, bid, "CARGA LIQUIDACIÓN", p + (force && prep.bloqueos.length ? " (forzada)" : ""));
  try { DriveApp.getFileById(draftId).setTrashed(true); } catch (e) {}
  return { ok: true, periodo: p, barrio: bid, mes: mes };
}
