/**
 * Usuarios por barrio.
 * Hoja USUARIOS: Usuario | Nombre | Barrio (S1, S2, LH o * para todos) | Rol (AUDITOR o ADMIN) | Clave_Hash | Salt | Activo (SI/NO) | Ultimo_Ingreso
 * La clave nunca se guarda: se guarda SHA-256(sal + clave). Los usuarios se crean desde el editor con crearUsuario().
 * Al ingresar, la app recibe un token de sesión que dura 6 horas (CacheService).
 * Un AUDITOR solo puede escribir en su barrio (o en hallazgos compartidos que incluyan su barrio). Un ADMIN puede escribir en todos.
 * Cinco claves incorrectas seguidas bloquean al usuario 15 minutos.
 */
var SESION_SEG = 21600, MAX_INTENTOS = 5, BLOQUEO_SEG = 900;

function hash_(salt, clave) {
  var b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + "|" + clave, Utilities.Charset.UTF_8);
  return b.map(function (x) { return ("0" + (x & 0xff).toString(16)).slice(-2); }).join("");
}
function login_(b) {
  var u = String(b.usuario || "").trim().toLowerCase(), clave = String(b.clave || "");
  if (!u || !clave) throw new Error("Escribí usuario y clave.");
  var C = CacheService.getScriptCache(), kInt = "int_" + u, n = +(C.get(kInt) || 0);
  if (n >= MAX_INTENTOS) throw new Error("Demasiados intentos. Probá de nuevo en 15 minutos.");
  var row = readSheet_("USUARIOS").filter(function (r) { return String(r.Usuario).toLowerCase() === u; })[0];
  if (!row || row.Activo === "NO" || hash_(String(row.Salt), clave) !== String(row.Clave_Hash)) {
    C.put(kInt, String(n + 1), BLOQUEO_SEG);
    throw new Error("Usuario o clave incorrectos.");
  }
  C.remove(kInt);
  var ses = { usuario: String(row.Usuario), nombre: String(row.Nombre || row.Usuario), barrio: String(row.Barrio || ""), rol: String(row.Rol || "AUDITOR").toUpperCase() };
  var token = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
  C.put("tok_" + token, JSON.stringify(ses), SESION_SEG);
  try { updateRow_("USUARIOS", "Usuario", row.Usuario, { Ultimo_Ingreso: ahora_() }); } catch (e) {}
  log_(ses, ses.barrio, "INGRESO", "");
  return { token: token, usuario: ses.usuario, nombre: ses.nombre, barrio: ses.barrio, rol: ses.rol, vence: Date.now() + SESION_SEG * 1000 };
}
function logout_(b) { if (b.token) CacheService.getScriptCache().remove("tok_" + b.token); return { ok: true }; }

/** Devuelve la sesión del token o corta con error. Si se pasa barrio, verifica que el usuario pueda escribir en él. */
function sesion_(token, barrio) {
  var s = token ? CacheService.getScriptCache().get("tok_" + token) : null;
  if (!s) throw new Error("La sesión venció. Volvé a ingresar.");
  var ses = JSON.parse(s);
  if (barrio && !puede_(ses, barrio)) throw new Error("Tu usuario no puede modificar datos de " + barrio + ".");
  return ses;
}
function puede_(ses, barrio) {
  if (ses.rol === "ADMIN" || ses.barrio === "*") return true;
  // Un hallazgo compartido (S1,S2,LH) lo puede actualizar el auditor de cualquiera de esos barrios.
  var bs = String(barrio || "").split(",");
  return bs.some(function (x) { return String(ses.barrio).split(",").indexOf(x.trim()) >= 0; });
}
