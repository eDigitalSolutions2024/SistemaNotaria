# 14 — Decisiones de Arquitectura (ADR)
**Architecture Decision Records — Sistema PLD Notaría**
**Versión:** 1.0 | **Fecha:** 2026-06-29

---

## ADR-001: Migración de `cliente` (texto libre) a referencia `ClienteGeneral`

**Estado:** APROBADO
**Fecha:** 2026-06-29
**Impacto:** Alto — afecta modelo Escritura, módulo PLD, generación XML, plantillas Word

---

### Contexto

El modelo `Escritura` almacena el nombre del cliente como `String` libre:

```
Escritura.cliente = "Juan Pérez García"   // texto, sin FK
```

El modelo `ClienteGeneral` contiene el expediente KYC completo (CURP, RFC, domicilio,
estado civil, etc.) referenciado por `clienteId` (Number → modelo `Cliente` del sistema
de turnos).

El módulo PLD necesita acceder a CURP, RFC, domicilio y otros datos estructurados del
cliente para generar el XML del SPPLD. Con `cliente` como texto libre esto es imposible.

**Problema:** No existe enlace entre `Escritura` y `ClienteGeneral`.

---

### Decisión

Adoptar el patrón **Dual-Field + Strangler Fig** en tres fases:

1. Agregar campo opcional `clienteGeneralRef` (ObjectId) al modelo `Escritura`.
2. Mantener `cliente` (String) intacto — nunca eliminarlo de escrituras existentes.
3. Nuevas escrituras populan ambos campos. Escrituras antiguas solo tienen `cliente`.
4. Un virtual getter resuelve la fuente correcta según disponibilidad.
5. Script de reconciliación opcional para vincular escrituras históricas.

---

### Estrategia de Migración (3 Fases)

#### FASE 0 — Preparación (sin tocar código de producción)

Tareas previas antes de cualquier cambio:

```
□ Inventario: ¿cuántas Escrituras existen sin clienteGeneralRef?
□ Inventario: ¿cuántos ClienteGeneral existen en la BD?
□ Análisis de matching: ¿qué % de Escrituras.cliente coincide con
  ClienteGeneral.nombre_completo (normalizado)?
□ Backup de colección escrituras antes de cualquier migración
```

Script de diagnóstico (solo lectura, para ejecutar antes de Fase 1):

```js
// Ejecutar en mongo shell o como script standalone — SOLO LECTURA
db.escrituras.aggregate([
  { $group: { _id: "$cliente", count: { $sum: 1 } } },
  { $sort: { count: -1 } },
  { $limit: 50 }
])
// Resultado: top 50 nombres más frecuentes para evaluar calidad del matching
```

---

#### FASE 1 — Extensión del modelo (non-breaking)

**Único cambio al modelo Escritura:**

```js
// Backend/models/Escritura.js — agregar SOLO estos campos, nada más
clienteGeneralRef: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'ClienteGeneral',
  default: null,              // null = escritura histórica sin vínculo
},
clienteNombreHistorico: {
  type: String,
  default: '',                // copia del texto libre al momento de vincular
},
```

**Regla de negocio:**
- `clienteGeneralRef = null` → escritura histórica. Usar `cliente` (String) como siempre.
- `clienteGeneralRef ≠ null` → escritura vinculada. Usar datos de `ClienteGeneral`.

**Virtual getter para consumo uniforme:**

```js
// En plantillaService y generador XML — helper de resolución
async function resolveCliente(escritura) {
  if (escritura.clienteGeneralRef) {
    return await ClienteGeneral.findById(escritura.clienteGeneralRef).lean();
  }
  // Fallback: devolver objeto mínimo con solo el nombre histórico
  return {
    nombre_completo: escritura.cliente,
    curp: '',
    rfc: '',
    domicilio: '',
    // ... resto vacío
  };
}
```

**Compatibilidad garantizada:**
- Todas las rutas existentes (`GET /api/escrituras`, etc.) siguen funcionando sin cambios.
- El campo `cliente` (String) permanece en el schema — no se toca.
- `clienteGeneralRef: null` en escrituras viejas no rompe nada.

---

#### FASE 2 — Nuevas escrituras vinculadas (UI)

**Cambio en el frontend — `Escrituras.jsx`:**

Agregar un selector/autocomplete de `ClienteGeneral` al formulario de alta de escritura.
Cuando el usuario selecciona un ClienteGeneral:

```
clienteGeneralRef = ObjectId del ClienteGeneral seleccionado
cliente           = ClienteGeneral.nombre_completo  (mantener para búsquedas legacy)
clienteNombreHistorico = ClienteGeneral.nombre_completo
```

El campo `cliente` (String) se sigue llenando — garantiza que filtros y búsquedas
existentes por nombre sigan funcionando sin cambios.

**El selector es OPCIONAL en esta fase** — si la Notaría no encuentra al cliente en
`ClienteGeneral`, puede escribir el nombre manualmente como hasta ahora.

---

#### FASE 3 — Reconciliación histórica (opcional, bajo demanda)

Script de reconciliación que intenta emparejar escrituras antiguas con ClienteGeneral
por coincidencia de nombre normalizado. Genera un reporte para revisión humana.

```
Escritura.cliente = "JUAN PEREZ GARCIA"
ClienteGeneral.nombre_completo = "Juan Pérez García"

Matching: normalizar ambos (mayúsculas, sin acentos, sin espacios extras)
→ "juan perez garcia" == "juan perez garcia" → candidato de match
```

El script **nunca auto-vincula** — genera una lista de candidatos para que el usuario
apruebe manualmente en la interfaz. Un partido ambiguo (múltiples ClienteGeneral con
nombre similar) se marca como REVISAR_MANUALMENTE.

**Este paso es opcional.** Las escrituras históricas no vinculadas siguen funcionando
indefinidamente con su texto libre.

---

### Diagrama del Estado de una Escritura

```
                   ESCRITURA
                      │
          ┌───────────┴───────────┐
          │                       │
   clienteGeneralRef            clienteGeneralRef
       = null                     = ObjectId
          │                       │
   ┌──────▼──────┐         ┌──────▼──────────────┐
   │  HISTÓRICA  │         │     VINCULADA        │
   │             │         │                      │
   │ cliente =   │         │ cliente = nombre     │
   │ "Juan Pérez"│         │ (copia para búsqueda)│
   │             │         │                      │
   │ PLD: datos  │         │ PLD: todos los datos │
   │ incompletos │         │ KYC disponibles      │
   │ (solo nombre│         │ (CURP, RFC, domicilio│
   │ disponible) │         │  estado civil, etc.) │
   └─────────────┘         └──────────────────────┘
```

---

### Impacto en el Módulo PLD

| Escenario | Comportamiento PLD |
|---|---|
| Escritura nueva + ClienteGeneral vinculado | Expediente PLD con datos KYC completos. XML SPPLD generado correctamente. |
| Escritura nueva sin ClienteGeneral (texto libre) | Expediente PLD creado. Datos KYC vacíos. Sistema solicita completar datos manualmente en el expediente PLD antes de generar XML. |
| Escritura histórica | Expediente PLD marcado como DATOS_INCOMPLETOS. No bloquea pero requiere que el abogado capture datos manualmente. |

**Consecuencia:** El módulo PLD necesita captura manual de datos KYC en el expediente
cuando no hay `clienteGeneralRef`. Esto es aceptable como estado transitorio.

---

### Alternativas Consideradas y Rechazadas

| Alternativa | Razón de Rechazo |
|---|---|
| Migración big-bang: convertir todos los `cliente` a FK inmediatamente | Alto riesgo. Requiere que TODOS los clientes históricos tengan ClienteGeneral. No es el caso. |
| Eliminar `cliente` String y usar solo ObjectId | Rompe búsquedas, filtros y plantillas existentes que dependen del String. |
| Duplicar el campo en una colección separada | Aumenta complejidad sin ventaja. El dual-field es más simple. |
| Usar `clienteId` (Number del sistema de turnos) como FK | `Cliente` (turno) no tiene CURP, RFC ni datos KYC. El FK correcto es a `ClienteGeneral`. |

---

### Consecuencias Aceptadas

- **Positivas:**
  - Cero cambios en código existente hasta Fase 2.
  - Escrituras históricas siguen funcionando indefinidamente.
  - Migración gradual sin fecha límite impuesta.
  - El módulo PLD funciona incluso con datos incompletos (modo degradado).

- **Negativas:**
  - Duplicación temporal del nombre en `cliente` y `clienteGeneralRef.nombre_completo`.
  - El módulo PLD tendrá expedientes con datos parciales durante el período de transición.
  - Requiere que los abogados seleccionen el ClienteGeneral al crear nuevas escrituras (cambio de hábito).

---

### Criterios de Completitud

La migración se considera completa cuando:
```
□ > 95% de escrituras de los últimos 12 meses tienen clienteGeneralRef
□ 100% de nuevas escrituras se crean con clienteGeneralRef
□ 0 expedientes PLD bloqueados por falta de datos KYC en operaciones nuevas
```

---

*ADR-001 aprobado. Siguiente ADR se agrega en este mismo documento conforme surjan decisiones.*
