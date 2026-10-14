/* Catálogos iniciales generados por scripts/build-demo.mjs. Los carga migrarDesdePlanillaVieja() (no pisa lo existente). */
var SEMILLAS = {
 "conceptos": [
  {
   "Concepto_Normalizado": "Servicio de seguridad / vigilancia",
   "Etiqueta": "Seguridad",
   "Es_Servicio": "NO",
   "Rubro_Modelo": "Seguridad (con la obra de cámaras)",
   "Notas": ""
  },
  {
   "Concepto_Normalizado": "Obra de cámaras (obra civil)",
   "Etiqueta": "Obra de cámaras",
   "Es_Servicio": "NO",
   "Rubro_Modelo": "Seguridad (con la obra de cámaras)",
   "Notas": ""
  },
  {
   "Concepto_Normalizado": "Equipamiento CCTV (PC, monitores, UPS)",
   "Etiqueta": "Equipo de monitoreo",
   "Es_Servicio": "NO",
   "Rubro_Modelo": "Seguridad (con la obra de cámaras)",
   "Notas": ""
  },
  {
   "Concepto_Normalizado": "Bidones de agua garita",
   "Etiqueta": "Bidones de agua",
   "Es_Servicio": "NO",
   "Rubro_Modelo": "Seguridad (con la obra de cámaras)",
   "Notas": ""
  },
  {
   "Concepto_Normalizado": "Mantenimiento Fideicomiso - espacios propios 80%",
   "Etiqueta": "Mantenimiento propios 80%",
   "Es_Servicio": "NO",
   "Rubro_Modelo": "Mantenimiento",
   "Notas": ""
  },
  {
   "Concepto_Normalizado": "Mantenimiento Fideicomiso - espacios comunes 20%",
   "Etiqueta": "Mantenimiento comunes 20%",
   "Es_Servicio": "NO",
   "Rubro_Modelo": "Mantenimiento",
   "Notas": ""
  },
  {
   "Concepto_Normalizado": "Caja chica Fideicomiso",
   "Etiqueta": "Caja chica",
   "Es_Servicio": "NO",
   "Rubro_Modelo": "Mantenimiento",
   "Notas": ""
  },
  {
   "Concepto_Normalizado": "Control de plagas / desratización",
   "Etiqueta": "Control de plagas",
   "Es_Servicio": "NO",
   "Rubro_Modelo": "Mantenimiento",
   "Notas": ""
  },
  {
   "Concepto_Normalizado": "Reparación - control remoto (materiales + M.O.)",
   "Etiqueta": "Reparación control remoto",
   "Es_Servicio": "NO",
   "Rubro_Modelo": "Mantenimiento",
   "Notas": ""
  },
  {
   "Concepto_Normalizado": "Honorarios administración",
   "Etiqueta": "Honorarios de administración",
   "Es_Servicio": "NO",
   "Rubro_Modelo": "Administración y bancos",
   "Notas": ""
  },
  {
   "Concepto_Normalizado": "Gastos bancarios - Roela",
   "Etiqueta": "Gastos bancarios Roela",
   "Es_Servicio": "NO",
   "Rubro_Modelo": "Administración y bancos",
   "Notas": ""
  },
  {
   "Concepto_Normalizado": "Gastos bancarios - Galicia",
   "Etiqueta": "Gastos bancarios Galicia",
   "Es_Servicio": "NO",
   "Rubro_Modelo": "Administración y bancos",
   "Notas": ""
  },
  {
   "Concepto_Normalizado": "Sistema AdminProp",
   "Etiqueta": "Sistema AdminProp",
   "Es_Servicio": "NO",
   "Rubro_Modelo": "Administración y bancos",
   "Notas": ""
  },
  {
   "Concepto_Normalizado": "Electricidad - EDENOR",
   "Etiqueta": "Luz del barrio (EDENOR)",
   "Es_Servicio": "SI",
   "Rubro_Modelo": "Luz",
   "Notas": ""
  },
  {
   "Concepto_Normalizado": "Electricidad sectores comunes - Fideicomiso",
   "Etiqueta": "Luz sectores comunes",
   "Es_Servicio": "SI",
   "Rubro_Modelo": "Luz",
   "Notas": ""
  },
  {
   "Concepto_Normalizado": "Telered",
   "Etiqueta": "Telered",
   "Es_Servicio": "SI",
   "Rubro_Modelo": "Internet de las cámaras",
   "Notas": ""
  },
  {
   "Concepto_Normalizado": "Seguro responsabilidad civil",
   "Etiqueta": "Seguro de responsabilidad civil",
   "Es_Servicio": "NO",
   "Rubro_Modelo": "Seguro",
   "Notas": ""
  },
  {
   "Concepto_Normalizado": "Impuesto inmobiliario ARBA (plan de pagos)",
   "Etiqueta": "ARBA plan de pagos",
   "Es_Servicio": "NO",
   "Rubro_Modelo": "Impuestos",
   "Notas": ""
  },
  {
   "Concepto_Normalizado": "Impuesto inmobiliario ARBA (cuota anual del predio)",
   "Etiqueta": "ARBA cuota anual",
   "Es_Servicio": "NO",
   "Rubro_Modelo": "Impuestos",
   "Notas": ""
  },
  {
   "Concepto_Normalizado": "Reparación portón vehicular",
   "Etiqueta": "Reparación del portón",
   "Es_Servicio": "NO",
   "Rubro_Modelo": "Mantenimiento",
   "Notas": ""
  }
 ],
 "parametros": [
  {
   "Clave": "Semaforo_Base",
   "Valor": "MEDIANA",
   "Descripcion": "Contra qué se compara cada servicio: MEDIANA o PROMEDIO de los meses anteriores (sin estimados ni provisorios)."
  },
  {
   "Clave": "Semaforo_Meses",
   "Valor": 6,
   "Descripcion": "Cuántos meses anteriores se miran."
  },
  {
   "Clave": "Semaforo_Amarillo",
   "Valor": 0.2,
   "Descripcion": "Desde qué suba un servicio se pinta amarillo (0,20 = 20%)."
  },
  {
   "Clave": "Semaforo_Rojo",
   "Valor": 0.35,
   "Descripcion": "Desde qué suba un servicio se pinta rojo."
  },
  {
   "Clave": "Tolerancia_Redondeo",
   "Valor": 1,
   "Descripcion": "Diferencia en pesos que se considera redondeo en los controles."
  },
  {
   "Clave": "Plazo_Respuesta_Dias",
   "Valor": 10,
   "Descripcion": "Días hábiles que se dan a la administración para responder."
  },
  {
   "Clave": "Mail_Para",
   "Valor": "RyM Administración",
   "Descripcion": "Destinatario del mail."
  },
  {
   "Clave": "Nombres_Excluir",
   "Valor": "",
   "Descripcion": "Nombres (separados por coma) que nunca se publican, además de los que la app detecta solos."
  }
 ],
 "oportunidades": [
  {
   "Barrio": "S2",
   "Mes": "2026-10",
   "Tipo": "AHORRO",
   "Origen": "AUTOMÁTICO",
   "Aplicar_En_Modelo": "SI",
   "Actualizado": "2026-10-14",
   "Usuario": "migración",
   "Regla": "SEG_LOTES",
   "ID_Hallazgo": "H08",
   "ID_Oportunidad": "O001",
   "Concepto": "Seguridad compartida con Senderos I",
   "Hoy": "50% de la factura para cada barrio ($ 5.918.162,43 en septiembre)",
   "Propuesta": "Repartir por cantidad de lotes: 18 de 39",
   "Ahorro_Mensual": 455243.26,
   "Prioridad": "ALTA",
   "Estado": "PLANTEADA",
   "Ajuste_Titulo": "Seguridad repartida por lotes con Senderos I",
   "Ajuste_Detalle": "18 de 39 lotes en vez de mitad y mitad"
  },
  {
   "Barrio": "S2",
   "Mes": "2026-10",
   "Tipo": "AHORRO",
   "Origen": "AUTOMÁTICO",
   "Aplicar_En_Modelo": "SI",
   "Actualizado": "2026-10-14",
   "Usuario": "migración",
   "Regla": "TELERED_INFORMADO",
   "ID_Hallazgo": "H26",
   "ID_Oportunidad": "O002",
   "Concepto": "Telered",
   "Hoy": "$ 567.600 por mes, entero a Senderos II",
   "Propuesta": "El abono informado de $ 100.000 y reparto con Senderos I",
   "Ahorro_Mensual": 467600,
   "Prioridad": "ALTA",
   "Estado": "PLANTEADA",
   "Ajuste_Titulo": "Telered al abono informado de $ 100.000",
   "Ajuste_Detalle": "Lo que la administración escribió el 10/09"
  },
  {
   "Barrio": "S2",
   "Mes": "2026-10",
   "Tipo": "AHORRO",
   "Origen": "AUTOMÁTICO",
   "Aplicar_En_Modelo": "SI",
   "Actualizado": "2026-10-14",
   "Usuario": "migración",
   "Regla": "PERSONAL_ADM",
   "ID_Hallazgo": "H29",
   "ID_Oportunidad": "O003",
   "Concepto": "Personal de administración en el mantenimiento",
   "Hoy": "3 personas en efectivo, sin retenciones",
   "Propuesta": "Excluirlas, como a la empleada administrativa",
   "Ahorro_Mensual": 153120,
   "Prioridad": "MEDIA",
   "Estado": "PROPUESTA",
   "Ajuste_Titulo": "Sin el personal de administración en el mantenimiento",
   "Ajuste_Detalle": "Mismo criterio que la empleada excluida"
  },
  {
   "Barrio": "S2",
   "Mes": "2026-10",
   "Tipo": "AHORRO",
   "Origen": "AUTOMÁTICO",
   "Aplicar_En_Modelo": "SI",
   "Actualizado": "2026-10-14",
   "Usuario": "migración",
   "Regla": "CAJA_CHICA",
   "ID_Hallazgo": "H31",
   "ID_Oportunidad": "O004",
   "Concepto": "Caja chica sin factura",
   "Hoy": "$ 551.500 de presupuestos y notas \"X\" en la base",
   "Propuesta": "Aceptar solo comprobantes fiscales",
   "Ahorro_Mensual": 70399,
   "Prioridad": "MEDIA",
   "Estado": "PROPUESTA",
   "Ajuste_Titulo": "Caja chica solo con comprobantes fiscales",
   "Ajuste_Detalle": "Sin presupuestos ni notas \"X\""
  },
  {
   "Barrio": "S2",
   "Mes": "2026-10",
   "Tipo": "AHORRO",
   "Origen": "AUDITOR",
   "Aplicar_En_Modelo": "SI",
   "Actualizado": "2026-10-14",
   "Usuario": "migración",
   "Regla": "",
   "ID_Hallazgo": "H28",
   "ID_Oportunidad": "O005",
   "Concepto": "Luz del Fideicomiso",
   "Hoy": "$ 498.204: 8,6% de dos cuentas, una industrial",
   "Propuesta": "Excluir la cuenta industrial e informar el criterio",
   "Ahorro_Mensual": "",
   "Prioridad": "MEDIA",
   "Estado": "PROPUESTA",
   "Ajuste_Titulo": "Sin la luz industrial del Fideicomiso",
   "Ajuste_Detalle": "Falta el criterio de reparto"
  },
  {
   "Barrio": "S2",
   "Mes": "2026-10",
   "Tipo": "AHORRO",
   "Origen": "AUTOMÁTICO",
   "Aplicar_En_Modelo": "NO",
   "Actualizado": "2026-10-14",
   "Usuario": "migración",
   "Regla": "SUBA_CONCEPTO",
   "ID_Hallazgo": "",
   "ID_Oportunidad": "O006",
   "Concepto": "Gastos bancarios Roela",
   "Hoy": "$ 519.171,01, +39,4% sobre el promedio de 3 meses",
   "Propuesta": "Revisar comisiones de cobranza y cuenta a nombre del barrio",
   "Ahorro_Mensual": "",
   "Prioridad": "BAJA",
   "Estado": "PROPUESTA",
   "Ajuste_Titulo": "Gastos bancarios Roela al promedio",
   "Ajuste_Detalle": ""
  },
  {
   "Barrio": "S2",
   "Mes": "2026-10",
   "Tipo": "RECLASIFICACIÓN",
   "Origen": "AUTOMÁTICO",
   "Aplicar_En_Modelo": "NO",
   "Actualizado": "2026-10-14",
   "Usuario": "migración",
   "Regla": "OBRA_ORDINARIA",
   "ID_Hallazgo": "H30",
   "ID_Oportunidad": "O007",
   "Concepto": "Obra de cámaras como gasto extraordinario",
   "Hoy": "$ 1.344.000 cargados como gasto ordinario",
   "Propuesta": "Pagarla con el fondo extraordinario ($ 1.659.305,82)",
   "Ahorro_Mensual": 1344000,
   "Prioridad": "MEDIA",
   "Estado": "PROPUESTA",
   "Ajuste_Titulo": "Obra de cámaras como gasto extraordinario",
   "Ajuste_Detalle": "Pagada con el fondo extraordinario ($ 1.659.305,82)"
  }
 ],
 "reglas": [
  {
   "ID_Regla": "N020",
   "Texto_Clave_Contiene": "PORTÓN",
   "CUIT": "N/D",
   "ID_Proveedor": "",
   "Concepto_Normalizado": "Reparación portón vehicular",
   "Categoria": "MANTENIMIENTO",
   "Subcategoria": "Reparaciones",
   "Tipo_Gasto": "REPARACIÓN",
   "Observacion": "La Huella 08/2026."
  }
 ],
 "provisorios": [
  "S2-2026-08-G003",
  "S2-2026-09-G003"
 ]
};
