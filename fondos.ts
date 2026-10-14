import { n0, num, r2 } from "../domain/format";
import type { Ctx } from "./ctx";
import { coefDe } from "./ctx";

export interface FondoReserva {
  informado: boolean;
  fondos: { fondo: string; ini: number | null; fin: number | null }[];
  reserva: null | { ini: number | null; fin: number | null; aporte: number; usos: number; cobertura: number | null };
}

/** Fondo de reserva: si la liquidación no lo informa se dice; si existe, aporte, usos y cuántos meses de gasto cubre. */
export function fondoReserva(ctx: Ctx): FondoReserva {
  const P = ctx.per.ID_Periodo;
  const F = (ctx.S.FONDOS || []).filter((f) => f.ID_Periodo === P && f.Fondo !== "TOTAL");
  const fondos = F.map((f) => ({ fondo: String(f.Fondo), ini: num(f.Saldo_Inicial), fin: num(f.Saldo_Final_Documento) }));
  const R = F.find((f) => /RESERVA/i.test(String(f.Fondo)));
  const informadoPer = num(ctx.per.Fondo_Reserva);
  if (!R && informadoPer === null) return { informado: false, fondos, reserva: null };
  const ing = (ctx.S.INGRESOS || []).filter((x) => x.ID_Periodo === P && /RESERVA/i.test(String(x.Fondo))).reduce((a, x) => a + n0(x.Importe), 0);
  const egr = (ctx.S.EGRESOS_CAJA || []).filter((x) => x.ID_Periodo === P && /RESERVA/i.test(String(x.Fondo))).reduce((a, x) => a + n0(x.Importe), 0);
  const fin = R ? num(R.Saldo_Final_Documento) : informadoPer;
  const gasto = n0(ctx.per.Total_Gastos_Periodo);
  return { informado: true, fondos, reserva: { ini: R ? num(R.Saldo_Inicial) : null, fin, aporte: r2(ing), usos: r2(-egr), cobertura: fin !== null && gasto ? fin / gasto : null } };
}

export interface Morosidad {
  unidades: number | null;
  conDeuda: number | null;
  deuda: number | null;
  intereses: number | null;
  mesesDeGasto: number | null;
  porLoteAlDia: number | null;
  /** Lo que se repartió de más el mes anterior (previsión no informada), total y por lote común. */
  previsionPrev: null | { total: number; porLote: number | null; mes: string };
}

export function morosidad(ctx: Ctx): Morosidad {
  const P = ctx.per.ID_Periodo;
  const sp = (re: RegExp) => { const r = (ctx.S.SALDOS_PATRIMONIO || []).find((s) => s.ID_Periodo === P && s.Bloque === "ESTADO_PATRIMONIAL" && re.test(String(s.Concepto))); return r ? n0(r.Importe) : null; };
  const deuda = sp(/^deudas a cobrar/i), intereses = sp(/^intereses a cobrar/i);
  const unidades = num(ctx.per.Cantidad_Unidades) ?? num(ctx.B.Lotes), conDeuda = num(ctx.per.Unidades_Con_Deuda);
  const gasto = n0(ctx.per.Total_Gastos_Periodo);
  let previsionPrev: Morosidad["previsionPrev"] = null;
  if (ctx.prev) {
    const d = r2(n0(ctx.prev.Base_Prorrateo_Ord) - n0(ctx.prev.Total_Gastos_Periodo));
    if (d > 100) { const c = coefDe(ctx.prev); previsionPrev = { total: d, porLote: c ? d * c : null, mes: String(ctx.prev.Mes) }; }
  }
  return {
    unidades, conDeuda, deuda, intereses,
    mesesDeGasto: deuda !== null && gasto ? deuda / gasto : null,
    porLoteAlDia: deuda !== null && unidades !== null && conDeuda !== null && unidades - conDeuda > 0 ? deuda / (unidades - conDeuda) : null,
    previsionPrev,
  };
}

/** Plata libre: lo que queda en caja después de pagar todo lo pendiente. */
export function plataLibre(ctx: Ctx) {
  const saldo = num(ctx.per.Saldo_Final), pend = num(ctx.per.Gastos_Pendientes_Pago), gasto = n0(ctx.per.Total_Gastos_Periodo);
  const libre = saldo !== null && pend !== null ? r2(saldo - pend) : null;
  return { saldo, pend, libre, meses: libre !== null && gasto ? libre / gasto : null };
}
