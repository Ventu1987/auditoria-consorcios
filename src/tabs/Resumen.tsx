import { useEffect, useMemo, useState } from "react";
import { useApp } from "../state";
import { ddmmaa, liq, mesCorto, mesNombre, mesTitulo, money, int0, pct, sinHtml, fraccionMes } from "../domain/format";
import { controles } from "../engine/controles";
import { comparativo } from "../engine/comparativo";
import { morosidad, plataLibre } from "../engine/fondos";
import { BUCKETS, respaldo } from "../engine/respaldo";
import { matriz } from "../engine/matriz";
import { titular } from "../engine/textos";
import { hallazgosDe, respuestas } from "../engine/hallazgos";

/** Corta en el último punto antes de n caracteres (para que la hoja A4 no desborde). */
const corto = (s: string, n: number) => { const t = sinHtml(s).trim(); if (t.length <= n) return t; const c = t.slice(0, n), i = c.lastIndexOf(". "); return i > n * 0.5 ? c.slice(0, i + 1) : c.replace(/\s+\S*$/, "") + "…"; };

function useEscala() {
  const [k, setK] = useState(1);
  useEffect(() => { const f = () => setK(Math.min(1, (window.innerWidth - 24) / 794)); f(); addEventListener("resize", f); return () => removeEventListener("resize", f); }, []);
  return k;
}

/** Resumen de 2 páginas A4 para mandar por WhatsApp: siempre en claro, con los temas de las pestañas 1, 2, 3 y 5. */
export default function Resumen() {
  const A = useApp(), ctx = A.ctx!;
  const k = useEscala();
  const d = useMemo(() => {
    const cs = controles(ctx), C = comparativo(ctx);
    return { cs, C, T: titular(ctx, C, cs), R: respaldo(ctx), M: matriz(ctx, 5), mo: morosidad(ctx), pl: plataLibre(ctx), hs: hallazgosDe(ctx), RS: respuestas(ctx) };
  }, [ctx]);
  const { cs, C, T, R, M, mo, pl, hs, RS } = d;
  const malos = cs.filter((c) => c.sev === "bad"), cierran = cs.filter((c) => c.sev === "ok"), revisar = cs.filter((c) => c.sev === "warn");
  const cambios = C.filas.filter((f) => Math.abs(f.dif) >= 0.005).sort((a, b) => Math.abs(b.dif) - Math.abs(a.dif)).slice(0, 6);
  const top = M.filas.slice(0, 3);
  const ultimo = (ctx.S.REPORTES || []).filter((r) => r.Barrio === ctx.barrio).sort((a, b) => String(b.Fecha_Envio).localeCompare(String(a.Fecha_Envio)))[0];
  const appUrl = location.href.replace(/\/resumen.*$/, "/dashboard");
  const mesN = mesNombre(ctx.mes);
  const wrap = (child: React.ReactNode) => <div className="pgscale" style={{ transform: `scale(${k})`, transformOrigin: "top center", marginBottom: k < 1 ? `calc(-297mm * ${1 - k})` : 0 }}>{child}</div>;
  return (
    <div className="pdfwrap">
      <div className="pdfbar noprint">
        <a className="btn ghost" href={A.link({ tab: "dashboard" })}>Volver a la app</a>
        <button className="btn" type="button" onClick={() => window.print()}>Imprimir o guardar PDF</button>
        <span className="small muted" style={{ alignSelf: "center" }}>En el diálogo elegí «Guardar como PDF», tamaño A4 y sin márgenes.</span>
      </div>
      {wrap(
        <article className="pg">
          <div className="mast"><div><p className="e">{ctx.nombre} · Resumen para propietarios</p><h1>Expensa de {mesN} {ctx.mes.slice(0, 4)}</h1></div><p className="d">Liquidación {liq(ctx.mes)}<br />Datos al {ddmmaa(String(A.ds?.updated || ""))}</p></div>
          <p className="lead">Tu expensa (lote común) es de <b className="num">{money(T.exp)}</b>. {T.lead}</p>
          <div className="k4">
            <div className="k"><span className="t">Gasto total del barrio</span><span className="v">{money(C.totalCur)}</span><span className="s">{T.vG !== null ? `${pct(T.vG, { sign: true })} contra ${mesNombre(ctx.prev!.Mes)}` : "Primera liquidación cargada"}</span></div>
            <div className="k"><span className="t">Plata libre después de pagar lo pendiente</span><span className="v">{money(pl.libre)}</span><span className="s">{pl.meses !== null ? `Alcanza para ${pl.meses.toFixed(2).replace(".", ",")} meses de gasto` : "N/D"}</span></div>
            <div className="k"><span className="t">Gasto con factura que coincide</span><span className="v">{R.nComp ? pct(R.share.coincide) : "N/D"}</span><span className="s">{R.nComp ? `$ ${Math.round(R.share.sin * 100)} de cada $ 100 no tienen factura` : "Respaldos todavía sin cargar"}</span></div>
            <div className="k"><span className="t">Lotes con deuda</span><span className="v">{mo.conDeuda ?? "N/D"} de {mo.unidades ?? "N/D"}</span><span className="s">Deben {money(mo.deuda)}{mo.mesesDeGasto !== null ? `, ${fraccionMes(mo.mesesDeGasto)}` : ""}</span></div>
          </div>
          <section className="sec">
            <h2>Lo más importante</h2>
            {hs.length ? <ol>{hs.slice(0, 5).map((h) => <li key={h.ID_Hallazgo}><b>{h.Titulo}.</b> {corto(h.Conclusion_Simple, 230)}</li>)}</ol> : <p className="cap">No hay hallazgos confirmados por el auditor.</p>}
          </section>
          <section className="sec">
            <h2>¿Cierran las cuentas?</h2>
            <table>
              <thead><tr><th>Control</th><th className="r">Liquidación</th><th className="r">Calculado</th><th className="r">Diferencia</th></tr></thead>
              <tbody>
                {malos.map((c) => <tr key={c.id}><td>{c.label}</td><td className="r num">{money(c.doc)}</td><td className="r num">{money(c.calc)}</td><td className="r num bad">{money(c.dif)}</td></tr>)}
                <tr><td colSpan={4} style={{ color: "#4F565C" }}>{malos.length ? "" : "Todos los controles cierran. "}Cierran: {cierran.map((c) => c.label.split(" = ")[0].toLowerCase()).join(", ") || "ninguno"}.{revisar.length ? ` A revisar: ${revisar.map((c) => `${c.label.split(" = ")[0].toLowerCase()} (${money(Math.abs(c.dif ?? 0))})`).join(", ")}.` : ""}</td></tr>
              </tbody>
            </table>
          </section>
          <div className="ft"><span>Fuente: liquidación {liq(ctx.mes)}, sus respaldos y extractos bancarios. Son indicadores de revisión, no acusaciones.</span><span>1 / 2</span></div>
        </article>,
      )}
      {wrap(
        <article className="pg">
          <div className="mast"><p className="e">{ctx.nombre} · Expensa de {mesN} {ctx.mes.slice(0, 4)}</p><p className="d">Resumen para propietarios</p></div>
          {ctx.prev && <section className="sec">
            <h2>Qué cambió contra {mesNombre(ctx.prev.Mes)}</h2>
            <table>
              <thead><tr><th>Concepto</th><th className="r">{mesTitulo(ctx.prev.Mes).split(" ")[0]}</th><th className="r">{mesTitulo(ctx.mes).split(" ")[0]}</th><th className="r">Diferencia</th></tr></thead>
              <tbody>
                {cambios.map((f) => <tr key={f.etq}><td>{f.etq}{f.nuevo ? " (nuevo)" : f.noRepite ? " (no se repite)" : ""}</td><td className="r num">{f.prev === null ? "—" : money(f.prev)}</td><td className="r num">{f.cur === null ? "—" : money(f.cur)}</td><td className="r num">{money(f.dif, { sign: true })}</td></tr>)}
                <tr><td><b>Gasto total</b></td><td className="r num"><b>{money(C.totalPrev)}</b></td><td className="r num"><b>{money(C.totalCur)}</b></td><td className="r num"><b>{money(C.difTotal, { sign: true })}</b></td></tr>
              </tbody>
            </table>
          </section>}
          <section className="sec">
            <h2>¿Qué parte del gasto tiene factura?</h2>
            {!R.nComp ? <p className="cap">Todavía no se cargaron los respaldos de esta liquidación: no se puede decir qué parte del gasto tiene factura.</p> : <>
            <div className="stack" role="img" aria-label="Respaldo del gasto">{BUCKETS.map((b) => R.share[b.k] > 0 && <i key={b.k} style={{ width: `${(R.share[b.k] * 100).toFixed(2)}%`, background: b.color }} />)}</div>
            <div className="legp">{BUCKETS.map((b) => <span key={b.k}><i style={{ background: b.color }} />{b.label}: {pct(R.share[b.k])} ({money(R.tot[b.k])})</span>)}</div></>}
          </section>
          <section className="sec">
            <h2>{M.meses.length} meses de un vistazo</h2>
            <table>
              <thead><tr><th>Concepto</th>{M.meses.map((p) => <th key={p.Mes} className="r">{mesCorto(p.Mes)}</th>)}</tr></thead>
              <tbody>
                <tr><td><b>Expensa lote común</b></td>{M.totales[1].celdas.map((c, j) => <td key={j} className="r num">{j === M.meses.length - 1 ? <b>{int0(c.v)}</b> : int0(c.v)}</td>)}</tr>
                {top.map((f) => <tr key={f.etq}><td>{f.etq}</td>{f.celdas.map((c, j) => <td key={j} className="r num">{c.v === null ? "—" : int0(c.v)}</td>)}</tr>)}
                <tr><td>Gasto total del barrio</td>{M.totales[0].celdas.map((c, j) => <td key={j} className="r num">{int0(c.v)}</td>)}</tr>
              </tbody>
            </table>
            <p className="cap">Pesos, sin centavos.{M.varExpensa !== null ? ` De ${mesNombre(M.meses[0].Mes)} a ${mesNombre(ctx.mes)} la expensa del lote común ${M.varExpensa >= 0 ? "subió" : "bajó"} ${pct(Math.abs(M.varExpensa))}.` : ""}</p>
          </section>
          <section className="sec">
            <h2>Qué se le pidió a la administración</h2>
            <div className="boxp">
              <p>{ultimo ? `Mail con ${String(ultimo.Puntos || "").split(",").filter(Boolean).length} puntos documentados, enviado el ${ddmmaa(ultimo.Fecha_Envio)}. Plazo para responder: ${ultimo.Plazo_Dias} días hábiles, hasta el ${ddmmaa(ultimo.Vence)}.${ultimo.Estado === "RESPONDIDO" ? ` Respondido el ${ddmmaa(ultimo.Fecha_Respuesta)}.` : ""}` : `Hay ${hs.length} puntos confirmados para plantear a la administración.`}</p>
              {RS.total > 0 && <p>De las {RS.total} respuestas anteriores: {[RS.cumplidas && `${RS.cumplidas} se cumplió`, RS.tarde && `${RS.tarde} se cumplió tarde`, RS.parcial && `${RS.parcial} en parte`, RS.mal && `${RS.mal} no se cumplieron, se contradijeron o no tuvieron respuesta`].filter(Boolean).join(", ")}.</p>}
            </div>
          </section>
          <div className="ft"><span>Todo el detalle, con los documentos: {appUrl}</span><span>2 / 2</span></div>
        </article>,
      )}
    </div>
  );
}
