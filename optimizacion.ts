import type { Row } from "../domain/types";
import { money, n0, num, pct, r2 } from "../domain/format";
import type { Ctx } from "./ctx";
import { comparativo } from "./comparativo";
import { oportunidadesDe } from "./modelo";

export interface Optimizacion {
  filas: Row[];
  ahorroMes: number;
  conImporte: number;
  porLote: number | null;
  anual: number;
  planteadas: number;
  aceptadas: number;
  sugerencias: Row[];
  porBarrio: { concepto: string; valores: { barrio: string; nombre: string; lotes: number | null; v: number | null }[] }[];
}

/**
 * Pestaña 4. Las oportunidades viven en la hoja OPORTUNIDADES (las edita el auditor).
 * Además la app sugiere oportunidades nuevas a partir de los datos; el auditor las agrega con un clic.
 */
export function optimizacion(ctx: Ctx): Optimizacion {
  const filas = oportunidadesDe(ctx).filter((o) => (o.Tipo || "AHORRO") === "AHORRO");
  const con = filas.filter((o) => num(o.Ahorro_Mensual) !== null);
  const ahorroMes = r2(con.reduce((s, o) => s + n0(o.Ahorro_Mensual), 0));
  const ya = new Set((ctx.S.OPORTUNIDADES || []).filter((o) => o.Barrio === ctx.barrio).map((o) => `${o.Regla}|${o.Concepto}`));
  const ya2 = new Set((ctx.S.OPORTUNIDADES || []).filter((o) => o.Barrio === ctx.barrio).map((o) => String(o.Regla)));
  const sug: Row[] = [];
  const C = comparativo(ctx), ro = num(ctx.par.Semaforo_Rojo) ?? 0.35, total = n0(ctx.per.Total_Gastos_Periodo);
  C.filas.filter((f) => f.cur !== null && f.vsProm3 !== null && f.vsProm3 >= ro && (f.cur as number) >= total * 0.02).forEach((f) => {
    const o = { Regla: "SUBA_CONCEPTO", Concepto: f.etq, Hoy: `${money(f.cur)}, ${pct(f.vsProm3, { sign: true })} sobre el promedio de 3 meses`, Propuesta: "Pedir el detalle y negociar o volver al promedio", Ahorro_Mensual: "", Prioridad: "MEDIA", Tipo: "AHORRO" };
    if (!ya.has(`${o.Regla}|${o.Concepto}`) && !(ctx.S.OPORTUNIDADES || []).some((x) => x.Barrio === ctx.barrio && x.Concepto === f.etq)) sug.push(o);
  });
  ctx.gastosMes.filter((g) => /OBRA/.test(String(g.Tipo_Gasto)) && g.Ordinario_Extraordinario !== "EXTRAORDINARIO").forEach((g) => {
    if (!ya2.has("OBRA_ORDINARIA")) sug.push({ Regla: "OBRA_ORDINARIA", Tipo: "RECLASIFICACIÓN", Concepto: `${ctx.etiqueta(g.Concepto_Normalizado)} como gasto extraordinario`, Hoy: `${money(n0(g.Importe))} cargados como gasto ordinario`, Propuesta: "Imputarla al fondo extraordinario con presupuesto aprobado", Ahorro_Mensual: n0(g.Importe), Prioridad: "MEDIA", Aplicar_En_Modelo: "NO", Ajuste_Titulo: `${ctx.etiqueta(g.Concepto_Normalizado)} como gasto extraordinario`, Ajuste_Detalle: "Pagada con el fondo extraordinario" });
  });
  // conceptos que se liquidan como estimado dos meses seguidos
  const i = ctx.periodos.indexOf(ctx.per), ant = ctx.periodos[i - 1];
  if (ant) ctx.gastosMes.filter((g) => g.Es_Estimado === "SI" && n0(g.Importe) > 0 && ctx.gastos.some((x) => x.ID_Periodo === ant.ID_Periodo && x.Concepto_Normalizado === g.Concepto_Normalizado && x.Es_Estimado === "SI")).forEach((g) => {
    if (!ya.has(`ESTIMADO_REPETIDO|${ctx.etiqueta(g.Concepto_Normalizado)}`)) sug.push({ Regla: "ESTIMADO_REPETIDO", Tipo: "AHORRO", Concepto: ctx.etiqueta(g.Concepto_Normalizado), Hoy: "Se liquida como estimado dos meses seguidos", Propuesta: "Liquidar con la factura real", Ahorro_Mensual: "", Prioridad: "BAJA" });
  });
  // comparación por lote con los otros barrios, mismo mes
  const barrios = (ctx.S.BARRIOS || []).filter((b) => num(b.Lotes));
  const grupos: { concepto: string; f: (etq: string) => boolean }[] = [
    { concepto: "Seguridad", f: (e) => e === "Seguridad" },
    { concepto: "Honorarios de administración", f: (e) => e === "Honorarios de administración" },
    { concepto: "Mantenimiento del Fideicomiso (80% + 20%)", f: (e) => /^Mantenimiento (propios|comunes)/.test(e) },
  ];
  const porBarrio = grupos.map((gr) => ({
    concepto: gr.concepto,
    valores: barrios.map((b) => {
      const gs = (ctx.S.GASTOS || []).filter((g) => g.Barrio === b.ID_Barrio && g.Mes === ctx.mes && gr.f(ctx.etiqueta(g.Concepto_Normalizado)));
      const lotes = num(b.Lotes);
      return { barrio: b.ID_Barrio, nombre: b.Nombre, lotes, v: gs.length && lotes ? gs.reduce((s, g) => s + n0(g.Importe), 0) / lotes : null };
    }),
  }));
  return {
    filas, ahorroMes, conImporte: con.length, porLote: ctx.coef ? ahorroMes * ctx.coef : null, anual: r2(ahorroMes * 12),
    planteadas: filas.filter((o) => /PLANTEADA|ACEPTADA|RECHAZADA/.test(String(o.Estado))).length, aceptadas: filas.filter((o) => o.Estado === "ACEPTADA").length,
    sugerencias: sug, porBarrio,
  };
}
