import { lista, mesNombre, money, n0, num, pct, r2 } from "../domain/format";
import type { Ctx } from "./ctx";
import type { Comparativo } from "./comparativo";
import type { Control } from "./controles";
import { resumenControles } from "./controles";

/** Frases del encabezado: salen solo de los datos, sin adjetivos. */
export function titular(ctx: Ctx, C: Comparativo, cs: Control[]) {
  const exp = num(ctx.per.Expensa_Ord_Lote_Tipo), r = resumenControles(cs);
  const partes: string[] = [];
  const vExp = C.expPrev && exp !== null ? exp / C.expPrev - 1 : null;
  const vG = C.totalPrev ? C.totalCur / C.totalPrev - 1 : null;
  if (vExp !== null && ctx.prev) partes.push(`${pct(Math.abs(vExp))} ${vExp >= 0 ? "más" : "menos"} que en ${mesNombre(ctx.prev.Mes)}.`);
  if (vG !== null) {
    let s = `El gasto del barrio ${vG >= 0 ? "subió" : "bajó"} ${pct(Math.abs(vG), { dec: 0 })}`;
    const sobre = ctx.prev ? r2(n0(ctx.prev.Base_Prorrateo_Ord) - n0(ctx.prev.Total_Gastos_Periodo)) : 0;
    if (vExp !== null && vG > vExp && sobre > 100) s += `, pero la expensa ${vExp >= 0 ? "subió menos" : "bajó"} porque en ${mesNombre(ctx.prev!.Mes)} ya se habían cobrado ${money(sobre)} de más`;
    partes.push(s + ".");
  }
  partes.push(r.bad ? `Este mes hay ${r.bad} control${r.bad > 1 ? "es" : ""} que no ${r.bad > 1 ? "cierran" : "cierra"}.` : "Todos los controles de la liquidación cierran o están dentro del redondeo.");
  return { exp, vExp, vG, lead: partes.join(" "), r };
}

/** Qué explica la diferencia de gasto contra el mes anterior. */
export function explicacion(C: Comparativo) {
  if (C.difTotal === null) return { titulo: "Primera liquidación cargada: no hay mes anterior para comparar.", lead: "" };
  const sube = C.difTotal >= 0;
  const motores = C.filas.filter((f) => (sube ? f.dif > 0 : f.dif < 0)).sort((a, b) => Math.abs(b.dif) - Math.abs(a.dif)).slice(0, 3);
  const suma = motores.reduce((s, f) => s + f.dif, 0);
  const contra = C.filas.filter((f) => (sube ? f.dif < 0 : f.dif > 0)).sort((a, b) => Math.abs(b.dif) - Math.abs(a.dif))[0];
  const nom = motores.map((f) => (f.nuevo ? `${f.etq} (nuevo)` : f.etq));
  const titulo = `El gasto ${sube ? "subió" : "bajó"} ${money(Math.abs(C.difTotal))}.`;
  const lead = `${lista(nom)} ${motores.length > 1 ? "explican" : "explica"} ${money(Math.abs(suma), { cents: false })}.` +
    (contra ? ` En sentido contrario, ${contra.etq.toLowerCase()} ${contra.dif < 0 ? "bajó" : "subió"} ${money(Math.abs(contra.dif))}.` : "");
  return { titulo, lead };
}
