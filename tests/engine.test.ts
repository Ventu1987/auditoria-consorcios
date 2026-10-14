/* Pruebas con los datos reales y públicos de Senderos II (liquidaciones 05 a 10/2026). Cada cifra se verificó a mano contra la liquidación. */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import type { Dataset } from "../src/domain/types";
import { buildCtx } from "../src/engine/ctx";
import { controles } from "../src/engine/controles";
import { comparativo, semaforo } from "../src/engine/comparativo";
import { morosidad, plataLibre, fondoReserva } from "../src/engine/fondos";
import { respaldo, indicadores } from "../src/engine/respaldo";
import { matriz } from "../src/engine/matriz";
import { modelo, expensaModelo } from "../src/engine/modelo";
import { optimizacion } from "../src/engine/optimizacion";
import { transparencia } from "../src/engine/transparencia";
import { armarMail, sumarHabiles } from "../src/engine/mail";
import { hallazgosDe } from "../src/engine/hallazgos";
import { titular, explicacion } from "../src/engine/textos";
import { money, pct } from "../src/domain/format";

const ds: Dataset = JSON.parse(fs.readFileSync(new URL("../public/demo/S2.json", import.meta.url), "utf8"));
const ctx = buildCtx(ds, "S2", "2026-10")!;
const c2 = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100);

describe("formatos", () => {
  it("importes y porcentajes", () => {
    expect(money(-46.37)).toBe("−$ 46,37");
    expect(money(21716.49, { sign: true })).toBe("+$ 21.716,49");
    expect(pct(0.0342454)).toBe("3,4%");
  });
});

describe("Dashboard de octubre 2026", () => {
  it("controles de la liquidación", () => {
    const cs = Object.fromEntries(controles(ctx).map((c) => [c.id, c]));
    expect(cs.suma.estado).toBe("Cierra");
    expect(c2(cs.reparto.dif)).toBe(-46.37);
    expect(cs.reparto.estado).toBe("Redondeo");
    expect(cs.continuidad.estado).toBe("Cierra");
    expect(cs.caja.estado).toBe("Cierra");
    expect(c2(cs.egresos.calc)).toBe(6624385.27);
    expect(c2(cs.egresos.dif)).toBe(27714.23);
    expect(cs.egresos.estado).toBe("A revisar");
    expect(c2(cs.pendientes.calc)).toBe(8475574.96);
    expect(c2(cs.pendientes.dif)).toBe(3654176.39);
    expect(c2(cs.patrimonio.calc)).toBe(21829954.56);
    expect(c2(cs.banco.calc)).toBe(8596500.3);
    expect(c2(cs.banco.dif)).toBe(-4964585.84);
    expect(controles(ctx).filter((c) => c.sev === "bad").length).toBe(3);
  });
  it("plata libre, morosidad y fondo de reserva", () => {
    const p = plataLibre(ctx);
    expect(c2(p.libre)).toBe(851338.85);
    const m = morosidad(ctx);
    expect(m.conDeuda).toBe(4);
    expect(Math.round(m.porLoteAlDia!)).toBe(416357);
    expect(c2(m.previsionPrev!.total)).toBe(1627054.66);
    expect(Math.round(m.previsionPrev!.porLote!)).toBe(92184);
    expect(fondoReserva(ctx).informado).toBe(false);
  });
  it("titular", () => {
    const t = titular(ctx, comparativo(ctx), controles(ctx));
    expect(t.lead).toContain("3,4% más que en septiembre");
    expect(t.lead).toContain("$ 1.627.054,66 de más");
    expect(t.lead).toContain("3 controles que no cierran");
  });
});

describe("Comparativo", () => {
  const C = comparativo(ctx);
  it("totales y conceptos nuevos", () => {
    expect(c2(C.difTotal)).toBe(2010397.45);
    expect(C.nuevos.map((f) => f.etq).sort()).toEqual(["ARBA cuota anual", "Luz sectores comunes", "Obra de cámaras"]);
    expect(c2(C.nuevos.reduce((s, f) => s + (f.cur || 0), 0))).toBe(1857339.52);
    expect(C.noRepiten.map((f) => f.etq).sort()).toEqual(["ARBA plan de pagos", "Reparación control remoto"]);
  });
  it("variaciones de Telered y seguridad", () => {
    const tel = C.filas.find((f) => f.etq === "Telered")!;
    expect(pct(tel.vsPrev!, { sign: true })).toBe("+194,3%");
    expect(pct(tel.vsProm3!, { sign: true })).toBe("+198,4%");
    const seg = C.filas.find((f) => f.etq === "Seguridad")!;
    expect(pct(seg.vsProm3!, { sign: true })).toBe("+3,1%");
    expect(explicacion(C).titulo).toBe("El gasto subió $ 2.010.397,45.");
  });
  it("semáforo de servicios (mediana sin estimados ni provisorios)", () => {
    const s = Object.fromEntries(semaforo(ctx).map((x) => [x.etq, x]));
    expect(s.Telered.base).toBe(192855);
    expect(s.Telered.sev).toBe("bad");
    expect(c2(s["Luz del barrio (EDENOR)"].cur)).toBe(515838.02);
    expect(c2(s["Luz del barrio (EDENOR)"].base)).toBe(453537.35);
    expect(pct(s["Luz del barrio (EDENOR)"].desvio!, { sign: true })).toBe("+13,7%");
    expect(s["Luz sectores comunes"].sev).toBe("new");
  });
});

describe("Respaldo", () => {
  const R = respaldo(ctx);
  it("reparto del gasto por tipo de respaldo", () => {
    expect(c2(R.tot.coincide)).toBe(3706958.01);
    expect(c2(R.tot.nocoincide)).toBe(6368867.94);
    expect(c2(R.tot.sin)).toBe(1404210.86);
    expect(c2(R.tot.parcial)).toBe(95928.98);
    expect(pct(R.share.coincide)).toBe("32,0%");
  });
  it("seguridad cobrada por encima de la factura: 3% de IIBB", () => {
    const seg = R.filas.find((f) => f.etq === "Seguridad")!;
    expect(seg.fLabel).toBe("No coincide");
    expect(seg.notas.map((n) => n.txt).join(" ")).toContain("$ 142.276,07");
  });
  it("salidas del banco de septiembre sin gasto", () => {
    expect(R.mesBanco).toBe("2026-09");
    expect(R.salidas.some((s) => Math.round(s.v) === 1135200)).toBe(true);
    expect(R.salidas.some((s) => Math.round(s.v) === 1120000)).toBe(true);
  });
  it("indicadores con clave estable", () => {
    const I = indicadores(ctx);
    expect(I.length).toBeGreaterThan(5);
    expect(new Set(I.map((i: any) => i.clave)).size).toBe(I.length);
  });
});

describe("Matriz, modelo y optimización", () => {
  it("matriz de 5 meses", () => {
    const M = matriz(ctx);
    expect(M.meses.map((p) => p.Mes)).toEqual(["2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(pct(M.varExpensa!)).toBe("33,4%");
    const tel = M.filas.find((f) => f.etq === "Telered")!;
    expect(tel.celdas.map((c) => c.heat)).toEqual(["", "d1", "", "", "u2"]);
  });
  it("expensa modelo", () => {
    const m = modelo(ctx);
    const seg = m.composicion.find((x) => x.rubro.startsWith("Seguridad"))!;
    expect(seg.de100.toFixed(2)).toBe("62.86");
    const elegidos = new Set(m.ajustes.filter((a) => a.aplicar).map((a) => a.id));
    const e = expensaModelo(m, elegidos);
    expect(e.n).toBe(4);
    expect(Math.round(e.diferencia!)).toBe(64950);
    const obra = m.ajustes.find((a) => a.id === "O007")!;
    expect(Math.round(obra.porLote!)).toBe(76147);
  });
  it("optimización", () => {
    const o = optimizacion(ctx);
    expect(Math.round(o.ahorroMes)).toBe(1146362);
    expect(Math.round(o.porLote!)).toBe(64950);
    expect(o.planteadas).toBe(2);
    const seg = o.porBarrio.find((x) => x.concepto === "Seguridad")!.valores.find((v) => v.barrio === "S2")!;
    expect(Math.round(seg.v!)).toBe(326708);
  });
});

describe("Transparencia y mail", () => {
  it("índice entre 0 y 100", () => {
    const t = transparencia(ctx, controles(ctx), respaldo(ctx));
    expect(t.puntaje).toBeGreaterThanOrEqual(0);
    expect(t.puntaje).toBeLessThanOrEqual(100);
  });
  it("días hábiles", () => { expect(sumarHabiles("2026-10-14", 10)).toBe("2026-10-28"); });
  it("mail con origen, documentos, inconsistencia y pedido", () => {
    const hs = hallazgosDe(ctx).slice(0, 3);
    const m = armarMail(hs, { barrioNombre: "Senderos II", para: "RyM Administración", tono: "formal", plazo: 10, firma: "", hoy: "2026-10-14" });
    expect(m.cuerpo).toContain("Qué muestran los documentos:");
    expect(m.cuerpo).toContain("Qué deben responder:");
    expect(m.asunto).toContain("Senderos II");
  });
});

describe("Privacidad de los datos publicados", () => {
  const txt = JSON.stringify(ds);
  it("no hay padrón, deuda por unidad ni nombres de archivo del propietario", () => {
    for (const s of ["PADRON_PRIVADO", "PRORRATEO", "MOROSIDAD", "CUPON_UNIDAD", "USUARIOS", "LOG"]) expect(ds.sheets[s]).toBeUndefined();
    expect(txt).not.toMatch(/facundovega/i);
    expect(txt).not.toMatch(/lotes? \d+\s*(,|y)\s*\d+/i);
  });
  it("CUIT de personas físicas enmascarados (salvo el administrador)", () => {
    const cuits = txt.match(/\b2[0347]-?\d{8}-?\d\b/g) || [];
    expect(cuits.every((c) => c.replace(/\D/g, "") === "20257876366")).toBe(true);
  });
});

describe("La Huella (liquidaciones 08 a 10/2026)", () => {
  const lh: Dataset = JSON.parse(fs.readFileSync(new URL("../public/demo/LH.json", import.meta.url), "utf8"));
  const c = buildCtx(lh, "LH", "2026-10")!;
  it("controles: se repartió de más y falta deuda en el patrimonio", () => {
    const cs = Object.fromEntries(controles(c).map((x) => [x.id, x]));
    expect(c2(cs.reparto.dif)).toBe(956782.24);
    expect(c2(cs.pendientes.dif)).toBe(3289068.61);
    expect(c2(cs.sinDetalle.dif)).toBe(11500000);
    expect(cs.banco.estado).toBe("Sin datos");
  });
  it("morosidad y previsión de septiembre", () => {
    const m = morosidad(c);
    expect(m.conDeuda).toBe(6);
    expect(c2(m.previsionPrev!.total)).toBe(1823565.32);
    expect(Math.round(m.previsionPrev!.porLote!)).toBe(86836);
  });
  it("sin respaldos cargados el respaldo queda N/D", () => {
    const R = respaldo(c);
    expect(R.nComp).toBe(0);
    expect(transparencia(c, controles(c), R).parcial).toBe(true);
  });
  it("luz: dos meses facturados juntos se comparan por mes", () => {
    const s = Object.fromEntries(semaforo(c).map((x) => [x.etq, x]));
    expect(c2(s["Luz del barrio (EDENOR)"].base)).toBe(523022.6);
  });
  it("titular cuando la expensa baja", () => {
    expect(titular(c, comparativo(c), controles(c)).lead).toContain("pero la expensa bajó porque en septiembre");
  });
});

describe("Mes guardado como fecha por Sheets", () => {
  it("serial 46296 y fecha completa vuelven a AAAA-MM", async () => {
    const { normalizar, nombreLiq } = await import("../src/domain/normalizar");
    const { mesTitulo } = await import("../src/domain/format");
    const d = normalizar({ version: 1, updated: "", barrio: "S2", sheets: { PERIODOS: [{ ID_Periodo: "S2-2026-10", Mes: 46296 }, { Mes: "46296" }, { Mes: "2026-09-01" }] } } as any);
    expect(d.sheets.PERIODOS.map((p) => p.Mes)).toEqual(["2026-10", "2026-10", "2026-09"]);
    expect(nombreLiq(d.sheets.PERIODOS[0], mesTitulo)).toBe("Octubre 2026");
    expect(nombreLiq({ Mes: "2026-10", Titulo: "46296 4629" }, mesTitulo)).toBe("46296 4629");
  });
});
