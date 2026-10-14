import type { Ctx } from "./ctx";
import type { Control } from "./controles";
import type { Respaldo } from "./respaldo";

export interface Transparencia { puntaje: number; parcial: boolean; partes: { k: string; label: string; v: number; max: number; detalle: string; nd?: boolean }[] }

/**
 * Índice de transparencia (0 a 100), igual para los tres barrios. Cuatro partes de 25 puntos:
 *  1. Respaldo: % del gasto con factura que coincide.
 *  2. Cuentas: % de controles de la liquidación que cierran.
 *  3. Respuestas: % de pedidos cumplidos (cumplido tarde o parcial cuentan la mitad).
 *  4. Documentación: % del gasto con algún comprobante enviado.
 * Es un indicador para comparar meses y barrios, no una calificación de la administración.
 */
export function transparencia(ctx: Ctx, cs: Control[], R: Respaldo): Transparencia {
  const evaluables = cs.filter((c) => c.sev !== "nd");
  const cierran = evaluables.filter((c) => c.sev === "ok").length;
  const RS = (ctx.S.RESPUESTAS_ADMIN || []).filter((r) => r.Barrio === ctx.barrio && r.Estado !== "NO APLICA" && String(r.Fecha) <= `${ctx.mes}-31`);
  const pts = RS.reduce((s, r) => s + (r.Estado === "CUMPLIDO" ? 1 : /CUMPLIDO TARDE|PARCIAL/.test(r.Estado) ? 0.5 : 0), 0);
  const conDoc = R.filas.filter((f) => !["No enviada", "Sin factura", "Estimado"].includes(f.fLabel)).reduce((s, f) => s + Math.max(f.v, 0), 0);
  const tot = R.filas.reduce((s, f) => s + Math.max(f.v, 0), 0);
  const partes = [
    { k: "resp", label: "Gasto con factura que coincide", v: 25 * R.share.coincide, max: 25, detalle: `${Math.round(R.share.coincide * 100)}% del gasto` },
    { k: "ctl", label: "Controles de la liquidación que cierran", v: evaluables.length ? (25 * cierran) / evaluables.length : 0, max: 25, detalle: `${cierran} de ${evaluables.length}` },
    { k: "rta", label: "Pedidos respondidos y cumplidos", v: RS.length ? (25 * pts) / RS.length : 0, max: 25, detalle: RS.length ? `${String(pts).replace(".", ",")} de ${RS.length}` : "Sin pedidos registrados" },
    { k: "doc", label: "Gasto con algún comprobante enviado", v: tot ? (25 * conDoc) / tot : 0, max: 25, detalle: `${tot ? Math.round((conDoc / tot) * 100) : 0}% del gasto` },
  ];
  // Sin respaldos cargados no se puede medir el respaldo: esas partes quedan sin datos y el puntaje se calcula sobre el resto.
  const sinResp = R.nComp === 0;
  const ps: Transparencia["partes"] = partes.map((p) => (sinResp && (p.k === "resp" || p.k === "doc") ? { ...p, v: 0, nd: true, detalle: "Respaldos sin cargar" } : p));
  const max = ps.filter((p) => !p.nd).reduce((s, p) => s + p.max, 0);
  return { puntaje: max ? Math.round((ps.reduce((s, p) => s + p.v, 0) / max) * 100) : 0, parcial: sinResp, partes: ps };
}
