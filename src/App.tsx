import { lazy, Suspense, useState } from "react";
import { BARRIOS_APP, TABS } from "./config";
import { useApp } from "./state";
import { periodosDe } from "./engine/ctx";
import { mesTitulo } from "./domain/format";
import { nombreLiq } from "./domain/normalizar";
import { Dialog } from "./components/ui";
import { salir } from "./api/client";
import Dashboard from "./tabs/Dashboard";
import { Empty } from "./components/ui";

const Comparativo = lazy(() => import("./tabs/Comparativo"));
const Respaldo = lazy(() => import("./tabs/Respaldo"));
const Optimizacion = lazy(() => import("./tabs/Optimizacion"));
const Matriz = lazy(() => import("./tabs/Matriz"));
const Modelo = lazy(() => import("./tabs/Modelo"));
const Reporte = lazy(() => import("./tabs/Reporte"));
const Resumen = lazy(() => import("./tabs/Resumen"));
const Cargar = lazy(() => import("./tabs/Cargar"));
const Ingresar = lazy(() => import("./tabs/Ingresar"));

const VISTAS: Record<string, React.ComponentType> = { dashboard: Dashboard, comparativo: Comparativo, respaldo: Respaldo, optimizacion: Optimizacion, matriz: Matriz, modelo: Modelo, reporte: Reporte, resumen: Resumen, cargar: Cargar, ingresar: Ingresar };

export default function App() {
  const A = useApp(), { ruta, ds, ctx } = A;
  const [ren, setRen] = useState(false);
  const Vista = VISTAS[ruta.tab] || Dashboard;
  if (ruta.tab === "resumen") return <Suspense fallback={<p className="empty">Armando el resumen…</p>}>{ctx ? <Resumen /> : <Estado />}</Suspense>;
  const pers = ds ? periodosDe(ds, ruta.barrio).slice().reverse() : [];
  const sinDatos = !A.cargando && ds && !ctx;
  return (
    <>
      <header className="top">
        <div className="wrap bar">
          <a className="brand" href={A.link({ tab: "dashboard" })}><small>Auditoría de Consorcios</small><b>Fideicomiso Bella Vista</b></a>
          <label className="sel">Barrio
            <select value={ruta.barrio} onChange={(e) => A.ir({ barrio: e.target.value, mes: "" })}>
              {BARRIOS_APP.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
            </select>
          </label>
          <label className="sel">Liquidación
            <select value={ctx?.mes || ""} onChange={(e) => A.ir({ mes: e.target.value })} disabled={!pers.length}>
              {!pers.length && <option value="">Sin liquidaciones</option>}
              {pers.map((p) => <option key={p.Mes} value={p.Mes}>{nombreLiq(p, mesTitulo)}</option>)}
            </select>
          </label>
          {A.puedeEditar && ctx && <button className="btn ghost sm" type="button" onClick={() => setRen(true)} title="Cambiar el nombre con el que se muestra esta liquidación">Renombrar</button>}
          <button className="btn ghost" type="button" onClick={A.cambiarTema} aria-pressed={A.tema === "dark"}>{A.tema === "dark" ? "Modo claro" : "Modo oscuro"}</button>
          <a className="btn ghost" href={A.link({ tab: "resumen" })} aria-disabled={!ctx}>Resumen PDF</a>
          <a className="btn" href={A.link({ tab: A.sesion ? "cargar" : "ingresar" })}>Cargar expensa</a>
        </div>
        <nav className="wrap tabs" aria-label="Pestañas">
          {TABS.map((t) => <a key={t.id} className={ruta.tab === t.id ? "on" : ""} href={A.link({ tab: t.id })} aria-current={ruta.tab === t.id ? "page" : undefined}><span>{t.n}</span>{t.label}</a>)}
        </nav>
        {(A.aviso || ds?.demo || A.sesion) && (
          <div className={`wrap banner${A.aviso ? " warn" : ""}`}>
            {A.aviso ? <span>{A.aviso}</span> : ds?.demo ? <span>Datos de demostración. Los cambios no se guardan.</span> : null}
            <span style={{ flex: 1 }} />
            {A.sesion ? (
              <span className="who">Auditor: <b>{A.sesion.nombre}</b> · {A.sesion.barrio === "*" ? "todos los barrios" : A.sesion.barrio}
                <button className="btn ghost sm" type="button" onClick={async () => { await salir(A.sesion); A.setSesion(null); A.toast("Sesión cerrada."); }}>Salir</button></span>
            ) : null}
          </div>
        )}
      </header>
      <Suspense fallback={<main className="main"><p className="muted">Cargando…</p></main>}>
        {ruta.tab === "ingresar" || ruta.tab === "cargar" ? <Vista /> : A.cargando && !ctx ? <main className="main"><p className="muted">Cargando los datos del barrio…</p></main>
          : A.error && !ds ? <main className="main"><Empty><p className="err">{A.error}</p><button className="btn" onClick={() => A.recargar()}>Reintentar</button></Empty></main>
          : sinDatos ? <main className="main"><Empty><h2>Todavía no hay liquidaciones cargadas de {BARRIOS_APP.find((b) => b.id === ruta.barrio)?.nombre || ruta.barrio}</h2><p className="muted" style={{ marginTop: 8 }}>Cuando el auditor del barrio cargue la primera expensa, acá van a aparecer el dashboard, los comparativos y el reporte.</p><p style={{ marginTop: 14 }}><a className="btn" href={A.link({ tab: A.sesion ? "cargar" : "ingresar" })}>Cargar expensa</a></p></Empty></main>
          : <Vista />}
      </Suspense>
      {!A.sesion && ruta.tab !== "ingresar" && <p className="wrap small muted noprint" style={{ padding: "0 24px 24px", maxWidth: 1240, margin: "0 auto" }}>¿Sos auditor de tu barrio? <a href={A.link({ tab: "ingresar" })}>Ingresá con tu usuario</a>.</p>}
      {ren && ctx && <Renombrar onClose={() => setRen(false)} />}
    </>
  );
}
/** Cambia el nombre visible de la liquidación elegida (no toca importes). */
function Renombrar({ onClose }: { onClose: () => void }) {
  const A = useApp(), ctx = A.ctx!;
  const [t, setT] = useState(nombreLiq(ctx.per, mesTitulo));
  const [busy, setBusy] = useState(false);
  const guardar = async () => { setBusy(true); try { await A.guardar("periodo", { id: ctx.per.ID_Periodo, titulo: t }, "Nombre actualizado."); onClose(); } catch { /* aviso mostrado */ } finally { setBusy(false); } };
  return (
    <Dialog title="Nombre de la liquidación" onClose={onClose}>
      <p className="small muted">Es solo el nombre que se ve en el selector y en el resumen. La liquidación sigue siendo {ctx.per.ID_Periodo}.</p>
      <div className="form"><label>Nombre<input className="field" value={t} maxLength={80} onChange={(e) => setT(e.target.value)} /></label></div>
      <div className="actions"><button className="btn" type="button" disabled={busy || !t.trim()} onClick={guardar}>Guardar</button><button className="btn ghost" type="button" onClick={() => setT(mesTitulo(ctx.mes))}>Volver a «{mesTitulo(ctx.mes)}»</button><button className="btn ghost" type="button" onClick={onClose}>Cancelar</button></div>
    </Dialog>
  );
}
function Estado() { const A = useApp(); return <main className="main">{A.cargando ? <p className="muted">Cargando…</p> : <Empty>No hay datos para armar el resumen.</Empty>}</main>; }
