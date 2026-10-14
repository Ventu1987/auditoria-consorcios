import { useMemo, useState } from "react";
import { useApp } from "../state";
import { Dialog, Foot, Hero, Simple } from "../components/ui";
import { int0, liq, mesCorto, mesLargo, money, money0, pct, n0 } from "../domain/format";
import { matriz, valorModo } from "../engine/matriz";
import type { FilaM, Modo } from "../engine/matriz";

const MODOS: [Modo, string][] = [["importe", "Importe"], ["lote", "Por lote común"], ["pct", "% del total"], ["var", "Variación"]];

export default function Matriz() {
  const A = useApp(), ctx = A.ctx!;
  const M = useMemo(() => matriz(ctx), [ctx]);
  const [modo, setModo] = useState<Modo>("importe");
  const [abierta, setAbierta] = useState<FilaM | null>(null);
  const fmt = (v: number | null) => (v === null ? "—" : modo === "pct" || modo === "var" ? pct(v, { sign: modo === "var" }) : int0(v));
  const first = M.meses[0], last = M.meses[M.meses.length - 1];
  const exp = M.totales[1].celdas;
  const descargar = async () => {
    const XLSX = await import("xlsx");
    const head = ["Concepto", ...M.meses.map((p) => liq(p.Mes))];
    const rows = [...M.filas, ...M.totales].map((f) => [f.etq, ...f.celdas.map((_, j) => valorModo(M, f, j, modo))]);
    const ws = XLSX.utils.aoa_to_sheet([head, ...rows, [], [`Fuente: liquidaciones de ${ctx.nombre}. Modo: ${MODOS.find((m) => m[0] === modo)![1]}.`]]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Matriz");
    XLSX.writeFile(wb, `matriz_${ctx.barrio}_${first.Mes}_${last.Mes}.xlsx`);
  };
  return (
    <main className="main">
      <Hero eyebrow={`${ctx.nombre} · Liquidaciones de ${mesLargo(first.Mes).split(" ")[0]} a ${mesLargo(last.Mes)}`}
        title={M.varExpensa !== null ? `En ${M.meses.length} meses la expensa del lote común ${M.varExpensa >= 0 ? "subió" : "bajó"} ${pct(Math.abs(M.varExpensa))}` : "Matriz histórica"} />
      <Simple>{`De ${money0(exp[0].v)} en ${mesLargo(first.Mes).split(" ")[0]} a ${money0(exp[exp.length - 1].v)} en ${mesLargo(last.Mes).split(" ")[0]}. Cada fila es un gasto y cada columna un mes. Los colores marcan dónde cambió: naranja si subió, azul si bajó.`}</Simple>
      <div className="tools">
        <div className="opts" role="group" aria-label="Mostrar">{MODOS.map(([k, l]) => <button key={k} className={`opt${modo === k ? " on" : ""}`} type="button" aria-pressed={modo === k} onClick={() => setModo(k)}>{l}</button>)}</div>
        <div className="opts"><button className="opt" type="button" onClick={descargar}>Descargar Excel</button></div>
      </div>
      <div className="box"><table>
        <thead><tr><th className="c">Concepto</th>{M.meses.map((p) => <th key={p.Mes}>{mesCorto(p.Mes)}</th>)}</tr></thead>
        <tbody>
          {M.filas.map((f) => (
            <tr key={f.etq} className="click" onClick={() => setAbierta(f)} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") setAbierta(f); }}>
              <td className="c">{f.etq}{f.prov && <small>{f.prov}</small>}</td>
              {f.celdas.map((c, j) => <td key={j} className={c.v === null ? "e" : c.heat}>{fmt(valorModo(M, f, j, modo))}</td>)}
            </tr>
          ))}
          {M.totales.map((f) => (
            <tr key={f.etq} className="tot"><td className="c">{f.etq}</td>{f.celdas.map((c, j) => <td key={j} className={c.heat}>{fmt(valorModo(M, f, j, modo))}</td>)}</tr>
          ))}
          {M.ipc.some((x) => x !== null) && <tr className="ref"><td className="c">IPC del mes (INDEC, solo referencia)</td>{M.ipc.map((x, j) => <td key={j}>{x === null ? "—" : pct(x)}</td>)}</tr>}
        </tbody>
      </table></div>
      <div className="legend"><span><i className="u2" />Subió más de 35%</span><span><i className="u1" />Subió entre 10% y 35%</span><span><i className="d1" />Bajó más de 10%</span><span><i className="nw" />Concepto nuevo</span><span>{modo === "importe" || modo === "lote" ? "Importes en pesos, sin centavos." : modo === "pct" ? "Parte del gasto total del mes." : "Contra el mes anterior del mismo concepto."}</span></div>
      <Foot>Toque una fila para ver el gasto mes a mes con su comprobante. La variación se mide contra el mes anterior del mismo concepto. El IPC es una referencia general, no una comparación con la expensa.</Foot>
      {abierta && <Detalle f={abierta} onClose={() => setAbierta(null)} />}
    </main>
  );
}

function Detalle({ f, onClose }: { f: FilaM; onClose: () => void }) {
  const ctx = useApp().ctx!;
  const gs = ctx.gastos.filter((g) => ctx.etiqueta(g.Concepto_Normalizado) === f.etq).sort((a, b) => String(b.Mes).localeCompare(String(a.Mes)));
  return (
    <Dialog title={f.etq} onClose={onClose} wide>
      <div className="tw"><table>
        <thead><tr><th>Liquidación</th><th>Texto de la liquidación</th><th className="r">Importe</th><th>Estado</th></tr></thead>
        <tbody>{gs.map((g) => (
          <tr key={g.ID_Gasto}><td className="num">{liq(g.Mes)}</td><td className="small">{g.Concepto_Original}{g.Observacion ? <><br /><span className="muted">{g.Observacion}</span></> : null}</td>
            <td className="r num">{money(n0(g.Importe))}</td><td className="small">{g.Estado_Pago}{g.Es_Estimado === "SI" ? " · estimado" : ""}{g.Es_Provisorio === "SI" ? " · provisorio" : ""}{g.Comprobante && g.Comprobante !== "N/D" ? ` · ${g.Comprobante}` : ""}</td></tr>
        ))}</tbody>
      </table></div>
    </Dialog>
  );
}
