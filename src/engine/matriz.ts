import type { Row } from "../domain/types";
import { n0, num, r2 } from "../domain/format";
import type { Ctx } from "./ctx";
import { coefDe, porEtiqueta } from "./ctx";

export type Modo = "importe" | "lote" | "pct" | "var";
export type Heat = "" | "u2" | "u1" | "d1" | "nw" | "e";
export interface CeldaM { v: number | null; heat: Heat; varPrev: number | null }
export interface FilaM { etq: string; prov: string; celdas: CeldaM[]; tot?: boolean }
export interface Matriz { meses: Row[]; filas: FilaM[]; totales: FilaM[]; ipc: (number | null)[]; varExpensa: number | null }

/** Calor contra el mes anterior del mismo concepto: >35% u2, 10–35% u1, < −10% d1, nuevo nw. */
export function heat(v: number | null, prev: number | null, hayHistoria: boolean): Heat {
  if (v === null) return "e";
  if (prev === null) return hayHistoria ? "nw" : "";
  if (!prev) return "";
  const d = v / prev - 1;
  return d > 0.35 ? "u2" : d > 0.1 ? "u1" : d < -0.1 ? "d1" : "";
}

export function matriz(ctx: Ctx, n = 6): Matriz {
  const i = ctx.periodos.indexOf(ctx.per);
  const meses = ctx.periodos.slice(Math.max(0, i - n + 1), i + 1);
  const maps = meses.map((p) => porEtiqueta(ctx, p.ID_Periodo));
  const etqs = [...new Set(maps.flatMap((m) => [...m.keys()]))];
  const filas: FilaM[] = etqs.map((etq) => {
    let prev: number | null = null;
    const celdas = maps.map((m, j) => {
      const x = m.get(etq), v = x ? x.v : null;
      const c: CeldaM = { v, heat: heat(v, prev, j > 0), varPrev: v !== null && prev ? v / prev - 1 : null };
      if (v !== null) prev = v; else prev = null;
      return c;
    });
    const prov = maps.map((m) => m.get(etq)?.prov).find(Boolean) || "";
    return { etq, prov, celdas };
  }).sort((a, b) => {
    const tot = (f: FilaM) => f.celdas.reduce((s, c) => s + Math.abs(c.v ?? 0), 0);
    return (b.celdas[b.celdas.length - 1].v ?? 0) - (a.celdas[a.celdas.length - 1].v ?? 0) || tot(b) - tot(a);
  });
  const fila = (etq: string, vals: (number | null)[]): FilaM => ({ etq, prov: "", tot: true,
    celdas: vals.map((v, j) => ({ v, heat: j === 0 || v === null || vals[j - 1] === null ? "" : heat(v, vals[j - 1], true), varPrev: j && v !== null && vals[j - 1] ? v / (vals[j - 1] as number) - 1 : null })) });
  const totG = meses.map((p) => num(p.Total_Gastos_Periodo));
  const exp = meses.map((p) => num(p.Expensa_Ord_Lote_Tipo));
  const idx = new Map((ctx.S.INDICES || []).map((x) => [String(x.Mes).slice(0, 7), num(x.IPC_Var_Mensual)]));
  return {
    meses, filas, totales: [fila("Gasto total del barrio", totG), fila("Expensa del lote común", exp)],
    ipc: meses.map((p) => idx.get(String(p.Mes)) ?? null),
    varExpensa: exp[0] && exp[exp.length - 1] !== null ? (exp[exp.length - 1] as number) / (exp[0] as number) - 1 : null,
  };
}

/** Valor a mostrar según el modo (importe, por lote común, % del gasto total, variación contra el mes anterior). */
export function valorModo(m: Matriz, fila: FilaM, j: number, modo: Modo): number | null {
  const c = fila.celdas[j]; if (c.v === null) return null;
  if (modo === "importe") return c.v;
  if (modo === "var") return c.varPrev;
  if (modo === "lote") { if (fila.etq === "Expensa del lote común") return c.v; const k = coefDe(m.meses[j]); return k ? r2(c.v * k) : null; }
  const t = n0(m.meses[j].Total_Gastos_Periodo); if (fila.etq === "Expensa del lote común") return null; return t ? c.v / t : null;
}
