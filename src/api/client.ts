import { API_URL } from "../config";
import type { Dataset, Sesion } from "../domain/types";

/** localStorage puede no estar disponible (modo privado): todo va envuelto. */
export const store = {
  get(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento: se sigue sin caché */ } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* nada */ } },
};

export type Origen = "api" | "cache" | "demo" | "anterior";
export interface Carga { ds: Dataset; origen: Origen; aviso?: string }

const demoUrl = (b: string) => new URL(`./demo/${b}.json`, document.baseURI).toString();
async function demo(barrio: string, aviso?: string): Promise<Carga> {
  const r = await fetch(demoUrl(barrio));
  if (!r.ok) throw new Error("No se pudieron cargar los datos de demostración.");
  return { ds: { ...(await r.json()), demo: true }, origen: "demo", aviso };
}

/**
 * Datos públicos de un barrio. Pide a la API con la versión que tiene guardada: si no cambió, usa lo guardado (no baja nada).
 * Si la API no responde usa lo guardado y, si no hay nada, los datos de demostración.
 */
export async function cargarDatos(barrio: string, opt: { forzarDemo?: boolean } = {}): Promise<Carga> {
  if (opt.forzarDemo || /[?&]demo\b/.test(location.search + location.hash)) return demo(barrio);
  const key = "datos_" + barrio;
  let cached: Dataset | null = null;
  try { const s = store.get(key); cached = s ? JSON.parse(s) : null; } catch { cached = null; }
  try {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 25000);
    const r = await fetch(`${API_URL}?action=data&barrio=${encodeURIComponent(barrio)}&v=${cached ? cached.version : ""}`, { signal: ctl.signal, redirect: "follow" });
    clearTimeout(t);
    const j = await r.json();
    if (j.error) throw new Error(j.error);
    if (j.notModified && cached) return { ds: cached, origen: "cache" };
    if (j.sheets) {
      if (j.version === undefined) return { ds: { ...j, version: 0, barrio }, origen: "anterior", aviso: "La API todavía tiene el código del portal anterior. Pegá el código nuevo en Apps Script (ver la guía) para habilitar la carga por barrio." };
      store.set(key, JSON.stringify(j));
      return { ds: j, origen: "api" };
    }
    throw new Error("Respuesta inesperada de la API.");
  } catch (e) {
    if (cached) return { ds: cached, origen: "cache", aviso: "Sin conexión con la planilla: se muestran los últimos datos guardados en este dispositivo." };
    return demo(barrio, "No se pudo conectar con la planilla. Se muestran datos de demostración (liquidaciones cargadas hasta octubre 2026).");
  }
}

/* ---------- sesión del auditor ---------- */
export function sesionGuardada(): Sesion | null {
  try { const s = JSON.parse(store.get("sesion") || "null"); return s && s.vence > Date.now() ? s : null; } catch { return null; }
}
export function guardarSesion(s: Sesion | null) { if (s) store.set("sesion", JSON.stringify(s)); else store.del("sesion"); }

/** POST como texto plano (sin consulta previa de CORS). Devuelve el JSON o lanza el error de la API. */
export async function post<T = any>(action: string, body: Record<string, unknown>, sesion?: Sesion | null): Promise<T> {
  const r = await fetch(API_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action, token: sesion?.token, ...body }), redirect: "follow" });
  const j = await r.json();
  if (j.error) {
    if (/sesión venció/i.test(j.error)) guardarSesion(null);
    throw new Error(j.error);
  }
  return j as T;
}

export async function ingresar(usuario: string, clave: string): Promise<Sesion> {
  const s = await post<Sesion>("login", { usuario, clave });
  guardarSesion(s);
  return s;
}
export async function salir(s: Sesion | null) { try { if (s) await post("logout", {}, s); } catch { /* nada */ } guardarSesion(null); }
export function olvidarDatos(barrio: string) { store.del("datos_" + barrio); }
