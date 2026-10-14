import { useMemo, useState } from "react";
import { useApp } from "../state";
import { Card, Chip, Dialog, Foot, Hero, Kpi, Simple } from "../components/ui";
import { dec, money0, num } from "../domain/format";
import { optimizacion } from "../engine/optimizacion";
import type { Row } from "../domain/types";

const PRIOS = ["ALTA", "MEDIA", "BAJA"], ESTADOS = ["PROPUESTA", "PLANTEADA", "ACEPTADA", "RECHAZADA"];
const tc = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const parse = (s: string) => { const t = s.trim(); if (!t) return ""; const x = num(t.replace(/\$|\s/g, "").replace(/\./g, "").replace(",", ".")); return x === null ? "" : x; };

export default function Optimizacion() {
  const A = useApp(), ctx = A.ctx!;
  const O = useMemo(() => optimizacion(ctx), [ctx]);
  const [nueva, setNueva] = useState<Row | null>(null);
  const ed = A.puedeEditar;
  const guardar = (fila: Row, ok = "Guardado.") => A.guardar("oportunidad", { fila }, ok).catch(() => null);
  const sinImporte = O.filas.length - O.conImporte;
  return (
    <main className="main">
      <Hero eyebrow={`${ctx.nombre} · Oportunidades de ahorro · editable por el auditor`}
        title={O.ahorroMes ? <>Se podrían ahorrar {money0(O.ahorroMes)} por mes: {money0(O.porLote)} en cada lote común</> : "Todavía no hay oportunidades con importe"}
        lead="La app propone oportunidades a partir de los datos. El auditor corrige el ahorro estimado, la prioridad y el estado, y agrega las suyas." />
      <section className="kpis">
        <Kpi k="Ahorro mensual estimado" v={money0(O.ahorroMes)} s={`${O.conImporte} oportunidad${O.conImporte === 1 ? "" : "es"} con importe`} />
        <Kpi k="Por lote común, por mes" v={money0(O.porLote)} s={`Coeficiente ${ctx.coef ? dec(ctx.coef * 100, 4) : "N/D"}%`} />
        <Kpi k="En un año" v={money0(O.anual)} s="Sin contar aumentos" />
        <Kpi k="Planteadas a la administración" v={`${O.planteadas} de ${O.filas.length}`} s={O.aceptadas ? `${O.aceptadas} aceptada${O.aceptadas > 1 ? "s" : ""}` : "Ninguna aceptada todavía"} />
      </section>
      <Simple>{`Si se corrigieran ${O.conImporte === 1 ? "este punto" : `estos ${O.conImporte} puntos`}, tu expensa bajaría unos ${money0(Math.round((O.porLote ?? 0) / 1000) * 1000)} por mes.${sinImporte ? ` ${sinImporte === 1 ? "La oportunidad sin importe se calcula" : `Las ${sinImporte} oportunidades sin importe se calculan`} cuando la administración informe el dato que falta.` : ""}`}</Simple>

      <Card title="Oportunidades" aside={ed ? <button className="btn" type="button" onClick={() => setNueva({ Concepto: "", Hoy: "", Propuesta: "", Ahorro_Mensual: "", Prioridad: "MEDIA", Estado: "PROPUESTA", Tipo: "AHORRO", Aplicar_En_Modelo: "SI", Mes: ctx.mes })}>Agregar oportunidad</button> : undefined}>
        <div className="tw"><table>
          <thead><tr><th>Concepto</th><th>Hoy</th><th>Propuesta</th><th className="r">Ahorro por mes</th><th>Prioridad</th><th>Estado</th><th>Origen</th></tr></thead>
          <tbody>{O.filas.map((o) => (
            <tr key={o.ID_Oportunidad}><td><b>{o.Concepto}</b>{o.ID_Hallazgo && <><br /><span className="small muted">Hallazgo {o.ID_Hallazgo}</span></>}</td><td className="small">{o.Hoy}</td><td className="small">{o.Propuesta}</td>
              <td className="r">{ed ? <input className="in" aria-label={`Ahorro ${o.Concepto}`} defaultValue={o.Ahorro_Mensual === "" ? "" : dec(+o.Ahorro_Mensual, 2)} placeholder="[a definir]"
                onBlur={(e) => { const v = parse(e.target.value); if (v !== (o.Ahorro_Mensual === "" ? "" : +o.Ahorro_Mensual)) guardar({ ID_Oportunidad: o.ID_Oportunidad, Ahorro_Mensual: v }); }} />
                : <span className="num">{o.Ahorro_Mensual === "" ? "[a definir]" : money0(+o.Ahorro_Mensual)}</span>}</td>
              <td>{ed ? <select className="dd" aria-label="Prioridad" value={o.Prioridad} onChange={(e) => guardar({ ID_Oportunidad: o.ID_Oportunidad, Prioridad: e.target.value })}>{PRIOS.map((p) => <option key={p} value={p}>{tc(p)}</option>)}</select> : tc(String(o.Prioridad || ""))}</td>
              <td>{ed ? <select className="dd" aria-label="Estado" value={o.Estado} onChange={(e) => guardar({ ID_Oportunidad: o.ID_Oportunidad, Estado: e.target.value })}>{ESTADOS.map((p) => <option key={p} value={p}>{tc(p)}</option>)}</select> : tc(String(o.Estado || ""))}</td>
              <td><Chip s={o.Origen === "AUDITOR" ? "new" : "nd"}>{o.Origen === "AUDITOR" ? "Auditor" : "Automático"}</Chip></td></tr>
          ))}</tbody>
          <tfoot><tr><td colSpan={3}>Total con importe</td><td className="r num">{money0(O.ahorroMes)}</td><td colSpan={3} /></tr></tfoot>
        </table></div>
      </Card>

      {O.sugerencias.length > 0 && (
        <Card title="La app sugiere revisar" aside="Salen de los datos de esta liquidación">
          <div className="list">{O.sugerencias.map((s, i) => (
            <div className="li" key={i}><Chip s="new">{s.Tipo === "RECLASIFICACIÓN" ? "Reclasificar" : "Revisar"}</Chip><div><b>{s.Concepto}</b><p className="small muted">{s.Hoy}. {s.Propuesta}.</p></div>
              {ed ? <button className="btn ghost sm" type="button" onClick={() => guardar({ ...s, Mes: ctx.mes, Origen: "AUTOMÁTICO", Estado: "PROPUESTA" }, "Oportunidad agregada.")}>Agregar</button> : <span />}</div>
          ))}</div>
        </Card>
      )}

      <Card title="Comparación por lote con los otros barrios">
        <p className="small">Mismo concepto, mismo mes, dividido por la cantidad de lotes de cada barrio. Se completa a medida que se cargan las liquidaciones de los otros barrios.</p>
        <div className="tw"><table style={{ minWidth: 640 }}>
          <thead><tr><th>Concepto</th>{O.porBarrio[0]?.valores.map((v) => <th className="r" key={v.barrio}>{v.nombre} ({v.lotes} lotes)</th>)}</tr></thead>
          <tbody>{O.porBarrio.map((g) => <tr key={g.concepto}><td>{g.concepto}</td>{g.valores.map((v) => <td className="r num" key={v.barrio}>{v.v === null ? "N/D" : money0(v.v)}</td>)}</tr>)}</tbody>
        </table></div>
      </Card>
      <Foot>Los ahorros son estimaciones del auditor y no montos reconocidos por la administración. Los cambios quedan registrados en la planilla (hoja LOG) con el valor anterior.</Foot>
      {nueva && <NuevaOportunidad o={nueva} onClose={() => setNueva(null)} onSave={async (o) => { await guardar(o, "Oportunidad agregada."); setNueva(null); }} />}
    </main>
  );
}

function NuevaOportunidad({ o, onClose, onSave }: { o: Row; onClose: () => void; onSave: (o: Row) => void }) {
  const [f, setF] = useState<Row>(o);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Dialog title="Agregar oportunidad" onClose={onClose}>
      <div className="form">
        <label>Concepto<input className="field" value={f.Concepto} onChange={set("Concepto")} /></label>
        <label>Cómo es hoy<input className="field" value={f.Hoy} onChange={set("Hoy")} /></label>
        <label>Propuesta<input className="field" value={f.Propuesta} onChange={set("Propuesta")} /></label>
        <label>Ahorro por mes (vacío si falta un dato)<input className="field" inputMode="decimal" value={f.Ahorro_Mensual} onChange={set("Ahorro_Mensual")} /></label>
        <label>Prioridad<select className="field" value={f.Prioridad} onChange={set("Prioridad")}>{PRIOS.map((p) => <option key={p} value={p}>{tc(p)}</option>)}</select></label>
        <label>Ajuste en la expensa modelo (título)<input className="field" value={f.Ajuste_Titulo || ""} onChange={set("Ajuste_Titulo")} placeholder="Ej.: Seguridad repartida por lotes" /></label>
      </div>
      <div className="actions"><button className="btn" type="button" disabled={!String(f.Concepto).trim()} onClick={() => onSave({ ...f, Ahorro_Mensual: parse(String(f.Ahorro_Mensual)), Origen: "AUDITOR" })}>Guardar</button><button className="btn ghost" type="button" onClick={onClose}>Cancelar</button></div>
    </Dialog>
  );
}
