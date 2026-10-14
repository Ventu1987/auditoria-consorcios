// @ts-nocheck
/* Reutilizado del portal v7 sin cambios de lógica. */
/* ===== Lector de liquidaciones AdminProp (100% en el navegador, sin costo) ===== */
const LiqParser = (() => {
  async function getLines(pdf) {
    const all = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const pg = await pdf.getPage(p), tc = await pg.getTextContent();
      const its = tc.items.filter(i => i.str && i.str.trim()).map(i => ({ s: i.str.trim(), x: i.transform[4], y: i.transform[5] }))
        .filter(i => !(i.x < 15 && /Generada por AdminProp/.test(i.s)));
      its.sort((a, b) => b.y - a.y || a.x - b.x);
      const lines = [];
      for (const it of its) {
        const L = lines[lines.length - 1];
        if (L && L.lastY - it.y <= 4.5) { L.its.push(it); L.lastY = it.y; } else lines.push({ p, y: it.y, lastY: it.y, its: [it] });
      }
      lines.forEach(L => { L.its.sort((a, b) => a.x - b.x); L.text = L.its.map(i => i.s).join(" ").replace(/\s+/g, " ").trim(); });
      all.push(...lines.filter(L => !(L.its.length === 1 && /^\d{1,2}$/.test(L.its[0].s) && L.its[0].x > 560)));
    }
    return { lines: all, pages: pdf.numPages };
  }
  const MONEY = /^-?(\d{1,3}(\.\d{3})*|\d+)(,\d{1,2})?,?$|^-$/;
  const num = s => { if (s == null) return null; s = String(s).trim(); if (s === "-" || s === "") return 0; s = s.replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."); if (s.endsWith(".")) s = s.slice(0, -1); const v = parseFloat(s); return isNaN(v) ? null : v; };
  const numDot = s => { const v = parseFloat(String(s).replace(/[^\d.\-]/g, "")); return isNaN(v) ? null : v; };
  const iso = d => { const m = String(d).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null; };
  const per = s => { const m = String(s).match(/(\d{1,2})\/(\d{4})/); return m ? `${m[2]}-${m[1].padStart(2, "0")}` : null; };
  const isMoney = i => MONEY.test(i.s);
  const inX = (L, a, b) => L.its.filter(i => i.x >= a && i.x < b && i.s !== "$" && isMoney(i));
  const val = (L, a, b) => { const t = inX(L, a, b); return t.length ? num(t[t.length - 1].s) : null; };
  const txt = (L, maxX) => L.its.filter(i => i.x < maxX).map(i => i.s).join(" ").replace(/\s+/g, " ").trim();
  const joinSplit = its => { const o = []; for (let k = 0; k < its.length; k++) { const a = its[k], b = its[k + 1]; if (/,$/.test(a.s) && b && /^\d{1,2}$/.test(b.s)) { o.push({ ...a, s: a.s + b.s }); k++; } else o.push(a); } return o; };

  function parse(doc, filename) {
    const { lines, pages } = doc, R = { periodo: null, liquidacion: null, fecha_emision: null, fecha_vencimiento: null, recargo_vencimiento: null, fecha_cierre: null, paginas: pages, barrio_texto: null,
      total_gastos: null, gastos_extraordinarios: 0, fondo_reserva: null, rubros: [], gastos: [], pagos_periodos_anteriores: [], pagos_periodos_anteriores_total: null,
      fondos: {}, ingresos: [], egresos: [], banco: {}, composicion_saldo: {}, patrimonio: {}, gastos_pendientes: [], cobros_no_identificados: [], cobros_identificados: [],
      saldos_pendientes: [], saldos_pendientes_total: null, prorrateo: [], prorrateo_totales: null, cupon: { unidad: null }, recibos: [], dudas: [] };
    let mode = "header", rubro = null, item = null, pa = null, rec = null, pendSub = false;
    const closeItem = () => { if (item) { const t = item.text.join(" ").replace(/\s+/g, " ").trim(); if (item.total == null) R.dudas.push({ campo: "Gasto " + (rubro || "") + " " + item.item, detalle: "No se encontró el importe de: " + t.slice(0, 80), pagina: item.p });
      const g = { rubro, item: item.item, concepto_original: t, importe: item.total ?? 0, columna: item.ord != null ? "ORD" : (item.ext != null ? "EXT" : "ORD"), base_calculo: null, porcentaje: null, pagina: String(item.p) };
      let m = t.match(/TOTAL DE \$([\d.,]+) X ([\d,]+)%/) || t.match(/(?:80|20)%: \$([\d.,]+); PARTICIPACI[ÓO]N[^%]*? ([\d,]+)%/);
      if (m) { g.base_calculo = num(m[1]); g.porcentaje = +(num(m[2]) / 100).toFixed(6); }
      R.gastos.push(g); item = null; } };
    const closePa = () => { if (pa) { const t = pa.text.join(" ").replace(/\s+/g, " ").trim(); R.pagos_periodos_anteriores.push({ periodo_origen: per(t.slice(0, 9)), concepto_original: t, importe: pa.imp ?? 0 }); if (pa.imp == null) R.dudas.push({ campo: "Pago de período anterior", detalle: "Sin importe: " + t.slice(0, 80), pagina: pa.p }); pa = null; } };
    for (const L of lines) {
      const T = L.text, U = T.toUpperCase();
      // --- marcadores de sección
      if (/^EXPENSAS$/.test(T)) continue;
      if (/Liquidaci[óo]n:/.test(T) && !R.periodo) { R.periodo = per(T); R.liquidacion = (T.match(/(\d{1,2}\/\d{4})/) || [])[1]; continue; }
      if (U.includes("RECIBO DE COBRO")) { closeItem(); closePa(); mode = "recibo"; rec = { nro: (T.match(/N° ([\d\-]+)/) || [])[1] || null, forma: [] }; R.recibos.push(rec); continue; }
      if (U.includes("ESTADO DE CUENTAS Y PRORRATEO")) { closeItem(); mode = "prorr"; continue; }
      if (U.includes("DETALLE DE EGRESOS E INGRESOS")) { closeItem(); mode = "detalle"; continue; }
      if (U.includes("COMPOSICIÓN DE SALDO") || U.includes("COMPOSICION DE SALDO")) { mode = "comp"; continue; }
      if (/^RESUMEN DE MOVIMIENTOS BANCARIOS$/.test(U)) { mode = "banco"; continue; }
      if (/^GASTOS PAGADOS DE PERIODOS ANTERIORES$/.test(U)) { mode = "pagant"; continue; }
      if (/ESTADO PATRIMONIAL$/.test(U)) { closePa(); mode = "patri"; pendSub = false; continue; }
      if (/^COBROS NO IDENTIFICADOS$/.test(U)) { mode = "cni"; continue; }
      if (/^COBROS IDENTIFICADOS$/.test(U)) { mode = "ci"; continue; }
      if (/^SALDOS PENDIENTES DE PAGO$/.test(U)) { mode = "spp"; continue; }
      if (U.includes("GASTOS DEL PERÍODO POR") || U.includes("GASTOS DEL PERIODO POR") || /^REMUNERACIONES AL PERSONAL$/.test(U)) { mode = "gastos"; continue; }
      if (/^\d{1,2}\.\s?[A-ZÁÉÍÓÚÑ]/.test(txt(L, 320)) && T.includes("Gastos Ord.")) { closeItem(); mode = "gastos"; rubro = txt(L, 320).replace(/^(\d{1,2}\.)\s*/, "$1 "); continue; }
      if (/^TOTAL DE GASTOS/.test(U)) { closeItem(); R.total_gastos = val(L, 490, 640); mode = "none"; continue; }
      if (/^(Ante cualquier|o escribirnos|Mis Expensas|INSERTAR FIRMA|\(Conf\. Art)/.test(T)) continue;

      if (mode === "header") {
        if (!R.barrio_texto && L.p === 1) { const right = L.its.filter(i => i.x > 440 && !/^(Barrio Privado|CUIT|Bella Vista|\$)/i.test(i.s) && !/^[\d.,\-]+$/.test(i.s)).map(i => i.s).join(" ").trim();
          if (right && /[a-záéíóú]/i.test(right) && !/(EXPENSAS|Liquidaci)/i.test(right)) R.barrio_texto = right; }
        const a = val(L, 480, 640);
        if (/^FACUNDO|, \d+-\d+ /.test(T) && T.includes("Lote")) { R.cupon.unidad = (T.match(/, (\d+-\d+)\s/) || [])[1] || null; continue; }
        if (/^Saldo anterior/.test(T)) { const m = T.match(/Ord\.?\s*:?\s*([\d.\-]+)\s*-\s*Ext\.?\s*:?\s*([\d.\-]+)/); R.cupon.saldo_anterior = a; if (m) { R.cupon.saldo_ant_ord = numDot(m[1]); R.cupon.saldo_ant_ext = numDot(m[2]); } }
        else if (/^Gastos Ord\./.test(T)) R.cupon.gastos_ord = a;
        else if (/^Gastos Particulares/.test(T)) R.cupon.gastos_particulares = a;
        else if (/^Interes por mora/i.test(T)) { const m = T.match(/Ord\.?\s*:?\s*([\d.\-]+)\s*-\s*Ext\.?\s*:?\s*([\d.\-]+)/); R.cupon.interes = a; if (m) { R.cupon.interes_ord = numDot(m[1]); R.cupon.interes_ext = numDot(m[2]); } }
        else if (/^Redondeo/.test(T)) R.cupon.redondeo = a;
        else if (/^TOTAL A PAGAR/.test(T)) R.cupon.total_a_pagar = a;
        else if (/^VENCIMIENTO 1/.test(T)) { const d = iso(T); R.fecha_vencimiento = d; R.cupon.fecha_vencimiento = d; const m = T.match(/([\d,]+)%/); R.recargo_vencimiento = m ? +(num(m[1]) / 100).toFixed(6) : null; R.cupon.recargo = R.recargo_vencimiento; R.cupon.total_con_recargo = a; }
        continue;
      }
      if (mode === "gastos") {
        if (/^TOTAL RUBRO/.test(txt(L, 640).replace(/^.*?(TOTAL RUBRO)/, "$1"))) { closeItem(); R.rubros.push({ rubro, total: val(L, 490, 640) ?? 0, pagina: L.p }); continue; }
        const first = L.its[0];
        if (first && /^[a-z]\.$/.test(first.s) && first.x < 30) { closeItem(); item = { item: first.s.replace(".", ""), text: [], p: L.p, ord: null, ext: null, total: null }; }
        if (!item) continue;
        const t = L.its.filter(i => i.x < 318 && i.s !== "$" && !(i === L.its[0] && /^[a-z]\.$/.test(i.s))).map(i => i.s).join(" "); if (t) item.text.push(t);
        const o = val(L, 318, 400), e = val(L, 400, 490), tt = val(L, 490, 640);
        if (o != null && inX(L, 318, 400).length) item.ord = o; if (e != null && inX(L, 400, 490).length && e !== 0) item.ext = e; if (tt != null && inX(L, 490, 640).length) item.total = tt;
        continue;
      }
      if (mode === "prorr") {
        const its = joinSplit(L.its);
        const take = (a, b) => { const t = its.filter(i => i.x >= a && i.x < b && i.s !== "$" && (isMoney(i) || /^-?\d+,\d*$/.test(i.s))); return t.length ? num(t[t.length - 1].s) : 0; };
        const isUnit = its.length > 3 && /^\d{1,2}$/.test(its[0].s) && its[1] && /^\d+-\d+$/.test(its[1].s);
        if (isUnit || /TOTALES/.test(T)) {
          const nums = its.filter(i => i.x > 150 && i.s !== "$" && !/%$/.test(i.s) && (isMoney(i) || /^-?\d+,\d*$/.test(i.s))).map(i => num(i.s));
          if (isUnit) {
            if (nums.length !== 9) R.dudas.push({ campo: "Unidad " + its[1].s, detalle: "La fila tiene " + nums.length + " columnas numéricas (se esperaban 9). Puede haber columnas extraordinarias: revisar.", pagina: L.p });
            const k = nums.length;
            R.prorrateo.push({ lote: +its[0].s, unidad: its[1].s, coeficiente: +(nums[4] / 100).toFixed(6), saldo_anterior: nums[0], pagos: nums[1], deuda: nums[2], interes: nums[3],
              gastos_ord: nums[5], gasto_particular: nums[k - 3], redondeo: nums[k - 2], total: nums[k - 1] });
          } else {
            const k = nums.length;
            R.prorrateo_totales = { saldo_anterior: nums[0], pagos: nums[1], deuda: nums[2], interes: nums[3], gastos_ord: nums[4], gasto_particular: nums[k - 3], redondeo: nums[k - 2], total: nums[k - 1] };
          }
        }
        continue;
      }
      if (mode === "detalle") {
        const lab = L.its.filter(i => i.x < 175).map(i => i.s).join(" ").trim();
        const o = val(L, 375, 434), e = val(L, 434, 492), t = val(L, 492, 640);
        if (!lab || (o == null && e == null && t == null)) continue;
        if (/^Saldo anterior/i.test(lab)) { R.fondos = { ORDINARIO: { saldo_inicial: o ?? 0 }, EXTRAORDINARIO: { saldo_inicial: e ?? 0 }, TOTAL: { saldo_inicial: t ?? 0 } }; continue; }
        if (/^Saldo al cierre/i.test(lab)) { R.fondos.ORDINARIO.saldo_final = o ?? 0; R.fondos.EXTRAORDINARIO.saldo_final = e ?? 0; R.fondos.TOTAL.saldo_final = t ?? 0; R.fecha_cierre = iso(T); continue; }
        [["ORDINARIO", o], ["EXTRAORDINARIO", e]].forEach(([f, v]) => { if (v) (v > 0 ? R.ingresos : R.egresos).push({ concepto: lab, fondo: f, importe: v }); });
        continue;
      }
      if (mode === "comp") { const a = val(L, 480, 640); if (/^EFECTIVO/.test(U)) R.composicion_saldo.efectivo = a ?? 0; if (/^CUENTA CORRIENTE/.test(U)) R.composicion_saldo.cuenta_corriente = a ?? 0; continue; }
      if (mode === "banco") { const a = val(L, 480, 640) ?? 0; if (/^Saldo inicial/i.test(T)) R.banco.saldo_inicial = a; else if (/^Ingresos/i.test(T)) R.banco.ingresos = a; else if (/^Egresos/i.test(T)) R.banco.egresos = a; else if (/^Saldo al cierre/i.test(T)) R.banco.saldo_cierre = a; continue; }
      if (mode === "pagant") {
        if (/^TOTAL\b/.test(U)) { closePa(); R.pagos_periodos_anteriores_total = val(L, 480, 640); continue; }
        if (/^\(\d{2}\/\d{4}\)/.test(T)) { closePa(); pa = { text: [], imp: null, p: L.p }; }
        if (!pa) continue;
        const t = txt(L, 480); if (t) pa.text.push(t); const a = val(L, 480, 640); if (a != null && inX(L, 480, 640).length) pa.imp = a;
        continue;
      }
      if (mode === "patri") {
        const a = val(L, 480, 640), lab = txt(L, 480);
        if (/^SALDO DE DISPONIBILIDADES/i.test(lab)) R.patrimonio.disponibilidades = a ?? 0;
        else if (/^Expensas y otros conceptos/i.test(lab)) R.patrimonio.expensas_a_cobrar = a ?? 0;
        else if (/^Deudas a cobrar/i.test(lab)) R.patrimonio.deudas_a_cobrar = a ?? 0;
        else if (/^Intereses a cobrar/i.test(lab)) R.patrimonio.intereses_a_cobrar = a ?? 0;
        else if (/^Redondeo/i.test(lab)) R.patrimonio.redondeo = a ?? 0;
        else if (/^Gastos devengados pendientes/i.test(lab)) { R.patrimonio.gastos_pendientes = a ?? 0; pendSub = true; }
        else if (/^PATRIMONIO NETO/i.test(lab)) { R.patrimonio.patrimonio_neto = a ?? 0; pendSub = false; }
        else if (pendSub && lab && a != null) R.gastos_pendientes.push({ concepto_original: lab, importe: a });
        else if (pendSub && (lab || a != null)) R.dudas.push({ campo: "Gasto pendiente", detalle: "Línea incompleta: " + T.slice(0, 80), pagina: L.p });
        continue;
      }
      if (mode === "cni") { for (const m of T.matchAll(/\$\s?([\d.,]+)\s*-\s*(\d{1,2}\/\d{4})/g)) R.cobros_no_identificados.push({ detalle: m[2], importe: num(m[1]) }); continue; }
      if (mode === "ci") { for (const m of T.matchAll(/(Un\.\d+)\s*\$\s?([\d.,]+)/g)) R.cobros_identificados.push({ unidad: m[1], importe: num(m[2]) }); continue; }
      if (mode === "spp") {
        if (/^TOTAL\b/.test(U)) { R.saldos_pendientes_total = val(L, 400, 640); mode = "none"; continue; }
        let u = null; for (const i of L.its) { const m = i.s.match(/\|\s*(\d+-\d+)/); if (m) u = m[1]; else if (u && i.s !== "$" && /^-?[\d.]+,\d{2}$/.test(i.s)) { R.saldos_pendientes.push({ unidad: u, importe: num(i.s) }); u = null; } }
        continue;
      }
      if (mode === "recibo") {
        const left = L.its.filter(i => i.x < 400 && !/C O P I A/.test(i.s)); const lt = left.map(i => i.s).join(" ");
        const amt = () => { const t = left.filter(i => /^-?\d+(\.\d+)?$/.test(i.s)); return t.length ? numDot(t[t.length - 1].s) : null; };
        if (/^Periodo:/.test(lt)) { rec.periodo = per(lt); rec.saldo = amt(); }
        else if (/Su Pago/.test(lt)) { rec.fecha_pago = iso(lt); rec.importe_pagado = amt(); }
        else if (/Saldo a favor/.test(lt)) rec.saldo_a_favor = amt();
        else if (/^Deuda/.test(lt)) rec.deuda = amt();
        else if (/^Expensas Ord/.test(lt)) rec.expensas_ord = amt();
        else if (/^Expensas Ext/.test(lt)) rec.expensas_ext = amt();
        else if (/^Intereses por mora/.test(lt)) rec.intereses = amt();
        else if (/^TOTAL/.test(lt)) rec.total = amt();
        else if (/^\d+-\d+$/.test(lt)) rec.unidad = lt;
        else if (/^Lugar y forma/.test(lt)) rec._f = true;
        else if (rec._f && !/^Talón/.test(lt)) { if (lt) rec.forma.push(lt); }
        else if (/^Talón/.test(lt)) rec._f = false;
        continue;
      }
    }
    closeItem(); closePa();
    R.recibos = R.recibos.map(r => ({ nro: r.nro, periodo: r.periodo, unidad: r.unidad || R.cupon.unidad, saldo: r.saldo, fecha_pago: r.fecha_pago, importe_pagado: r.importe_pagado, saldo_a_favor: r.saldo_a_favor,
      deuda: r.deuda, expensas_ord: r.expensas_ord, expensas_ext: r.expensas_ext, intereses: r.intereses, total: r.total, forma_pago: r.forma.join(" ").replace(/_ /g, "_").replace(/(\d) _/g, "$1_").replace(/\s+/g, " ").trim() }));
    if (!R.periodo) R.dudas.push({ campo: "Período", detalle: "No se encontró 'Liquidación: M/AAAA'.", pagina: 1 });
    if (!R.prorrateo.length) R.dudas.push({ campo: "Prorrateo", detalle: "No se encontró el estado de cuentas por unidad.", pagina: 2 });
    if (R.total_gastos == null) R.dudas.push({ campo: "Total de gastos", detalle: "No se encontró 'TOTAL DE GASTOS'.", pagina: 2 });
    R.gastos.forEach(g => { if (/ESTIMADO/i.test(g.concepto_original)) {} });
    return R;
  }
  async function fromFile(pdfjsLib, data) { const pdf = await pdfjsLib.getDocument({ data }).promise; return parse(await getLines(pdf)); }
  return { getLines, parse, fromFile, num };
})();
export default LiqParser;
