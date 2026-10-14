import type { Row, Sev } from "../domain/types";
import { finDeMes, ddmm, mesNombre, n0, num, sum, r2, money } from "../domain/format";
import type { Ctx } from "./ctx";

export interface Control {
  id: string;
  label: string;
  doc: number | null;
  calc: number | null;
  dif: number | null;
  sev: Sev;
  estado: string;
  fuente: string;
  nota?: string;
}

/**
 * Regla única para todos los controles (diferencia = liquidación − calculado):
 *  |dif| ≤ tolerancia → Cierra · |dif| ≤ $ 100 → Redondeo · |dif| < 1% de lo informado → A revisar · resto → No cierra.
 */
export function clasificar(doc: number | null, calc: number | null, tol: number): { sev: Sev; estado: string; dif: number | null } {
  if (doc === null || calc === null) return { sev: "nd", estado: "Sin datos", dif: null };
  const dif = r2(doc - calc), a = Math.abs(dif);
  if (a <= tol) return { sev: "ok", estado: "Cierra", dif };
  if (a <= 100) return { sev: "ok", estado: "Redondeo", dif };
  if (a < Math.abs(doc) * 0.01) return { sev: "warn", estado: "A revisar", dif };
  return { sev: "bad", estado: "No cierra", dif };
}

/** Saldo de cada cuenta bancaria del barrio al cierre de un día: último saldo con fecha ≤ ese día. */
export function saldoBancos(ctx: Ctx, hasta: string): { total: number | null; cuentas: { cuenta: string; saldo: number | null; fecha: string }[] } {
  const movs = (ctx.S.MOVIMIENTOS_BANCO || []).filter((m) => m.Barrio === ctx.barrio && num(m.Saldo) !== null && /^\d{4}-\d{2}-\d{2}/.test(String(m.Fecha)));
  const keys = [...new Set(movs.map((m) => `${m.Banco} · ${m.Cuenta}`))];
  const cuentas = keys.map((k) => {
    const ms = movs.filter((m) => `${m.Banco} · ${m.Cuenta}` === k && String(m.Fecha) <= hasta);
    // último movimiento del día: el orden de carga respeta el extracto
    const last = ms.reduce<Row | null>((a, m) => (!a || String(m.Fecha) >= String(a.Fecha) ? m : a), null);
    return { cuenta: k, saldo: last ? n0(last.Saldo) : null, fecha: last ? String(last.Fecha) : "" };
  });
  const ok = cuentas.length && cuentas.every((c) => c.saldo !== null);
  return { total: ok ? sum(cuentas.map((c) => c.saldo as number)) : null, cuentas };
}

export function controles(ctx: Ctx): Control[] {
  const { per, tol } = ctx, P = per.ID_Periodo;
  const G = ctx.gastosMes, out: Control[] = [];
  const add = (id: string, label: string, doc: number | null, calc: number | null, fuente: string, nota?: string) => {
    const c = clasificar(doc, calc, tol);
    out.push({ id, label, doc, calc, dif: c.dif, sev: c.sev, estado: c.estado, fuente, nota });
  };
  const totalG = sum(G.map((g) => n0(g.Importe)));
  add("suma", "Suma de los ítems = total de gastos", num(per.Total_Gastos_Periodo), totalG, "Liquidación: total de gastos contra la suma de cada ítem.");
  add("reparto", "Lo repartido entre los lotes = gasto del mes", num(per.Base_Prorrateo_Ord), num(per.Total_Gastos_Periodo), "Liquidación: columna de gastos ordinarios del prorrateo contra el total de gastos.");
  add("continuidad", `Saldo inicial = saldo final de ${ctx.prevAny ? mesNombre(String(ctx.prevAny.Mes)) : "el mes anterior"}`,
    num(per.Saldo_Inicial), ctx.prevAny ? num(ctx.prevAny.Saldo_Final) : null, "Saldo inicial de esta liquidación contra el saldo final de la anterior.");
  add("caja", "Saldo inicial + ingresos − egresos = saldo final", num(per.Saldo_Final), r2(n0(per.Saldo_Inicial) + n0(per.Ingresos) + n0(per.Egresos_Caja)), "Resumen de caja de la liquidación.");
  const eg = (ctx.S.EGRESOS_CAJA || []).filter((e) => e.ID_Periodo === P && e.Tipo_Egreso === "PAGO DE GASTOS LIQUIDADOS");
  const pa = (ctx.S.PAGOS_PER_ANTERIORES || []).filter((x) => x.ID_Periodo === P);
  add("egresos", "Egresos por gastos = pagos registrados", eg.length ? -sum(eg.map((e) => n0(e.Importe))) : null,
    sum(pa.map((x) => n0(x.Importe)).concat(G.filter((g) => g.Estado_Pago !== "PENDIENTE").map((g) => n0(g.Importe)))),
    "Egresos de caja por gastos contra los pagos de meses anteriores más los gastos del mes que figuran pagados.");
  const egTodos = (ctx.S.EGRESOS_CAJA || []).filter((e) => e.ID_Periodo === P);
  const sinDet = egTodos.filter((e) => e.Tipo_Egreso === "EGRESO SIN DETALLE DE COMPROBANTE");
  add("sinDetalle", "Todas las salidas de caja tienen un gasto asociado", egTodos.length ? -sum(egTodos.map((e) => n0(e.Importe))) : null, egTodos.length ? -sum(egTodos.filter((e) => !sinDet.includes(e)).map((e) => n0(e.Importe))) : null,
    "Total de egresos de caja contra los egresos que la liquidación vincula con gastos liquidados.", sinDet.length ? `Sin gasto asociado: ${sinDet.map((e) => `“${e.Concepto}” ${money(-n0(e.Importe))}`).join("; ")}.` : undefined);
  add("pendientes", "Gastos pendientes informados = detalle de pendientes", num(per.Gastos_Pendientes_Pago), sum(G.filter((g) => g.Estado_Pago === "PENDIENTE").map((g) => n0(g.Importe))),
    "Total de gastos pendientes del estado patrimonial contra los gastos del mes marcados como pendientes.");
  const EP = (ctx.S.SALDOS_PATRIMONIO || []).filter((s) => s.ID_Periodo === P && s.Bloque === "ESTADO_PATRIMONIAL");
  const pnRow = EP.find((s) => /patrimonio neto/i.test(s.Concepto));
  const comp = EP.filter((s) => s !== pnRow);
  add("patrimonio", "Patrimonio neto (con toda la deuda restada)", pnRow ? n0(pnRow.Importe) : num(per.Patrimonio_Neto), comp.length ? sum(comp.map((s) => n0(s.Importe))) : null,
    "Patrimonio que informa la liquidación contra la suma de sus propios componentes: disponibilidades, expensas a cobrar, deudas, intereses, redondeo y gastos pendientes.");
  const prevMes = ctx.prevAny ? String(ctx.prevAny.Mes) : null;
  if (prevMes) {
    const fin = finDeMes(prevMes), b = saldoBancos(ctx, fin);
    const faltan = b.cuentas.filter((c) => c.saldo === null).map((c) => c.cuenta);
    add("banco", `Banco al ${ddmm(fin)} = saldo de la liquidación`, num(per.Saldo_Inicial), b.total, "Saldo inicial de la liquidación contra la suma de los saldos de los extractos bancarios al cierre del mes anterior.",
      !b.cuentas.length ? "No hay extractos cargados." : faltan.length ? `Falta el extracto de: ${faltan.join(", ")}.` : b.cuentas.map((c) => `${c.cuenta}: ${money(c.saldo)} (${ddmm(c.fecha)})`).join(" · "));
  }
  return out;
}

export function resumenControles(cs: Control[]) {
  return { bad: cs.filter((c) => c.sev === "bad").length, warn: cs.filter((c) => c.sev === "warn").length, ok: cs.filter((c) => c.sev === "ok").length, nd: cs.filter((c) => c.sev === "nd").length };
}
