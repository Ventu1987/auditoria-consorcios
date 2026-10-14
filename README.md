# Auditoría de Consorcios — Fideicomiso Bella Vista

App web para controlar las expensas de Senderos II, Senderos I y La Huella. Cualquier propietario la puede ver con el link. Los auditores de cada barrio ingresan con su usuario para cargar las liquidaciones y confirmar los hallazgos.

- **Datos:** una planilla de Google nueva, sin fórmulas. Todos los cálculos los hace la app.
- **API:** Google Apps Script. Es el mismo proyecto del portal anterior, así que la URL no cambia.
- **App:** React y TypeScript, publicada gratis en GitHub Pages. Se actualiza sola cada vez que se sube un cambio.
- **Costo:** $ 0.

## Las 7 pestañas

| # | Pestaña | Qué muestra |
|---|---|---|
| 1 | Dashboard | La expensa del mes y 8 controles de caja y saldos. También el fondo de reserva, la morosidad, el semáforo de servicios, lo que hay que revisar y el índice de transparencia. |
| 2 | Comparativo | La comparación contra el mes anterior: barras de lo que subió y lo que bajó, concepto por concepto (contra el mes anterior y contra el promedio de 3 meses), conceptos nuevos, semáforo y lo que dijo la administración. |
| 3 | Respaldo | Qué parte del gasto tiene una factura por el mismo importe y cómo se pagó cada gasto. Además, las salidas del banco que no coinciden con ningún gasto y la clasificación de imágenes con un clic. |
| 4 | Optimización | Las oportunidades de ahorro, que el auditor puede editar, y las que sugiere la app. También compara el costo por lote con los otros barrios. |
| 5 | Matriz histórica | Una fila por concepto y una columna por mes. Se puede ver en importe, por lote, como % del total o como variación. Incluye el IPC como referencia y se descarga en Excel. |
| 6 | Expensa modelo | Cuánto sería la expensa con los ajustes que se elijan, y en qué se va cada $ 100. |
| 7 | Reporte / Mail | El mail se arma con los hallazgos confirmados, en tres tonos posibles y con plazo en días hábiles. Desde acá se siguen los envíos y las respuestas, y se confirman o descartan los indicadores automáticos. |

**Resumen PDF:** 2 hojas A4, siempre en modo claro, con lo más importante de las pestañas 1, 2, 3 y 5. Sirve para mandar por WhatsApp.

**Modo oscuro:** se guarda en cada dispositivo. Si nunca se eligió, la app usa el modo que tenga configurado el sistema.

## Instalación (una sola vez)

### 1. Backend (Apps Script)

1. Abrí la planilla vieja y entrá en **Extensiones → Apps Script**.
2. Borrá `Code.gs`, `Datos1.gs`, `Datos2.gs` y `Datos3.gs`.
3. Creá estos archivos y pegá en cada uno el contenido de la carpeta `apps-script/`: `config.gs`, `api.gs`, `auth.gs`, `privacy.gs`, `liquidacion.gs`, `auditoria.gs`, `setup.gs` y `semillas.gs`.
4. En el menú de arriba elegí la función **`crearPlanilla`** y tocá **Ejecutar**. Aceptá los permisos. En **Registro de ejecución** aparece el link de la planilla nueva.
5. Ejecutá **`migrarDesdePlanillaVieja`**. Copia los valores de la planilla vieja, nunca las fórmulas, y carga los catálogos (etiquetas de conceptos, parámetros y las 7 oportunidades ya analizadas). La planilla vieja no se toca.
6. Creá los usuarios. Abrí `setup.gs`, escribí arriba una función temporal y ejecutala:
   ```js
   function misUsuarios() {
     crearUsuario("facundo", "Facundo Vega", "S2", "ADMIN", "una-clave-de-10-o-mas");
     crearUsuario("auditor.s1", "Auditor Senderos I", "S1", "AUDITOR", "otra-clave-larga");
     crearUsuario("hugo.menegozzi", "Hugo Menegozzi", "LH", "AUDITOR", "otra-clave-larga");
   }
   ```
   Después **borrá esa función**, así las claves no quedan escritas en ningún lado. La planilla solo guarda una huella cifrada de cada clave.
7. Entrá en **Implementar → Gestionar implementaciones → ✏️ → Versión: Nueva versión → Implementar**. Así la URL sigue siendo la misma de antes.

**La Huella:** la planilla vieja no tiene sus liquidaciones. Una vez publicada la app, Hugo Menegozzi (o un ADMIN) entra con su usuario y carga las de 08, 09 y 10/2026 con **Cargar expensa**, en orden. La app ya las leyó bien: totales de $ 10.500.281,83, $ 9.601.589,68 y $ 10.096.651,76.

Para probar: ejecutá `probar()` y en el registro va a aparecer el tamaño de los datos públicos.

### 2. App (GitHub Pages)

1. Creá un repositorio público en GitHub, por ejemplo `auditoria-consorcios`, y subí todo el contenido de esta carpeta.
2. En el repositorio, entrá en **Settings → Pages → Source: GitHub Actions**.
3. Listo: cada vez que se sube un cambio, GitHub corre las pruebas, compila y publica. La app queda en `https://<tu-usuario>.github.io/auditoria-consorcios/`.

Si la URL de la API cambia algún día, se edita en `src/config.ts`.

## Quién ve qué

- **Propietarios (con el link):** ven todo lo publicado. Nunca ven el padrón, los nombres de propietarios, la deuda por lote, los nombres de empleados ni los CUIT de personas físicas (salvo el del administrador), ni el nombre de archivo de la liquidación de cada propietario. De la morosidad solo se ve **cuántos** lotes deben, nunca **cuáles**.
- **Auditor de un barrio:** carga liquidaciones, respaldos y extractos de su barrio. También confirma indicadores, edita oportunidades y registra mails y respuestas. En los hallazgos compartidos (por ejemplo S1,S2,LH) puede agregar novedades.
- **ADMIN:** puede escribir en todos los barrios.
- Cada cambio queda en la hoja **LOG**, con usuario, fecha y valor anterior.

## Cómo se trabaja cada mes

1. **Cargar expensa → 1. Liquidación:** subí el PDF. La app lo lee en el teléfono o la computadora, lo controla contra la planilla y recién después lo guarda.
2. **2. Respaldos:** subí facturas, comprobantes, fotos y extractos (Excel). La app identifica cada página y la vincula con su gasto.
3. **Reporte / Mail:** confirmá o descartá los indicadores automáticos. Cada uno que se confirma pasa a ser un hallazgo. Elegí los puntos, el tono y el plazo, y tocá **Copiar el mail** y **Marcar como enviado**.
4. **Resumen PDF → Imprimir o guardar PDF**, y mandalo al grupo de propietarios.

## Reglas de los cálculos

- **Controles:** diferencia = liquidación − calculado. Hasta $ 1 cierra, hasta $ 100 es redondeo, menos del 1% queda "a revisar" y más que eso "no cierra".
- **Semáforo:** compara cada servicio con la mediana de los 6 meses anteriores, sin contar meses estimados, provisorios ni ajustes. Se pone amarillo desde +20% y rojo desde +35%. Se cambia en la hoja PARAMETROS (por ejemplo, para usar el promedio en lugar de la mediana).
- **Coeficiente del lote común:** expensa ÷ total repartido. No se usa el coeficiente redondeado de la liquidación.
- **Índice de transparencia:** tiene 4 partes de 25 puntos cada una (factura que coincide, controles que cierran, pedidos cumplidos y gasto con algún comprobante). Sirve para comparar, no es una calificación.
- **IPC:** se muestra solo como referencia mensual del INDEC. No hay comparaciones con la inflación.
- Un dato dudoso se marca **REVISAR** y uno que falta, **N/D**. Las alertas son indicadores de revisión, no acusaciones.

## Desarrollo

```bash
npm install
npm run dev      # app local (sin API usa los datos de demostración)
npm test         # 22 pruebas: cifras reales de octubre 2026 y simulación completa del backend
npm run demo     # rearma public/demo/*.json y apps-script/semillas.gs desde una copia local de la planilla (tests/fixtures/snapshot_raw.json, que no se sube al repositorio)
```

Con `?demo` en la URL, la app usa los datos de demostración aunque la API responda.
