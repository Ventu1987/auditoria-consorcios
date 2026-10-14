import { useEffect, useMemo, useState } from "react";
import { useApp } from "../state";
import { Card, Chip, Dialog, Hero, Simple } from "../components/ui";
import { ddmmaa, liq, money, n0, num } from "../domain/format";
import { store } from "../api/client";
import { armarMail, fechaTxt } from "../engine/mail";
import type { Tono } from "../engine/mail";
import { GRAV, hallazgosDe, respuestas } from "../engine/hallazgos";
import { indicadores } from "../engine/respaldo";
import type { Row } from "../domain/types";

const hoyISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export default function Reporte() {
  const A = useApp(), ctx = A.ctx!;
  const hs = useMemo(() => hallazgosDe(ctx), [ctx]);
  const RS = useMemo(() => respuestas(ctx), [ctx]);
  const [tono, setTono] = useState<Tono>(() => (store.get("tono") as Tono) || "formal");
  const [plazo, setPlazo] = useState(() => num(ctx.par.Plazo_Respuesta_Dias) ?? 10);
  const [para, setPara] = useState(String(ctx.par.Mail_Para || ctx.per.Administrador || "la administración"));
  const [firma, setFirma] = useState(() => store.get("firma") || "");
  const [sel, setSel] = useState<Set<string>>(() => new Set(hs.filter((h) => !(h.Gravedad === "A REVISAR" && n0(h.Monto_Total) < 1000)).map((h) => h.ID_Hallazgo)));
  const [todos, setTodos] = useState(false);
  const elegidos = hs.filter((h) => sel.has(h.ID_Hallazgo));
  const M = useMemo(() => armarMail(elegidos, { barrioNombre: ctx.nombre, para, tono, plazo, firma, hoy: hoyISO() }), [elegidos, ctx.nombre, para, tono, plazo, firma]);
  const [cuerpo, setCuerpo] = useState(M.cuerpo);
  const [editado, setEditado] = useState(false);
  useEffect(() => { if (!editado) setCuerpo(M.cuerpo); }, [M.cuerpo, editado]);
  const [dlg, setDlg] = useState<"" | "nuevo" | "respuesta">("");
  const [evento, setEvento] = useState<Row | null>(null);
  const toggle = (id: string) => { const s = new Set(sel); if (s.has(id)) s.delete(id); else s.add(id); setSel(s); };
  const reportes = (ctx.S.REPORTES || []).filter((r) => r.Barrio === ctx.barrio).sort((a, b) => String(b.Fecha_Envio).localeCompare(String(a.Fecha_Envio)));
  const copiar = async () => { try { await navigator.clipboard.writeText(`Asunto: ${M.asunto}\n\n${cuerpo}`); A.toast("Mail copiado. Pegalo en tu correo."); } catch { A.toast("No se pudo copiar: seleccioná el texto y copialo a mano."); } };
  const mailto = `mailto:?subject=${encodeURIComponent(M.asunto)}&body=${encodeURIComponent(cuerpo.length > 1800 ? cuerpo.slice(0, 1800) + "\n\n[El mail sigue: usá «Copiar el mail» para pegarlo completo]" : cuerpo)}`;
  const pdf = () => {
    const w = window.open("", "_blank"); if (!w) { A.toast("El navegador bloqueó la ventana: permití ventanas emergentes."); return; }
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(M.asunto)}</title><style>body{font:14px/1.6 "IBM Plex Sans",system-ui,sans-serif;color:#17212B;max-width:760px;margin:32px auto;padding:0 24px}h1{font:600 18px Georgia,serif}pre{white-space:pre-wrap;font:inherit}</style></head><body><p><b>Para:</b> ${esc(para)}</p><h1>${esc(M.asunto)}</h1><pre>${esc(cuerpo)}</pre></body></html>`);
    w.document.close(); setTimeout(() => w.print(), 300);
  };
  const enviado = () => A.guardar("reporte", { fila: { Fecha_Envio: hoyISO(), Para: para, Asunto: M.asunto, Tono: tono, Plazo_Dias: plazo, Vence: M.vence, Puntos: elegidos.map((h) => h.ID_Hallazgo).join(","), Cuerpo: cuerpo.replace(firma, "[firma]") } }, "Mail registrado como enviado. Cada punto quedó anotado en su historial.").catch(() => null);
  const verHs = todos ? hs : hs.slice(0, 8);
  return (
    <main className="main">
      <Hero eyebrow={`${ctx.nombre} · Mail a la administración`} title="El mail se arma solo con los hallazgos confirmados"
        lead="Elegí qué puntos van y el tono. Cada punto sale con su origen, lo que muestran los documentos, la inconsistencia y lo que deben responder. Se puede editar antes de enviar." />
      <div className="cols">
        <aside className="left">
          <div className="card">
            <h2>Tono</h2>
            <div className="seg" role="group" aria-label="Tono del mail">
              {([["cordial", "Cordial"], ["formal", "Formal"], ["intimacion", "Intimación"]] as [Tono, string][]).map(([k, l]) => <button key={k} type="button" className={tono === k ? "on" : ""} aria-pressed={tono === k} onClick={() => { setTono(k); store.set("tono", k); }}>{l}</button>)}
            </div>
            <label className="sel" style={{ textTransform: "none", letterSpacing: 0, fontSize: 13 }}>Plazo para responder
              <select value={plazo} onChange={(e) => setPlazo(+e.target.value)}>{[5, 10, 15].map((d) => <option key={d} value={d}>{d} días hábiles</option>)}</select></label>
            <label className="sel" style={{ textTransform: "none", letterSpacing: 0, fontSize: 13 }}>Para<input className="field" value={para} onChange={(e) => setPara(e.target.value)} /></label>
            <label className="sel" style={{ textTransform: "none", letterSpacing: 0, fontSize: 13 }}>Firma (queda solo en este dispositivo)
              <textarea className="field" style={{ minHeight: 70 }} value={firma} placeholder={"Nombre y apellido\nPropietario — Lote / UF"} onChange={(e) => { setFirma(e.target.value); store.set("firma", e.target.value); }} /></label>
          </div>
          <div className="card">
            <div className="head"><h2>Puntos ({hs.length})</h2><span className="small muted">{sel.size} elegidos</span></div>
            <div className="hl">{verHs.map((h) => (
              <label key={h.ID_Hallazgo}><input type="checkbox" checked={sel.has(h.ID_Hallazgo)} onChange={() => toggle(h.ID_Hallazgo)} />
                <span>{h.Titulo}<small>{n0(h["Impacto_" + ctx.barrio]) || n0(h.Monto_Total) ? `${money(n0(h["Impacto_" + ctx.barrio]) || n0(h.Monto_Total))} · ` : ""}{h.Fuentes ? String(h.Fuentes).slice(0, 70) : `Liquidación ${liq(String(h.Mes || ctx.mes))}`}</small>
                  {A.puedeEditar && <small><button className="btn ghost sm" type="button" style={{ marginTop: 6 }} onClick={(e) => { e.preventDefault(); setEvento(h); }}>Registrar novedad</button></small>}</span>
                <Chip s={GRAV[h.Gravedad]?.sev || "nd"}>{GRAV[h.Gravedad]?.label || h.Gravedad}</Chip></label>
            ))}</div>
            <div className="row">{hs.length > 8 && <button className="btn ghost" type="button" onClick={() => setTodos(!todos)}>{todos ? "Ver menos" : `Ver los ${hs.length}`}</button>}
              <button className="btn ghost" type="button" onClick={() => setSel(new Set(sel.size === hs.length ? [] : hs.map((h) => h.ID_Hallazgo)))}>{sel.size === hs.length ? "Ninguno" : "Todos"}</button>
              {A.puedeEditar && <button className="btn ghost" type="button" onClick={() => setDlg("nuevo")}>Nuevo hallazgo</button>}</div>
          </div>
          {A.sesion && <Indicadores />}
        </aside>
        <section className="right">
          <div className="mail">
            <div className="mh"><p><span>Para:</span> {para}</p><p><span>Asunto:</span> {M.asunto}</p></div>
            <textarea aria-label="Texto del mail" value={cuerpo} onChange={(e) => { setCuerpo(e.target.value); setEditado(true); }} />
          </div>
          <div className="actions">
            <button className="btn" type="button" onClick={copiar}>Copiar el mail</button>
            <a className="btn ghost" href={mailto}>Abrir en el correo</a>
            <button className="btn ghost" type="button" onClick={pdf}>Guardar PDF</button>
            {A.puedeEditar && <button className="btn ghost" type="button" onClick={enviado} disabled={!elegidos.length}>Marcar como enviado</button>}
            {editado && <button className="btn ghost" type="button" onClick={() => { setEditado(false); setCuerpo(M.cuerpo); }}>Volver a generar</button>}
          </div>
          <p className="small muted">Vence el {fechaTxt(M.vence)} si se envía hoy ({plazo} días hábiles; revisar si hay feriados). «Abrir en el correo» lleva hasta 1.800 caracteres: para el texto completo usá «Copiar el mail».</p>

          <Card title="Seguimiento">
            {reportes.length ? <div className="tw"><table>
              <thead><tr><th>Envío</th><th>Puntos</th><th>Vence</th><th>Respuesta</th>{A.puedeEditar && <th />}</tr></thead>
              <tbody>{reportes.map((r) => {
                const venc = r.Estado === "ENVIADO" && String(r.Vence) < hoyISO();
                return (
                  <tr key={r.ID_Reporte}><td className="num">{ddmmaa(r.Fecha_Envio)}</td><td>{String(r.Puntos || "").split(",").filter(Boolean).length}</td><td className="num">{ddmmaa(r.Vence)}</td>
                    <td><Chip s={r.Estado === "RESPONDIDO" ? "ok" : venc ? "bad" : "nd"}>{r.Estado === "RESPONDIDO" ? `Respondido ${ddmmaa(r.Fecha_Respuesta)}` : venc ? "Vencido sin respuesta" : "Esperando"}</Chip></td>
                    {A.puedeEditar && <td>{r.Estado !== "RESPONDIDO" && <button className="btn ghost sm" type="button" onClick={() => A.guardar("reporte", { fila: { ID_Reporte: r.ID_Reporte, Estado: "RESPONDIDO", Fecha_Respuesta: hoyISO() } }, "Marcado como respondido.").catch(() => null)}>Respondieron</button>}</td>}</tr>
                );
              })}</tbody>
            </table></div> : <p className="small muted">Todavía no se registró ningún envío. Al marcar un mail como enviado queda acá con su vencimiento.</p>}
            <p className="small">Respuestas anteriores registradas: {RS.total}.{RS.total ? ` ${[RS.cumplidas && `${RS.cumplidas} cumplida${RS.cumplidas > 1 ? "s" : ""}`, RS.tarde && `${RS.tarde} cumplida${RS.tarde > 1 ? "s" : ""} tarde`, RS.parcial && `${RS.parcial} parcial${RS.parcial > 1 ? "es" : ""}`, RS.mal && `${RS.mal} no cumplida${RS.mal > 1 ? "s" : ""}, contradicha${RS.mal > 1 ? "s" : ""} o sin respuesta`].filter(Boolean).join(", ")}.` : ""}</p>
            {RS.total > 0 && <details><summary>Ver lo que respondió la administración</summary>
              <div className="tw"><table><thead><tr><th>Fecha</th><th>Dijo</th><th>Lo que muestran los documentos</th><th>Estado</th></tr></thead>
                <tbody>{RS.rows.map((r) => <tr key={r.ID_Respuesta}><td className="num">{ddmmaa(r.Fecha)}</td><td className="small">“{r.Dijo}”</td><td className="small">{r.Documentos_Muestran}</td><td><Chip s={/^CUMPLIDO$/.test(r.Estado) ? "ok" : /TARDE|PARCIAL/.test(r.Estado) ? "warn" : /NO APLICA|PENDIENTE/.test(r.Estado) ? "nd" : "bad"}>{r.Estado}</Chip></td></tr>)}</tbody></table></div></details>}
            {A.puedeEditar && <button className="btn ghost" type="button" onClick={() => setDlg("respuesta")}>Registrar una respuesta</button>}
          </Card>
        </section>
      </div>
      {dlg === "nuevo" && <NuevoHallazgo onClose={() => setDlg("")} />}
      {dlg === "respuesta" && <NuevaRespuesta hs={hs} onClose={() => setDlg("")} />}
      {evento && <Evento h={evento} onClose={() => setEvento(null)} />}
    </main>
  );
}

/** Circuito: indicador automático → el auditor confirma (nace el hallazgo) o descarta. */
function Indicadores() {
  const A = useApp(), ctx = A.ctx!;
  const I = useMemo(() => indicadores(ctx), [ctx]);
  const pend = I.filter((i: any) => !i.decision);
  const [ver, setVer] = useState(false);
  const decidir = (i: any, decision: string) => A.guardar("indicador", {
    clave: i.clave, mes: ctx.mes, titulo: i.t, decision,
    hallazgo: decision === "CONFIRMADO" ? { titulo: i.t, conclusion: i.txt, detalle: i.txt, pedir: i.pedir || "", monto: i.monto || 0, mes: (i.pid ? String(i.pid).slice(-7) : ctx.mes), gravedad: i.sev === "bad" ? "CRÍTICO" : i.sev === "warn" ? "IMPORTANTE" : "A REVISAR", fuentes: `Indicador automático de la app (liquidación ${liq(ctx.mes)})` } : undefined,
  }, decision === "CONFIRMADO" ? "Hallazgo creado." : "Indicador descartado.").catch(() => null);
  return (
    <div className="card">
      <div className="head"><h2>Indicadores automáticos</h2><span className="small muted">{pend.length} sin revisar</span></div>
      <p className="small muted">La app los calcula cruzando liquidación, comprobantes y extractos. Confirmar crea el hallazgo; descartar lo saca de esta lista.</p>
      <div className="list">{(ver ? pend : pend.slice(0, 5)).map((i: any) => (
        <div key={i.clave} style={{ padding: "10px 0", borderBottom: "1px solid var(--line2)", display: "grid", gap: 6 }}>
          <div className="row"><Chip s={i.sev}>{i.sev === "bad" ? "Grave" : i.sev === "warn" ? "Revisar" : "Dato"}</Chip><b className="small">{i.t}</b></div>
          <p className="small muted">{i.txt}</p>
          {A.puedeEditar && <div className="row"><button className="btn sm" type="button" onClick={() => decidir(i, "CONFIRMADO")}>Confirmar</button><button className="btn ghost sm" type="button" onClick={() => decidir(i, "DESCARTADO")}>Descartar</button></div>}
        </div>
      ))}{!pend.length && <p className="small muted">No hay indicadores pendientes.</p>}</div>
      {pend.length > 5 && <button className="btn ghost" type="button" onClick={() => setVer(!ver)}>{ver ? "Ver menos" : `Ver los ${pend.length}`}</button>}
    </div>
  );
}

function NuevoHallazgo({ onClose }: { onClose: () => void }) {
  const A = useApp(), ctx = A.ctx!;
  const [f, setF] = useState<Row>({ titulo: "", gravedad: "IMPORTANTE", conclusion: "", detalle: "", pedir: "", fuentes: `Liquidación ${liq(ctx.mes)}`, monto: "", mes: ctx.mes, barrios: ctx.barrio });
  const set = (k: string) => (e: React.ChangeEvent<any>) => setF({ ...f, [k]: e.target.value });
  return (
    <Dialog title="Nuevo hallazgo" onClose={onClose} wide>
      <Simple>Cada hallazgo es un indicador de revisión con el dato que lo sostiene, no una acusación. Si un dato es dudoso escribí REVISAR; si falta, N/D.</Simple>
      <div className="form">
        <label>Título<input className="field" value={f.titulo} onChange={set("titulo")} /></label>
        <label>Gravedad<select className="field" value={f.gravedad} onChange={set("gravedad")}><option value="CRÍTICO">Grave</option><option value="IMPORTANTE">Importante</option><option value="A REVISAR">A revisar</option></select></label>
        <label>En simple: cuál es la inconsistencia o qué falta<textarea className="field" value={f.conclusion} onChange={set("conclusion")} /></label>
        <label>Qué muestran los documentos (con importes y fechas)<textarea className="field" value={f.detalle} onChange={set("detalle")} /></label>
        <label>Qué debe responder la administración<textarea className="field" value={f.pedir} onChange={set("pedir")} /></label>
        <label>Origen (documentos)<input className="field" value={f.fuentes} onChange={set("fuentes")} /></label>
        <label>Importe involucrado (opcional)<input className="field" inputMode="decimal" value={f.monto} onChange={set("monto")} /></label>
        <label>Barrios (S1, S2, LH separados por coma)<input className="field" value={f.barrios} onChange={set("barrios")} /></label>
      </div>
      <div className="actions"><button className="btn" type="button" disabled={!f.titulo || !f.conclusion} onClick={async () => { try { await A.guardar("nuevo_hallazgo", { ...f, monto: num(String(f.monto).replace(/\./g, "").replace(",", ".")) || 0 }, "Hallazgo creado."); onClose(); } catch { /* aviso mostrado */ } }}>Guardar</button><button className="btn ghost" type="button" onClick={onClose}>Cancelar</button></div>
    </Dialog>
  );
}

function NuevaRespuesta({ hs, onClose }: { hs: Row[]; onClose: () => void }) {
  const A = useApp();
  const [f, setF] = useState<Row>({ fecha: hoyISO(), dijo: "", muestran: "", estado: "PENDIENTE", idHallazgo: "" });
  const set = (k: string) => (e: React.ChangeEvent<any>) => setF({ ...f, [k]: e.target.value });
  return (
    <Dialog title="Registrar una respuesta de la administración" onClose={onClose} wide>
      <div className="form">
        <label>Fecha<input className="field" type="date" value={f.fecha} onChange={set("fecha")} /></label>
        <label>Qué dijo (textual)<textarea className="field" value={f.dijo} onChange={set("dijo")} /></label>
        <label>Qué muestran los documentos<textarea className="field" value={f.muestran} onChange={set("muestran")} /></label>
        <label>Estado<select className="field" value={f.estado} onChange={set("estado")}>{["PENDIENTE", "CUMPLIDO", "CUMPLIDO TARDE", "PARCIAL", "NO CUMPLIDO", "CONTRADICHO", "SIN RESPUESTA", "NO APLICA"].map((e) => <option key={e}>{e}</option>)}</select></label>
        <label>Hallazgo relacionado<select className="field" value={f.idHallazgo} onChange={set("idHallazgo")}><option value="">Ninguno</option>{hs.map((h) => <option key={h.ID_Hallazgo} value={h.ID_Hallazgo}>{h.ID_Hallazgo} · {h.Titulo}</option>)}</select></label>
      </div>
      <div className="actions"><button className="btn" type="button" disabled={!f.dijo} onClick={async () => { try { await A.guardar("respuesta", f, "Respuesta registrada."); onClose(); } catch { /* aviso mostrado */ } }}>Guardar</button><button className="btn ghost" type="button" onClick={onClose}>Cancelar</button></div>
    </Dialog>
  );
}

function Evento({ h, onClose }: { h: Row; onClose: () => void }) {
  const A = useApp();
  const [f, setF] = useState<Row>({ tipo: "COMENTARIO", texto: "", fecha: hoyISO() });
  const set = (k: string) => (e: React.ChangeEvent<any>) => setF({ ...f, [k]: e.target.value });
  const bit = (A.ctx!.S.BITACORA || []).filter((e) => e.ID_Hallazgo === h.ID_Hallazgo).sort((a, b) => String(b.Fecha).localeCompare(String(a.Fecha)));
  return (
    <Dialog title={h.Titulo} onClose={onClose} wide>
      {bit.length > 0 && <div className="list">{bit.slice(0, 8).map((e) => <div className="li" key={e.ID_Evento} style={{ gridTemplateColumns: "auto 1fr" }}><span className="small num muted">{ddmmaa(e.Fecha)}</span><p className="small"><b>{e.Tipo}</b> · {e.Texto}</p></div>)}</div>}
      <div className="form">
        <label>Tipo<select className="field" value={f.tipo} onChange={set("tipo")}>{["COMENTARIO", "ACLARACIÓN", "RESPUESTA ADMINISTRACIÓN", "EN GESTIÓN", "SOLUCIONADO", "REABIERTO", "DESCARTADO"].map((t) => <option key={t}>{t}</option>)}</select></label>
        <label>Fecha<input className="field" type="date" value={f.fecha} onChange={set("fecha")} /></label>
        <label>Texto<textarea className="field" value={f.texto} onChange={set("texto")} /></label>
      </div>
      <div className="actions"><button className="btn" type="button" disabled={!f.texto} onClick={async () => { try { await A.guardar("evento", { ...f, idHallazgo: h.ID_Hallazgo }, "Novedad registrada."); onClose(); } catch { /* aviso mostrado */ } }}>Guardar</button><button className="btn ghost" type="button" onClick={onClose}>Cancelar</button></div>
    </Dialog>
  );
}
