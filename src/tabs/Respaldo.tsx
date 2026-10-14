import { useMemo, useState } from "react";
import { useApp } from "../state";
import { Card, Chip, Foot, Hero, Rich, Simple } from "../components/ui";
import { ddmm, liq, mesNombre, money, num, pct } from "../domain/format";
import { BUCKETS, respaldo } from "../engine/respaldo";
import type { Row } from "../domain/types";

const TIPOS = [["FACTURA", "Factura"], ["TICKET_FISCAL", "Tique fiscal"], ["NO_FISCAL", "No fiscal"], ["PRESUPUESTO", "Presupuesto"], ["TRANSFERENCIA", "Pago"], ["IGNORAR", "No va"]] as const;

export default function Respaldo() {
  const A = useApp(), ctx = A.ctx!;
  const R = useMemo(() => respaldo(ctx), [ctx]);
  const [filtro, setFiltro] = useState<"todos" | "obs" | "sin">("todos");
  const conObs = R.filas.filter((f) => f.notas.some((n) => n.s === "warn" || n.s === "bad") || f.fSev === "bad");
  const sin = R.filas.filter((f) => f.bucket === "sin");
  const ver = filtro === "obs" ? conObs : filtro === "sin" ? sin : R.filas;
  const de100 = (k: keyof typeof R.share) => Math.round(R.share[k] * 100);
  if (!R.nComp) return (
    <main className="main">
      <Hero eyebrow={`${ctx.nombre} · Liquidación ${liq(ctx.mes)}`} title="Todavía no se cargaron los respaldos de esta liquidación"
        lead="Cuando el auditor suba las facturas, los comprobantes de pago y los extractos (Cargar expensa → 2. Respaldos), acá se ve gasto por gasto si hay factura y si coincide con lo cobrado." />
      <Card title="Gastos del mes a respaldar">
        <div className="tw"><table><thead><tr><th>Concepto</th><th className="r">Liquidado</th><th>Estado</th></tr></thead>
          <tbody>{R.filas.map((f) => <tr key={f.etq}><td><b>{f.etq}</b>{f.prov && <><br /><span className="small muted">{f.prov}</span></>}</td><td className="r num">{money(f.v)}</td><td><Chip s="nd">Sin respaldo cargado</Chip></td></tr>)}</tbody></table></div>
      </Card>
      {A.sesion && <p><a className="btn" href={A.link({ tab: "cargar" })}>Cargar respaldos</a></p>}
    </main>
  );
  return (
    <main className="main">
      <Hero eyebrow={`${ctx.nombre} · Liquidación ${liq(ctx.mes)} · ${R.nComp} comprobantes y ${R.nMovs} movimientos bancarios leídos`}
        title={`${R.share.coincide < 0.5 ? "Solo el" : "El"} ${pct(R.share.coincide, { dec: 0 })} del gasto tiene una factura que coincide con lo cobrado`}
        lead="Para cada gasto: si hay factura, si el importe es idéntico, si está pagado y a quién. El resto queda marcado con lo que falta." />

      <Card title="¿Qué parte del gasto está respaldada?">
        <div className="stack" role="img" aria-label={BUCKETS.map((b) => `${b.label}: ${pct(R.share[b.k])}`).join(", ")}>
          {BUCKETS.map((b) => R.share[b.k] > 0 && <i key={b.k} style={{ width: `${(R.share[b.k] * 100).toFixed(2)}%`, background: b.color }} title={b.label} />)}
        </div>
        <div className="leg">{BUCKETS.map((b) => (
          <div key={b.k}><i className="sw" style={{ background: b.color }} /><p className="small"><b>{b.label} · {pct(R.share[b.k])}</b><br /><span className="num">{money(R.tot[b.k])}</span>
            {" · "}{R.filas.filter((f) => f.bucket === b.k).length} concepto{R.filas.filter((f) => f.bucket === b.k).length === 1 ? "" : "s"}</p></div>
        ))}</div>
        <Simple>{`De cada $ 100 que pagaste, $ ${de100("coincide")} tienen una factura por el mismo importe. En $ ${de100("nocoincide")} la factura existe pero no coincide con lo cobrado, y $ ${de100("sin")} no tienen factura.${R.share.parcial ? ` Otros $ ${Math.max(1, de100("parcial"))} tienen comprobantes parciales.` : ""}`}</Simple>
      </Card>

      <Card title="Gasto por gasto" aside={
        <div className="opts" role="group" aria-label="Filtro">
          <button className={`opt${filtro === "todos" ? " on" : ""}`} type="button" onClick={() => setFiltro("todos")}>Todos ({R.filas.length})</button>
          <button className={`opt${filtro === "obs" ? " on" : ""}`} type="button" onClick={() => setFiltro("obs")}>Con observaciones ({conObs.length})</button>
          <button className={`opt${filtro === "sin" ? " on" : ""}`} type="button" onClick={() => setFiltro("sin")}>Sin factura ({sin.length})</button>
        </div>}>
        <div className="tw"><table>
          <thead><tr><th>Concepto</th><th className="r">Liquidado</th><th>Factura</th><th>Pago</th><th>Qué muestran los documentos</th></tr></thead>
          <tbody>{ver.map((f) => (
            <tr key={f.etq}><td><b>{f.etq}</b>{f.prov && <><br /><span className="small muted">{f.prov}</span></>}</td><td className="r num">{money(f.v)}</td>
              <td><Chip s={f.fSev}>{f.fLabel}</Chip></td><td><Chip s={f.pSev}>{f.pLabel}</Chip></td>
              <td className="obs">{f.notas.length ? f.notas.map((n, i) => <p key={i}><Rich html={n.txt} /></p>) : <span className="muted">{f.fSev === "ok" ? "Coincide." : "Sin documentos."}</span>}</td></tr>
          ))}</tbody>
        </table></div>
      </Card>

      {(R.pendientes.length > 0 || A.puedeEditar) && <Revision pend={R.pendientes} />}

      <Card title="Salidas del banco que no coinciden con ningún gasto" aside={`Extractos de ${mesNombre(R.mesBanco)}`}>
        {R.salidas.length ? <div className="tw"><table>
          <thead><tr><th>Fecha</th><th>Movimiento</th><th className="r">Importe</th><th>Qué falta</th></tr></thead>
          <tbody>{R.salidas.map((s, i) => <tr key={i}><td className="num">{ddmm(s.f)}</td><td>{s.t}</td><td className="r num">{money(s.v)}</td><td><Chip s={s.sev}>{s.sev === "bad" ? "Falta" : "Revisar"}</Chip> {s.falta}</td></tr>)}</tbody>
        </table></div> : <p className="small muted">{R.nMovs ? "Todas las salidas del extracto coinciden con algún gasto o comprobante." : `No hay extractos bancarios de ${mesNombre(R.mesBanco)} cargados.`}</p>}
      </Card>
      <Foot>Fuente: respaldos enviados por la administración con la liquidación {liq(ctx.mes)} y extractos bancarios de {mesNombre(R.mesBanco)}. Los originales quedan en la carpeta de Drive del barrio (solo auditores).</Foot>
    </main>
  );
}

/** Páginas escaneadas o fotos que el auditor clasifica con un clic. */
function Revision({ pend }: { pend: Row[] }) {
  const A = useApp();
  const [imp, setImp] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const clasificar = async (c: Row, rev: string) => {
    setBusy(c.ID_Comprobante);
    try { await A.guardar("revision", { id: c.ID_Comprobante, revision: rev, importe: imp[c.ID_Comprobante] !== undefined ? num(imp[c.ID_Comprobante].replace(/\./g, "").replace(",", ".")) : undefined }, "Comprobante clasificado."); }
    catch { /* el aviso ya se mostró */ } finally { setBusy(""); }
  };
  return (
    <Card title="Para clasificar con un clic" aside={`Solo el auditor · ${pend.length} página${pend.length === 1 ? "" : "s"} escaneada${pend.length === 1 ? "" : "s"} o fotos`}>
      {!pend.length ? <p className="small muted">No hay imágenes pendientes de revisar.</p> : !A.puedeEditar ? <p className="small muted">Hay {pend.length} imágenes de respaldo que el auditor todavía no clasificó. Mientras tanto cuentan como "sin revisar".</p> :
        <div className="rev">{pend.slice(0, 30).map((c) => (
          <div className="rv" key={c.ID_Comprobante}>
            <div className="ph">{c.Archivo}<br />pág. {c.Pagina}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <b className="small">{A.ctx!.etiqueta(String(A.ctx!.gastos.find((g) => g.ID_Gasto === c.ID_Gasto)?.Concepto_Normalizado || "Sin gasto asociado"))} · página {c.Pagina}</b>
              <div className="opts">{TIPOS.map(([k, l]) => <button key={k} className={`opt${c.Revision === k ? " on" : ""}`} type="button" disabled={busy === c.ID_Comprobante} onClick={() => clasificar(c, k)}>{l}</button>)}</div>
              <label className="small">Importe <input className="in" inputMode="decimal" value={imp[c.ID_Comprobante] ?? (c.Importe !== "" ? String(c.Importe).replace(".", ",") : "")} onChange={(e) => setImp({ ...imp, [c.ID_Comprobante]: e.target.value })} /></label>
            </div>
          </div>
        ))}</div>}
    </Card>
  );
}
