/** URL de la API (Apps Script). Es la misma implementación del portal anterior: al pegar el código nuevo en ese proyecto la URL no cambia. */
export const API_URL = "https://script.google.com/macros/s/AKfycbxkYAGwgYNEQuyZAYl6Aft6ZDMhQnTZGnTHpWHg2zNdj8JOBIRXIRWwuUbx7fOB93cl/exec";

export const BARRIOS_APP = [
  { id: "S2", nombre: "Senderos II" },
  { id: "S1", nombre: "Senderos I" },
  { id: "LH", nombre: "La Huella" },
] as const;

export const TABS = [
  { id: "dashboard", n: 1, label: "Dashboard" },
  { id: "comparativo", n: 2, label: "Comparativo" },
  { id: "respaldo", n: 3, label: "Respaldo" },
  { id: "optimizacion", n: 4, label: "Optimización" },
  { id: "matriz", n: 5, label: "Matriz histórica" },
  { id: "modelo", n: 6, label: "Expensa modelo" },
  { id: "reporte", n: 7, label: "Reporte / Mail" },
] as const;
export type TabId = (typeof TABS)[number]["id"] | "resumen" | "cargar" | "ingresar";
