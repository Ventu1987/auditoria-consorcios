import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { cargarDatos, guardarSesion, olvidarDatos, post, sesionGuardada, store } from "./api/client";
import type { Origen } from "./api/client";
import type { Dataset, Sesion } from "./domain/types";
import type { TabId } from "./config";
import { buildCtx } from "./engine/ctx";
import type { Ctx } from "./engine/ctx";

/* ---------- rutas: #/S2/2026-10/comparativo ---------- */
export interface Ruta { barrio: string; mes: string; tab: TabId }
export function leerRuta(): Ruta {
  const p = location.hash.replace(/^#\/?/, "").split("?")[0].split("/");
  const barrio = /^[A-Z0-9]{1,4}$/.test(p[0] || "") ? p[0] : store.get("barrio") || "S2";
  const mes = /^\d{4}-\d{2}$/.test(p[1] || "") ? p[1] : "";
  const tab = (p[2] || p[1] && !/^\d{4}-\d{2}$/.test(p[1]) && p[1] || "dashboard") as TabId;
  return { barrio, mes, tab };
}
export const href = (r: Partial<Ruta>, base: Ruta) => `#/${r.barrio ?? base.barrio}/${r.mes ?? base.mes}/${r.tab ?? base.tab}`;

interface Estado {
  ruta: Ruta;
  ir: (r: Partial<Ruta>) => void;
  link: (r: Partial<Ruta>) => string;
  ds: Dataset | null;
  ctx: Ctx | null;
  origen: Origen | null;
  aviso: string;
  cargando: boolean;
  error: string;
  recargar: (limpiar?: boolean) => Promise<void>;
  sesion: Sesion | null;
  setSesion: (s: Sesion | null) => void;
  puedeEditar: boolean;
  /** Guarda en la planilla y recarga los datos. En demostración no guarda. */
  guardar: (action: string, body: Record<string, unknown>, ok?: string) => Promise<any>;
  /** Igual que guardar pero sin recargar (para varias escrituras seguidas). */
  post: (action: string, body: Record<string, unknown>) => Promise<any>;
  tema: "light" | "dark";
  cambiarTema: () => void;
  toast: (s: string) => void;
}
const C = createContext<Estado | null>(null);
export const useApp = () => { const x = useContext(C); if (!x) throw new Error("Sin contexto"); return x; };

export function AppProvider({ children }: { children: ReactNode }) {
  const [ruta, setRuta] = useState<Ruta>(leerRuta);
  const [ds, setDs] = useState<Dataset | null>(null);
  const [origen, setOrigen] = useState<Origen | null>(null);
  const [aviso, setAviso] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [sesion, setSesionS] = useState<Sesion | null>(sesionGuardada);
  const [tema, setTema] = useState<"light" | "dark">(() => (document.documentElement.dataset.theme === "dark" ? "dark" : "light"));
  const [msg, setMsg] = useState("");

  useEffect(() => { const f = () => setRuta(leerRuta()); addEventListener("hashchange", f); return () => removeEventListener("hashchange", f); }, []);
  const ir = useCallback((r: Partial<Ruta>) => { location.hash = href(r, leerRuta()).slice(1); }, []);
  const link = useCallback((r: Partial<Ruta>) => href(r, ruta), [ruta]);

  const recargar = useCallback(async (limpiar = false) => {
    setCargando(true); setError("");
    if (limpiar) olvidarDatos(ruta.barrio);
    try { const c = await cargarDatos(ruta.barrio); setDs(c.ds); setOrigen(c.origen); setAviso(c.aviso || ""); }
    catch (e) { setError(String((e as Error).message || e)); }
    finally { setCargando(false); }
  }, [ruta.barrio]);
  useEffect(() => { store.set("barrio", ruta.barrio); recargar(); }, [ruta.barrio, recargar]);

  const ctx = useMemo(() => (ds ? buildCtx(ds, ruta.barrio, ruta.mes || undefined) : null), [ds, ruta.barrio, ruta.mes]);
  // si la ruta no trae mes (o trae uno que no existe), se fija el elegido
  useEffect(() => { if (ctx && ruta.mes !== ctx.mes && !["ingresar"].includes(ruta.tab)) history.replaceState(null, "", href({ mes: ctx.mes }, ruta)); }, [ctx, ruta]);

  // tema: guardado por dispositivo; al imprimir siempre claro
  useEffect(() => {
    const before = () => { document.documentElement.dataset.theme = "light"; };
    const after = () => { document.documentElement.dataset.theme = tema; };
    addEventListener("beforeprint", before); addEventListener("afterprint", after);
    return () => { removeEventListener("beforeprint", before); removeEventListener("afterprint", after); };
  }, [tema]);
  const cambiarTema = useCallback(() => setTema((t) => { const n = t === "dark" ? "light" : "dark"; document.documentElement.dataset.theme = n; store.set("tema", n); return n; }), []);

  const toast = useCallback((s: string) => { setMsg(s); setTimeout(() => setMsg((m) => (m === s ? "" : m)), 4000); }, []);
  const setSesion = useCallback((s: Sesion | null) => { guardarSesion(s); setSesionS(s); }, []);
  const puedeEditar = !!sesion && !!ds && !ds.demo && origen !== "anterior" &&
    (sesion.rol === "ADMIN" || sesion.barrio === "*" || sesion.barrio.split(",").map((x) => x.trim()).includes(ruta.barrio));
  const guardar = useCallback(async (action: string, body: Record<string, unknown>, ok?: string) => {
    if (!ds || ds.demo) { toast("Modo demostración: los cambios no se guardan."); return null; }
    if (!sesion) { toast("Ingresá como auditor para guardar."); return null; }
    try {
      const r = await post(action, { barrio: ruta.barrio, ...body }, sesion);
      if (ok) toast(ok);
      await recargar();
      return r;
    } catch (e) {
      const m = String((e as Error).message || e);
      if (/sesión venció/i.test(m)) setSesionS(null);
      toast(m); throw e;
    }
  }, [ds, sesion, ruta.barrio, recargar, toast]);

  const postSolo = useCallback(async (action: string, body: Record<string, unknown>) => {
    if (!ds || ds.demo) { toast("Modo demostración: los cambios no se guardan."); return null; }
    return post(action, { barrio: ruta.barrio, ...body }, sesion);
  }, [ds, sesion, ruta.barrio, toast]);
  const v: Estado = { ruta, ir, link, ds, ctx, origen, aviso, cargando, error, recargar, sesion, setSesion, puedeEditar, guardar, post: postSolo, tema, cambiarTema, toast };
  return <C.Provider value={v}>{children}{msg && <div className="toast" role="status">{msg}</div>}</C.Provider>;
}
