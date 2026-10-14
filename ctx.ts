import type { Dataset, Row } from "../domain/types";
import { n0, num } from "../domain/format";

/** Todo lo que los motores necesitan sobre un barrio y una liquidación. Se arma una vez por pantalla. */
export interface Ctx {
  ds: Dataset;
  S: Record<string, Row[]>;
  barrio: string;
  B: Row;
  nombre: string;
  mes: string;
  /** Período elegido (fila de PERIODOS). */
  per: Row;
  /** Liquidación anterior con gastos (para comparar). */
  prev?: Row;
  /** Período inmediatamente anterior, tenga o no gastos (para la continuidad de saldos). */
  prevAny?: Row;
  /** Liquidaciones del barrio con gastos, ordenadas por mes. */
  periodos: Row[];
  /** Todos los períodos del barrio (incluye meses sin gastos). */
  todos: Row[];
  gastos: Row[];
  gastosMes: Row[];
  /** Coeficiente exacto del lote común: expensa / base prorrateada. */
  coef: number | null;
  par: Record<string, any>;
  etiqueta: (concepto: string) => string;
  rubro: (g: Row) => string;
  esServicio: (concepto: string, categoria?: string) => boolean;
  tol: number;
}

export const filtrarBarrio = (rows: Row[] | undefined, b: string) => (rows || []).filter((r) => r.Barrio === b || (r.Barrios && String(r.Barrios).split(",").map((x: string) => x.trim()).includes(b)));

export function coefDe(p?: Row): number | null {
  if (!p) return null;
  const e = num(p.Expensa_Ord_Lote_Tipo), b = num(p.Base_Prorrateo_Ord);
  if (e && b) return e / b;
  return num(p.Coef_Lote_Tipo);
}

export function periodosDe(ds: Dataset, barrio: string): Row[] {
  return (ds.sheets.PERIODOS || []).filter((p) => p.Barrio === barrio && n0(p.Total_Gastos_Periodo) > 1).sort((a, b) => String(a.Mes).localeCompare(String(b.Mes)));
}

const titulo = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

export function buildCtx(ds: Dataset, barrio: string, mes?: string): Ctx | null {
  const S = ds.sheets;
  const periodos = periodosDe(ds, barrio);
  if (!periodos.length) return null;
  const per = periodos.find((p) => p.Mes === mes) || periodos[periodos.length - 1];
  const i = periodos.indexOf(per);
  const todos = (S.PERIODOS || []).filter((p) => p.Barrio === barrio).sort((a, b) => String(a.Mes).localeCompare(String(b.Mes)));
  const prevAny = todos.filter((p) => String(p.Mes) < String(per.Mes)).pop();
  const B = (S.BARRIOS || []).find((b) => b.ID_Barrio === barrio) || { ID_Barrio: barrio, Nombre: barrio };
  const gastos = (S.GASTOS || []).filter((g) => g.Barrio === barrio);
  const par: Record<string, any> = {};
  (S.PARAMETROS || []).forEach((p) => { par[p.Clave] = p.Valor; });
  const cat: Record<string, Row> = {};
  (S.CONCEPTOS || []).forEach((c) => { cat[c.Concepto_Normalizado] = c; });
  return {
    ds, S, barrio, B, nombre: B.Nombre || barrio, mes: per.Mes, per, prev: periodos[i - 1], prevAny, periodos, todos, gastos,
    gastosMes: gastos.filter((g) => g.ID_Periodo === per.ID_Periodo),
    coef: coefDe(per), par,
    etiqueta: (c) => (cat[c] && cat[c].Etiqueta) || c,
    rubro: (g) => (cat[g.Concepto_Normalizado] && cat[g.Concepto_Normalizado].Rubro_Modelo) || titulo(String(g.Categoria || "Otros")),
    esServicio: (c, categoria) => (cat[c] ? cat[c].Es_Servicio === "SI" : /^SERVICIOS/.test(String(categoria || ""))),
    tol: num(par.Tolerancia_Redondeo) ?? 1,
  };
}

/** Importe de un concepto (por etiqueta) en un período. */
export function porEtiqueta(ctx: Ctx, idPeriodo: string, filtro: (g: Row) => boolean = () => true): Map<string, { v: number; rows: Row[]; prov: string }> {
  const m = new Map<string, { v: number; rows: Row[]; prov: string }>();
  ctx.gastos.filter((g) => g.ID_Periodo === idPeriodo && filtro(g)).forEach((g) => {
    const k = ctx.etiqueta(g.Concepto_Normalizado);
    const x = m.get(k) || { v: 0, rows: [], prov: "" };
    x.v = Math.round((x.v + n0(g.Importe)) * 100) / 100;
    x.rows.push(g);
    if (!x.prov && g.Proveedor) x.prov = g.Proveedor;
    m.set(k, x);
  });
  return m;
}
