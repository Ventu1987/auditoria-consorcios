import type { Dataset } from "./types";

/** Serial de fecha de Sheets (días desde 30/12/1899) → AAAA-MM-DD. */
export function serialAFecha(n: number): string {
  return new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 864e5).toISOString().slice(0, 10);
}

/**
 * Deja el mes siempre como AAAA-MM. Sheets a veces guarda "2026-10" como fecha y la API lo manda como
 * serial (46296) o como "2026-10-01". Si la fila tiene ID_Periodo (S2-2026-10), manda ese.
 * Las columnas de fecha que llegan como serial se pasan a AAAA-MM-DD.
 */
export function normalizar(ds: Dataset): Dataset {
  for (const rows of Object.values(ds.sheets || {})) {
    for (const r of rows || []) {
      if ("Mes" in r) {
        const m = String(r.ID_Periodo || "").match(/-(\d{4}-\d{2})$/);
        const x = r.Mes;
        if (m) r.Mes = m[1];
        else if (typeof x === "number" || /^\d{5}(\.\d+)?$/.test(String(x))) { const n = Number(x); if (n > 30000 && n < 80000) r.Mes = serialAFecha(n).slice(0, 7); }
        else if (/^\d{4}-\d{2}-\d{2}/.test(String(x))) r.Mes = String(x).slice(0, 7);
      }
      for (const k of Object.keys(r)) {
        if (/^Fecha|^Vence$/.test(k) && (typeof r[k] === "number" || /^\d{5}$/.test(String(r[k])))) { const n = Number(r[k]); if (n > 30000 && n < 80000) r[k] = serialAFecha(n); }
      }
    }
  }
  return ds;
}

/** Nombre con el que se muestra una liquidación: el que eligió el auditor o "Octubre 2026". */
export function nombreLiq(p: Record<string, any> | undefined, mesTitulo: (m: string) => string): string {
  if (!p) return "";
  const t = String(p.Titulo || "").trim();
  return t || mesTitulo(String(p.Mes));
}
