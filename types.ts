export type Row = Record<string, any>;
export interface Dataset {
  version: number;
  updated: string;
  barrio: string;
  demo?: boolean;
  sheets: Record<string, Row[]>;
}
/** Estado de un indicador: en orden, a revisar, no cierra, sin datos, nuevo. */
export type Sev = "ok" | "warn" | "bad" | "nd" | "new";
export interface Sesion { token: string; usuario: string; nombre: string; barrio: string; rol: string; vence: number }
