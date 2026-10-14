import { useState } from "react";
import { useApp } from "../state";
import { ingresar } from "../api/client";
import { Card, Hero, Simple } from "../components/ui";

/** Ingreso de auditores. Cada usuario tiene su barrio: solo puede cargar y editar datos de ese barrio. */
export default function Ingresar() {
  const A = useApp();
  const [u, setU] = useState(""), [c, setC] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try { const s = await ingresar(u, c); A.setSesion(s); A.toast(`Hola, ${s.nombre}.`); A.ir({ barrio: s.barrio && s.barrio !== "*" ? s.barrio.split(",")[0] : A.ruta.barrio, tab: "cargar" }); }
    catch (x) { setErr(String((x as Error).message || x)); } finally { setBusy(false); }
  };
  if (A.sesion) return <main className="main"><Hero eyebrow="Auditores" title={`Ya ingresaste como ${A.sesion.nombre}`} lead={`Podés cargar y editar datos de ${A.sesion.barrio === "*" ? "todos los barrios" : A.sesion.barrio}.`}><p><a className="btn" href={A.link({ tab: "cargar" })}>Cargar expensa</a></p></Hero></main>;
  return (
    <main className="main" style={{ maxWidth: 560 }}>
      <Hero eyebrow="Auditores" title="Ingresar" lead="Los propietarios no necesitan usuario: todo lo publicado se ve con el link. El ingreso es para quien carga las liquidaciones y confirma los hallazgos de su barrio." />
      <Card>
        <form className="form" onSubmit={enviar}>
          <label>Usuario<input className="field" autoComplete="username" value={u} onChange={(e) => setU(e.target.value)} required /></label>
          <label>Clave<input className="field" type="password" autoComplete="current-password" value={c} onChange={(e) => setC(e.target.value)} required /></label>
          {err && <p className="err" role="alert">{err}</p>}
          <button className="btn" type="submit" disabled={busy}>{busy ? "Ingresando…" : "Ingresar"}</button>
        </form>
      </Card>
      <Simple>Los usuarios los crea el administrador de la planilla desde Apps Script (función crearUsuario). La clave no se guarda: solo una huella cifrada. Después de 5 intentos fallidos el usuario se bloquea 15 minutos.</Simple>
    </main>
  );
}
