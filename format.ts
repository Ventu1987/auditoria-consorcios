/* Formatos en castellano rioplatense. Los importes nunca se redondean salvo donde se dice (columnas "sin centavos"). */
const MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MES3 = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const MINUS = "−";

/** Número o null. "", "N/D", "REVISAR" y textos no numéricos devuelven null. */
export function num(v: unknown): number | null {
  if (v === "" || v === null || v === undefined) return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  const s = String(v).trim();
  if (!/^[-+]?\$?\s*[\d.,]+$/.test(s.replace(/\s/g, ""))) return null;
  const x = Number(s.replace(/[$\s]/g, ""));
  return isFinite(x) ? x : null;
}
export const n0 = (v: unknown) => num(v) ?? 0;
/** Suma con redondeo a centavos (evita 0,30000000004). */
export const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;
export const r2 = (v: number) => Math.round(v * 100) / 100;

const fmt2 = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

/** $ 1.234,56 · −$ 46,37 · con sign: +$ 21.716,49 */
export function money(v: number | null | undefined, opt: { sign?: boolean; cents?: boolean } = {}): string {
  if (v === null || v === undefined || !isFinite(v)) return "N/D";
  const cents = opt.cents !== false;
  const a = Math.abs(v), body = "$ " + (cents ? fmt2.format(a) : fmt0.format(Math.round(a)));
  const zero = cents ? Math.abs(v) < 0.005 : Math.round(Math.abs(v)) === 0;
  if (zero) return opt.sign ? body : body;
  if (v < 0) return MINUS + body;
  return (opt.sign ? "+" : "") + body;
}
export const money0 = (v: number | null | undefined, sign = false) => money(v, { cents: false, sign });
/** 5.374.516 (sin signo $ ni centavos, para matrices). */
export const int0 = (v: number | null | undefined) => (v === null || v === undefined ? "N/D" : (v < 0 ? MINUS : "") + fmt0.format(Math.round(Math.abs(v))));
/** 0,034 → +3,4% */
export function pct(v: number | null | undefined, opt: { dec?: number; sign?: boolean } = {}): string {
  if (v === null || v === undefined || !isFinite(v)) return "N/D";
  const dec = opt.dec ?? 1, x = v * 100;
  const s = new Intl.NumberFormat("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(Math.abs(x));
  const isZero = Number(Math.abs(x).toFixed(dec)) === 0;
  return (x < 0 && !isZero ? MINUS : opt.sign && !isZero ? "+" : "") + s + "%";
}
export const dec = (v: number, d = 2) => new Intl.NumberFormat("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);

/* ---------- meses ---------- */
export const mesNombre = (m: string) => MES[+m.slice(5, 7) - 1] || m;
export const mesLargo = (m: string) => `${mesNombre(m)} ${m.slice(0, 4)}`;
export const mesTitulo = (m: string) => { const s = mesLargo(m); return s.charAt(0).toUpperCase() + s.slice(1); };
export const mesCorto = (m: string) => MES3[+m.slice(5, 7) - 1] || m;
export const liq = (m: string) => `${m.slice(5, 7)}/${m.slice(0, 4)}`;
export function addMes(m: string, k: number): string {
  let y = +m.slice(0, 4), mm = +m.slice(5, 7) + k;
  while (mm < 1) { mm += 12; y--; }
  while (mm > 12) { mm -= 12; y++; }
  return `${y}-${String(mm).padStart(2, "0")}`;
}
/** Último día del mes: "2026-09" → "2026-09-30" */
export function finDeMes(m: string): string {
  const y = +m.slice(0, 4), mm = +m.slice(5, 7);
  return `${m}-${String(new Date(y, mm, 0).getDate()).padStart(2, "0")}`;
}
/** "2026-09-15" → "15/09" */
export const ddmm = (f: string) => { const x = String(f || "").match(/(\d{4})-(\d{2})-(\d{2})/); return x ? `${x[3]}/${x[2]}` : "N/D"; };
export const ddmmaa = (f: string) => { const x = String(f || "").match(/(\d{4})-(\d{2})-(\d{2})/); return x ? `${x[3]}/${x[2]}/${x[1]}` : "N/D"; };
/** Fracción de mes en palabras para "Doña Rosa". */
export function fraccionMes(x: number): string {
  if (!isFinite(x)) return "N/D";
  if (x < 0.15) return "menos de una semana de gastos";
  if (Math.abs(x - 0.25) < 0.08) return "un cuarto de mes de gastos";
  if (Math.abs(x - 0.5) < 0.08) return "medio mes de gastos";
  if (Math.abs(x - 0.75) < 0.08) return "tres cuartos de mes de gastos";
  if (Math.abs(x - 1) < 0.08) return "un mes de gastos";
  return `${dec(x, 1)} meses de gastos`;
}
/** Une una lista: "a, b y c" */
export function lista(xs: string[]): string {
  if (xs.length <= 1) return xs.join("");
  return xs.slice(0, -1).join(", ") + " y " + xs[xs.length - 1];
}
/** Texto del motor de auditoría: escapa todo y deja solo <b>. */
export function htmlSeguro(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/&lt;(\/?)b&gt;/g, "<$1b>");
}
export const sinHtml = (s: string) => String(s ?? "").replace(/<[^>]+>/g, "");
export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
