/* pdf.js 3.11 (la misma versión con la que se probó el lector de liquidaciones del portal v7). Se carga solo al usarlo. */
let p: Promise<any> | null = null;
export function pdfjs(): Promise<any> {
  return (p = p || Promise.all([import("pdfjs-dist/build/pdf"), import("pdfjs-dist/build/pdf.worker.min.js?url")]).then(([lib, w]: any[]) => {
    const L = lib.default?.getDocument ? lib.default : lib;
    L.GlobalWorkerOptions.workerSrc = w.default;
    return L;
  }));
}
export async function xlsx(): Promise<any> {
  const X: any = await import("xlsx");
  const L = X.read ? X : X.default;
  (window as any).XLSX = L; // el lector de extractos del portal v7 lo busca acá
  return L;
}
export const aBase64 = (buf: ArrayBuffer) => {
  let s = ""; const b = new Uint8Array(buf), CH = 0x8000;
  for (let i = 0; i < b.length; i += CH) s += String.fromCharCode.apply(null, Array.from(b.subarray(i, i + CH)));
  return btoa(s);
};
