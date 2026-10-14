import type { Row } from "../domain/types";
import { n0, num, r2 } from "../domain/format";
import type { Ctx } from "./ctx";

export interface Ajuste { id: string; titulo: string; detalle: string; ahorro: number | null; porLote: number | null; aplicar: boolean; tipo: string; estado: string; hallazgo: string }
export interface Modelo {
  oficial: number | null;
  composicion: { rubro: string; v: number; de100: number }[];
  ajustes: Ajuste[];
  coef: number | null;
}

/** Oportunidades vigentes del barrio (no descartadas ni rechazadas). */
export const oportunidadesDe = (ctx: Ctx): Row[] =>
  (ctx.S.OPORTUNIDADES || []).filter((o) => o.Barrio === ctx.barrio && !/DESCARTADA|RECHAZADA/.test(String(o.Estado)) && String(o.Mes || ctx.mes) <= ctx.mes);

export function modelo(ctx: Ctx): Modelo {
  const total = n0(ctx.per.Total_Gastos_Periodo), by = new Map<string, number>();
  ctx.gastosMes.forEach((g) => by.set(ctx.rubro(g), r2((by.get(ctx.rubro(g)) || 0) + n0(g.Importe))));
  const composicion = [...by.entries()].map(([rubro, v]) => ({ rubro, v, de100: total ? (v / total) * 100 : 0 })).sort((a, b) => b.v - a.v);
  const ajustes = oportunidadesDe(ctx).filter((o) => o.Ajuste_Titulo).map((o) => {
    const a = num(o.Ahorro_Mensual);
    return { id: o.ID_Oportunidad, titulo: o.Ajuste_Titulo, detalle: o.Ajuste_Detalle || "", ahorro: a, porLote: a !== null && ctx.coef ? a * ctx.coef : null,
      aplicar: o.Aplicar_En_Modelo === "SI", tipo: o.Tipo || "AHORRO", estado: o.Estado || "", hallazgo: o.ID_Hallazgo || "" };
  });
  return { oficial: num(ctx.per.Expensa_Ord_Lote_Tipo), composicion, ajustes, coef: ctx.coef };
}
/** Expensa modelo con los ajustes elegidos. */
export function expensaModelo(m: Modelo, elegidos: Set<string>) {
  const aplic = m.ajustes.filter((a) => elegidos.has(a.id) && a.porLote !== null);
  const baja = aplic.reduce((s, a) => s + (a.porLote as number), 0);
  const modelo = m.oficial !== null ? r2(m.oficial - baja) : null;
  return { modelo, diferencia: m.oficial !== null && modelo !== null ? r2(m.oficial - modelo) : null, pct: m.oficial ? baja / m.oficial : null, n: aplic.length };
}
