import type { Row } from "../domain/types";
import { liq, lista, money } from "../domain/format";

export type Tono = "cordial" | "formal" | "intimacion";
export interface OpcionesMail { barrioNombre: string; para: string; tono: Tono; plazo: number; firma: string; hoy: string }

/** Suma días hábiles (lunes a viernes; no descuenta feriados: revisar la fecha si cae cerca de uno). */
export function sumarHabiles(fecha: string, n: number): string {
  const d = new Date(fecha + "T12:00:00");
  let k = 0;
  while (k < n) { d.setDate(d.getDate() + 1); const w = d.getDay(); if (w !== 0 && w !== 6) k++; }
  return d.toISOString().slice(0, 10);
}

const limpio = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
const punto = (s: string) => (s && !/[.!?…)]$/.test(s) ? s + "." : s);

/** Arma asunto y cuerpo con los hallazgos elegidos: cada punto con origen, lo que muestran los documentos, la inconsistencia y lo que deben responder. */
export function armarMail(hs: Row[], o: OpcionesMail) {
  const meses = [...new Set(hs.map((h) => String(h.Mes || "")).filter((m) => /^\d{4}-\d{2}$/.test(m)))].sort();
  const liqs = lista(meses.map(liq));
  const vence = sumarHabiles(o.hoy, o.plazo);
  const asunto = `${o.barrioNombre} — Observaciones documentadas a ${meses.length > 1 ? "las liquidaciones" : "la liquidación"} ${liqs || "[liquidaciones]"} y pedido de rendición de cuentas (plazo: ${o.plazo} días hábiles)`;
  const intro: Record<Tono, string> = {
    cordial: `Estimados de ${o.para}:\n\nLes escribo como propietario de ${o.barrioNombre} para pedirles aclaraciones sobre ${meses.length > 1 ? "las liquidaciones" : "la liquidación"} ${liqs}. Para que sea fácil responder, cada punto indica de qué documento sale, qué muestra, cuál es la inconsistencia y qué necesitamos saber.`,
    formal: `Señores ${o.para}:\n\nMe dirijo a ustedes como propietario de ${o.barrioNombre}, con relación a ${meses.length > 1 ? "las liquidaciones" : "la liquidación"} ${liqs}. Cada punto indica de qué documento sale, qué muestra, cuál es la inconsistencia y qué deben responder.`,
    intimacion: `Señores ${o.para}:\n\nMe dirijo a ustedes como propietario de ${o.barrioNombre}, con relación a ${meses.length > 1 ? "las liquidaciones" : "la liquidación"} ${liqs}. Varios de estos puntos ya fueron planteados sin respuesta completa. Cada punto indica de qué documento sale, qué muestra, cuál es la inconsistencia y qué deben responder.`,
  };
  const cierre: Record<Tono, string> = {
    cordial: `Les agradecería la respuesta, punto por punto, dentro de los próximos ${o.plazo} días hábiles (hasta el ${fechaTxt(vence)}). Quedo a disposición para revisar juntos cualquiera de los puntos.\n\nSaludos cordiales,`,
    formal: `Solicito respuesta por escrito, punto por punto y con la documentación indicada, dentro de los ${o.plazo} días hábiles de recibido este correo (hasta el ${fechaTxt(vence)}).\n\nSaludo atentamente,`,
    intimacion: `Solicito respuesta por escrito, punto por punto y con la documentación indicada, dentro del plazo de ${o.plazo} días hábiles (hasta el ${fechaTxt(vence)}). Vencido ese plazo sin una respuesta completa, pondré el detalle en conocimiento de los propietarios y del Fideicomiso, y evaluaremos los pasos a seguir.\n\nSaludo atentamente,`,
  };
  const partes: string[] = [intro[o.tono], "Aclaro que cada observación es un indicador de revisión basado en los documentos recibidos, no una acusación."];
  let n = 0;
  const bloques = ["CRÍTICO", "IMPORTANTE", "A REVISAR"];
  for (const g of bloques.concat(["OTRO"])) {
    const del = hs.filter((h) => (g === "OTRO" ? !bloques.includes(h.Gravedad) : h.Gravedad === g));
    if (!del.length) continue;
    partes.push(`— ${g === "CRÍTICO" ? "Puntos graves" : g === "IMPORTANTE" ? "Puntos importantes" : g === "A REVISAR" ? "Puntos a revisar" : "Otros puntos"} —`);
    for (const h of del) {
      n++;
      const lineas = [`${n}. ${limpio(h.Titulo)}`];
      if (h.Fuentes) lineas.push(`Origen: ${punto(limpio(h.Fuentes))}`);
      lineas.push(`Qué muestran los documentos: ${punto(limpio(h.Detalle_Tecnico || h.Conclusion_Simple))}`);
      if (h.Respuesta_Administracion) lineas.push(`Lo que respondieron antes: «${limpio(h.Respuesta_Administracion)}»`);
      lineas.push(`Inconsistencia / qué falta: ${punto(limpio(h.Conclusion_Simple))}`);
      const monto = +h.Monto_Total || 0;
      if (monto && /RECUPERAR|AJUSTAR/.test(String(h.Tipo_Impacto))) lineas.push(`Importe involucrado: ${money(monto)}.`);
      lineas.push(`Qué deben responder: ${punto(limpio(h.Que_Pedir) || "Explicación por escrito y documentación de respaldo")}`);
      partes.push(lineas.join("\n"));
    }
  }
  partes.push(cierre[o.tono]);
  partes.push(o.firma || "[Nombre y apellido]\nPropietario — [Lote / UF], " + o.barrioNombre);
  return { asunto, cuerpo: partes.join("\n\n"), vence, n };
}
export function fechaTxt(f: string) { const m = f.match(/(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : f; }
