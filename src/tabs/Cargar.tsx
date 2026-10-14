import { useMemo, useRef, useState } from "react";
import { useApp } from "../state";
import { Card, Chip, Hero, Simple } from "../components/ui";
import { liq, mesTitulo, money, n0 } from "../domain/format";
import LiqParser from "../legacy/parser";
import Ingest from "../legacy/ingest";
import { aBase64, pdfjs, xlsx } from "../lib/pdf";
import type { Row } from "../domain/types";

type Paso = 1 | 2 | 3;
const REVS = [["FACTURA", "Factura"], ["TICKET_FISCAL", "Tique fiscal"], ["NO_FISCAL", "No fiscal"], ["PRESUPUESTO", "Presupuesto"], ["TRANSFERENCIA", "Pago"], ["IGNORAR", "No va"]] as const;

/** Asistente de carga en 3 pasos: liquidación → respaldos y extractos → listo. Lee los archivos en el navegador; a la planilla solo van los datos. */
export default function Cargar() {
  const A = useApp();
  const [paso, setPaso] = useState<Paso>(1);
  const [mes, setMes] = useState("");
  if (!A.sesion && !A.ds?.demo) return <main className="main"><Hero eyebrow="Cargar expensa" title="Primero ingresá como auditor" lead="La carga queda registrada con tu usuario y solo podés cargar liquidaciones de tu barrio."><p><a className="btn" href={A.link({ tab: "ingresar" })}>Ingresar</a></p></Hero></main>;
  return (
    <main className="main">
      <Hero eyebrow={`Cargar expensa · ${A.ctx?.nombre || A.ruta.barrio}`} title={paso === 1 ? "1. La liquidación" : paso === 2 ? "2. Respaldos y extractos" : "3. Listo"}
        lead={paso === 1 ? "Elegí el PDF de la liquidación. La app lo lee en tu dispositivo, controla que las cuentas cierren y recién después lo guarda." : paso === 2 ? "Facturas, comprobantes de pago, planillas y extractos bancarios del mes. La app identifica cada página y la vincula con su gasto." : "Los datos ya están en la planilla y se ven en todas las pestañas."}>
        <div className="steps" aria-label="Pasos"><span className={paso === 1 ? "on" : ""}>1 · Liquidación</span><span className={paso === 2 ? "on" : ""}>2 · Respaldos</span><span className={paso === 3 ? "on" : ""}>3 · Listo</span></div>
      </Hero>
      {A.ds?.demo && <Simple warn tag="Demostración">Sin conexión con la planilla: la app lee los archivos y muestra el resultado, pero no guarda nada.</Simple>}
      {paso === 1 && <PasoLiquidacion onListo={(m) => { setMes(m); setPaso(2); }} />}
      {paso === 2 && <PasoRespaldos mes={mes || A.ctx?.mes || ""} onListo={() => setPaso(3)} />}
      {paso === 3 && <Card title="Carga terminada"><p>Ya podés revisar la liquidación {mes ? liq(mes) : ""} en el tablero.</p><div className="actions"><a className="btn" href={A.link({ tab: "dashboard", mes })}>Ver el dashboard</a><a className="btn ghost" href={A.link({ tab: "reporte", mes })}>Revisar indicadores y armar el mail</a></div></Card>}
    </main>
  );
}

function PasoLiquidacion({ onListo }: { onListo: (mes: string) => void }) {
  const A = useApp();
  const [file, setFile] = useState<File | null>(null);
  const [liqJ, setLiq] = useState<any>(null);
  const [prev, setPrev] = useState<any>(null);
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(""), [err, setErr] = useState("");
  const leer = async (f: File) => {
    setFile(f); setLiq(null); setPrev(null); setErr(""); setBusy("Leyendo el PDF…");
    try { const lib = await pdfjs(); const j = await LiqParser.fromFile(lib, new Uint8Array(await f.arrayBuffer())); setLiq(j); }
    catch (e) { setErr("No se pudo leer el PDF: " + String((e as Error).message || e)); } finally { setBusy(""); }
  };
  const revisar = async () => {
    if (!file || !liqJ) return; setBusy("Controlando contra la planilla…"); setErr("");
    try { const r = await A.post("preview", { json: liqJ, filename: file.name, pdfBase64: aBase64(await file.arrayBuffer()) }); if (r) setPrev(r.preview); }
    catch (e) { setErr(String((e as Error).message || e)); } finally { setBusy(""); }
  };
  const incorporar = async () => {
    setBusy("Guardando en la planilla…"); setErr("");
    try { const r = await A.guardar("commit", { draftId: prev.draftId, force }, "Liquidación incorporada."); if (r) onListo(r.mes || prev.periodo); }
    catch (e) { setErr(String((e as Error).message || e)); } finally { setBusy(""); }
  };
  const gastos = liqJ?.gastos || [];
  return (
    <>
      <Card title="Archivo de la liquidación">
        <label className="drop"><b>Elegí el PDF de la liquidación</b><span className="small muted">El que manda la administración todos los meses</span>
          <input type="file" accept="application/pdf,.pdf" onChange={(e) => e.target.files?.[0] && leer(e.target.files[0])} /></label>
        {busy && <p className="small muted" role="status">{busy}</p>}
        {err && <p className="err" role="alert">{err}</p>}
      </Card>
      {liqJ && (
        <Card title="Lo que leyó la app" aside={file?.name}>
          <div className="tw"><table><tbody>
            <tr><td>Barrio (texto del PDF)</td><td>{liqJ.barrio_texto || "N/D"}</td></tr>
            <tr><td>Período</td><td>{/^\d{4}-\d{2}$/.test(liqJ.periodo || "") ? mesTitulo(liqJ.periodo) : "REVISAR"}</td></tr>
            <tr><td>Total de gastos</td><td className="num">{money(n0(liqJ.total_gastos))}</td></tr>
            <tr><td>Ítems de gasto</td><td>{gastos.length} · suman {money(gastos.reduce((s: number, g: any) => s + n0(g.importe), 0))}</td></tr>
            <tr><td>Unidades en el prorrateo</td><td>{(liqJ.prorrateo || []).length}</td></tr>
          </tbody></table></div>
          {(liqJ.dudas || []).length > 0 && <Simple warn tag="Revisar">{liqJ.dudas.map((d: any, i: number) => <p key={i} className="small">{d.campo}: {d.detalle}</p>)}</Simple>}
          {!prev && <div className="actions"><button className="btn" type="button" onClick={revisar} disabled={!!busy || A.ds?.demo}>Controlar contra la planilla</button>
            {A.ds?.demo && <span className="small muted">En demostración no se puede controlar ni guardar.</span>}</div>}
        </Card>
      )}
      {prev && (
        <Card title={`Controles de ${prev.barrioNombre} · ${mesTitulo(prev.periodo)}`}>
          {prev.bloqueos.length > 0 && <Simple warn tag="No cierra">{prev.bloqueos.map((b: string, i: number) => <p key={i}>{b}</p>)}</Simple>}
          <div className="tw"><table>
            <thead><tr><th>Control</th><th className="r">Liquidación</th><th className="r">Calculado</th><th className="r">Diferencia</th><th>Estado</th></tr></thead>
            <tbody>{prev.controles.map((c: any, i: number) => <tr key={i}><td>{c.control}</td><td className="r num">{money(c.documento)}</td><td className="r num">{money(c.calculado)}</td><td className="r num">{money(c.diferencia)}</td><td><Chip s={c.ok ? "ok" : /CRÍTICO/.test(c.nivel) ? "bad" : "warn"}>{c.ok ? "Cierra" : "No cierra"}</Chip></td></tr>)}</tbody>
          </table></div>
          {prev.observaciones.length > 0 && <details><summary>{prev.observaciones.length} observaciones automáticas</summary><div className="list">{prev.observaciones.map((o: any, i: number) => <div className="li" key={i} style={{ gridTemplateColumns: "auto 1fr" }}><span className="small">{o.importancia}</span><p className="small"><b>{o.dato}.</b> {o.problema}</p></div>)}</div></details>}
          {prev.bloqueos.length > 0 && <label className="row small"><input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> Incorporar igual: lo que no cierra queda como observación para reclamar.</label>}
          <div className="actions"><button className="btn" type="button" onClick={incorporar} disabled={!!busy || (prev.bloqueos.length > 0 && !force)}>Incorporar a la planilla</button></div>
          {busy && <p className="small muted" role="status">{busy}</p>}
          {err && <p className="err" role="alert">{err}</p>}
        </Card>
      )}
      <p className="small"><button className="btn ghost sm" type="button" onClick={() => onListo(A.ctx?.mes || "")}>Saltar: la liquidación ya está cargada, subir solo respaldos</button></p>
    </>
  );
}

function PasoRespaldos({ mes, onListo }: { mes: string; onListo: () => void }) {
  const A = useApp(), ctx = A.ctx;
  const [items, setItems] = useState<Row[]>([]), [movs, setMovs] = useState<Row[]>([]), [avisos, setAvisos] = useState<string[]>([]);
  const [busy, setBusy] = useState(""), [drive, setDrive] = useState(true);
  const blobs = useRef<Record<string, File>>({});
  const barrio = A.ruta.barrio, pid = `${barrio}-${mes}`;
  const gastosMes = useMemo(() => (ctx ? ctx.gastos.filter((g) => g.ID_Periodo === pid) : []), [ctx, pid]);
  const leer = async (files: File[]) => {
    if (!files.length) return;
    const B = (A.ds?.sheets.BARRIOS || []).find((b) => b.ID_Barrio === barrio) || {};
    const its: Row[] = [], ms: Row[] = [], av: string[] = [];
    try {
      const lib = files.some((f) => /\.pdf$/i.test(f.name)) ? await pdfjs() : null;
      if (files.some((f) => /\.(xlsx?|csv)$/i.test(f.name))) await xlsx();
      for (const [i, f] of files.entries()) {
        setBusy(`Leyendo ${i + 1} de ${files.length}: ${f.name}`);
        try {
          const x = await Ingest.readFile(f, { pdfjs: lib, barrio, barrioNombre: B.Nombre, patron: B.Patron_En_PDF, admin: B.CUIT_Administrador });
          blobs.current[f.name] = f;
          x.items.forEach((it: Row) => { it.ID_Periodo = pid; it.Barrio = barrio; it.Mes = mes; it._file = f.name; if (it.Tipo === "IMAGEN" && !it.Revision) it.Revision = "PENDIENTE"; its.push(it); });
          x.movs.forEach((m: Row) => ms.push({ ...m, Barrio: barrio }));
          if (x.banco && x.banco.filtrado) av.push(`${f.name}: el extracto está filtrado (solo comisiones e impuestos).`);
        } catch (e) { av.push(`${f.name}: no se pudo leer (${String((e as Error).message || e)}).`); }
      }
      Ingest.link(its, (A.ds?.sheets.GASTOS || []).filter((g) => g.Barrio === barrio), (A.ds?.sheets.PAGOS_PER_ANTERIORES || []).filter((g) => g.Barrio === barrio));
      setItems((p) => [...p, ...its]); setMovs((p) => [...p, ...ms]); setAvisos((p) => [...p, ...av]);
    } finally { setBusy(""); }
  };
  const upd = (k: number, o: Row) => setItems(items.map((x, i) => (i === k ? { ...x, ...o } : x)));
  const guardar = async () => {
    try {
      const urls: Record<string, string> = {};
      if (drive) for (const [i, nm] of Object.keys(blobs.current).entries()) {
        setBusy(`Subiendo a Drive ${i + 1} de ${Object.keys(blobs.current).length}: ${nm}`);
        const f = blobs.current[nm]; const r = await A.post("subir_archivo", { name: nm, mime: f.type, base64: aBase64(await f.arrayBuffer()), mes }); if (r) urls[nm] = r.url;
      }
      setBusy("Guardando comprobantes…");
      const its = items.map((i) => { const o: Row = { ...i, Drive_URL: urls[i._file] || "" }; delete o._file; return o; });
      const a = await A.post("comprobantes", { items: its });
      let b: any = { nuevos: 0 }; if (movs.length) { setBusy("Guardando movimientos bancarios…"); b = await A.post("movimientos", { movs }); }
      if (a) { A.toast(`Guardado: ${a.nuevos} comprobantes nuevos y ${b?.nuevos ?? 0} movimientos.`); await A.recargar(); onListo(); }
    } catch (e) { A.toast(String((e as Error).message || e)); } finally { setBusy(""); }
  };
  const tipos = items.reduce<Record<string, number>>((o, i) => { o[i.Tipo] = (o[i.Tipo] || 0) + 1; return o; }, {});
  const vinc = items.filter((i) => i.ID_Gasto || i.ID_Pago_Ant).length;
  return (
    <>
      <Card title={`Respaldos de la liquidación ${mes ? liq(mes) : ""}`}>
        <label className="drop"><b>Elegí los archivos</b><span className="small muted">PDF, fotos (JPG, PNG) y extractos (Excel o CSV). Se pueden elegir varios a la vez.</span>
          <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.csv" onChange={(e) => leer([...(e.target.files || [])])} /></label>
        {busy && <p className="small muted" role="status">{busy}</p>}
        {avisos.length > 0 && <Simple warn tag="Avisos">{avisos.map((a, i) => <p key={i} className="small">{a}</p>)}</Simple>}
      </Card>
      {items.length > 0 && (
        <Card title={`${items.length} comprobantes y ${movs.length} movimientos bancarios`} aside={`${vinc} vinculados a un gasto · ${Object.entries(tipos).map(([k, v]) => `${v} ${k.toLowerCase().replace(/_/g, " ")}`).join(", ")}`}>
          <div className="tw"><table>
            <thead><tr><th>Archivo · pág.</th><th>Tipo</th><th className="r">Importe</th><th>Gasto</th></tr></thead>
            <tbody>{items.map((it, k) => (
              <tr key={k}><td className="small">{it.Archivo}{it.Pagina ? ` · ${it.Pagina}` : ""}{it.Nota ? <><br /><span className="muted">{String(it.Nota).slice(0, 140)}</span></> : null}</td>
                <td>{it.Tipo === "IMAGEN" || it.Tipo === "OTRO" ? <div className="opts">{REVS.map(([r, l]) => <button key={r} type="button" className={`opt${it.Revision === r ? " on" : ""}`} onClick={() => upd(k, { Revision: r, Es_Fiscal: /FACTURA|TICKET/.test(r) ? "SI" : "NO" })}>{l}</button>)}</div> : <Chip s="nd">{String(it.Tipo).replace(/_/g, " ").toLowerCase()}</Chip>}</td>
                <td className="r"><input className="in" defaultValue={it.Importe === "" || it.Importe == null ? "" : String(it.Importe).replace(".", ",")} onBlur={(e) => upd(k, { Importe: Ingest.nAR(e.target.value) })} /></td>
                <td><select className="dd" value={it.ID_Gasto || ""} onChange={(e) => upd(k, { ID_Gasto: e.target.value })}><option value="">Sin vincular</option>{gastosMes.map((g) => <option key={g.ID_Gasto} value={g.ID_Gasto}>{ctx!.etiqueta(g.Concepto_Normalizado)} · {money(n0(g.Importe))}</option>)}</select></td></tr>
            ))}</tbody>
          </table></div>
          <label className="row small"><input type="checkbox" checked={drive} onChange={(e) => setDrive(e.target.checked)} /> Guardar también los archivos originales en la carpeta de Drive del barrio (solo los ven los auditores).</label>
          <div className="actions"><button className="btn" type="button" onClick={guardar} disabled={!!busy || A.ds?.demo}>Guardar en la planilla</button><button className="btn ghost" type="button" onClick={() => { setItems([]); setMovs([]); setAvisos([]); blobs.current = {}; }}>Descartar</button></div>
        </Card>
      )}
      <p className="small"><button className="btn ghost sm" type="button" onClick={onListo}>Terminar sin respaldos</button></p>
    </>
  );
}
