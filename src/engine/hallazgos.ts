import type { Row, Sev } from "../domain/types";
import type { Ctx } from "./ctx";
import { filtrarBarrio } from "./ctx";

export const GRAV: Record<string, { label: string; sev: Sev; o: number }> = {
  "CRÍTICO": { label: "Grave", sev: "bad", o: 0 },
  "IMPORTANTE": { label: "Importante", sev: "warn", o: 1 },
  "A REVISAR": { label: "Revisar", sev: "nd", o: 2 },
};
export const abierto = (h: Row) => !/SOLUCIONADO|DESCARTADO/.test(String(h.Estado || ""));
/** Hallazgos confirmados del barrio, abiertos, ordenados por gravedad y monto. */
export function hallazgosDe(ctx: Ctx, soloMes = false): Row[] {
  return filtrarBarrio(ctx.S.HALLAZGOS, ctx.barrio)
    .filter((h) => abierto(h) && h.Gravedad !== "SIN INCONSISTENCIA" && (!soloMes || h.Mes === ctx.mes) && String(h.Mes || "") <= ctx.mes)
    .sort((a, b) => (GRAV[a.Gravedad]?.o ?? 3) - (GRAV[b.Gravedad]?.o ?? 3) || (+b["Impacto_" + ctx.barrio] || +b.Monto_Total || 0) - (+a["Impacto_" + ctx.barrio] || +a.Monto_Total || 0));
}
/** Pestaña a la que conviene mandar a quien lee un hallazgo. */
export function tabDe(h: Row): "respaldo" | "optimizacion" | "comparativo" {
  const t = `${h.Titulo} ${h.Categoria_Problema} ${h.Tipo_Impacto}`.toLowerCase();
  if (/factura|comprobante|presupuesto|pago|cuenta|transfer|extracto/.test(t)) return "respaldo";
  if (/criterio|reparto|redistribu|lotes/.test(t)) return "optimizacion";
  return "comparativo";
}
/** Estadística de respuestas de la administración. */
export function respuestas(ctx: Ctx) {
  const RS = (ctx.S.RESPUESTAS_ADMIN || []).filter((r) => r.Barrio === ctx.barrio);
  const c = (re: RegExp) => RS.filter((r) => re.test(String(r.Estado))).length;
  return { total: RS.length, cumplidas: c(/^CUMPLIDO$/), tarde: c(/CUMPLIDO TARDE/), parcial: c(/PARCIAL/), mal: c(/NO CUMPLIDO|CONTRADICHO|SIN RESPUESTA/), noAplica: c(/NO APLICA/), pendientes: c(/^PENDIENTE$/), rows: RS };
}
