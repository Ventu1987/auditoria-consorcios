import { useMemo } from "react";
import { useApp } from "../state";
import { Card, Chip, Foot, Hero, Kpi, Simple } from "../components/ui";
import { ddmm, liq, lista, mesNombre, money, n0, pct, r2 } from "../domain/format";
import { comparativo, semaforo } from "../engine/comparativo";
import { explicacion } from "../engine/textos";
import { respaldo } from "../engine/respaldo";

export default function Comparativo() {
  const A = useApp(), ctx = A.ctx!;
  const { C, sem, ex, R } = useMemo(() => { const C = comparativo(ctx); return { C, sem: semaforo(ctx), ex: explicacion(C), R: respaldo(ctx) }; }, [ctx]);
  const prevN = ctx.prev ? mesNombre(ctx.prev.Mes) : "", curN = mesNombre(ctx.mes);
  if (!ctx.prev) return <main className="main"><Hero eyebrow={`${ctx.nombre} · ${curN}`} title="Es la primera liquidación cargada" lead="Cuando se cargue la siguiente, acá se compara concepto por concepto." /></main>;
  const vG = C.totalPrev ? C.totalCur / C.totalPrev - 1 : null, vE = C.expPrev && C.expCur !== null ? C.expCur / C.expPrev - 1 : null;
  const sobre = r2(n0(ctx.prev.Base_Prorrateo_Ord) - n0(ctx.prev.Total_Gastos_Periodo));
  const dib = C.filas.filter((f) => Math.abs(f.dif) >= 0.005).sort((a, b) => b.dif - a.dif);
  const max = Math.max(...dib.map((f) => Math.abs(f.dif)), 1);
  const chicos = dib.filter((f) => Math.abs(f.dif) < max * 0.004), grandes = dib.filter((f) => !chicos.includes(f));
  const alerta = new Set(sem.filter((s) => s.sev === "bad").map((s) => s.etq));
  const sinFac = (etq: string) => { if (!R.nComp) return false; const f = R.filas.find((x) => x.etq === etq); return f && ["No enviada", "Sin factura"].includes(f.fLabel); };
  const subieron = C.filas.filter((f) => f.dif > 0).map((f) => f.etq.toLowerCase());
  const resp = (ctx.S.RESPUESTAS_ADMIN || []).filter((r) => r.Barrio === ctx.barrio && subieron.some((w) => w.length > 4 && String(r.Dijo).toLowerCase().includes(w)));
  return (
    <main className="main">
      <Hero eyebrow={`${ctx.nombre} · ${curN} contra ${prevN} de ${ctx.mes.slice(0, 4)}`} title={ex.titulo} lead={ex.lead} />
      <section className="kpis">
        <Kpi k="Gasto del barrio" v={pct(vG, { sign: true })} s={`${money(C.totalPrev)} → ${money(C.totalCur)}`} />
        <Kpi k="Expensa del lote común" v={pct(vE, { sign: true })} s={`${money(C.expPrev)} → ${money(C.expCur)}`} />
        <Kpi k="Conceptos nuevos" v={String(C.nuevos.length)} s={C.nuevos.length ? `${money(C.nuevos.reduce((s, f) => s + (f.cur || 0), 0))} que no estaban en ${prevN}` : `Nada nuevo contra ${prevN}`} />
        <Kpi k="Conceptos que no se repiten" v={String(C.noRepiten.length)} s={C.noRepiten.length ? lista(C.noRepiten.map((f) => `${f.etq} (${money(f.prev)})`)) : "Todos se repiten"} />
      </section>
      <Simple>{vG !== null && vE !== null && sobre > 100 && vG > vE
        ? `El gasto ${vG >= 0 ? "subió" : "bajó"} ${pct(Math.abs(vG), { dec: 0 })} pero tu expensa ${vE >= 0 ? "subió" : "bajó"} ${pct(Math.abs(vE))}. No es que se ahorró: en ${prevN} se repartieron ${money(sobre)} más de lo que se gastó, así que la expensa de ${prevN} ya estaba inflada.`
        : `El gasto del barrio ${vG !== null && vG >= 0 ? "subió" : "bajó"} ${pct(Math.abs(vG ?? 0))} y tu expensa ${vE !== null && vE >= 0 ? "subió" : "bajó"} ${pct(Math.abs(vE ?? 0))}. Abajo está cada concepto, de mayor suba a mayor baja.`}</Simple>

      <Card title="¿Qué explica la diferencia?" aside="Cambio de cada concepto, de mayor suba a mayor baja">
        <div className="dv" role="img" aria-label={`Variación de cada concepto entre ${prevN} y ${curN}`}>
          {grandes.map((f) => {
            const w = `${Math.max((Math.abs(f.dif) / max) * 100, 0.4).toFixed(1)}%`;
            return [
              <span className="l" key={f.etq + "l"}>{f.etq}{f.nuevo ? " (nuevo)" : f.noRepite ? " (no se repite)" : ""}</span>,
              <span className="neg" key={f.etq + "n"}>{f.dif < 0 && <i className="b" style={{ width: w, background: "var(--down)" }} />}</span>,
              <span className="pos" key={f.etq + "p"}>{f.dif > 0 && <i className="b" style={{ width: w, background: "var(--up)" }} />}</span>,
              <span className="v" key={f.etq + "v"}>{money(f.dif, { sign: true })}</span>,
            ];
          })}
        </div>
        <p className="small muted">Naranja: sube. Azul: baja.{C.sinCambio.length ? ` Sin cambios: ${lista(C.sinCambio.map((f) => f.etq.toLowerCase()))}.` : ""}{chicos.length ? ` No se dibujan por su tamaño: ${lista(chicos.map((f) => `${f.etq} (${money(f.dif, { sign: true })})`))}.` : ""}</p>
      </Card>

      <Card title="Concepto por concepto">
        <div className="tw"><table>
          <thead><tr><th>Concepto</th><th className="r">{prevN}</th><th className="r">{curN}</th><th className="r">Diferencia</th><th className="r">vs. mes anterior</th><th className="r">vs. promedio 3 meses</th></tr></thead>
          <tbody>{C.filas.map((f) => (
            <tr key={f.etq}><td>{f.etq} {f.nuevo && <Chip s="new">Nuevo</Chip>}{f.noRepite && <Chip s="nd">No se repite</Chip>}{alerta.has(f.etq) && <Chip s="bad">Alerta</Chip>}{f.prov ? <><br /><span className="small muted">{f.prov}</span></> : null}</td>
              <td className="r num">{f.prev === null ? "—" : money(f.prev)}</td><td className="r num">{f.cur === null ? "—" : money(f.cur)}</td>
              <td className="r num">{money(f.dif, { sign: true })}</td><td className="r num">{f.vsPrev === null ? "—" : pct(f.vsPrev, { sign: true })}</td><td className="r num">{f.vsProm3 === null ? "—" : pct(f.vsProm3, { sign: true })}</td></tr>
          ))}</tbody>
          <tfoot><tr><td>Gasto total</td><td className="r num">{money(C.totalPrev)}</td><td className="r num">{money(C.totalCur)}</td><td className="r num">{money(C.difTotal, { sign: true })}</td><td className="r num">{pct(vG, { sign: true })}</td><td /></tr></tfoot>
        </table></div>
        <p className="small muted">"—" en el promedio: el concepto no tiene tres meses de historia. La variación se calcula sobre el importe liquidado de cada concepto.</p>
      </Card>

      <section className="two">
        <Card title="Semáforo de servicios" aside={`${String(ctx.par.Semaforo_Base || "MEDIANA") === "PROMEDIO" ? "Promedio" : "Mediana"} de ${ctx.par.Semaforo_Meses ?? 6} meses, sin estimados`}>
          <div className="tw"><table>
            <thead><tr><th>Servicio</th><th className="r">Base</th><th className="r">{curN}</th><th className="r">Desvío</th></tr></thead>
            <tbody>{sem.map((s) => (
              <tr key={s.etq}><td>{s.etq}{s.nota ? <><br /><span className="small muted">{s.nota}</span></> : null}{sinFac(s.etq) ? <><br /><span className="small muted">Sin factura.</span></> : null}</td>
                <td className="r num">{s.base === null ? "—" : money(s.base)}</td><td className="r num">{money(s.cur)}</td>
                <td className="r"><Chip s={s.sev}>{s.sev === "new" ? "Nuevo" : s.desvio === null ? "N/D" : pct(s.desvio, { sign: true })}</Chip></td></tr>
            ))}</tbody>
          </table></div>
          <p className="small muted">Para separar en la luz cuánto es precio (tarifa) y cuánto consumo, hacen falta los kWh de cada factura: se pueden anotar en la observación del gasto.</p>
        </Card>
        <Card title="Lo que dijo la administración">
          {resp.length ? resp.map((r) => (
            <Simple key={r.ID_Respuesta} warn={/CONTRADICHO|NO CUMPLIDO/.test(r.Estado)} tag={r.Estado === "CONTRADICHO" ? "Contradicción" : r.Estado}>
              <p>{ddmm(r.Fecha)}: “{r.Dijo}”</p>{r.Documentos_Muestran && <p className="small">{r.Documentos_Muestran}</p>}
            </Simple>
          )) : <p className="small muted">No hay respuestas registradas sobre los conceptos que subieron.</p>}
          <p className="small">Cuando un concepto sube y hay una respuesta registrada de la administración sobre ese concepto, la app las muestra juntas.</p>
        </Card>
      </section>
      <Foot>Fuente: liquidaciones {ctx.periodos.slice(0, ctx.periodos.indexOf(ctx.per) + 1).slice(-5).map((p) => liq(p.Mes)).join(", ")} de {ctx.nombre}.</Foot>
    </main>
  );
}
