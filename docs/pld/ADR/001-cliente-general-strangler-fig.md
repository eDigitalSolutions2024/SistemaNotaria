# ADR-001: Migración de `cliente` (texto libre) a `ClienteGeneral` (referencia estructurada)
## Patrón: Dual-Field + Strangler Fig

**Estado:** APROBADO
**Fecha de decisión:** 2026-06-29
**Autor:** Equipo de Arquitectura
**Revisado por:** Titular de la Notaría
**Impacto:** Alto — afecta modelo `Escritura`, módulo PLD, generación XML SPPLD, plantillas Word

---

## 1. Contexto

El sistema notarial actual almacena el nombre del cliente en la colección `escrituras` como un campo de texto libre:

```
Escritura {
  cliente: "Juan Pérez García",   // String, sin relación a ningún modelo
  ...
}
```

Existe el modelo `ClienteGeneral` que contiene el expediente KYC completo de cada persona (CURP, RFC, domicilio, estado civil, ocupación, fecha de nacimiento, etc.), vinculado al sistema de turnos mediante `clienteId` (Number → modelo `Cliente`).

El módulo PLD que se está diseñando **requiere acceso a datos estructurados** del cliente para:
- Generar el XML del SPPLD conforme al esquema `fep.xsd`
- Capturar al Beneficiario Final correctamente
- Verificar contra listas PEP y OFAC
- Calcular la acumulación de operaciones por cliente en ventana de 6 meses

Con `Escritura.cliente` como texto libre, ninguna de estas funciones puede automatizarse de forma confiable.

---

## 2. Problema

### 2.1 Brecha técnica central

```
Escritura.cliente = "Juan Pérez García"   ← String sin FK
ClienteGeneral.nombre_completo = "Juan Pérez García"   ← datos KYC completos

No existe enlace entre ambas colecciones.
```

### 2.2 Consecuencias directas

| Consecuencia | Impacto en PLD |
|---|---|
| Imposible obtener CURP/RFC del cliente desde la escritura | El XML SPPLD quedaría incompleto — SAT rechazaría el aviso |
| Imposible verificar PEP automáticamente | Verificación manual — riesgo de omisión |
| Imposible calcular acumulación por cliente | Un mismo cliente puede tener múltiples escrituras con nombres ligeramente distintos |
| Imposible poblar BeneficiarioFinal desde datos existentes | El abogado tendría que capturar todo manualmente cada vez |

### 2.3 Por qué no se puede ignorar

La LFPIORPI (Art. 18) exige identificación completa del cliente con nombre, RFC o CURP, domicilio y datos de identificación oficial. El XML `fep.xsd` tiene campos obligatorios que solo pueden obtenerse de `ClienteGeneral`. Sin este vínculo, cada aviso requiere captura manual completa, anulando toda la automatización del módulo PLD.

---

## 3. Alternativas Evaluadas

### Alternativa A: Big-Bang Migration (Rechazada)
Convertir inmediatamente todos los `Escritura.cliente` a ObjectId referenciando `ClienteGeneral`.

**Por qué se rechaza:**
- Requiere que el 100% de escrituras históricas tengan un `ClienteGeneral` correspondiente — condición que no se cumple.
- Alto riesgo operativo: cualquier escritura sin match queda inutilizable.
- Requiere downtime de migración.
- Si falla, rollback complejo y potencialmente destructivo.

### Alternativa B: Nueva colección de enlace (Rechazada)
Crear una colección `escritura_cliente_map { escrituraId, clienteGeneralId }` como tabla pivote.

**Por qué se rechaza:**
- Introduce complejidad de join sin ventaja real sobre el Dual-Field.
- Dos colecciones para representar una relación simple.
- Consultas más costosas (triple join: escritura → map → clienteGeneral).

### Alternativa C: Usar `clienteId` (Number del turno) como FK (Rechazada)
Referenciar el modelo `Cliente` (sistema de turnos) en lugar de `ClienteGeneral`.

**Por qué se rechaza:**
- El modelo `Cliente` (turno) solo tiene nombre, hora de llegada y estado del turno — no tiene CURP, RFC ni datos KYC.
- El FK correcto para PLD es `ClienteGeneral`, no `Cliente`.
- El modelo `Cliente` puede eliminarse una vez cerrado el turno — referencia inestable.

### Alternativa D: Duplicar datos KYC en Escritura (Rechazada)
Agregar CURP, RFC, domicilio directamente al modelo `Escritura`.

**Por qué se rechaza:**
- Violación de DRY — los datos KYC ya existen en `ClienteGeneral`.
- Desincronización inevitable: si el cliente actualiza su domicilio, las escrituras antiguas quedan con datos obsoletos.
- Aumenta el tamaño del documento `escritura` innecesariamente.

### Alternativa E ✅: Dual-Field + Strangler Fig (SELECCIONADA)
Agregar campo `clienteGeneralRef` (ObjectId, nullable) manteniendo `cliente` (String) intacto.

---

## 4. Decisión

Se adopta el patrón **Dual-Field + Strangler Fig** implementado en tres fases progresivas.

### 4.1 Cambio mínimo al modelo Escritura

```
// Agregar únicamente estos dos campos — nada más se modifica
clienteGeneralRef: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'ClienteGeneral',
  default: null,
},
clienteNombreHistorico: {
  type: String,
  default: '',
},
```

### 4.2 Regla de resolución de cliente

```
clienteGeneralRef = null     →  Escritura HISTÓRICA
                                Fuente de nombre: escritura.cliente (String)
                                PLD: datos KYC vacíos, captura manual en expediente

clienteGeneralRef ≠ null     →  Escritura VINCULADA
                                Fuente de nombre: ClienteGeneral.nombre_completo
                                PLD: datos KYC disponibles automáticamente
```

### 4.3 Invariante del sistema

> El campo `cliente` (String) **nunca se elimina** y **nunca queda vacío** en nuevas escrituras. Cuando se vincula un `ClienteGeneral`, el sistema copia `ClienteGeneral.nombre_completo` al campo `cliente`. Esto garantiza que todas las búsquedas, filtros y plantillas existentes que dependen del String siguen funcionando sin ningún cambio.

---

## 5. Plan de Migración

### FASE 0 — Diagnóstico (antes de cualquier cambio de código)

**Objetivo:** Entender el estado real de los datos.

```
Tareas:
□ Contar escrituras existentes en MongoDB
□ Contar ClienteGeneral existentes
□ Ejecutar script de diagnóstico (solo lectura):
  - Top 50 nombres más frecuentes en escrituras
  - % de nombres que tienen match exacto/parcial en ClienteGeneral
  - Escrituras sin fecha, sin cliente, sin tipoTramite (casos edge)
□ Estimar: ¿cuántas escrituras históricas se pueden vincular automáticamente?
□ Backup de colección escrituras (OBLIGATORIO antes de Fase 1)
```

**Criterio de avance:** Backup confirmado + diagnóstico ejecutado.

### FASE 1 — Extensión del modelo (non-breaking)

**Objetivo:** Agregar los campos sin romper nada.

```
Cambios:
□ Agregar clienteGeneralRef y clienteNombreHistorico al schema Escritura.js
□ Deploy del cambio (ninguna escritura existente se ve afectada — campos default: null / '')
□ Verificar en producción que escrituras existentes siguen funcionando normalmente
□ Agregar endpoint GET /api/pld/expedientes/escritura/:escrituraId (sin UI todavía)
```

**Criterio de avance:** 0 errores en sistema existente después del deploy.

### FASE 2 — UI de vinculación en nuevas escrituras

**Objetivo:** Nuevas escrituras se crean con `clienteGeneralRef`.

```
Cambios:
□ Escrituras.jsx: agregar autocomplete de ClienteGeneral en formulario de alta
□ Al seleccionar ClienteGeneral:
    escritura.clienteGeneralRef = ObjectId
    escritura.cliente = ClienteGeneral.nombre_completo  (mantener String para legacy)
    escritura.clienteNombreHistorico = ClienteGeneral.nombre_completo
□ El selector es OPCIONAL — si no se selecciona, el campo texto libre sigue disponible
□ Badge visual en el formulario: "✓ Cliente vinculado a expediente general"
```

**Criterio de avance:** > 80% de nuevas escrituras creadas con `clienteGeneralRef` en primer mes.

### FASE 3 — Reconciliación histórica (opcional, sin fecha límite)

**Objetivo:** Vincular escrituras antiguas cuando sea posible y conveniente.

```
Herramienta:
□ Script de reconciliación (NO auto-vincula):
  - Normaliza nombres (mayúsculas, sin acentos, sin espacios extra)
  - Genera lista de candidatos: { escrituraId, clienteGeneralId, confianza: 'EXACTO'|'PARCIAL'|'AMBIGUO' }
  - Solo candidatos 'EXACTO' se presentan para aprobación
  - 'AMBIGUO' queda como REVISAR_MANUALMENTE

□ UI de reconciliación en panel ADMIN:
  - Muestra pares candidatos
  - Admin aprueba o descarta cada uno
  - Sistema vincula solo los aprobados

□ Escrituras no reconciliadas: siguen funcionando indefinidamente con texto libre
```

**Criterio de avance:** No hay criterio — es opcional. No hay deadline.

---

## 6. Justificación Técnica

| Factor | Análisis |
|---|---|
| **Compatibilidad hacia atrás** | Total. `clienteGeneralRef: null` es semánticamente "sin vínculo" — no rompe ninguna lectura ni escritura existente. |
| **Riesgo de migración** | Mínimo. No hay transformación de datos en Fase 1. |
| **Deuda técnica** | Baja. El dual-field es temporal — cuando > 95% de escrituras estén vinculadas, el campo `cliente` (String) puede deprecarse. |
| **Costo de implementación** | Bajo. Dos campos nuevos, un selector en UI, un helper de resolución. |
| **Beneficio para PLD** | Alto. Habilita automatización completa de XML SPPLD, verificación PEP y acumulación. |
| **Consistencia de datos** | El campo `cliente` siempre es igual a `ClienteGeneral.nombre_completo` en escrituras vinculadas — sin inconsistencia. |

---

## 7. Riesgos

| ID | Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|---|
| R1 | Abogado no selecciona ClienteGeneral en nuevas escrituras | Alta | Medio | Selector opcional en Fase 2; badge visual de incentivo; en Fase posterior hacerlo obligatorio para tipos que generan PLD |
| R2 | Nombre en `cliente` y `ClienteGeneral.nombre_completo` divergen | Baja | Bajo | Invariante: al vincular, sistema copia el nombre automáticamente; es atómico |
| R3 | Un ClienteGeneral vinculado se elimina | Muy baja | Alto | ClienteGeneral no tiene endpoint DELETE en producción actual; agregar soft-delete con validación: "no eliminar si tiene escrituras vinculadas" |
| R4 | Script de reconciliación vincula par incorrecto | Baja | Medio | Script nunca auto-vincula; requiere aprobación manual por cada par |
| R5 | Deploy de Fase 1 rompe algo inesperado | Muy baja | Alto | Backup previo; rollback = revertir commit del schema (campos con default null son seguros) |

---

## 8. Estrategia de Rollback

### Rollback Fase 1 (si hay problema después del deploy)

```
Acción: Revertir el commit que agrega clienteGeneralRef al schema.

Impacto en datos: NINGUNO.
MongoDB ignora campos que no están en el schema (los almacena pero no los expone).
Los campos clienteGeneralRef y clienteNombreHistorico simplemente dejan de aparecer
en las respuestas de la API. Los datos existentes no se alteran.

Tiempo de rollback: < 5 minutos (revertir deploy, reiniciar servidor).
```

### Rollback Fase 2 (si el selector causa problemas en UI)

```
Acción: Revertir el cambio en Escrituras.jsx.

Impacto en datos: Las escrituras ya vinculadas mantienen su clienteGeneralRef.
Nuevas escrituras volverán a crearse sin vínculo hasta que se re-deploya.

Tiempo de rollback: < 5 minutos.
```

### Rollback Fase 3 (script de reconciliación)

```
Acción: Setear clienteGeneralRef = null en las escrituras que se vincularon.

Script de rollback:
  db.escrituras.updateMany(
    { _id: { $in: [lista de ids vinculados en esta sesión] } },
    { $set: { clienteGeneralRef: null, clienteNombreHistorico: '' } }
  )

Tiempo: depende de cuántos se vincularon. Operación segura y reversible.
```

---

## 9. Impacto Esperado

### En el sistema actual (escrituras históricas)
- **Cero impacto.** Todas las rutas, filtros, plantillas y reportes existentes siguen funcionando exactamente igual.

### En el módulo PLD
- Con `clienteGeneralRef` poblado: XML SPPLD puede generarse con datos completos automáticamente.
- Sin `clienteGeneralRef`: expediente PLD funciona en modo degradado (captura manual de datos KYC).

### En la operación diaria
- Los abogados verán un selector nuevo en el formulario de alta de escrituras.
- Para escrituras vinculadas, el formulario pre-llena datos del cliente automáticamente.
- Reducción estimada de tiempo de captura en expediente PLD: ~70% para escrituras vinculadas.

### En métricas de cumplimiento (proyección a 12 meses)
- Mes 1-3: coexistencia de escrituras vinculadas y no vinculadas.
- Mes 6: > 80% de nuevas escrituras vinculadas.
- Mes 12: posibilidad de hacer `clienteGeneralRef` obligatorio en escrituras con actividad vulnerable PLD.

---

## 10. Criterios de Aceptación

El ADR se considera implementado satisfactoriamente cuando se cumplan **todos**:

```
□ [FASE 1] Schema actualizado sin errores en producción
□ [FASE 1] Escrituras existentes responden igual que antes del cambio
□ [FASE 1] Campo clienteGeneralRef = null en todas las escrituras históricas (default aplicado)
□ [FASE 2] Selector de ClienteGeneral funciona en formulario de alta
□ [FASE 2] Al seleccionar ClienteGeneral, escritura.cliente se actualiza automáticamente
□ [FASE 2] Escrituras sin selección de ClienteGeneral siguen creándose correctamente
□ [MÓDULO PLD] expedienteService.resolveCliente() devuelve datos KYC cuando hay clienteGeneralRef
□ [MÓDULO PLD] expedienteService.resolveCliente() devuelve objeto mínimo (solo nombre) cuando clienteGeneralRef = null
□ [MÓDULO PLD] XML SPPLD se genera sin errores para escrituras vinculadas
□ [FASE 3 — OPCIONAL] Script de reconciliación no auto-vincula; requiere aprobación manual
□ [SEGURIDAD] No existe endpoint que elimine ClienteGeneral con escrituras vinculadas
```

---

## Referencias

- [01-vision-general.md](../01-vision-general.md) — Contexto legal y objetivo del módulo PLD
- [02-arquitectura.md](../02-arquitectura.md) — Arquitectura completa del módulo
- [03-modelo-datos.md](../03-modelo-datos.md) — Schema de ExpedientePLD y campos PLD en Escritura
- [14-decisiones-arquitectura.md](../14-decisiones-arquitectura.md) — Registro de decisiones (índice)

---

*ADR-001 aprobado por el titular de la Notaría el 2026-06-29.*
*Esta decisión es irreversible en cuanto a la dirección general (adoptar ClienteGeneral como fuente de verdad), aunque la implementación por fases es flexible.*
