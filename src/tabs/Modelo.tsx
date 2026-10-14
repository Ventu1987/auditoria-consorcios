import { useMemo, useState } from "react";
import { useApp } from "../state";
import { Card, Foot, Hero, Simple } from "../components/ui";
import { dec, liq, mesTitulo, money, money0, pct } from "../domain/format";
import { expensaModelo, modelo } from "../engine/modelo";

export default function Modelo() {
  const A = useApp(), ctx = A.ctx!;
  const M = useMemo(() => modelo(ctx), [ctx]);
  const inicial = useMemo(() => new Set(M.ajustes.filter((a) => a.aplicar).map((a) => a.id)), [M]);
  const [sel, setSel] = useState<Set<string>>(inicial);
  const E = expensaModelo(M, sel);
  const cambio = M.ajustes.some((a) => sel.has(a.id) !== a.aplicar);
  const top = M.composicion[0];
  const toggle = (id: string) => { const s = new Set(sel); if (s.has(id)) s.delete(id); else s.add(id); setSel(s); };
  const guardarSel = async () => {
    for (const a of M.ajustes) if (sel.has(a.id) !== a.aplicar) await A.post("oportunidad", { fila: { ID_Oportunidad: a.id, Aplicar_En_Modelo: sel.has(a.id) ? "SI" : "NO" } });
    await A.recargar(); A.toast("Selección guardada como predeterminada.");
  };
  return (
    <main className="main">
      <Hero eyebrow={`${ctx.nombre} · ${mesTitulo(ctx.mes)} · lote común`} title="Tu expensa, liquidada como debería"
        lead="Los mismos gastos reales del mes, ordenados y con los ajustes que el auditor eligió aplicar. No reemplaza la liquidación oficial: sirve para ver cuánto cambiaría." />
      <section className="vs">
        <div><span className="k">Liquidación oficial</span><span className="v">{money(M.oficial)}</span><span className="s">Lo que figura en el cupón</span></div>
        <div><span className="k">Expensa modelo</span><span className="v green">{money(E.modelo)}</span><span className="s">Gastos reales con {E.n} ajuste{E.n === 1 ? "" : "s"}</span></div>
        <div className="dk"><span className="k">Diferencia por lote común</span><span className="v">{money(E.diferencia)}</span><span className="s">{pct(E.pct)} de la expensa</span></div>
      </section>
      <section className="two">
        <Card title="De cada $ 100 de tu expensa">
          <div className="hb" role="img" aria-label="Composición de la expensa por rubro">
            {M.composicion.filter((c) => c.v > 0).map((c) => [
              <span key={c.rubro + "l"}>{c.rubro}</span>,
              <span className="t" key={c.rubro + "t"}><i style={{ width: `${Math.min(c.de100, 100).toFixed(2)}%` }} /></span>,
              <span className="p" key={c.rubro + "p"}>$ {dec(c.de100, 2)}</span>,
            ])}
          </div>
          {top && <Simple>{`${top.de100 > 60 ? "Casi dos tercios" : top.de100 > 45 ? "Cerca de la mitad" : `$ ${Math.round(top.de100)} de cada $ 100`} de lo que pagás es ${top.rubro.toLowerCase().replace(/ \(.*\)$/, "")}. Por eso los ajustes sobre ese rubro son los que más pesan.`}</Simple>}
        </Card>
        <Card title="Ajustes" aside={A.puedeEditar && cambio ? <button className="btn sm" type="button" onClick={guardarSel}>Guardar selección</button> : undefined}>
          {M.ajustes.length ? <div className="adj">{M.ajustes.map((a) => (
            <label key={a.id}><input type="checkbox" checked={sel.has(a.id)} onChange={() => toggle(a.id)} />
              <span>{a.titulo}<small>{a.detalle}{a.tipo === "RECLASIFICACIÓN" ? " · no es un ahorro: cambia de dónde sale la plata" : ""}</small></span>
              <span className="num">{a.porLote === null ? "[a definir]" : `−${money0(a.porLote)}`}</span></label>
          ))}</div> : <p className="small muted">Todavía no hay ajustes. Se cargan en la pestaña Optimización.</p>}
          <p className="small muted">Importes por lote común (ahorro mensual × coeficiente {ctx.coef ? dec(ctx.coef * 100, 4) : "N/D"}%). Cualquiera puede probar combinaciones; el auditor elige cuáles quedan marcadas.</p>
        </Card>
      </section>
      <Foot>Gasto real del mes: {money(+ctx.per.Total_Gastos_Periodo)} (liquidación {liq(ctx.mes)}). Coeficiente del lote común: {ctx.coef ? dec(ctx.coef * 100, 4) : "N/D"}% (expensa ÷ total repartido).</Foot>
    </main>
  );
}
