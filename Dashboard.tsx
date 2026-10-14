import { useMemo } from "react";
import { useApp } from "../state";
import { Card, Chip, Dot, Foot, Hero, Kpi, Simple } from "../components/ui";
import { dec, ddmmaa, fraccionMes, liq, mesNombre, money, money0, n0, pct, sinHtml } from "../domain/format";
import { controles } from "../engine/controles";
import type { Control } from "../engine/controles";
import { comparativo, semaforo } from "../engine/comparativo";
import { fondoReserva, morosidad, plataLibre } from "../engine/fondos";
import { respaldo, indicadores } from "../engine/respaldo";
import { titular } from "../engine/textos";
import { transparencia } from "../engine/transparencia";
import { GRAV, hallazgosDe, tabDe } from "../engine/hallazgos";

const mill = (v: number | null) => (v === null ? "N/D" : `$ ${dec(v / 1e6, 2)} millones`);
/** Cada control que no cierra, dicho en simple. */
export function controlEnSimple(c: Control): string {
  const d = money(Math.abs(c.dif ?? 0));
  switch (c.id) {
    case "patrimonio": return `La liquidación dice que el barrio tiene un patrimonio de ${mill(c.doc)}, pero la suma de sus propios números da ${mill(c.calc)}: ${d} de diferencia.`;
    case "pendientes": return `Los gastos pendientes de pago que informa la liquidación (${money(c.doc)}) no coinciden con el detalle de gastos pendientes (${money(c.calc)}).`;
    case "banco": return `Lo que había en el banco al cierre del mes anterior (${money(c.calc)}) no coincide con el saldo que informa la liquidación (${money(c.doc)}).`;
    case "reparto": return `Se repartió entre los lotes ${money(c.doc)}, pero el gasto del mes fue ${money(c.calc)}.`;
    case "continuidad": return `El saldo con el que empieza el mes no es el saldo con el que terminó el anterior (${d} de diferencia).`;
    case "caja": return `La caja no cierra: saldo inicial más ingresos menos egresos no da el saldo final (${d}).`;
    case "sinDetalle": return `Salieron de la caja ${d} sin un gasto liquidado que los respalde.${c.nota ? " " + c.nota : ""}`;
    case "egresos": return `Lo que salió de la caja para pagar gastos no coincide con los pagos registrados (${d}).`;
    case "suma": return `La suma de los gastos no da el total que informa la liquidación (${d}).`;
    default: return `${c.label}: ${d} de diferencia.`;
  }
}

export default function Dashboard() {
  const A = useApp(), ctx = A.ctx!;
  const d = useMemo(() => {
    const cs = controles(ctx), C = comparativo(ctx), R = respaldo(ctx);
    return { cs, C, R, T: titular(ctx, C, cs), sem: semaforo(ctx), fr: fondoReserva(ctx), mo: morosidad(ctx), pl: plataLibre(ctx), tr: transparencia(ctx, cs, R), hs: hallazgosDe(ctx, true), ind: indicadores(ctx) };
  }, [ctx]);
  const { cs, C, R, T, sem, fr, mo, pl, tr, hs } = d;
  const mes = mesNombre(ctx.mes), malos = cs.filter((c) => c.sev === "bad");
  const pendientesInd = d.ind.filter((i: any) => !i.decision && i.sev !== "nd").length;
  const filaDe = (etq: string) => R.filas.find((f) => f.etq === etq);
  return (
    <main className="main">
      <Hero eyebrow={`${ctx.nombre} · Liquidación ${liq(ctx.mes)} · lote común`} title={<>Tu expensa de {mes} es de <span className="num">{money(T.exp)}</span></>} lead={T.lead}>
        <div className="row">
          {T.r.bad > 0 && <Chip s="bad" dot>{T.r.bad} control{T.r.bad > 1 ? "es" : ""} no {T.r.bad > 1 ? "cierran" : "cierra"}</Chip>}
          {T.r.warn > 0 && <Chip s="warn" dot>{T.r.warn} a revisar</Chip>}
          <Chip s="ok" dot>{T.r.ok} en orden</Chip>
          {T.r.nd > 0 && <Chip s="nd" dot>{T.r.nd} sin datos</Chip>}
        </div>
      </Hero>

      <section className="kpis" aria-label="Indicadores del mes">
        <Kpi k="Expensa del lote común" v={money(T.exp)} s={C.expPrev !== null && T.exp !== null ? `${money(T.exp - C.expPrev, { sign: true })} (${pct(T.vExp, { sign: true })}) contra ${ctx.prev ? mesNombre(ctx.prev.Mes) : "el mes anterior"}` : "Primera liquidación cargada"} />
        <Kpi k="Gasto total del barrio" v={money(C.totalCur)} s={C.difTotal !== null ? `${money(C.difTotal, { sign: true })} (${pct(T.vG, { sign: true })}) contra ${mesNombre(ctx.prev!.Mes)}` : ""} />
        <Kpi k="Plata libre después de pagar lo pendiente" v={money(pl.libre)} s={pl.libre !== null ? `Saldo ${money(pl.saldo)} − pendientes ${money(pl.pend)}. Alcanza para ${dec(pl.meses ?? 0, 2)} meses de gasto.` : "Falta el saldo o los pendientes."} />
        {R.nComp ? <Kpi k="Gasto con factura que coincide" v={pct(R.share.coincide)} s={<>{money(R.tot.coincide)} de {money(R.total)}. <a href={A.link({ tab: "respaldo" })}>Ver respaldo</a></>} />
          : <Kpi k="Gasto con factura que coincide" v="N/D" s="Todavía no se cargaron los respaldos de esta liquidación." />}
      </section>

      <Card title="¿Cierran las cuentas?" aside="Lo que dice la liquidación contra lo que dan sus propios números">
        <Simple>{malos.length ? malos.map((c) => <p key={c.id}>{controlEnSimple(c)}</p>) : "Todos los controles de la liquidación cierran o están dentro del redondeo."}</Simple>
        <div className="tw"><table>
          <thead><tr><th>Control</th><th className="r">Liquidación</th><th className="r">Calculado</th><th className="r">Diferencia</th><th>Estado</th></tr></thead>
          <tbody>{cs.map((c) => (
            <tr key={c.id}><td>{c.label}</td><td className="r num">{money(c.doc)}</td><td className="r num">{money(c.calc)}</td><td className="r num">{c.dif === null ? "N/D" : money(c.dif)}</td><td><Chip s={c.sev}>{c.estado}</Chip></td></tr>
          ))}</tbody>
        </table></div>
        <details><summary>Detalle técnico de cada control</summary>
          <div className="list">{cs.map((c) => <div className="li" key={c.id} style={{ gridTemplateColumns: "1fr" }}><p className="small"><b>{c.label}.</b> {c.fuente}{c.nota ? ` ${c.nota}` : ""}</p></div>)}</div>
          <p className="small muted">Diferencia = liquidación − calculado. Hasta {money(ctx.tol)} cierra; hasta $ 100 se considera redondeo; menos del 1% queda a revisar.</p>
        </details>
      </Card>

      <section className="three">
        <div className="card">
          <div className="head"><h3>Fondo de reserva</h3>{fr.informado ? <Chip s="ok">Informado</Chip> : <Chip s="bad">No informado</Chip>}</div>
          {fr.informado && fr.reserva ? (
            <>
              <p className="big">{money(fr.reserva.fin)}</p>
              <p className="small">Aporte del mes: {money(fr.reserva.aporte)}. Usos: {money(fr.reserva.usos)}. Cubre {fr.reserva.cobertura !== null ? fraccionMes(fr.reserva.cobertura) : "N/D"}.</p>
            </>
          ) : <p className="small">La liquidación no tiene fondo de reserva. {fr.fondos.length ? `Solo informa ${fr.fondos.map((f) => `un fondo ${f.fondo.toLowerCase()}`).join(" y ")}.` : ""}</p>}
          <div className="tw"><table><tbody>
            {fr.fondos.map((f) => <tr key={f.fondo}><td>Fondo {f.fondo.toLowerCase()}</td><td className="r num">{money(f.fin)}</td></tr>)}
            {!fr.informado && <tr><td>Fondo de reserva</td><td className="r num">N/D</td></tr>}
          </tbody></table></div>
          <p className="small muted">Cuando exista: aporte del mes = % fijado, y cada uso con su acta.</p>
        </div>

        <div className="card">
          <div className="head"><h3>Morosidad: cuánto te afecta</h3>{mo.conDeuda !== null && mo.unidades !== null ? <Chip s={mo.conDeuda ? "warn" : "ok"}>{mo.conDeuda} de {mo.unidades} lotes</Chip> : <Chip s="nd">N/D</Chip>}</div>
          <p className="big">{money(mo.deuda)}</p>
          <p className="small">Deuda de los lotes atrasados{mo.intereses !== null ? `, más ${money(mo.intereses)} de intereses` : ""}.{mo.mesesDeGasto !== null ? ` Equivale a ${fraccionMes(mo.mesesDeGasto)} del barrio.` : ""}</p>
          {mo.porLoteAlDia !== null && <p className="small">Si se cubriera con los {(mo.unidades ?? 0) - (mo.conDeuda ?? 0)} lotes al día, serían <b className="num">{money0(mo.porLoteAlDia)}</b> por lote.
            {mo.previsionPrev && mo.previsionPrev.porLote !== null ? <> En {mesNombre(mo.previsionPrev.mes)} ya se hizo algo parecido: se repartieron {money(mo.previsionPrev.total)} más de lo gastado, <b className="num">{money0(mo.previsionPrev.porLote)}</b> por lote común.</> : null}</p>}
          <p className="small muted">Solo se publica cuántos lotes deben, nunca cuáles.</p>
        </div>

        <div className="card">
          <div className="head"><h3>Semáforo de servicios</h3><span className="small muted">vs. {String(ctx.par.Semaforo_Base || "MEDIANA").toLowerCase()} de {ctx.par.Semaforo_Meses ?? 6} meses</span></div>
          <div className="list">{sem.slice(0, 4).map((s) => {
            const f = filaDe(s.etq), sinFac = R.nComp > 0 && f && ["No enviada", "Sin factura"].includes(f.fLabel);
            return (
              <div className="li" key={s.etq}><Dot s={s.sev} style={{ marginTop: 6 }} /><div><b>{s.etq}</b>
                <p className="small muted">{s.sev === "new" ? `Cargo nuevo: ${money(s.cur)}.` : s.base !== null ? `${money(s.cur)} contra ${money(s.base)}${s.nota ? ` (${s.nota})` : ""}.` : s.nota}{sinFac ? " Sin factura." : ""}</p></div>
                <Chip s={s.sev}>{s.sev === "new" ? "Nuevo" : s.desvio !== null ? pct(s.desvio, { sign: true }) : "N/D"}</Chip></div>
            );
          })}{!sem.length && <p className="small muted">No hay servicios marcados en el catálogo de conceptos.</p>}</div>
          <p className="small muted">Amarillo desde {pct(n0(ctx.par.Semaforo_Amarillo ?? 0.2), { dec: 0, sign: true })}, rojo desde {pct(n0(ctx.par.Semaforo_Rojo ?? 0.35), { dec: 0, sign: true })}. No cuenta meses estimados, provisorios ni ajustes. <a href={A.link({ tab: "comparativo" })}>Ver detalle</a></p>
        </div>
      </section>

      <section className="two">
        <Card title="Lo que hay que revisar este mes" aside={hs.length ? `${hs.length} hallazgo${hs.length > 1 ? "s" : ""} confirmado${hs.length > 1 ? "s" : ""} por el auditor` : undefined}>
          {hs.length ? <div className="list">{hs.slice(0, 6).map((h) => (
            <div className="li" key={h.ID_Hallazgo}><Chip s={GRAV[h.Gravedad]?.sev || "nd"}>{GRAV[h.Gravedad]?.label || h.Gravedad}</Chip>
              <div><b>{h.Titulo}</b><p className="small muted">{sinHtml(h.Conclusion_Simple)}</p></div><a href={A.link({ tab: tabDe(h) })}>Ver</a></div>
          ))}</div> : <p className="small muted">No hay hallazgos confirmados para esta liquidación.</p>}
          {hs.length > 6 && <p className="small"><a href={A.link({ tab: "reporte" })}>Ver los {hs.length}</a></p>}
          {A.sesion && pendientesInd > 0 && <p className="small"><Chip s="new">{pendientesInd} indicadores automáticos sin revisar</Chip> <a href={A.link({ tab: "reporte" })}>Confirmar o descartar</a></p>}
        </Card>
        <Card title="Índice de transparencia" aside="Del 0 al 100, igual para los tres barrios">
          <div className="row" style={{ alignItems: "baseline", gap: 12 }}><span className="score">{tr.puntaje}</span><span className="muted">de 100{tr.parcial ? " · parcial: faltan los respaldos" : ""}</span></div>
          <div className="list">{tr.partes.map((p) => (
            <div key={p.k} style={{ display: "grid", gap: 4, padding: "8px 0" }}>
              <div className="row" style={{ justifyContent: "space-between" }}><span className="small">{p.label}</span><span className="small num">{p.nd ? "N/D" : `${dec(p.v, 1)} / ${p.max}`} · {p.detalle}</span></div>
              <div className="meter"><i style={{ width: `${(p.v / p.max) * 100}%` }} /></div>
            </div>
          ))}</div>
          <p className="small muted">Es un indicador para comparar meses y barrios con la misma regla, no una calificación de la administración.</p>
        </Card>
      </section>

      <Foot>Fuente: liquidación {liq(ctx.mes)} de {ctx.per.Administrador || "la administración"}, sus respaldos y los extractos bancarios. Datos actualizados el {ddmmaa(String(A.ds?.updated || ""))}. Cada observación es un indicador de revisión, no una acusación.</Foot>
    </main>
  );
}
