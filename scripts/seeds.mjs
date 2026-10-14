/* Catálogos iniciales. Se usan para los datos de demostración y se copian a apps-script/semillas.gs
   (la migración los carga en la planilla nueva). Todo sale de la auditoría ya hecha; el auditor lo puede editar en la app. */
const C = (Concepto_Normalizado, Etiqueta, Rubro_Modelo, Es_Servicio = "NO", Notas = "") => ({ Concepto_Normalizado, Etiqueta, Es_Servicio, Rubro_Modelo, Notas });
export const conceptos = [
  C("Servicio de seguridad / vigilancia", "Seguridad", "Seguridad (con la obra de cámaras)"),
  C("Obra de cámaras (obra civil)", "Obra de cámaras", "Seguridad (con la obra de cámaras)"),
  C("Equipamiento CCTV (PC, monitores, UPS)", "Equipo de monitoreo", "Seguridad (con la obra de cámaras)"),
  C("Bidones de agua garita", "Bidones de agua", "Seguridad (con la obra de cámaras)"),
  C("Mantenimiento Fideicomiso - espacios propios 80%", "Mantenimiento propios 80%", "Mantenimiento"),
  C("Mantenimiento Fideicomiso - espacios comunes 20%", "Mantenimiento comunes 20%", "Mantenimiento"),
  C("Caja chica Fideicomiso", "Caja chica", "Mantenimiento"),
  C("Control de plagas / desratización", "Control de plagas", "Mantenimiento"),
  C("Reparación - control remoto (materiales + M.O.)", "Reparación control remoto", "Mantenimiento"),
  C("Honorarios administración", "Honorarios de administración", "Administración y bancos"),
  C("Gastos bancarios - Roela", "Gastos bancarios Roela", "Administración y bancos"),
  C("Gastos bancarios - Galicia", "Gastos bancarios Galicia", "Administración y bancos"),
  C("Sistema AdminProp", "Sistema AdminProp", "Administración y bancos"),
  C("Electricidad - EDENOR", "Luz del barrio (EDENOR)", "Luz", "SI"),
  C("Electricidad sectores comunes - Fideicomiso", "Luz sectores comunes", "Luz", "SI"),
  C("Telered", "Telered", "Internet de las cámaras", "SI"),
  C("Seguro responsabilidad civil", "Seguro de responsabilidad civil", "Seguro"),
  C("Impuesto inmobiliario ARBA (plan de pagos)", "ARBA plan de pagos", "Impuestos"),
  C("Impuesto inmobiliario ARBA (cuota anual del predio)", "ARBA cuota anual", "Impuestos"),
];
export const parametros = [
  ["Semaforo_Base", "MEDIANA", "Contra qué se compara cada servicio: MEDIANA o PROMEDIO de los meses anteriores (sin estimados ni provisorios)."],
  ["Semaforo_Meses", 6, "Cuántos meses anteriores se miran."],
  ["Semaforo_Amarillo", 0.2, "Desde qué suba un servicio se pinta amarillo (0,20 = 20%)."],
  ["Semaforo_Rojo", 0.35, "Desde qué suba un servicio se pinta rojo."],
  ["Tolerancia_Redondeo", 1, "Diferencia en pesos que se considera redondeo en los controles."],
  ["Plazo_Respuesta_Dias", 10, "Días hábiles que se dan a la administración para responder."],
  ["Mail_Para", "RyM Administración", "Destinatario del mail."],
  ["Nombres_Excluir", "", "Nombres (separados por coma) que nunca se publican, además de los que la app detecta solos."],
].map(([Clave, Valor, Descripcion]) => ({ Clave, Valor, Descripcion }));
const O = (o) => ({ Barrio: "S2", Mes: "2026-10", Tipo: "AHORRO", Origen: "AUTOMÁTICO", Aplicar_En_Modelo: "SI", Actualizado: "2026-10-14", Usuario: "migración", Regla: "", ID_Hallazgo: "", ...o });
export const oportunidades = [
  O({ ID_Oportunidad: "O001", Concepto: "Seguridad compartida con Senderos I", Hoy: "50% de la factura para cada barrio ($ 5.918.162,43 en septiembre)", Propuesta: "Repartir por cantidad de lotes: 18 de 39",
      Ahorro_Mensual: 455243.26, Prioridad: "ALTA", Estado: "PLANTEADA", Regla: "SEG_LOTES", Ajuste_Titulo: "Seguridad repartida por lotes con Senderos I", Ajuste_Detalle: "18 de 39 lotes en vez de mitad y mitad", ID_Hallazgo: "H08" }),
  O({ ID_Oportunidad: "O002", Concepto: "Telered", Hoy: "$ 567.600 por mes, entero a Senderos II", Propuesta: "El abono informado de $ 100.000 y reparto con Senderos I",
      Ahorro_Mensual: 467600, Prioridad: "ALTA", Estado: "PLANTEADA", Regla: "TELERED_INFORMADO", Ajuste_Titulo: "Telered al abono informado de $ 100.000", Ajuste_Detalle: "Lo que la administración escribió el 10/09", ID_Hallazgo: "H26" }),
  O({ ID_Oportunidad: "O003", Concepto: "Personal de administración en el mantenimiento", Hoy: "3 personas en efectivo, sin retenciones", Propuesta: "Excluirlas, como a la empleada administrativa",
      Ahorro_Mensual: 153120, Prioridad: "MEDIA", Estado: "PROPUESTA", Regla: "PERSONAL_ADM", Ajuste_Titulo: "Sin el personal de administración en el mantenimiento", Ajuste_Detalle: "Mismo criterio que la empleada excluida", ID_Hallazgo: "H29" }),
  O({ ID_Oportunidad: "O004", Concepto: "Caja chica sin factura", Hoy: "$ 551.500 de presupuestos y notas \"X\" en la base", Propuesta: "Aceptar solo comprobantes fiscales",
      Ahorro_Mensual: 70399, Prioridad: "MEDIA", Estado: "PROPUESTA", Regla: "CAJA_CHICA", Ajuste_Titulo: "Caja chica solo con comprobantes fiscales", Ajuste_Detalle: "Sin presupuestos ni notas \"X\"", ID_Hallazgo: "H31" }),
  O({ ID_Oportunidad: "O005", Concepto: "Luz del Fideicomiso", Hoy: "$ 498.204: 8,6% de dos cuentas, una industrial", Propuesta: "Excluir la cuenta industrial e informar el criterio",
      Ahorro_Mensual: "", Prioridad: "MEDIA", Estado: "PROPUESTA", Origen: "AUDITOR", Ajuste_Titulo: "Sin la luz industrial del Fideicomiso", Ajuste_Detalle: "Falta el criterio de reparto", ID_Hallazgo: "H28" }),
  O({ ID_Oportunidad: "O006", Concepto: "Gastos bancarios Roela", Hoy: "$ 519.171,01, +39,4% sobre el promedio de 3 meses", Propuesta: "Revisar comisiones de cobranza y cuenta a nombre del barrio",
      Ahorro_Mensual: "", Prioridad: "BAJA", Estado: "PROPUESTA", Regla: "SUBA_CONCEPTO", Aplicar_En_Modelo: "NO", Ajuste_Titulo: "Gastos bancarios Roela al promedio", Ajuste_Detalle: "" }),
  O({ ID_Oportunidad: "O007", Tipo: "RECLASIFICACIÓN", Concepto: "Obra de cámaras como gasto extraordinario", Hoy: "$ 1.344.000 cargados como gasto ordinario", Propuesta: "Pagarla con el fondo extraordinario ($ 1.659.305,82)",
      Ahorro_Mensual: 1344000, Prioridad: "MEDIA", Estado: "PROPUESTA", Regla: "OBRA_ORDINARIA", Aplicar_En_Modelo: "NO", Ajuste_Titulo: "Obra de cámaras como gasto extraordinario", Ajuste_Detalle: "Pagada con el fondo extraordinario ($ 1.659.305,82)", ID_Hallazgo: "H30" }),
];
/* Reglas de normalización que se agregan a las de la planilla vieja (clave contenida más larga gana). */
export const reglas = [
  { ID_Regla: "N020", Texto_Clave_Contiene: "PORTÓN", CUIT: "N/D", ID_Proveedor: "", Concepto_Normalizado: "Reparación portón vehicular", Categoria: "MANTENIMIENTO", Subcategoria: "Reparaciones", Tipo_Gasto: "REPARACIÓN", Observacion: "La Huella 08/2026." },
];
conceptos.push({ Concepto_Normalizado: "Reparación portón vehicular", Etiqueta: "Reparación del portón", Es_Servicio: "NO", Rubro_Modelo: "Mantenimiento", Notas: "" });
