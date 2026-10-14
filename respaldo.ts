import Audit from "../legacy/audit";
import type { Row, Sev } from "../domain/types";
import { addMes, n0, num, r2, sinHtml } from "../domain/format";
import type { Ctx } from "./ctx";

/** Resultado del motor de auditoría del portal v7 (cruza liquidación, comprobantes, extractos y respuestas). */
export type AuditResult = any;

const memo = new Map<string, AuditResult>();
/** Corre el motor sobre la liquidación elegida y las dos anteriores (así detecta cuotas repetidas, cargos nuevos, etc.). */
export function auditar(ctx: Ctx): AuditResult {
  const i = ctx.periodos.indexOf(ctx.per);
  const ids = ctx.periodos.slice(Math.max(0, i - 2), i + 1).map((p) => p.ID_Periodo);
  const k = `${ctx.ds.version}|${ctx.ds.updated}|${ctx.barrio}|${ids.join(",")}`;
  if (!memo.has(k)) { if (memo.size > 12) memo.clear(); memo.set(k, Audit.run(ctx.ds, ctx.barrio, { periodos: ids })); }
  return memo.get(k);
}

export type Bucket = "coincide" | "nocoincide" | "sin" | "parcial";
export const BUCKETS: { k: Bucket; label: string; color: string }[] = [
  { k: "coincide", label: "Factura que coincide", color: "#1E7A4C" },
  { k: "nocoincide", label: "Factura que no coincide", color: "#C2410C" },
  { k: "sin", label: "Sin factura enviada", color: "#8A8F94" },
  { k: "parcial", label: "Comprobantes parciales", color: "#F2B26B" },
];
const BK: Record<string, Bucket> = { si: "coincide", ext: "coincide", noco: "nocoincide", dif: "nocoincide", conj: "nocoincide", parc: "parcial", no: "sin", pres: "sin", noenv: "sin", est: "sin", pend: "sin" };
const FL: Record<string, string> = { si: "Coincide", ext: "Extracto", noco: "No coincide", dif: "Difiere", conj: "Factura conjunta", parc: "Parcial", no: "Sin factura", pres: "Solo presupuesto", noenv: "No enviada", est: "Estimado", pend: "Imagen sin revisar" };
const FS: Record<string, Sev> = { si: "ok", ext: "ok", noco: "bad", dif: "warn", conj: "warn", parc: "bad", no: "bad", pres: "bad", noenv: "nd", est: "warn", pend: "nd" };

export interface FilaRespaldo {
  etq: string; prov: string; v: number; bucket: Bucket;
  fLabel: string; fSev: Sev; pLabel: string; pSev: Sev; sev: Sev;
  notas: { s: Sev; txt: string }[]; gids: string[];
}
export interface Respaldo {
  filas: FilaRespaldo[];
  tot: Record<Bucket, number>;
  total: number;
  share: Record<Bucket, number>;
  salidas: { f: string; t: string; v: number; falta: string; sev: Sev }[];
  pendientes: Row[];
  nComp: number;
  nMovs: number;
  mesBanco: string;
  audit: AuditResult;
}

export function respaldo(ctx: Ctx): Respaldo {
  const A = auditar(ctx), P = ctx.per.ID_Periodo;
  const filas: FilaRespaldo[] = [];
  for (const r of A.cuadro) {
    const c = r.cells[P];
    if (!c || !c.g || !c.g.length) continue; // fila de control (repartido) o sin gasto este mes
    const fK = c.fK || "noenv", pK = c.pK || "pend";
    const g0 = ctx.gastos.find((g) => g.ID_Gasto === c.g[0]);
    let fLabel = FL[fK] || fK;
    if (fK === "si" && g0 && /PRORRATEO/.test(String(g0.Tipo_Gasto))) fLabel = "Respaldo de la base";
    filas.push({
      etq: ctx.etiqueta(r.c), prov: r.p || "", v: r2(c.v), bucket: BK[fK] || "sin", fLabel, fSev: FS[fK] || "nd",
      pLabel: (Audit.P[pK] || [pK])[0], pSev: (Audit.P[pK] || [0, "nd"])[1], sev: c.s,
      notas: (c.o || []).map((o: any) => ({ s: o.s, txt: o.txt })), gids: c.g,
    });
  }
  filas.sort((a, b) => b.v - a.v);
  const tot = { coincide: 0, nocoincide: 0, sin: 0, parcial: 0 } as Record<Bucket, number>;
  filas.forEach((f) => { tot[f.bucket] = r2(tot[f.bucket] + f.v); });
  const total = r2(Object.values(tot).reduce((a, b) => a + b, 0));
  const share = Object.fromEntries(Object.entries(tot).map(([k, v]) => [k, total ? v / total : 0])) as Record<Bucket, number>;
  const mesBanco = addMes(ctx.mes, -1);
  const salidas = (A.salidas || []).filter((s: any) => String(s.f).slice(0, 7) === mesBanco).map((s: any) => ({ ...s, t: sinHtml(s.t), falta: sinHtml(s.falta) }));
  const comps = (ctx.S.COMPROBANTES || []).filter((c) => c.ID_Periodo === P);
  const pendientes = comps.filter((c) => c.Revision === "PENDIENTE" || (c.Tipo === "IMAGEN" && !c.Revision));
  const nMovs = (ctx.S.MOVIMIENTOS_BANCO || []).filter((m) => m.Barrio === ctx.barrio && String(m.Fecha).slice(0, 7) === mesBanco).length;
  return { filas, tot, total, share, salidas, pendientes, nComp: comps.length, nMovs, mesBanco, audit: A };
}

/** Indicadores automáticos del motor, con una clave estable para confirmarlos o descartarlos. */
export function indicadores(ctx: Ctx) {
  const A = auditar(ctx);
  const dec = new Map((ctx.S.INDICADORES || []).filter((d) => d.Barrio === ctx.barrio).map((d) => [String(d.Clave), d]));
  return (A.ind || []).map((i: any) => {
    const clave = [i.t, i.pid || "", num(i.monto) !== null ? r2(n0(i.monto)) : ""].join("|");
    return { ...i, clave, txt: sinHtml(i.ve), decision: dec.get(clave) };
  });
}
