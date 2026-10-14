// @ts-nocheck
/* Reutilizado del portal v7 sin cambios de lógica. */
/* Motor de auditoría: cruza liquidaciones, comprobantes, extractos y respuestas, y saca las conclusiones.
   Todo lo que produce es un indicador de revisión con el dato que lo sostiene; nada se inventa ni se redondea. */
const Audit = (() => {
  const num = v => { if (v === "" || v == null) return null; const x = typeof v === "number" ? v : Number(String(v).replace(/\$|\s/g, "")); return isFinite(x) ? x : null; };
  const n0 = v => num(v) || 0;
  const fm = v => (v < 0 ? "−" : "") + "$ " + Math.abs(v).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const f0 = v => (v < 0 ? "−" : "") + "$ " + Math.round(Math.abs(v)).toLocaleString("es-AR");
  const pc = v => (v * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 }) + "%";
  const dd = s => { const m = String(s || "").match(/(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}` : "N/D"; };
  const dig = c => String(c || "").replace(/[^\d*]/g, "");
  const sameCuit = (a, b) => { a = dig(a); b = dig(b); if (!a || !b) return null; if (!a.includes("*") && !b.includes("*")) return a === b; return a.slice(0, 6) === b.slice(0, 6) && a.slice(-1) === b.slice(-1); };
  const near = (a, b, t = 1) => Math.abs(a - b) <= t;
  const MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const mlab = m => { const [y, k] = String(m).split("-"); return MES[+k - 1] + " " + y; };
  const mprev = m => { let [y, k] = String(m).split("-").map(Number); k--; if (!k) { k = 12; y--; } return `${y}-${String(k).padStart(2, "0")}`; };
  const mnext = m => { let [y, k] = String(m).split("-").map(Number); k++; if (k > 12) { k = 1; y++; } return `${y}-${String(k).padStart(2, "0")}`; };
  const rev = c => { const r = String(c.Revision || ""); return r && r !== "PENDIENTE" ? r : c.Tipo === "IMAGEN" ? "PENDIENTE" : c.Tipo; };
  const det = c => { try { return c.Detalle_JSON ? JSON.parse(c.Detalle_JSON) : (c.Detalle || {}); } catch (e) { return {}; } };
  const SEVR = { ok: 0, nd: 1, warn: 2, bad: 3 };
  const worst = (...s) => s.filter(Boolean).reduce((a, b) => SEVR[b] > SEVR[a] ? b : a, "ok");
  const F = { si: ["Factura", "ok"], no: ["Sin factura", "bad"], pres: ["Solo presupuesto", "bad"], noco: ["Factura no coincide", "bad"], dif: ["Difiere de la factura", "warn"], noenv: ["Factura no enviada", "nd"], est: ["Estimado", "warn"], parc: ["Comprobantes parciales", "warn"], conj: ["Factura conjunta", "warn"], ext: ["Extracto", "ok"], pend: ["Imagen sin revisar", "nd"] };
  const P = { si: ["Pagado", "ok"], pend: ["Pendiente", "nd"], nd: ["Pago sin comprobante", "nd"], terc: ["Pagado a un tercero", "warn"], pers: ["Desde cuenta personal", "bad"], adm: ["Transferido al administrador", "bad"], pant: ["“Pago” = pantalla de saldo", "warn"], deb: ["Débito no coincide", "warn"] };

  function run(DATA, barrio, opt = {}) {
    const S = DATA.sheets, B = (S.BARRIOS || []).find(b => b.ID_Barrio === barrio) || {};
    const bName = B.Nombre || barrio, admin = dig(B.CUIT_Administrador);
    const per = (S.PERIODOS || []).filter(p => p.Barrio === barrio && n0(p.Total_Gastos_Periodo) > 1).sort((a, b) => String(a.Mes).localeCompare(b.Mes));
    const want = opt.n || 3, P3 = opt.periodos ? per.filter(p => opt.periodos.includes(p.ID_Periodo)) : per.slice(-want);
    const ids = P3.map(p => p.ID_Periodo), pById = Object.fromEntries(per.map(p => [p.ID_Periodo, p]));
    const G = (S.GASTOS || []).filter(g => g.Barrio === barrio);
    const Gin = G.filter(g => ids.includes(g.ID_Periodo));
    const PA = (S.PAGOS_PER_ANTERIORES || []).filter(g => g.Barrio === barrio);
    const C = (S.COMPROBANTES || []).filter(c => c.Barrio === barrio);
    const M = (S.MOVIMIENTOS_BANCO || []).filter(m => m.Barrio === barrio);
    const HZ = (S.HALLAZGOS || []).filter(h => !h.Barrios || String(h.Barrios).split(",").includes(barrio));
    const RS = (S.RESPUESTAS_ADMIN || []).filter(r => r.Barrio === barrio);
    const EV = (S.BITACORA || []).filter(e => !e.Barrios || String(e.Barrios).split(",").includes(barrio));
    const others = (S.BARRIOS || []).filter(b => b.ID_Barrio !== barrio && b.Patron_En_PDF).map(b => ({ n: b.Nombre, re: new RegExp(b.Patron_En_PDF, "i") }));
    const compsOf = id => { const seen = new Set(); return C.filter(c => c.ID_Gasto === id && rev(c) !== "IGNORAR").filter(c => { const k = [c.Archivo, c.Pagina, c.Tipo, c.Numero, c.Importe].join("|"); if (seen.has(k)) return false; seen.add(k); return true; }); };
    const ind = [], cellNote = {}, mayores = [];
    const liqN = pid => String((pById[pid] || {}).Liquidacion || pid).replace(/^(\d)\//, "0$1/");
    const addInd = o => { o.id = o.id || "I" + String(ind.length + 1).padStart(2, "0"); ind.push(o); return o; };
    const noteG = (gid, s, txt) => { (cellNote[gid] = cellNote[gid] || []).push({ s, txt }); };
    const lastP = P3[P3.length - 1] || {}, coef = (n0(lastP.Base_Prorrateo_Ord) && n0(lastP.Expensa_Ord_Lote_Tipo) ? n0(lastP.Expensa_Ord_Lote_Tipo) / n0(lastP.Base_Prorrateo_Ord) : 0) || n0(lastP.Coef_Lote_Tipo) || null; // coeficiente exacto: expensa / base (el de la planilla está redondeado)

    /* ---------- facturas repetidas (en todo el barrio) ---------- */
    const facKey = {};
    C.filter(c => rev(c) === "FACTURA" && c.Numero && /\d{3,}-\d{3,}/.test(c.Numero)).forEach(c => { const k = (dig(c.CUIT_Emisor) || c.Emisor || "") + "|" + String(c.Numero).replace(/^0+/, ""); (facKey[k] = facKey[k] || []).push(c); });
    Object.values(facKey).forEach(arr => { const gs = [...new Set(arr.map(c => c.ID_Gasto).filter(Boolean))]; if (gs.length < 2) return;
      const c0 = arr[0], g2 = gs.map(id => G.find(g => g.ID_Gasto === id)).filter(Boolean); if (!g2.some(g => ids.includes(g.ID_Periodo))) return;
      if (g2.some(g => n0(g.Importe) < 0 || g.Es_Estimado === "SI") || new Set(g2.map(g => g.ID_Periodo)).size < 2 && new Set(g2.map(g => g.Concepto_Normalizado)).size < 2) return;
      const txt = `La factura ${c0.Emisor ? c0.Emisor + " " : ""}${c0.Numero} (${fm(n0(c0.Importe))}) aparece en ${g2.map(g => `${g.Concepto_Normalizado} de la liquidación ${g.ID_Periodo.slice(-2)}/${g.ID_Periodo.slice(-7, -3)}`).join(" y en ")}.`;
      addInd({ sev: "bad", grupo: "B", t: "Una misma factura en dos gastos", ve: txt, monto: n0(c0.Importe), pedir: "Reintegro de lo cobrado por segunda vez.", pid: g2[g2.length - 1].ID_Periodo });
      g2.slice(1).forEach(g => noteG(g.ID_Gasto, "bad", `Factura ${c0.Numero} ya cobrada en otro gasto.`)); });

    /* ---------- cuadro por concepto y mes ---------- */
    const rows = {};
    const prevOf = g => { const pp = per[per.findIndex(p => p.ID_Periodo === g.ID_Periodo) - 1]; return pp ? G.filter(x => x.ID_Periodo === pp.ID_Periodo && x.Concepto_Normalizado === g.Concepto_Normalizado) : []; };
    Gin.forEach(g => {
      const key = g.Concepto_Normalizado || g.Concepto_Original, r = rows[key] = rows[key] || { c: key, p: g.Proveedor || "", cat: g.Categoria || "", cells: {} };
      if (!r.p && g.Proveedor) r.p = g.Proveedor;
      const cell = r.cells[g.ID_Periodo] = r.cells[g.ID_Periodo] || { v: 0, f: [], pg: [], o: [], s: "ok", g: [] };
      const v = n0(g.Importe); cell.v += v; cell.g.push(g.ID_Gasto);
      const cs = compsOf(g.ID_Gasto), by = t => cs.filter(c => rev(c) === t);
      const fac = by("FACTURA"), tick = by("TICKET_FISCAL"), nof = by("NO_FISCAL"), pres = by("PRESUPUESTO"), refs = by("REFERENCIA"), pant = by("PANTALLA_SALDO"), trf = by("TRANSFERENCIA"), pago = by("PAGO_SERVICIO"), ext = by("EXTRACTO"), plan = by("PLANILLA_SUELDOS"), pendI = by("PENDIENTE");
      const est = g.Es_Estimado === "SI", tipo = String(g.Tipo_Gasto || ""), base = /PRORRATEO/.test(tipo);
      let f = null, pg = null; const o = cell.o;
      // --- factura ---
      if (v < 0 && est) { f = "est"; o.push({ s: "ok", txt: `Ajuste de un estimado anterior: ${fm(v)}.` }); }
      else if (est) { f = "est"; o.push({ s: "warn", txt: "Liquidado como estimado." }); }
      else if (tipo === "BANCARIO") { f = ext.length ? "ext" : "noenv"; if (ext.some(c => /filtrad/i.test(c.Nota || "") || det(c).filtrado)) { f = "parc"; o.push({ s: "bad", txt: "El extracto enviado está <b>filtrado</b>: solo comisiones e impuestos." }); } }
      else if (base) {
        const pap = fac.concat(tick, nof, pres), tot = pap.reduce((a, c) => a + n0(c.Importe), 0), fis = fac.concat(tick).reduce((a, c) => a + n0(c.Importe), 0);
        if (!cs.length) f = "noenv";
        else if (nof.length || pres.length) { f = "parc"; const sh = tot ? fis / tot : 0; o.push({ s: sh < .5 ? "bad" : "warn", txt: `${fac.length + tick.length} de ${pap.length} comprobantes son fiscales (${pc(sh)} del importe). ${nof.length + pres.length} son presupuestos o notas “no válido como factura”${tot - fis ? ` por ${fm(tot - fis)}` : ""}.` }); }
        else { f = "si"; if (fac.length && !plan.length && tot) o.push({ s: "ok", txt: `Equivale al ${pc(v / tot)} de ${fac.length} factura${fac.length > 1 ? "s" : ""} por ${fm(tot)}.` }); }
        if (pendI.length) o.push({ s: "nd", txt: `${pendI.length} imagen${pendI.length > 1 ? "es" : ""} sin revisar.` });
      } else if (fac.length) {
        const uniq = [...new Map(fac.map(c => [c.Numero || c.ID_Comprobante, c])).values()];
        const best = uniq.map(c => ({ c, F: n0(c.Importe) })).sort((a, b) => Math.abs(a.F - v) - Math.abs(b.F - v))[0], Fv = best.F, nro = best.c.Numero || "";
        const k = v ? Fv / v : 0, neto = Fv / 1.21;
        if (near(Fv, v)) f = "si";
        else if (near(v, Fv / 2, 0.02)) { f = "si"; o.push({ s: "warn", txt: `Es la mitad de la factura ${nro} (${fm(Fv)}): servicio compartido.` }); }
        else if (k > 1.9 && near(k, Math.round(k), 0.01)) { f = "conj"; o.push({ s: "warn", txt: `La factura ${nro} es por ${fm(Fv)}: ${Math.round(k)} veces este importe.` }); }
        else if (v > 0 && v < Fv * 0.95) { f = "si"; o.push({ s: "warn", txt: `Es el ${pc(v / Fv)} de la factura ${nro} (${fm(Fv)}). Criterio de reparto a informar.` }); }
        else if (v > Fv && near(v - Fv, neto * 0.03, 1)) { f = "noco"; o.push({ s: "bad", txt: `Factura ${nro}: ${fm(Fv)}. Se liquidó <b>${fm(v - Fv)} más</b> = 3% de percepción de IIBB sobre el neto, que la factura no tiene.` }); }
        else if (Math.abs(v - Fv) / Math.max(Fv, 1) < 0.01) { f = "dif"; o.push({ s: "warn", txt: `Factura ${nro}: ${fm(Fv)}. Diferencia ${fm(v - Fv)}.` }); }
        else { f = "noco"; o.push({ s: "bad", txt: `Factura ${nro}: ${fm(Fv)}. Liquidado ${fm(v)}: diferencia <b>${fm(v - Fv)}</b>.` }); }
        const rc = best.c; if (rc.CUIT_Receptor && B.CUIT_Fideicomiso && sameCuit(rc.CUIT_Receptor, B.CUIT_Fideicomiso) === false && !/PRORRATEO/.test(tipo)) o.push({ s: "warn", txt: `La factura está a nombre de ${String(rc.Receptor || "otro CUIT (" + rc.CUIT_Receptor + ")").split(/\s+(Vto|Domicilio|CUIT|IVA|Fecha)\b/i)[0].trim()}, no del barrio.` });
      } else if (pres.length) { f = "pres"; const d = det(pres[0]); o.push({ s: "bad", txt: `El respaldo es un <b>presupuesto</b>${d.moneda === "USD" && d.importeUSD ? ` en US$ ${d.importeUSD.toLocaleString("es-AR")}` : ""}, no una factura.` }); }
      else if (nof.length) { f = "no"; o.push({ s: "bad", txt: "El respaldo no es un comprobante fiscal." }); }
      else if (refs.length) { f = "noenv"; o.push({ s: "nd", txt: `Se envió solo una referencia (${refs[0].Emisor || "documento"}), no la factura.` }); }
      else if (pendI.length) f = "pend";
      else f = "noenv";
      // --- pago ---
      const paidDocs = trf.concat(pago);
      if (paidDocs.length) {
        pg = "si";
        trf.forEach(t => { const d = det(t);
          if (/personal|caja de ahorro/i.test(t.Cuenta_Debito || "") || /personal/i.test(d.origen || "")) { pg = "pers"; o.push({ s: "bad", txt: `Pagado el ${dd(t.Fecha)} desde una <b>caja de ahorro personal</b>${t.Ordenante ? " de " + t.Ordenante : ""}.` }); }
          else if (admin && sameCuit(t.CUIT_Destinatario, admin)) { pg = "adm"; o.push({ s: "bad", txt: `El ${dd(t.Fecha)} se transfirieron ${fm(n0(t.Importe))} a una cuenta del administrador${/ahorro/i.test(d.cuentaCredito || "") ? " (caja de ahorros)" : ""}${t.Concepto_Pago ? `, concepto “${t.Concepto_Pago}”` : ""}.` }); }
          else { const em = fac[0] && (fac[0].CUIT_Emisor || ""), sm = em ? sameCuit(em, t.CUIT_Destinatario) : null;
            if (sm === false) { pg = pg === "si" ? "terc" : pg; o.push({ s: "warn", txt: `Pagado el ${dd(t.Fecha)} a ${t.Destinatario || "otra persona"}, distinta del emisor de la factura.` }); }
            if (n0(t.Importe) > v + 1 && !near(n0(t.Importe), v)) { const otros = C.filter(x => rev(x) === "TRANSFERENCIA" && x.Numero && x.Numero === t.Numero && near(n0(x.Importe), n0(t.Importe))).map(x => x.ID_Gasto), suma = [...new Set(otros)].reduce((a, id) => a + n0((G.find(g => g.ID_Gasto === id) || {}).Importe), 0);
              if (near(suma, n0(t.Importe), 1)) o.push({ s: "ok", txt: `Pago conjunto del ${dd(t.Fecha)} por ${fm(n0(t.Importe))} (incluye otros gastos liquidados).` });
              else { o.push({ s: "warn", txt: `El ${dd(t.Fecha)} se pagaron <b>${fm(n0(t.Importe))}</b>${t.Concepto_Pago ? ` (“${t.Concepto_Pago}”)` : ""}, más que este gasto.` }); mayores.push({ t, g, v }); } }
            else if (sm !== false) o.push({ s: "ok", txt: `Pagado el ${dd(t.Fecha)}.` }); }
          if (admin && sameCuit(t.CUIT_Ordenante, admin)) cell.adminAcct = true; });
        if (!base) pago.forEach(t => o.push({ s: "ok", txt: `Pago de servicio del ${dd(t.Fecha)}${t.Importe ? " por " + fm(n0(t.Importe)) : ""}.` }));
      } else if (pant.length) { pg = "pant"; o.push({ s: "warn", txt: `El “comprobante de pago” es una pantalla de saldo a pagar${pant.length > 1 ? `, enviada ${pant.length} veces` : ""}.` }); }
      else if (/PENDIENTE/i.test(g.Estado_Pago || "")) pg = "pend";
      else if (ext.length || tipo === "BANCARIO") pg = "si";
      else pg = "nd";
      // --- otras señales ---
      if (tipo === "OBRA" && /ORDINARIO/i.test(g.Ordinario_Extraordinario || "ORDINARIO")) o.push({ s: "warn", txt: "Es una <b>obra</b> y se cargó como gasto ordinario." });
      others.forEach(ob => { if (ob.re.test(g.Concepto_Original || "")) o.push({ s: "warn", txt: `El texto del gasto menciona a <b>${ob.n}</b>.` }); });
      const pv = prevOf(g);
      if (pv.length && /CUOTA/i.test(g.Concepto_Original || "") && pv.some(x => x.Concepto_Original === g.Concepto_Original && near(n0(x.Importe), v))) o.push({ s: "bad", txt: "Mismo texto, misma cuota e importe que en la liquidación anterior." });
      const pvv = pv.reduce((a, x) => a + n0(x.Importe), 0), idxP = per.findIndex(p => p.ID_Periodo === g.ID_Periodo);
      if (!pv.length && idxP > 0 && !(per[idxP - 2] && G.some(x => x.ID_Periodo === per[idxP - 2].ID_Periodo && x.Concepto_Normalizado === g.Concepto_Normalizado)) && v > 100000 && !est && /PRORRATEO|ABONO|SERVICIO|HONORARIO/.test(tipo)) o.push({ s: "warn", txt: "<b>Cargo nuevo</b>: no estaba en la liquidación anterior." });
      if (pvv > 0 && v > 0 && !est && v / pvv > 1.5 && cell.g.length === 1) o.push({ s: "warn", txt: `<b>+${pc(v / pvv - 1)}</b> contra la liquidación anterior (${fm(pvv)}).` });
      plan.forEach(c => { const d = det(c); if (!d.empleados) return;
        if (d.administracion) o.push({ s: d.administracion > 1 ? "warn" : "ok", txt: `Planilla ${c.Periodo_Servicio || ""}: ${d.empleados} empleados, ${d.administracion} del sector administración.` });
        if (d.efectivoSinRetenciones) o.push({ s: "bad", txt: `${d.efectivoSinRetenciones} pagados en efectivo y sin retenciones (${fm(d.netoEfectivoSinRet)}).` });
        if (d.porcRetenciones > .25) o.push({ s: "warn", txt: `Retenciones del ${pc(d.porcRetenciones)} del remunerativo (lo habitual ronda 19–20%).` }); });
      cell.f.push(f); cell.pg.push(pg);
    });
    /* ---------- reparto contra gasto ---------- */
    const repRow = { c: "Total repartido entre los lotes", p: "contra el gasto del mes", total: true, cells: {} };
    P3.forEach(p => { const gt = n0(p.Total_Gastos_Periodo), rep = n0(p.Base_Prorrateo_Ord), d = rep - gt, c = { v: rep, o: [], fK: null, pK: null };
      if (Math.abs(d) <= 100) { c.s = "ok"; c.o.push({ s: "ok", txt: `Coincide con el gasto (${fm(gt)}).` }); }
      else { c.s = d > 0 ? "bad" : "warn"; c.o.push({ s: c.s, txt: `Gasto: ${fm(gt)}. <b>${d > 0 ? "+" : ""}${fm(d)}</b> ${d > 0 ? "repartido de más" : "repartido de menos"}.` });
        if (d > 0) addInd({ sev: "bad", grupo: "A", t: "Se repartió entre los lotes más de lo gastado", ve: `Liquidación ${liqN(p.ID_Periodo)}: gasto ${fm(gt)}, repartido ${fm(rep)}. Diferencia ${fm(d)}${coef ? ` (${f0(d * coef)} por lote común)` : ""}.`, monto: d, pedir: "Devolución o crédito a los lotes en la próxima liquidación.", pid: p.ID_Periodo, recup: true }); }
      repRow.cells[p.ID_Periodo] = c; });

    /* ---------- controles de la liquidación (patrimonio, pendientes) ---------- */
    (S.VALIDACIONES || []).filter(v => v.Barrio === barrio && ids.includes(v.ID_Periodo)).forEach(v => {
      const a = num(v.Importe_Documento), b = num(v.Importe_Calculado), t = num(v.Tolerancia) || 1; if (a == null || b == null || Math.abs(a - b) <= t) return;
      const niv = String(v.Nivel_Si_Falla || ""); if (!/CR[IÍ]TICO|IMPORTANTE/i.test(niv)) return;
      if (/Base prorrateada/i.test(v.Control)) return;
      const pat = /Patrimonio/i.test(v.Control), pen = /pendientes/i.test(v.Control);
      addInd({ sev: /CR[IÍ]TICO/i.test(niv) ? "bad" : "warn", grupo: "A", t: pat ? "El patrimonio informado no cierra" : pen ? "Gastos pendientes que no están en el detalle" : "Control de la liquidación que no cierra",
        ve: `${v.Control}: la liquidación dice ${fm(a)}; la suma de sus propios datos da ${fm(b)}. Diferencia ${fm(a - b)}.${pat ? " Hay deuda que figura como pendiente pero no se resta del patrimonio." : ""}`, monto: Math.abs(a - b), pedir: pat ? "Estado patrimonial corregido con toda la deuda con proveedores." : "Detalle de la diferencia.", pid: v.ID_Periodo, patrimonio: pat });
    });

    /* ---------- bancos ---------- */
    const months = new Set(); P3.forEach(p => months.add(mprev(p.Mes)));
    const Mr = M.filter(m => months.has(String(m.Fecha).slice(0, 7)));
    const liqFor = f => { const m = mnext(String(f).slice(0, 7)); return (per.find(p => p.Mes === m) || {}).ID_Periodo || ""; };
    // pagos desde una cuenta del administrador
    const fromAdm = C.filter(c => ["TRANSFERENCIA", "PAGO_SERVICIO"].includes(rev(c)) && admin && sameCuit(c.CUIT_Ordenante, admin) && months.has(String(c.Fecha).slice(0, 7)));
    if (fromAdm.length) { const ctas = [...new Set(fromAdm.map(c => c.Cuenta_Debito).filter(Boolean))], fechas = [...new Set(fromAdm.map(c => c.Fecha))].sort().map(dd);
      const names = [...new Set(M.filter(m => { const d = dig(m.Cuenta).replace(/\*/g, "").slice(-6); return d.length >= 6 && ctas.some(x => dig(x).includes(d)); }).map(m => m.Nombre_Cuenta))].filter(x => x && !/^[\d\/]+$/.test(x));
      addInd({ sev: "bad", grupo: "A", t: "Los pagos salen de una cuenta a nombre del administrador", ve: `${fromAdm.length} comprobantes de pago (${fechas.join(", ")}) tienen como ordenante a ${fromAdm[0].Ordenante || "el administrador"} (CUIT ${B.CUIT_Administrador}), cuenta ${ctas.join(", ")}.${names.length ? ` En el extracto la cuenta figura como “${names.join("”, “")}”.` : ""}${B.CUIT_Fideicomiso ? ` El barrio tiene CUIT propio: ${B.CUIT_Fideicomiso}.` : ""}`, pedir: "Titularidad de cada cuenta y traspaso a una cuenta a nombre del barrio.", pid: ids[ids.length - 1] }); }
    // transferencias al administrador
    const honor = G.filter(g => /HONORARIO/i.test(g.Tipo_Gasto || "") || /Honorarios/i.test(g.Concepto_Normalizado || ""));
    const toAdm = Mr.filter(m => n0(m.Debito) > 0 && admin && (sameCuit(m.CUIT_Contraparte, admin) || (/MISMO TIT/i.test(m.Descripcion || "") && String(m.Descripcion).includes(admin))));
    const salidas = [];
    toAdm.forEach(m => { const v = n0(m.Debito), pid = liqFor(m.Fecha), h = honor.filter(g => [pid, (per[per.findIndex(p => p.ID_Periodo === pid) - 1] || {}).ID_Periodo].includes(g.ID_Periodo));
      const hv = h.length ? n0(h[0].Importe) : 0, k = hv ? v / hv : 0, multiple = hv && k >= 1 && near(k, Math.round(k), 0.001);
      const tr = C.find(c => rev(c) === "TRANSFERENCIA" && near(n0(c.Importe), v) && c.Fecha === m.Fecha);
      const txt = multiple ? `Equivale a ${Math.round(k)} honorario${k > 1.5 ? "s" : ""} de ${fm(hv)}.${tr && tr.Concepto_Pago ? ` Concepto: “${tr.Concepto_Pago}”.` : ""}` : "No coincide con ningún gasto liquidado.";
      salidas.push({ f: m.Fecha, t: `Transferencia a una cuenta del administrador${/ahorro/i.test(JSON.stringify(det(tr || {}))) ? " (caja de ahorros)" : ""}`, v, falta: multiple ? "Factura de honorarios de cada mes a nombre del barrio" : "Todo: no hay gasto ni comprobante", sev: multiple ? "warn" : "bad" });
      addInd({ sev: multiple ? "warn" : "bad", grupo: "A", t: multiple ? "Transferencia al administrador por honorarios" : "Transferencia al administrador sin gasto que la respalde", ve: `${dd(m.Fecha)}: ${fm(v)} a una cuenta del mismo titular (${m.Contraparte || "administrador"}). ${txt}`, monto: v, pedir: multiple ? "Factura de honorarios de cada mes, a nombre del barrio." : "Destino y motivo de la transferencia, con comprobante.", pid: pid || ids[ids.length - 1] }); });
    // otras salidas: ¿coinciden con algún gasto, pago o comprobante?
    const imps = [], debs = {};
    const norm = t => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    const mnum = m => { const [y, k] = String(m).split("-").map(Number); return y * 12 + k; };
    G.forEach(g => imps.push({ v: n0(g.Importe), g })); PA.forEach(p => imps.push({ v: n0(p.Importe), g: p }));
    C.filter(c => ["ORDEN_PAGO", "TRANSFERENCIA", "PAGO_SERVICIO", "FACTURA"].includes(rev(c))).forEach(c => imps.push({ v: n0(c.Importe), c }));
    const byProv = {}; G.forEach(g => { const k = g.ID_Proveedor || g.Proveedor; if (k) (byProv[k] = byProv[k] || []).push(n0(g.Importe)); });
    const pairSum = v => Object.values(byProv).some(a => a.some((x, i) => a.some((y, j) => j > i && near(x + y, v))));
    Mr.filter(m => n0(m.Debito) > 0 && ["TRANSFERENCIA", "DEBITO_AUTOMATICO", "CHEQUE", "OTRO"].includes(m.Tipo) && !toAdm.includes(m)).forEach(m => {
      const v = n0(m.Debito), pid = liqFor(m.Fecha);
      if (/Ctas Propias/i.test(m.Descripcion || "") || (m.Mismo_Titular === "SI" && !sameCuit(m.CUIT_Contraparte, admin))) { salidas.push({ f: m.Fecha, t: `Transferencia a “cuentas propias”: ${m.Contraparte || "otra cuenta"}`, v, falta: "Para qué y con qué gasto se relaciona", sev: "warn" }); return; }
      if (imps.some(x => near(x.v, v)) || pairSum(v)) return;
      const toks = norm((m.Contraparte || "") + " " + (m.Descripcion || "")).split(/[^A-Z]+/).filter(w => w.length >= 5 && !/^(TRANSF|DEBITO|AUTOM|SERVI|INTERB|DISTINTO|MISMO)/.test(w));
      const gm = toks.length && G.filter(g => Math.abs(mnum(g.Mes) - mnum(String(m.Fecha).slice(0, 7))) <= 2).find(g => toks.some(w => norm((g.Proveedor || "") + " " + (g.Concepto_Normalizado || "")).includes(w)));
      if (gm) { const gg = G.filter(g => g.Concepto_Normalizado === gm.Concepto_Normalizado && g.ID_Periodo === (liqFor(m.Fecha) || gm.ID_Periodo))[0] || gm;
        debs[gg.ID_Gasto] = 1; noteG(gg.ID_Gasto, "warn", `El banco debitó ${fm(v)} el ${dd(m.Fecha)}; se liquidó ${fm(n0(gg.Importe))}.`); return; }
      const mult = Gin.concat(G).map(g => ({ g, k: n0(g.Importe) ? v / n0(g.Importe) : 0 })).find(x => x.k >= 1.9 && x.k <= 4.1 && near(x.k, Math.round(x.k), 0.0005));
      const pers = /DISTINTO TIT|Persona física/i.test((m.Descripcion || "") + (m.Contraparte || "")) && /persona/i.test(m.Contraparte || m.Descripcion || "");
      const tr = C.find(c => rev(c) === "TRANSFERENCIA" && near(n0(c.Importe), v));
      let t, falta, sev = "bad";
      if (mult) { t = `${m.Tipo === "DEBITO_AUTOMATICO" ? "Débito automático" : "Salida"} = ${Math.round(mult.k)} × ${fm(n0(mult.g.Importe))} (${mult.g.Concepto_Normalizado})`; falta = `Se liquidó uno solo; falta explicar ${fm(v - n0(mult.g.Importe))}`; noteG(mult.g.ID_Gasto, "bad", `El ${dd(m.Fecha)} el banco debitó <b>${fm(v)}</b> (${Math.round(mult.k)} veces este importe).`); }
      else if (tr && tr.ID_Gasto) { t = `Transferencia a ${tr.Destinatario || "un tercero"} (${tr.Concepto_Pago || "sin concepto"})`; falta = "Facturas que respalden el importe completo"; }
      else { t = `${m.Tipo === "DEBITO_AUTOMATICO" ? "Débito automático" : "Transferencia"}${pers ? " a una persona física" : m.Contraparte ? " a " + m.Contraparte : ""}`; falta = "Gasto y comprobante que la respalden"; }
      salidas.push({ f: m.Fecha, t, v, falta, sev });
      addInd({ sev, grupo: "A", t: "Salida de la cuenta sin gasto que coincida", ve: `${dd(m.Fecha)}: ${t}, ${fm(v)}. ${falta}.`, monto: mult ? v - n0(mult.g.Importe) : v, pedir: "Comprobante y explicación.", pid: pid || ids[ids.length - 1] }); });
    mayores.forEach(({ t, g, v }) => { const x = n0(t.Importe); if (salidas.some(s => s.f === t.Fecha && near(s.v, x))) return;
      salidas.push({ f: t.Fecha, t: `Transferencia a ${t.Destinatario || "un tercero"}${t.Concepto_Pago ? ` (“${t.Concepto_Pago}”)` : ""}`, v: x, falta: `Facturas por la diferencia con lo liquidado (${fm(v)} en ${g.Concepto_Normalizado})`, sev: "warn" });
      addInd({ sev: "warn", grupo: "A", t: "Pago mayor que el gasto liquidado", ve: `${dd(t.Fecha)}: ${fm(x)} a ${t.Destinatario || "un tercero"}${t.Concepto_Pago ? ` por “${t.Concepto_Pago}”` : ""}. El gasto liquidado (${g.Concepto_Normalizado}) es de ${fm(v)}.`, monto: x - v, pedir: "Facturas que respalden el resto del pago.", pid: g.ID_Periodo }); });
    // bajas de saldo que el extracto no muestra
    const groups = {}; M.forEach((m, i) => { const k = m.Banco + "|" + m.Cuenta; (groups[k] = groups[k] || []).push({ m, i }); });
    Object.values(groups).map(a => a.sort((x, y) => String(x.m.Fecha).localeCompare(String(y.m.Fecha)) || x.i - y.i).map(x => x.m)).forEach(arr => { let last = null, between = 0;
      arr.forEach(m => { between += n0(m.Credito) - n0(m.Debito);
        if (num(m.Saldo) == null) return;
        if (last && months.has(String(m.Fecha).slice(0, 7)) && mnum(String(m.Fecha).slice(0, 7)) - mnum(String(last.Fecha).slice(0, 7)) <= 1) { const un = num(m.Saldo) - (num(last.Saldo) + between);
          if (un < -50000) { const eg = (S.EGRESOS_CAJA || []).concat(PA).find(e => e.Barrio === barrio && near(Math.abs(n0(e.Importe)), -un, 1)), egT = eg ? ` Coincide con “${eg.Concepto || eg.Concepto_Normalizado}” de la liquidación ${String(eg.ID_Periodo).slice(-2)}/${String(eg.ID_Periodo).slice(-7, -3)}${/SIN DETALLE/i.test(eg.Tipo_Egreso || "") ? ", registrado sin comprobante" : ""}.` : "";
            salidas.push({ f: m.Fecha, t: `Baja de saldo que el extracto no muestra (${m.Banco}, ${dd(last.Fecha)} a ${dd(m.Fecha)})${eg ? ": “" + (eg.Concepto || eg.Concepto_Normalizado) + "”" : ""}`, v: -un, falta: "Extracto completo y comprobantes", sev: "bad" });
            addInd({ sev: "bad", grupo: "A", t: "El saldo baja sin movimientos visibles", ve: `${m.Banco}: entre el ${dd(last.Fecha)} y el ${dd(m.Fecha)} el saldo pasa de ${fm(num(last.Saldo))} a ${fm(num(m.Saldo))}; los movimientos que muestra el extracto explican ${fm(between)}. Faltan ${fm(-un)} de salidas.${egT}`, monto: -un, pedir: "Extracto completo, sin filtrar, y comprobantes de esas salidas.", pid: liqFor(m.Fecha) || ids[0] }); } }
        last = m; between = 0; }); });
    // extractos filtrados
    C.filter(c => c.Tipo === "EXTRACTO" && (/filtrad/i.test(c.Nota || "") || det(c).filtrado) && ids.includes(c.ID_Periodo)).forEach(c => addInd({ sev: "bad", grupo: "D", t: "Extracto bancario filtrado", ve: `El extracto enviado como respaldo (${c.Archivo}) trae solo comisiones e impuestos: no muestra cobros ni pagos.`, pedir: "Extracto completo de la cuenta.", pid: c.ID_Periodo }));
    // conciliación: saldo inicial de la liquidación contra bancos al cierre del mes anterior
    const conc = [];
    P3.forEach(p => { const fin = mprev(p.Mes) + "-31", accts = {};
      M.filter(m => num(m.Saldo) != null && String(m.Fecha) <= fin && String(m.Fecha) >= mprev(p.Mes) + "-01").forEach(m => { const k = m.Banco + "|" + m.Cuenta; accts[k] = m; });
      const ks = Object.keys(accts); if (!ks.length) return; const banco = ks.reduce((a, k) => a + num(accts[k].Saldo), 0), liq = n0(p.Saldo_Inicial), d = banco - liq;
      const allA = [...new Set(M.map(m => m.Banco + "|" + m.Cuenta))], faltan = allA.filter(k => !ks.includes(k));
      conc.push({ pid: p.ID_Periodo, mes: mprev(p.Mes), liq, banco, d, cuentas: ks.map(k => k.replace("|", " ")), faltan: faltan.map(k => k.replace("|", " ")) });
      if (Math.abs(d) > 1000 && !faltan.length) addInd({ sev: "warn", grupo: "D", t: "Los saldos del banco no coinciden con la liquidación", ve: `Al cierre de ${mlab(mprev(p.Mes))} la liquidación informa ${fm(liq)} y los extractos suman ${fm(banco)} (${ks.length} cuenta${ks.length > 1 ? "s" : ""}). Diferencia ${fm(d)}.`, monto: Math.abs(d), pedir: "Conciliación bancaria al cierre.", pid: p.ID_Periodo }); });
    // cobros no identificados que el banco sí identifica
    (S.INGRESOS || []).filter(i => i.Barrio === barrio && ids.includes(i.ID_Periodo) && /no identificad/i.test(i.Concepto || "")).forEach(i => {
      const v = n0(i.Importe), hit = M.find(m => near(n0(m.Credito), v) && m.Identificable === "SI");
      if (hit) addInd({ sev: "warn", grupo: "D", t: "Cobro “no identificado” que el banco identifica", ve: `${fm(v)} figura como no identificado, pero el extracto del ${dd(hit.Fecha)} muestra quién transfirió.`, pedir: "Imputar el cobro al lote que corresponde.", pid: i.ID_Periodo }); });

    // severidad y etiquetas por celda
    Object.values(rows).forEach(r => Object.values(r.cells).forEach(c => {
      c.g.forEach(id => (cellNote[id] || []).forEach(x => c.o.push(x)));
      const seen = new Set(); c.o = c.o.filter(x => !seen.has(x.txt) && seen.add(x.txt));
      c.g.forEach(id => { if (debs[id]) c.pg.push("deb"); });
      const fs = [...new Set(c.f)].filter(Boolean), ps = [...new Set(c.pg)].filter(Boolean);
      const fK = ["noco", "pres", "no", "dif", "conj", "parc", "est", "noenv", "pend", "si", "ext"].find(k => fs.includes(k)) || null;
      const pK = ["pers", "adm", "deb", "terc", "pant", "nd", "pend", "si"].find(k => ps.includes(k)) || null;
      c.fK = fK; c.pK = pK; c.s = worst(fK ? F[fK][1] : "ok", pK && pK !== "pend" ? P[pK][1] : "ok", ...c.o.map(x => x.s));
      if (c.s === "ok" && fK === "noenv") c.s = "nd";
    }));

    /* ---------- indicadores por celda ---------- */
    const Rw = Object.values(rows);
    const cellInd = (k, t, sev, grupo, pedir, fn) => { const hits = []; Rw.forEach(r => ids.forEach(pid => { const c = r.cells[pid]; if (c && fn(c)) hits.push({ r, pid, c }); }));
      const byC = {}; hits.forEach(h => (byC[h.r.c] = byC[h.r.c] || []).push(h));
      if (hits.length) addInd({ sev, grupo, t, ve: Object.entries(byC).map(([c, hs]) => `${c}: ${hs.map(h => `${liqN(h.pid)} ${fm(h.c.v)}`).join(", ")}`).join("; ") + ".", monto: hits.reduce((a, h) => a + h.c.v, 0), pedir, pid: hits[hits.length - 1].pid, cells: hits.map(h => h.r.c + "|" + h.pid) }); };
    cellInd("noco", "Importes liquidados que no coinciden con su factura", "bad", "B", "Liquidar el importe de la factura y acreditar la diferencia.", c => c.fK === "noco");
    cellInd("pres", "Gastos cobrados con un presupuesto en lugar de factura", "bad", "B", "Factura y comprobante de pago, o reintegro.", c => c.fK === "pres" || c.fK === "no");
    cellInd("pers", "Pagos desde cuentas personales", "bad", "A", "Que ningún pago salga de cuentas personales.", c => c.pK === "pers");
    cellInd("terc", "Pagos a una persona distinta del emisor de la factura", "warn", "A", "Autorización del proveedor para cobrar por un tercero.", c => c.pK === "terc");
    cellInd("est", "Gastos liquidados como estimados", "warn", "D", "Liquidar con la factura real.", c => c.fK === "est" && c.v > 0);
    cellInd("pant", "Comprobantes de pago que no son comprobantes", "warn", "D", "Comprobante de pago real.", c => c.pK === "pant");
    cellInd("obra", "Obras cargadas como gasto ordinario", "warn", "C", "Presupuesto aprobado e imputación como extraordinario.", c => c.o.some(x => /obra<\/b>/.test(x.txt)));
    cellInd("otro", "Textos copiados de otro barrio", "warn", "D", "Revisar la liquidación antes de emitirla.", c => c.o.some(x => /menciona a/.test(x.txt)));
    cellInd("cuota", "Cuotas repetidas de una liquidación a otra", "bad", "B", "Reintegro.", c => c.o.some(x => /misma cuota/.test(x.txt)));
    cellInd("parc", "Respaldos con comprobantes no fiscales", "warn", "D", "Solo comprobantes fiscales.", c => c.fK === "parc" && c.o.some(x => /no válido/.test(x.txt)));
    cellInd("plan", "Planilla de sueldos con pagos en efectivo sin retenciones", "bad", "C", "Explicar y excluir lo que no corresponde al barrio.", c => c.o.some(x => /efectivo y sin retenciones/.test(x.txt)));
    cellInd("noenv", "Gastos sin factura enviada", "nd", "D", "Factura de cada gasto.", c => c.fK === "noenv" && c.v > 0);

    /* ---------- verificados (planilla HALLAZGOS) ---------- */
    const abiertos = HZ.filter(h => !/SOLUCIONADO|DESCARTADO/.test(h.Estado || ""));
    const imp = h => n0(h["Impacto_" + barrio]);
    const montos = abiertos.filter(h => /^A RECUPERAR/.test(h.Tipo_Impacto || "") && imp(h)).map(h => ({ id: h.ID_Hallazgo, t: h.Titulo, per: h.Periodo_Afectado || h.Mes, v: imp(h), est: /ESTIMADO/.test(h.Tipo_Impacto) })).sort((a, b) => b.v - a.v);
    const criterios = abiertos.filter(h => /CRITERIO|REDISTRIBUCI/.test(h.Tipo_Impacto || "")).map(h => ({ id: h.ID_Hallazgo, t: h.Titulo, v: imp(h), pedir: h.Que_Pedir }));
    const totM = montos.reduce((a, m) => a + m.v, 0);

    /* ---------- cronología ---------- */
    const crono = [];
    RS.forEach(r => crono.push({ f: r.Fecha, who: "rym", w: "Administración", t: `“${r.Dijo}”` }));
    const rsF = new Set(RS.map(r => String(r.Fecha).slice(0, 10))), altas = {};
    EV.forEach(e => { const f = String(e.Fecha).slice(0, 10), h = HZ.find(x => x.ID_Hallazgo === e.ID_Hallazgo);
      if (e.Tipo === "ALTA") { (altas[f] = altas[f] || []).push(h ? h.Titulo : e.ID_Hallazgo); return; }
      if (/RESPUESTA/.test(e.Tipo) && rsF.has(f)) return;
      crono.push({ f, who: /RESPUESTA/.test(e.Tipo) ? "rym" : "yo", w: /RESPUESTA/.test(e.Tipo) ? "Administración" : e.Autor || "Portal", t: `${h ? h.Titulo + ": " : ""}${e.Texto}` }); });
    Object.entries(altas).forEach(([f, ts]) => crono.push({ f, who: "yo", w: "Auditoría", t: ts.length === 1 ? `Se registra el problema “${ts[0]}”.` : `Se registran ${ts.length} problemas: ${ts.slice(0, 4).join("; ")}${ts.length > 4 ? "; y otros" : ""}.` }));
    salidas.filter(s => s.sev === "bad").forEach(s => crono.push({ f: s.f, who: "bco", w: "Banco", t: `${s.t}: ${fm(s.v)}.` }));
    per.filter(p => ids.includes(p.ID_Periodo) && /\d{4}-\d{2}-\d{2}/.test(String(p.Fecha_Emision))).forEach(p => crono.push({ f: String(p.Fecha_Emision).slice(0, 10), who: "rym", w: "Administración", t: `Emite la liquidación ${p.Liquidacion}.` }));
    crono.sort((a, b) => String(a.f).localeCompare(String(b.f)));
    const seenE = new Set(); const cron = crono.filter(e => { const k = e.f + e.t; if (seenE.has(k)) return false; seenE.add(k); return true; });

    /* ---------- faltantes ---------- */
    const falt = [];
    const noenv = {}; Rw.forEach(r => ids.forEach(pid => { const c = r.cells[pid]; if (c && (c.fK === "noenv" || c.fK === "pres") && c.v > 0) (noenv[r.c] = noenv[r.c] || []).push((pById[pid] || {}).Liquidacion || pid); }));
    Object.entries(noenv).forEach(([k, v]) => falt.push({ d: `Factura de ${k}`, para: `Liquidación ${v.join(", ")}` }));
    const pend = C.filter(c => ids.includes(c.ID_Periodo) && rev(c) === "PENDIENTE"); if (pend.length) falt.push({ d: `${pend.length} imágenes de respaldo sin revisar en el portal`, para: "Clasificarlas en Comprobantes" });
    ids.forEach(pid => { const m = mprev(pById[pid].Mes); const banks = [...new Set(M.map(x => x.Banco + " " + x.Cuenta))]; banks.forEach(b => { if (!M.some(x => x.Banco + " " + x.Cuenta === b && String(x.Fecha).startsWith(m))) falt.push({ d: `Extracto ${b} de ${mlab(m)}`, para: "Ver entradas, salidas y conciliar" }); }); });
    abiertos.filter(h => h.Que_Pedir).forEach(h => falt.push({ d: h.Que_Pedir, para: h.Titulo, id: h.ID_Hallazgo }));

    /* ---------- resumen ---------- */
    const order = { bad: 0, warn: 1, nd: 2 };
    ind.sort((a, b) => (order[a.sev] - order[b.sev]) || String(a.grupo).localeCompare(b.grupo));
    const salBad = salidas.filter(s => s.sev === "bad").reduce((a, s) => a + s.v, 0);
    const patr = ind.filter(i => i.patrimonio).reduce((a, i) => Math.max(a, i.monto || 0), 0);
    const rsOk = RS.filter(r => /^CUMPLIDO$/.test(r.Estado)).length, rsMal = RS.filter(r => /NO CUMPLIDO|CONTRADICHO|SIN RESPUESTA/.test(r.Estado)).length;
    const res = { totM, porLote: coef ? totM * coef : null, coef, salBad, patr, rsOk, rsMal, rsTot: RS.length, nBad: ind.filter(i => i.sev === "bad").length, nWarn: ind.filter(i => i.sev === "warn").length,
      claves: abiertos.filter(h => h.Gravedad === "CRÍTICO").slice(0, 6).map(h => ({ t: h.Titulo, s: h.Conclusion_Simple })) };
    const cuadro = Rw.sort((a, b) => { const sa = Math.max(...ids.map(p => a.cells[p] ? SEVR[a.cells[p].s] : 0)), sb = Math.max(...ids.map(p => b.cells[p] ? SEVR[b.cells[p].s] : 0)); return (sb - sa) || (Math.max(...ids.map(p => b.cells[p] ? b.cells[p].v : 0)) - Math.max(...ids.map(p => a.cells[p] ? a.cells[p].v : 0))); });
    cuadro.push(repRow);
    return { barrio, bName, B, periodos: P3, ids, cuadro, ind, montos, criterios, salidas: salidas.sort((a, b) => b.v - a.v), conc, respuestas: RS, cron, falt, res, verificados: abiertos, todos: HZ, F, P, fm, f0, pc, dd, mlab, mprev };
  }

  /* Texto de intimación armado con lo verificado y lo detectado. */
  function carta(A, firma) {
    const L = A.periodos.map(p => String(p.Liquidacion).replace(/^(\d)\//, "0$1/")).join(", "), v = A.verificados.filter(h => h.Gravedad !== "SIN INCONSISTENCIA");
    const sev = { "CRÍTICO": 0, "IMPORTANTE": 1, "A REVISAR": 2 }; v.sort((a, b) => (sev[a.Gravedad] ?? 3) - (sev[b.Gravedad] ?? 3));
    const items = v.filter(h => h.Que_Pedir).map(h => { const m = n0(h["Impacto_" + A.barrio]); return `${h.Titulo}${m && /RECUPERAR|SIN EXPLICAR|AJUSTAR|DOCUMENTAR/.test(h.Tipo_Impacto || "") ? ` (${A.fm(m)})` : ""}: ${h.Que_Pedir.replace(/\.$/, "")}.`; });
    A.ind.filter(i => i.sev === "bad" && !v.some(h => h.Titulo === i.t)).slice(0, 6).forEach(i => items.push(`${i.t}: ${i.pedir.replace(/\.$/, "")}. (${i.ve.replace(/<[^>]+>/g, "")})`));
    return `Asunto: Intimación — rendición de cuentas documentada de las liquidaciones ${L} de ${A.bName}

Señores ${(A.periodos[A.periodos.length - 1] || {}).Administrador || "Administración"}:

${firma.intro || `Como propietario de ${A.bName}, y ante la falta de respuesta documentada a las observaciones planteadas`}, los intimo a que en el plazo de 10 días hábiles:

${items.map((t, i) => `${i + 1}. ${t}`).join("\n")}
${items.length + 1}. Respondan por escrito cada observación, indicando si corresponde o no y con qué documentación.

Vencido el plazo sin respuesta completa, solicitaré la intervención del fiduciario, convocaré a los propietarios a asamblea para tratar la continuidad de la administración y evaluaré las acciones que correspondan. Las expensas se seguirán abonando en término, bajo protesta y con reserva de derechos.

${firma.nombre || "[Nombre]"}
${firma.lote || "[Lote]"} — ${A.bName}`;
  }
  return { run, carta, F, P, fm, f0 };
})();
export default Audit;
