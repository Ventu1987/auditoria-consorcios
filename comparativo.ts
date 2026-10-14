import type { Row, Sev } from "../domain/types";
import { n0, num, sum, r2, median } from "../domain/format";
import type { Ctx } from "./ctx";
import { porEtiqueta } from "./ctx";

export interface FilaComp {
  etq: string;
  prov: string;
  cur: number | null;   // null = no está este mes
  prev: number | null;  // null = no estaba el mes anterior
  dif: number;
  vsPrev: number | null;
  vsProm3: number | null;
  nuevo: boolean;
  noRepite: boolean;
  rows: Row[];
}
export interface Comparativo {
  filas: FilaComp[];
  totalCur: number;
  totalPrev: number | null;
  difTotal: number | null;
  expCur: number | null;
  expPrev: number | null;
  nuevos: FilaComp[];
  noRepiten: FilaComp[];
  sinCambio: FilaComp[];
}

export function comparativo(ctx: Ctx): Comparativo {
  const cur = porEtiqueta(ctx, ctx.per.ID_Periodo);
  const prev = ctx.prev ? porEtiqueta(ctx, ctx.prev.ID_Periodo) : new Map();
  const i = ctx.periodos.indexOf(ctx.per), ult3 = ctx.periodos.slice(Math.max(0, i - 3), i);
  const hist = ult3.map((p) => porEtiqueta(ctx, p.ID_Periodo));
  const keys = [...new Set([...cur.keys(), ...prev.keys()])];
  const filas: FilaComp[] = keys.map((k) => {
    const c = cur.get(k), p = prev.get(k);
    const cv = c ? c.v : null, pv = p ? p.v : null;
    const h = hist.map((m) => m.get(k)).filter(Boolean).map((x) => x!.v);
    const prom3 = h.length === 3 ? sum(h) / 3 : null;
    return {
      etq: k, prov: (c || p)!.prov, cur: cv, prev: pv, dif: r2((cv ?? 0) - (pv ?? 0)),
      vsPrev: cv !== null && pv ? cv / pv - 1 : null,
      vsProm3: cv !== null && prom3 ? cv / prom3 - 1 : null,
      nuevo: !!ctx.prev && cv !== null && pv === null, noRepite: cv === null && pv !== null,
      rows: (c || p)!.rows,
    };
  }).sort((a, b) => (b.cur ?? -1) - (a.cur ?? -1) || (b.prev ?? 0) - (a.prev ?? 0));
  const totalCur = n0(ctx.per.Total_Gastos_Periodo), totalPrev = ctx.prev ? n0(ctx.prev.Total_Gastos_Periodo) : null;
  return {
    filas, totalCur, totalPrev, difTotal: totalPrev === null ? null : r2(totalCur - totalPrev),
    expCur: num(ctx.per.Expensa_Ord_Lote_Tipo), expPrev: ctx.prev ? num(ctx.prev.Expensa_Ord_Lote_Tipo) : null,
    nuevos: filas.filter((f) => f.nuevo), noRepiten: filas.filter((f) => f.noRepite), sinCambio: filas.filter((f) => f.cur !== null && f.prev !== null && Math.abs(f.dif) < 0.005),
  };
}

/* ---------------- Semáforo de servicios ---------------- */
/** Si una liquidación trae varias facturas del mismo servicio por meses distintos (p. ej. junio y julio juntos), se compara el promedio por mes. */
const mesesServicio = (rs: Row[]) => Math.max(1, new Set(rs.map((g) => String(g.Periodo_Servicio || "")).filter((m) => /^\d{4}-\d{2}$/.test(m))).size);
export interface Semaforo { etq: string; base: number | null; cur: number | null; desvio: number | null; sev: Sev; meses: number; nota: string; }

/** Servicios del mes contra la mediana (o promedio) de los meses anteriores. No cuenta estimados, provisorios ni ajustes negativos. */
export function semaforo(ctx: Ctx): Semaforo[] {
  const base = String(ctx.par.Semaforo_Base || "MEDIANA").toUpperCase();
  const nMeses = num(ctx.par.Semaforo_Meses) ?? 6, am = num(ctx.par.Semaforo_Amarillo) ?? 0.2, ro = num(ctx.par.Semaforo_Rojo) ?? 0.35;
  const limpio = (g: Row) => g.Es_Estimado !== "SI" && g.Es_Provisorio !== "SI" && n0(g.Importe) > 0;
  const i = ctx.periodos.indexOf(ctx.per), ant = ctx.periodos.slice(Math.max(0, i - nMeses), i);
  const servicios = [...new Set(ctx.gastosMes.filter((g) => ctx.esServicio(g.Concepto_Normalizado, g.Categoria)).map((g) => ctx.etiqueta(g.Concepto_Normalizado)))];
  return servicios.map((etq) => {
    const delMes = ctx.gastosMes.filter((g) => ctx.etiqueta(g.Concepto_Normalizado) === etq);
    const ok = delMes.filter(limpio), cur = ok.length ? sum(ok.map((g) => n0(g.Importe))) / mesesServicio(ok) : null;
    const vals = ant.map((p) => ctx.gastos.filter((g) => g.ID_Periodo === p.ID_Periodo && ctx.etiqueta(g.Concepto_Normalizado) === etq && limpio(g)))
      .filter((rs) => rs.length).map((rs) => sum(rs.map((g) => n0(g.Importe))) / mesesServicio(rs));
    const estuvo = ant.some((p) => ctx.gastos.some((g) => g.ID_Periodo === p.ID_Periodo && ctx.etiqueta(g.Concepto_Normalizado) === etq));
    const b = vals.length ? (base === "PROMEDIO" ? sum(vals) / vals.length : median(vals)) : null;
    const notas: string[] = [];
    if (delMes.some((g) => n0(g.Importe) < 0)) notas.push("sin el ajuste");
    if (mesesServicio(ok) > 1) notas.push(`${mesesServicio(ok)} meses facturados juntos: se compara el promedio por mes`);
    if (delMes.some((g) => g.Es_Estimado === "SI" && n0(g.Importe) > 0)) notas.push("hay importes estimados que no se cuentan");
    if (cur === null) return { etq, base: b, cur, desvio: null, sev: "nd" as Sev, meses: vals.length, nota: "Este mes solo hay importes estimados o provisorios." };
    if (!estuvo) return { etq, base: null, cur, desvio: null, sev: "new" as Sev, meses: 0, nota: "Cargo nuevo." };
    if (b === null) return { etq, base: null, cur, desvio: null, sev: "nd" as Sev, meses: 0, nota: "Los meses anteriores fueron estimados o provisorios." };
    const d = cur / b - 1;
    return { etq, base: b, cur, desvio: d, sev: (d >= ro ? "bad" : d >= am ? "warn" : "ok") as Sev, meses: vals.length, nota: notas.join("; ") };
  }).sort((a, b) => ({ bad: 0, warn: 1, new: 2, nd: 3, ok: 4 }[a.sev] - { bad: 0, warn: 1, new: 2, nd: 3, ok: 4 }[b.sev]) || (b.cur ?? 0) - (a.cur ?? 0));
}
