// @ts-nocheck
/* Reutilizado del portal v7 sin cambios de lógica. */
/* ===== Lector de comprobantes y extractos (100% en el navegador, sin costo) =====
   Clasifica cada archivo: factura, orden de pago, transferencia, pago de servicio, presupuesto,
   planilla de sueldos, F.931, extracto bancario o imagen a revisar. No guarda nombres de personas
   que pagan expensas; los de empleados nunca se leen (solo totales de la planilla). */
const Ingest = (() => {
  const nAR = s => { if (s == null) return null; s = String(s).trim().replace(/[^\d,.\-]/g, "").replace(/[.,]+$/, ""); if (!s) return null;
    const lc = s.lastIndexOf(","), ld = s.lastIndexOf(".");
    if (lc > ld) s = s.replace(/\./g, "").replace(",", "."); else if (ld > lc && lc >= 0) s = s.replace(/,/g, ""); else if (ld >= 0 && s.length - ld === 4 && (s.match(/\./g) || []).length >= 1 && lc < 0) s = s.replace(/\./g, "");
    const v = parseFloat(s); return isNaN(v) ? null : v; };
  const cuit = s => { const m = String(s || "").replace(/\s/g, "").match(/(\d{2})-?(\d{8})-?(\d)/); return m ? m[1] + m[2] + m[3] : ""; };
  const iso = d => { const m = String(d || "").match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/); if (!m) return ""; const y = m[3].length === 2 ? "20" + m[3] : m[3]; return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; };
  const MES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
  const isoLargo = t => { const m = String(t).match(/(\d{1,2}) de (\w+) de (\d{4})/i); return m && MES[m[2].toLowerCase()] ? `${m[3]}-${String(MES[m[2].toLowerCase()]).padStart(2, "0")}-${m[1].padStart(2, "0")}` : ""; };
  const g = (t, re, i = 1) => { const m = t.match(re); return m ? m[i].trim() : ""; };
  const money = (t, re) => { const m = t.match(re); return m ? nAR(m[1]) : null; };
  const personaCUIT = c => /^(20|23|24|27)/.test(c || "");

  /** Nombre de archivo de AdminProp: "11._Seguridad-Cooperativa_de_Trab-5918162-20260818_125444.pdf" (con prefijo opcional "comprobante_de_pago-"). */
  function fromName(name) {
    const base = String(name).replace(/^[0-9a-f]{8}-/i, "");
    const m = base.match(/^(comprobante_de_pago-)?(\d+)\._([^-]+)-(.+?)-(-?\d+)-(\d{8})_\d+/);
    if (!m) return { base };
    return { base, pago: !!m[1], rubro: +m[2], rubroNombre: m[3].replace(/_/g, " "), proveedor: m[4].replace(/_/g, " "), importe: +m[5], fechaArchivo: `${m[6].slice(0, 4)}-${m[6].slice(4, 6)}-${m[6].slice(6, 8)}` };
  }

  async function pdfPages(lib, data) {
    const pdf = await lib.getDocument({ data }).promise, out = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const pg = await pdf.getPage(p), tc = await pg.getTextContent();
      const its = tc.items.filter(i => i.str && i.str.trim()).map(i => ({ s: i.str, x: i.transform[4], y: i.transform[5] }));
      its.sort((a, b) => b.y - a.y || a.x - b.x);
      const lines = []; for (const it of its) { const L = lines[lines.length - 1]; if (L && Math.abs(L.y - it.y) <= 3) L.t.push(it); else lines.push({ y: it.y, t: [it] }); }
      const text = lines.map(L => L.t.sort((a, b) => a.x - b.x).map(i => i.s).join(" ").replace(/\s+/g, " ").trim()).join("\n")
        .replace(/([A-Za-z]) ([áéíóúÁÉÍÓÚñÑ]) ?(?=[a-záéíóúñ])/g, "$1$2").replace(/N ?([º°]) ?/g, "N$1 ");
      out.push({ page: p, text, its });
    }
    return out;
  }
  const legible = t => (t.replace(/[^A-Za-zÁÉÍÓÚáéíóúñÑ]/g, "").length > 40) && !/^[\W\d\s]*$/.test(t) && (t.match(/[A-Za-z]{4,}/g) || []).length > 8;

  /** Planilla de sueldos (página rotada): agrupa por empleado usando posiciones. Solo guarda totales y conteos, sin nombres. */
  function planilla(its) {
    const rot = its.length && its.some(i => /D\.N\.I\./.test(i.s));
    if (!rot) return null;
    const dnis = its.filter(i => /^D\.N\.I\./.test(i.s.trim())), nums = its.filter(i => /^[\d.]+,\d\d$/.test(i.s.trim())).map(i => ({ ...i, v: nAR(i.s) }));
    const near = (a, b, d) => Math.abs(a - b) <= d;
    // filas de totales: grupos de números lejos de todo empleado
    const far = nums.filter(n => !dnis.some(d => near(n.x, d.x, 16)));
    const grp = {}; far.forEach(n => { const k = Math.round(n.x); (grp[k] = grp[k] || []).push(n); });
    const tot = Object.values(grp).find(g => g.length >= 4); if (!tot) return null;
    const cols = [...tot].sort((a, b) => b.v - a.v).slice(0, 4); // rem, neto, ret, norem
    const colY = { rem: cols[0].y, neto: cols[1].y, ret: cols[2].y, norem: cols[3].y };
    const diffs = nums.flatMap(n => dnis.map(d => Math.round(n.x - d.x))).filter(v => Math.abs(v) >= 6 && Math.abs(v) <= 14), cnt = {};
    diffs.forEach(v => cnt[v] = (cnt[v] || 0) + 1);
    const off = +(Object.entries(cnt).sort((a, b) => b[1] - a[1])[0] || [0])[0];
    const emp = dnis.map(d => { const row = its.filter(i => near(i.x, d.x, 3)), ns = nums.filter(n => near(n.x, d.x + off, 3));
      const pick = c => { const o = ns.map(n => ({ n, dy: Math.abs(n.y - colY[c]) })).sort((a, b) => a.dy - b.dy)[0]; return o && o.dy < 25 ? o.n.v : null; };
      const txt = row.map(i => i.s).join(" ");
      return { sector: (txt.match(/ADMINISTRACI[OÓ]N|MAESTRANZA|SEGURIDAD|LIMPIEZA|JARDINER[IÍ]A|MANTENIMIENTO|OPERARIO/) || [""])[0], efectivo: /Efectivo/i.test(txt), rem: pick("rem"), ret: pick("ret"), neto: pick("neto") }; });
    return { emp, rem: cols[0].v, neto: cols[1].v, ret: cols[2].v };
  }

  /** Clasifica una página de texto. Devuelve un comprobante o null. */
  function classify(t, its) {
    const T = t.replace(/[ \t]+/g, " "), U = T.toUpperCase();
    // Pantalla de saldo (no acredita pago)
    if (/^\s*Resumen\b/m.test(T) && /Saldo a pagar/i.test(T) && !/Pagado|Acreditado/i.test(T)) return { Tipo: "PANTALLA_SALDO", Es_Fiscal: "NO", Importe: money(T, /Saldo a pagar\s*\$?\s*([\d.,]+)/i), Numero: g(T, /N[úu]mero de cuenta\s*(\d+)/i), Nota: "Pantalla de saldo a pagar: no acredita un pago (sin fecha ni estado)." };
    if (/Comprobante de transferencia/i.test(T) || (/Ordenante/i.test(T) && /Destinatario/i.test(T))) {
      const o = { Tipo: "TRANSFERENCIA", Es_Fiscal: "NO", Fecha: iso(g(T, /Fecha y hora de env[ií]o\s*([\d\/]+)/i) || g(T, /Fecha de carga\s*([\d\/]+)/i)), Importe: money(T, /Importe\s*\$\s*([\d.,]+)/i),
        Ordenante: g(T, /Ordenante\s*([^\n]+?)\s*(?:\n|CUIT)/i), CUIT_Ordenante: cuit(g(T, /CUIT ordenante\s*([\d\-]+)/i)), Cuenta_Debito: g(T, /N[ºo°] de cuenta d[ée]bito\s*(\d+)/i),
        Destinatario: g(T, /Destinatario\s*([^\n]+?)\s*(?:\n|CUIT)/i), CUIT_Destinatario: cuit(g(T, /CUIT destinatario\s*([\d\-]+)/i)), Concepto_Pago: [g(T, /Motivo\s*([^\n]+)/i), g(T, /Concepto\s*([^\n]+)/i), g(T, /Referencia\s*([^\n]+)/i)].filter(Boolean).join(" · "),
        Numero: g(T, /N[ºo°] de transacci[óo]n\s*(\d+)/i), Detalle: { cuentaCredito: g(T, /Tipo de cuenta cr[ée]dito\s*([^\n]+)/i), origen: g(T, /Tipo cuenta d[ée]bito\s*([^\n]+)/i) } };
      return o;
    }
    if (/Comprobante de pago/i.test(T) && /(Ente|Importe)/i.test(T) && /(Pagado|PagoMisCuentas|C[óo]digo de pago|Transacci[óo]n)/i.test(T)) {
      return { Tipo: "PAGO_SERVICIO", Es_Fiscal: "NO", Fecha: iso(g(T, /Fecha y hora de env[ií]o\s*([\d\/]+)/i) || g(T, /Fecha\s*\n?\s*([\d\/]{8,10})/i) || g(T, /(\d{2}\/\d{2}\/\d{2,4})/)), Importe: money(T, /Importe\s*\n?\s*\$\s*([\d.,]+)/i),
        Destinatario: g(T, /\bEnte\s+([^\n]+)/) || g(T, /Comprobante de pago\s*\n\s*([^\n]+)/i), Cuenta_Debito: g(T, /N[ºo°] de cuenta d[ée]bito\s*(\d+)/i), Ordenante: g(T, /Solicitante\s*([^\n]+)/i), Numero: g(T, /C[óo]digo de pago\s*(\d+)/i) || g(T, /Identificaci[óo]n\s*\n?\s*(\d+)/i), Nota: g(T, /Estado\s*([^\n]+)/i) };
    }
    if (/Identificador de la operaci[óo]n/i.test(T) && /Monto/i.test(T)) return { Tipo: "PAGO_SERVICIO", Es_Fiscal: "NO", Importe: money(T, /Monto\s*\n?\s*\$\s*([\d.,]+)/i), Destinatario: g(T, /Servicio\s*\n?\s*([^\n]+)/i), Fecha: iso(g(T, /Fecha y hora de pago\s*\n?\s*([\d\/]+)/i)), CUIT_Ordenante: cuit(g(T, /CUIT\s*\n?\s*([\d\-]{11,13})/i)) };
    if (/Volante Electr[óo]nico de Pago/i.test(T) || /SIJPDJ/i.test(T) && /Importe total a pagar/i.test(T)) return { Tipo: "F931", Es_Fiscal: "SI", Importe: money(T, /Importe total a pagar\s*\$?\s*([\d.,]+)/i), Periodo_Servicio: g(T, /Per[ií]odo:\s*(\d{4}-\d{2})/i), Emisor: "ARCA (cargas sociales)", CUIT_Receptor: cuit(g(T, /CUIT:\s*([\d\-]+)/i)) };
    if (/Boleta de pago/i.test(T) && /Aporte/i.test(T)) return { Tipo: "SINDICATO", Es_Fiscal: "SI", Importe: money(T, /Total a Pagar\s*\$?\s*([\d.,]+)/i), Periodo_Servicio: g(T, /Boleta de pago\s*(\d{2}\/\d{4})/i), Emisor: "UTEDYC" };
    if (/Planilla de Pagos/i.test(T)) {
      const P = planilla(its || []), emp = P ? P.emp : [];
      const adm = emp.filter(e => /ADMIN/.test(e.sector)), efSinRet = emp.filter(e => e.efectivo && !e.ret);
      return { Tipo: "PLANILLA_SUELDOS", Es_Fiscal: "SI", Periodo_Servicio: g(T, /(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE) (\d{4})/i, 0), Importe: P ? P.neto : null,
        Detalle: { empleados: emp.length, administracion: adm.length, efectivoSinRetenciones: efSinRet.length, netoEfectivoSinRet: efSinRet.reduce((a, e) => a + (e.neto || 0), 0),
          remunerativo: P ? P.rem : null, retenciones: P ? P.ret : null, porcRetenciones: P && P.rem ? P.ret / P.rem : null, porEmpleado: emp },
        Nota: `${emp.length} empleados (${adm.length} de administración${efSinRet.length ? `, ${efSinRet.length} pagados en efectivo sin retenciones` : ""}).` };
    }
    if (/ORDEN DE PAGO|OTROS PAGOS/i.test(T) && /Imputado|Comprobantes Imputados/i.test(T)) {
      const num = g(T, /(?:ORDEN DE PAGO|OTROS PAGOS)\s+(\d{5}-\d{8})/i), imp = (T.match(/TOTAL\s*:\s*([\d.,]+)/i) || T.match(/Imputado:\s*([\d.,]+)/i) || [])[1];
      const fc = [...T.matchAll(/\b(FC\s?[A-C]-?\d+-\d+|Arba [^\n]+?PR:\s*\d+|Edenor Cta \d+[^\n]*?PR:\s*\d+|(?:Sueldos|Cargas Sociales|Sindicato) a Pagar)\s+([\d.,]+)/gi)].map(m => ({ comp: m[1].trim(), importe: nAR(m[2]) }));
      const lines = T.split("\n"), iC = lines.findIndex(l => /CUIT\s+\d{2}-\d{8}-\d/.test(l)), prov = iC >= 0 ? (lines[iC + 1] || "").replace(/\s+N[ºo°]\s*\d+.*$/, "").trim() : "";
      return { Tipo: "ORDEN_PAGO", Es_Fiscal: "NO", Numero: num, Fecha: isoLargo(T), Importe: nAR(imp), Emisor: g(T, /^(Fid[a-z]+ Bella Vista)/im) || "Fideicomiso Bella Vista", Destinatario: prov, CUIT_Destinatario: cuit((lines[iC + 1] || "").match(/CUIT\s+([\d\-]+)/)?.[1] || ""),
        Detalle: { comprobantes: fc, forma: g(T, /(Banco [A-Za-z]+[^\n]*?)\s+\d/i) } };
    }
    if (/Liquidaci[óo]n de Servicio P[úu]blico/i.test(T)) {
      const tot = money(T, /TOTAL A PAGAR\s*\$\s*([\d.,]+)/i) ?? money(T, /TOTAL CON IMPUESTOS:\s*([\d.,]+)/i), v2 = money(T, /2[°º]?\.?\s*Vencimiento[^$]*\$\s*([\d.,]+)/i) ?? money(T, /TOTAL AL 2do VENCIMIENTO[^\d]*([\d.,]+)/i);
      return { Tipo: "FACTURA", Subtipo: "SERVICIO_PUBLICO", Es_Fiscal: "SI", Emisor: "EDENOR", CUIT_Emisor: "30655116202", Numero: g(T, /Liquidaci[óo]n de Servicio P[úu]blico N[°º]\s*([\d\-]+)/i), Fecha: iso(g(T, /Emisi[óo]n:?\s*([\d\/]+)/i)),
        Importe: tot, Periodo_Servicio: g(T, /Per[ií]odo de consumo:\s*([\d\/]+ AL [\d\/]+)/i) || g(T, /Per[ií]odo:\s*(\d{2}\/\d{4})/i), Receptor: g(T, /(FIDUCIARIA BELLA VISTA[^\n]*?|FIDEICOMISO BELLA VISTA)(?:\s{2}|\n|$)/i),
        Detalle: { cuenta: (g(T, /Cuenta\s*N?[°º]?\s*([\d ]{10,14})/i) || "").replace(/\s/g, ""), segundoVto: v2, saldoAnterior: money(T, /Saldo anterior\s*\$\s*([\d.,]+)/i) || 0, intereses: money(T, /Intereses por pago fuera de t[ée]rmino\s*([\d.,]+)/i) || 0, actividad: g(T, /Actividad:\s*([A-Z]+)/i), tarifa: g(T, /TARIFA:\s*([\w\-]+)/i) || g(T, /Tarifa:\s*([\w ]+?)\s+Ciclo/i) } };
    }
    if (/Impuesto\s*\n?\s*Inmobiliario/i.test(T) && /Partida/i.test(T)) return { Tipo: "FACTURA", Subtipo: "IMPUESTO", Es_Fiscal: "SI", Emisor: "ARBA", CUIT_Emisor: "30710404611", Numero: g(T, /Partida N[ºo°]?\s*([\d\-]+)/i), Importe: money(T, /A pagar\s*\n?\s*\$\s*([\d.,]+)/i) ?? money(T, /Total a pagar\s*\$?\s*([\d.,]+)/i), Periodo_Servicio: g(T, /(Cuota \d+ de \d{4})/i), Fecha: iso(g(T, /Vencimiento\s*\n?\s*([\d\/]+)/i)) };
    if (/ESTADO DE CUENTA/i.test(T) && /FAC:\s*\d{4}-\d{8}/i.test(T)) return { Tipo: "FACTURA", Es_Fiscal: "SI", Emisor: g(T, /(VER TV S\.?A\.?)/i) || "Proveedor", CUIT_Emisor: cuit(g(T, /C\.U\.I\.T:?\s*([\d\-]+)/i)), Numero: g(T, /FAC:\s*(\d{4}-\d{8})/i), Fecha: iso(g(T, /FECHA:\s*(\d{2}\/\d{2}\/\d{4})/i)),
      Importe: money(T, /Factura actual\s*\$\s*([\d.,]+)/i) ?? money(T, /TOTAL\s*\n?\s*\$\s*([\d.,]+)/i), Periodo_Servicio: g(T, /PERIODO:\s*([\d\/]+)/i), CUIT_Receptor: cuit(g(T, /CUIT N[°º]:\s*([\d\-]+)/i)), Detalle: { saldoAnterior: money(T, /Saldo anterior\s*\$\s*([\d.,]+)/i), totalAPagar: money(T, /TOTAL A PAGAR:\s*\$\s*([\d.,]+)/i) } };
    if (/Propuesta T[ée]cnica|PRESUPUESTO|NOTA DE PEDIDO|no v[áa]lido como factura/i.test(T) && !/Comp\.?\s*Nro|CAE/i.test(T)) {
      const usd = T.match(/U\$S\s*([\d.,]+)/i); return { Tipo: "PRESUPUESTO", Es_Fiscal: "NO", Emisor: g(T, /^\s*([^\n]{3,60})\n/), Fecha: iso(T) || isoLargo(T), Importe: usd ? null : money(T, /TOTAL\s*\$?\s*([\d.,]+)/i), Detalle: usd ? { moneda: "USD", importeUSD: nAR(usd[1]) } : {}, Nota: usd ? `Presupuesto en dólares (US$ ${usd[1]}).` : "Presupuesto o documento no válido como factura." };
    }
    if (/FACTURA/i.test(T) && /(Comp\.?\s*Nro|N[ºo°]\s*\d{4}-\d{8}|Punto de Venta)/i.test(T)) {
      const letra = g(T, /\b([ABC])\s*\n?\s*COD\.?\s*0?\d+/i) || g(T, /FACTURA\s*\n?\s*([ABC])\b/) || g(T, /\n([ABC])\n/);
      const pv = g(T, /Punto de Venta:?\s*(\d+)/i), nro = g(T, /Comp\.?\s*Nro:?\s*(\d+)/i) || g(T, /N[ºo°]\s*(\d{4}-\d{8})/i);
      const cuits = [...T.matchAll(/CUIT(?:\/CUIL)?:?\s*([\d]{2}-?[\d]{8}-?\d)/gi)].map(m => cuit(m[1]));
      const total = (m => m ? nAR(m[1].replace(/\s+/g, "")) : null)(T.match(/Importe Total:\s*\$?\s*(\d[\d., ]*\d)/i)) ?? money(T, /\bTotal:\s*\$\s*([\d.,]+)/i) ?? money(T, /Total \$\s*([\d.,]+)/i) ?? money(T, /\bTOTAL\s*\$?:?\s*([\d.,]+)/);
      const per = (T.match(/Per[ií]odo [Ff]acturado Desde:?\s*([\d\/]+)\s*Hasta:?\s*([\d\/]+)/) || []);
      return { Tipo: "FACTURA", Subtipo: letra ? "LETRA_" + letra : "", Es_Fiscal: "SI", Emisor: g(T, /Raz[óo]n Social:\s*([^\n]+?)(?:\s{2,}|\s+Punto|\s+Fecha|\n)/i), CUIT_Emisor: cuits[0] || "", CUIT_Receptor: cuits[1] || "",
        Receptor: g(T, /(?:Apellido y Nombre \/ )?Raz[óo]n Social:\s*([^\n]+?)\s*(?:\n|$)/gi) && (T.match(/Raz[óo]n Social:\s*([^\n]+)/gi) || [])[1]?.replace(/Raz[óo]n Social:\s*/i, "").trim() || "",
        Numero: pv && nro ? `${pv.padStart(4, "0").slice(-5)}-${nro.padStart(8, "0")}` : nro, Fecha: iso(g(T, /Fecha de Emisi[óo]n:?\s*([\d\/]+)/i) || g(T, /Fecha:?\s*([\d\/]{8,10})/i)), Importe: total,
        Periodo_Servicio: per.length ? `${iso(per[1])} a ${iso(per[2])}` : "", Detalle: { iva: money(T, /IVA (?:Insc\.?|Contenido:?)\s*\$?\s*([\d.,]+)/i) ?? money(T, /21,00%\s+([\d.,]+)/), percepcion: money(T, /Percepci[óo]n IIBB[^\d]*([\d.,]+)/i), concepto: g(T, /(?:Producto \/ Servicio|Descripci[óo]n)[^\n]*\n([^\n]+)/i) } };
    }
    return null;
  }

  /** Extracto bancario en Excel (Galicia o Roela). `bName` = nombre del barrio para elegir el bloque correcto. */
  function bank(wb, XLSX, file, barrio, patron, admin) {
    const out = [], rowsOf = n => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null });
    const toISO = v => v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === "number" ? new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10) : iso(v);
    const tipo = (d, imp) => { const D = String(d || "").toUpperCase();
      if (/SALDO AL INICIO/.test(D)) return "SALDO_INICIAL";
      if (/IMPUESTO LEY|IMP\.? (DEB|CRE)|I\.V\.A|^IVA|PERCEP|ING\.? BRUTOS|IMP\. ING/.test(D)) return "IMPUESTO";
      if (/COM\.|COMISION/.test(D)) return "COMISION";
      if (/TRANSF|CREDIN|DEBIN/.test(D)) return imp > 0 ? "COBRO" : "TRANSFERENCIA";
      if (/PAGO AUTOMATICO|DEB\.? AUTOM/.test(D)) return "DEBITO_AUTOMATICO";
      if (/SIRO|RAPIPAGO|PAGO ?FACIL|LINK|MIS CUENTAS|RIPSA/.test(D)) return "COBRO";
      if (/CHEQUE/.test(D)) return "CHEQUE"; return imp > 0 ? "COBRO" : "OTRO"; };
    const party = d => { const m = String(d || "").match(/(MISMO|DISTINTO) TIT\.?-?\s*(\d{11})\s*([^0-9]{0,60})/i); return m ? { mismo: /MISMO/i.test(m[1]), cuit: m[2], nombre: m[3].trim() } : null; };
    const names = wb.SheetNames;
    // Galicia: encabezado con Débitos / Créditos
    for (const n of names) {
      const R = rowsOf(n), hi = R.findIndex(r => r && r.some(c => /D[ée]bitos/i.test(c)) && r.some(c => /Cr[ée]ditos/i.test(c)));
      if (hi < 0) continue;
      const H = R[hi].map(c => String(c || "")), ix = k => H.findIndex(h => new RegExp(k, "i").test(h));
      const iF = ix("^Fecha"), iD = ix("Descripci"), iDb = ix("D[ée]bitos"), iCr = ix("Cr[ée]ditos"), iS = ix("^Saldo"), iL = ix("Leyendas Adicionales1"), iL2 = ix("Leyendas Adicionales2"), iO = ix("Observaciones");
      R.slice(hi + 1).forEach(r => { if (!r || r[iF] == null) return; const db = +r[iDb] || 0, cr = +r[iCr] || 0, d = String(r[iD] || ""), imp = cr - db, t = tipo(d, imp);
        const extra = [r[iO], r[iL], r[iL2], r[iL + 2]].filter(x => x != null && x !== "" && !(x instanceof Date)).map(String);
        const c = extra.map(cuit).find(Boolean) || "", nom = extra.find(x => /[A-Za-z]{3,}/.test(x) && !/^(VARIOS|Imputado|EXPENSAS|ZHBB|MBBB)/i.test(x)) || "";
        const mov = { Banco: "Galicia", Cuenta: n, Nombre_Cuenta: n, Fecha: toISO(r[iF]), Descripcion: d, Tipo: t, Debito: db || (cr === 0 && r[iDb] == null ? null : 0), Credito: cr, Saldo: r[iS] != null ? +r[iS] : null, Archivo: file };
        if (r[iDb] == null && cr === 0) { mov.Debito = null; mov.Nota = "El extracto no informa el importe; se deduce del saldo."; }
        if (/Ctas Propias/i.test(d)) { mov.Tipo = "TRANSFERENCIA"; mov.Mismo_Titular = "SI"; }
        if (mov.Tipo === "COBRO") { mov.Identificable = nom ? "SI" : "NO"; } else { mov.Contraparte = nom; mov.CUIT_Contraparte = c; }
        out.push(mov); });
      for (let i = 1; i < out.length; i++) if (out[i].Debito == null && out[i - 1].Saldo != null && out[i].Saldo != null) { const d = +(out[i - 1].Saldo - out[i].Saldo + (out[i].Credito || 0)).toFixed(2); out[i].Debito = d > 0 ? d : 0; }
      return { banco: "Galicia", movs: out, filtrado: false };
    }
    // Roela: bloques "Convenio: X - Cuenta Nro.: Y" (opcional) y hoja Conversion
    const conv = {}; if (names.includes("Conversion")) rowsOf("Conversion").forEach(r => { const v = (r || []).filter(c => c != null && c !== ""); if (v.length >= 2 && v[0] !== "Convenio") conv[String(v[0]).trim()] = String(v[1]).trim(); });
    const main = names.find(n => rowsOf(n).some(r => r && r.some(c => /Extracto de Cuenta/i.test(c)))) || names[0];
    const R = rowsOf(main); let cur = null, curCta = null, hit = false, filtrado = R.some(r => r && r.some(c => /TOTAL IMPORTE/i.test(c)));
    const re = patron ? new RegExp(patron, "i") : null, okBlock = c => { const eq = conv[c] || c; return re ? re.test(eq) : true; };
    const hasBlocks = R.some(r => r && r.some(c => /^Convenio:/i.test(String(c || ""))));
    R.forEach(r => { if (!r) return; const cell = r.find(c => c != null && c !== "");
      const cs = String(cell || ""); if (/^Convenio:/i.test(cs)) { const m = cs.match(/Convenio:\s*(.+?)\s*-\s*Cuenta Nro\.:\s*([\d\/]+)/i); cur = m ? m[1].trim() : cs; curCta = m ? m[2] : ""; return; }
      if (hasBlocks && (!cur || !okBlock(cur))) return;
      const k = r.findIndex(c => /^\d{6}\/\d$/.test(String(c || ""))); if (k < 0) return;
      const fecha = toISO(r[k + 1]), d = String(r[k + 4] ?? r[k + 3] ?? ""), imp = typeof r[k + 5] === "number" ? r[k + 5] : (typeof r[k + 3] === "number" ? r[k + 3] : null), saldo = typeof r[k + 6] === "number" ? r[k + 6] : null;
      const desc = r[k + 4] != null ? String(r[k + 4]) : String(r[k + 3] ?? "");
      const isSaldo = /Saldo Al Inicio/i.test(desc) || /Saldo Al Inicio/i.test(String(r[k + 3] || ""));
      const amount = isSaldo ? null : (typeof r[k + 5] === "number" ? r[k + 5] : null);
      const t = isSaldo ? "SALDO_INICIAL" : tipo(desc, amount || 0), p = party(desc); hit = true;
      const mov = { Banco: "Roela", Cuenta: curCta || r[k], Nombre_Cuenta: cur ? (cur + (conv[cur] && conv[cur] !== cur ? " (" + conv[cur] + ")" : "")) : r[k], Fecha: fecha, Descripcion: isSaldo ? "Saldo al inicio" : desc.replace(/(TIT\.?-?\s*\d{11}\s*)(.*)$/i, (m0, a, b) => p && !p.mismo && personaCUIT(p.cuit) ? a + "" : m0),
        Tipo: t, Debito: amount != null && amount < 0 ? -amount : 0, Credito: amount != null && amount > 0 ? amount : 0, Saldo: isSaldo ? (typeof r[k + 5] === "number" ? r[k + 5] : saldo) : saldo, Archivo: file };
      if (p) { mov.CUIT_Contraparte = p.cuit; mov.Contraparte = p.nombre; mov.Mismo_Titular = p.mismo ? "SI" : "NO"; }
      if (t === "COBRO") { mov.Identificable = "NO"; mov.Contraparte = ""; mov.CUIT_Contraparte = ""; }
      out.push(mov); });
    return { banco: "Roela", movs: out, filtrado: filtrado && !out.some(m => m.Tipo === "COBRO"), convenio: hasBlocks };
  }

  let XLSXp = null;
  const loadXLSX = () => window.XLSX ? Promise.resolve(window.XLSX) : (XLSXp = XLSXp || new Promise((res, rej) => { const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"; s.onload = () => res(window.XLSX); s.onerror = () => rej(new Error("No se pudo cargar el lector de Excel.")); document.head.appendChild(s); }));

  /** Procesa un archivo. Devuelve { file, items:[comprobantes], movs:[movimientos], thumbs } */
  async function readFile(file, ctx) {
    const meta = fromName(file.name), ext = (file.name.split(".").pop() || "").toLowerCase(), res = { file: file.name, meta, items: [], movs: [], banco: null };
    const base = { Archivo: meta.base || file.name, Rubro_Archivo: meta.rubro || "", Importe_Archivo: meta.importe ?? "", Es_Pago_Archivo: meta.pago ? "SI" : "" };
    if (/^xlsx?$|^csv$/.test(ext)) {
      const XLSX = await loadXLSX(), wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array", cellDates: true });
      const b = bank(wb, XLSX, base.Archivo, ctx.barrio, ctx.patron, ctx.admin); res.banco = b; res.movs = b.movs;
      res.items.push({ ...base, Tipo: "EXTRACTO", Es_Fiscal: "NO", Emisor: "Banco " + b.banco, Importe: b.movs.filter(m => m.Tipo === "COMISION" || m.Tipo === "IMPUESTO").reduce((a, m) => a + (m.Debito || 0), 0),
        Nota: `${b.movs.length} movimientos de ${ctx.barrioNombre}${b.filtrado ? ". Extracto filtrado: solo trae comisiones e impuestos." : ""}${b.convenio ? ". El archivo trae movimientos de otros consorcios: solo se toma el bloque de " + ctx.barrioNombre + "." : ""}`, Detalle: { filtrado: b.filtrado } });
      return res;
    }
    if (/^(jpe?g|png|webp|heic)$/.test(ext)) { res.items.push({ ...base, Tipo: "IMAGEN", Es_Fiscal: "REVISAR", Importe: meta.importe ?? null, Nota: "Imagen: revisar a mano." }); return res; }
    if (ext !== "pdf") { res.items.push({ ...base, Tipo: "OTRO", Es_Fiscal: "REVISAR", Nota: "Formato no reconocido." }); return res; }
    const pages = await pdfPages(ctx.pdfjs, new Uint8Array(await file.arrayBuffer())), seen = new Set();
    for (const pg of pages) {
      let c = legible(pg.text) ? classify(pg.text, pg.its) : null;
      if (!c) { c = { Tipo: legible(pg.text) ? "OTRO" : "IMAGEN", Es_Fiscal: "REVISAR", Nota: legible(pg.text) ? pg.text.slice(0, 160).replace(/\n/g, " ") : "Página escaneada o foto: revisar a mano." }; }
      const key = [c.Tipo, c.Numero, c.Importe, c.Fecha].join("|");
      if (c.Tipo !== "IMAGEN" && c.Tipo !== "OTRO" && c.Numero && seen.has(key)) continue; // original, duplicado, triplicado
      seen.add(key);
      const prev = res.items[res.items.length - 1];
      if (prev && prev.Tipo === c.Tipo && (c.Tipo === "PRESUPUESTO" || c.Tipo === "OTRO" || c.Tipo === "PLANILLA_SUELDOS" && false)) { if (c.Detalle && c.Detalle.moneda) { prev.Detalle = c.Detalle; prev.Nota = c.Nota; } continue; }
      if (c.Tipo === "PRESUPUESTO") c.Emisor = meta.proveedor || "";
      if (c.Tipo === "OTRO" && /&RPSUREDQWH|,QJUHVDGR/.test(pg.text)) { c.Tipo = "ACREDITACION"; c.Es_Fiscal = "NO"; c.Nota = "Constancia de acreditación de sueldos (texto codificado)."; }
      res.items.push({ ...base, ...c, Pagina: pg.page });
    }
    // Una sola página "IMAGEN" seguida de otras imágenes = un comprobante por página (caja chica). Se dejan todas para revisar.
    return res;
  }

  /** Vincula comprobantes con los gastos del período: por nombre de archivo (rubro + importe), por importe o por número citado en el gasto. */
  function link(items, gastos, pagosAnt) {
    const ab = v => Math.abs(+v || 0);
    const mnum = s => { const m = String(s || "").match(/(\d{4})-(\d{2})/); return m ? +m[1] * 12 + +m[2] : null; };
    const pref = (cand, it) => { const f = mnum(it.Fecha); return cand.sort((a, b) => f != null ? Math.abs(mnum(a.ID_Periodo) - f - 0.5) - Math.abs(mnum(b.ID_Periodo) - f - 0.5) : (b.ID_Periodo === it.ID_Periodo) - (a.ID_Periodo === it.ID_Periodo) || String(b.ID_Periodo).localeCompare(String(a.ID_Periodo))); };
    items.forEach(it => {
      if (it.ID_Gasto || it.ID_Pago_Ant) return;
      const per = gastos;
      let cand = [];
      if (it.Importe_Archivo !== "" && it.Importe_Archivo != null) cand = per.filter(gx => Math.abs(Math.trunc(ab(gx.Importe)) - Math.abs(+it.Importe_Archivo)) <= 1 && (!it.Rubro_Archivo || String(gx.Rubro_Original || "").startsWith(it.Rubro_Archivo + ".")));
      if (!cand.length && it.Importe) cand = per.filter(gx => Math.abs(ab(gx.Importe) - ab(it.Importe)) < 1);
      if (!cand.length && it.Numero) cand = per.filter(gx => String(gx.Concepto_Original || "").includes(String(it.Numero).replace(/^0+/, "")));
      if (cand.length) it.ID_Gasto = pref(cand, it)[0].ID_Gasto;
      else if (it.Importe_Archivo !== "" && pagosAnt) { const pa = pagosAnt.find(p => Math.abs(Math.trunc(ab(p.Importe)) - Math.abs(+it.Importe_Archivo)) <= 1); if (pa) it.ID_Pago_Ant = pa.ID_Pago_Ant; }
    });
    return items;
  }
  return { readFile, link, classify, fromName, bank, loadXLSX, nAR, cuit, personaCUIT };
})();
export default Ingest;
