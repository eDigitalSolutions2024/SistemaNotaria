# 01 — Visión General del Módulo PLD
**Sistema de Cumplimiento LFPIORPI para Notarías Públicas**
**Versión:** 1.0 | **Fecha:** 2026-06-29 | **Estado:** BORRADOR — pendiente aprobación

---

## Tabla de Contenidos

1. [Contexto Legal](#1-contexto-legal)
2. [Objetivo del Módulo](#2-objetivo-del-módulo)
3. [Alcance](#3-alcance)
4. [Posicionamiento en el Sistema Actual](#4-posicionamiento-en-el-sistema-actual)
5. [Casos de Uso Principales](#5-casos-de-uso-principales)
6. [Flujo de Alto Nivel](#6-flujo-de-alto-nivel)
7. [Obligaciones Cubiertas](#7-obligaciones-cubiertas)
8. [Lo que NO cubre este módulo](#8-lo-que-no-cubre-este-módulo)
9. [Restricciones y Supuestos](#9-restricciones-y-supuestos)
10. [Riesgos de Alto Nivel](#10-riesgos-de-alto-nivel)
11. [Criterios de Éxito](#11-criterios-de-éxito)
12. [Dependencias con Otros Documentos](#12-dependencias-con-otros-documentos)
13. [Preguntas Pendientes](#13-preguntas-pendientes)

---

## 1. Contexto Legal

### 1.1 Marco Normativo Vigente

| Instrumento | Publicación DOF | Vigencia | Relevancia |
|---|---|---|---|
| LFPIORPI (Ley Federal para la Prevención e Identificación de Operaciones con Recursos de Procedencia Ilícita) | 17/Oct/2012 | 17/Jul/2013 | Ley principal |
| Reforma LFPIORPI | 16/Jul/2025 | 17/Jul/2025 | **Reforma mayor vigente** |
| Reglamento LFPIORPI | Publicación original 2013 | — | Reglamento base |
| Reforma al Reglamento | 27/Mar/2026 | Vigente | Nuevas obligaciones operativas |
| Reglas de Carácter General | SAT/UIF, actualizadas | Vigente | Procedimientos detallados |
| CFF Art. 32-B Ter y Quater | 2022 | Vigente | Beneficiario Controlador |

### 1.2 Autoridad Reguladora

La **UIF (Unidad de Inteligencia Financiera)**, adscrita a la **SHCP**, es la autoridad receptora de avisos. El **SAT** actúa como operador tecnológico del portal de presentación.

### 1.3 Posición de la Notaría como Sujeto Obligado

Las Notarías Públicas son **Sujetos Obligados** bajo el **Art. 17, Fracción XII** de la LFPIORPI (renumerado de Fracción XVII en la reforma de 2025). Sus actividades vulnerables incluyen:

- **Fr. XII-A:** Transmisión o constitución de derechos reales sobre inmuebles
- **Fr. XII-B:** Constitución, modificación, extinción de fideicomisos traslativos
- **Fr. XII-C:** Poder para actos de administración irrevocable o dominio (sin umbral)
- **Fr. XII-D:** Constitución, fusión, escisión, modificación de personas morales (sin umbral)
- **Fr. XII-E:** Otorgamiento de créditos o préstamos (sin umbral)

### 1.4 Umbrales Vigentes 2026

> **UMA Diaria 2026:** $117.31 MXN (vigencia: Feb 2026 – Ene 2027, INEGI)

| Actividad Vulnerable | Umbral | Equivalencia MXN |
|---|---|---|
| Transmisión derechos reales inmuebles | 8,000 UMA | $938,480 MXN |
| Fideicomisos traslativos | 4,000 UMA | $469,240 MXN |
| Poderes irrevocables administración/dominio | Sin umbral | Siempre aviso |
| Constitución/fusión/escisión de personas morales | Sin umbral | Siempre aviso |
| Créditos y préstamos | Sin umbral | Siempre aviso |

> **IMPORTANTE:** El umbral de 8,000 UMA fue reducido desde 16,000 UMA por la reforma de julio 2025.
> Toda operación que SUPERE el umbral (no iguale) genera obligación de aviso.

### 1.5 Restricción de Efectivo

Bajo Art. 32 LFPIORPI, ninguna de las operaciones anteriores puede pagarse en **efectivo** cuando el monto supere el umbral correspondiente. Infracción: $1,173,100 – $7,625,150 MXN.

---

## 2. Objetivo del Módulo

### 2.1 Objetivo General

Construir un **módulo integral de cumplimiento PLD** completamente embebido en el Sistema Notarial existente, que automatice la detección, gestión, documentación y transmisión de avisos al SAT conforme a la LFPIORPI, eliminando el riesgo de incumplimiento por omisión o error humano.

### 2.2 Objetivos Específicos

| # | Objetivo | Indicador de Éxito |
|---|---|---|
| O1 | Detectar automáticamente escrituras que generan obligación de aviso | 0 escrituras elegibles sin aviso generado |
| O2 | Construir y mantener el expediente PLD de cada operación | 100% de operaciones con expediente completo |
| O3 | Capturar datos de Beneficiario Final e identificación oficial | 100% de avisos con BF documentado |
| O4 | Generar XML conforme al esquema `fep.xsd` del SPPLD | XML válido en validación contra XSD |
| O5 | Generar TXT pipe-delimited conforme a especificaciones DeclaraNot | TXT válido en carga SAT |
| O6 | Registrar acuses de recibo del SAT por aviso | 100% de avisos con acuse guardado |
| O7 | Detectar acumulación de operaciones por cliente (ventana 6 meses) | Alertas automáticas al alcanzar umbral |
| O8 | Controlar listas PEP y listas negras | 100% de clientes verificados pre-firma |
| O9 | Producir el reporte de Aviso en Cero para meses sin operaciones | Entrega automática antes del día 17 |
| O10 | Soportar el flujo de Aviso de 24 horas (Art. 7 Bis) | Alerta inmediata en operación sospechosa |
| O11 | Conservar documentación por 10 años con trazabilidad completa | Audit log inalterable |
| O12 | Generar reportes para la auditoría anual obligatoria | Reporte generado sin intervención manual |

---

## 3. Alcance

### 3.1 Dentro del Alcance (In Scope)

```
✅ Detección automática de actividades vulnerables al registrar escritura
✅ Motor de reglas configurable (umbrales, tipos de trámite, acumulación)
✅ Expediente PLD por operación (capturas, documentos, estados)
✅ Captura de Beneficiario Final (LFPIORPI) integrada al ClienteGeneral existente
✅ Captura de Beneficiario Controlador (CFF) para personas morales
✅ Listas de vigilancia: PEP, OFAC SDN, ONU, listas negras UIF
✅ Generación de XML para SPPLD (fep.xsd)
✅ Generación de TXT para DeclaraNot
✅ Flujo de revisión → aprobación → transmisión de avisos
✅ Registro de acuses SAT (PDF/XML)
✅ Aviso en Cero (meses sin operaciones vulnerables)
✅ Aviso urgente 24 horas (Art. 7 Bis — operaciones sospechosas)
✅ Acumulación 6 meses rolling por cliente
✅ Dashboard de cumplimiento (semáforo de vencimientos)
✅ Alertas por vencimiento (día 17 mensual, 15 días DeclaraNot)
✅ Reporte para auditoría anual
✅ Conservación documental con control de retención 10 años
✅ Trazabilidad completa con audit log inalterable
✅ Integración con roles existentes (ADMIN, ABOGADO)
```

### 3.2 Fuera del Alcance (Out of Scope)

```
❌ Firma electrónica e.firma automática (proceso manual en SPPLD — browser)
❌ Transmisión directa API al SAT (SAT no expone API REST pública para SPPLD)
❌ OCR de documentos de identificación (fase posterior, ver 09-ocr.md)
❌ IA/ML para detección de patrones (fase posterior, ver 10-ia.md)
❌ Integración con RUPA (Registro Único de Personas Acreditadas)
❌ Módulo de capacitación del personal (out of scope técnico)
❌ Integración con sistemas de otras notarías
❌ Cumplimiento de jurisdicciones fuera de México
```

### 3.3 Sistemas SAT Involucrados

El módulo interactúa con **dos sistemas SAT distintos e independientes**:

| Sistema | URL | Propósito | Formato | Plazo |
|---|---|---|---|---|
| **SPPLD** | sppld.sat.gob.mx | Avisos PLD/AML a la UIF | XML (fep.xsd) + e.firma | Día 17 del mes siguiente |
| **DeclaraNot** | sat.gob.mx | Declaración fiscal de actos notariales | TXT pipe-delimited UTF-8 CRLF | 15 días hábiles desde firma |

> **Distinción crítica:** SPPLD es obligación de la **LFPIORPI** (anti-lavado). DeclaraNot es obligación del **CFF Art. 27** (fiscal). Son regímenes, plazos, formatos y autoridades distintas aunque ambos vayan al SAT.

---

## 4. Posicionamiento en el Sistema Actual

### 4.1 Arquitectura Actual (Resumen)

```
┌─────────────────────────────────────────────────────────────────┐
│                    SISTEMA NOTARIAL ACTUAL                       │
│                                                                  │
│  Frontend: React 19 + MUI 7 + DataGrid 8                        │
│  Backend:  Node.js + Express 5 — Puerto 8010                    │
│  DB:       MongoDB (Mongoose)                                    │
│  Auth:     JWT + express-session + connect-mongo                 │
│  RT:       Socket.io                                             │
│                                                                  │
│  Módulos:                                                        │
│  ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌─────────────────┐  │
│  │Escrituras│ │Protocolito│ │ Recibos  │ │ClientesGenerales│  │
│  └──────────┘ └───────────┘ └──────────┘ └─────────────────┘  │
│  ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌─────────────────┐  │
│  │Presupues.│ │  Salas   │ │Plantillas│ │   Calendario    │  │
│  └──────────┘ └───────────┘ └──────────┘ └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Integración del Módulo PLD

El módulo PLD se inserta como una **capa horizontal** que envuelve el flujo de Escrituras sin modificar su lógica existente:

```
┌─────────────────────────────────────────────────────────────────┐
│                    SISTEMA NOTARIAL + PLD                        │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │               MÓDULO PLD (NUEVO)                         │   │
│  │                                                          │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │   │
│  │  │ Motor de │ │Expediente│ │Generador │ │Dashboard │  │   │
│  │  │  Reglas  │ │   PLD    │ │XML/TXT   │ │Cumplim.  │  │   │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └──────────┘  │   │
│  │       │             │            │                        │   │
│  │  ┌────▼─────────────▼────────────▼──────────────────┐  │   │
│  │  │         Capa de Integración PLD                    │  │   │
│  │  │  (hooks en Escritura save, middleware de alertas)  │  │   │
│  │  └────────────────────┬──────────────────────────────┘  │   │
│  └───────────────────────┼──────────────────────────────────┘  │
│                           │  (lee, no modifica)                  │
│  ┌────────────────────────▼──────────────────────────────────┐  │
│  │              MÓDULOS EXISTENTES (sin cambios)              │  │
│  │   Escrituras → Protocolito → Recibos → ClientesGenerales  │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### 4.3 Principio de Integración

> **Regla de oro:** El módulo PLD **lee** el estado de las Escrituras pero **nunca bloquea ni modifica** el flujo notarial existente. Las obligaciones PLD se gestionan en paralelo, no en serie.

La única excepción: alertas de **alerta de verificación PEP** antes de la firma (notificación, no bloqueo).

---

## 5. Casos de Uso Principales

### 5.1 Diagrama de Actores

```
                    ┌─────────────┐
                    │   Sistema   │
                    │  (automát.) │
                    └──────┬──────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   ┌────▼────┐        ┌────▼────┐       ┌────▼────┐
   │ ABOGADO │        │  ADMIN  │       │  SAT    │
   │(titular)│        │  PLD    │       │(externo)│
   └────┬────┘        └────┬────┘       └────┬────┘
        │                  │                  │
        │  Gestiona         │  Configura       │  Recibe
        │  expediente PLD   │  reglas, aprueba │  avisos XML
        │  por operación    │  avisos, reportes│  y TXT
```

### 5.2 Catálogo de Casos de Uso

| ID | Caso de Uso | Actor | Prioridad |
|---|---|---|---|
| CU-01 | Detección automática de escritura con obligación PLD | Sistema | CRÍTICA |
| CU-02 | Iniciar expediente PLD para operación elegible | Sistema/ABOGADO | CRÍTICA |
| CU-03 | Capturar datos de Beneficiario Final | ABOGADO | CRÍTICA |
| CU-04 | Verificar cliente contra listas PEP y OFAC | Sistema | CRÍTICA |
| CU-05 | Completar identificación oficial en expediente | ABOGADO | CRÍTICA |
| CU-06 | Revisar y aprobar aviso antes de transmisión | ADMIN PLD | ALTA |
| CU-07 | Generar XML SPPLD (fep.xsd) para aviso | Sistema | CRÍTICA |
| CU-08 | Descargar XML para firmar y subir al SPPLD | ABOGADO/ADMIN | CRÍTICA |
| CU-09 | Registrar acuse de recibo del SAT | ABOGADO/ADMIN | ALTA |
| CU-10 | Generar TXT para DeclaraNot | Sistema | ALTA |
| CU-11 | Detectar operación sospechosa (aviso 24h) | ABOGADO/Sistema | CRÍTICA |
| CU-12 | Emitir aviso urgente en 24 horas (Art. 7 Bis) | ABOGADO | CRÍTICA |
| CU-13 | Generar Aviso en Cero mensual | Sistema | ALTA |
| CU-14 | Monitorear acumulación 6 meses por cliente | Sistema | ALTA |
| CU-15 | Consultar dashboard de cumplimiento | ADMIN PLD | ALTA |
| CU-16 | Generar reporte para auditoría anual | ADMIN PLD | ALTA |
| CU-17 | Configurar umbrales y reglas del motor | ADMIN | MEDIA |
| CU-18 | Consultar historial de avisos por período | ADMIN PLD | MEDIA |
| CU-19 | Gestionar lista PEP interna | ADMIN | MEDIA |

### 5.3 Detalle: CU-01 — Detección Automática

**Pre-condición:** Se guarda o actualiza una Escritura en el sistema.

**Flujo principal:**
1. Sistema evalúa `tipoTramite` de la Escritura contra el catálogo de actividades vulnerables.
2. Sistema recupera `valorAvaluo` / `valorOperacion` del Presupuesto vinculado.
3. Motor de reglas evalúa: ¿supera el umbral en UMA vigente?
4. Si SÍ → crea registro `ExpedientePLD` con estatus `PENDIENTE_DATOS`.
5. Notifica al abogado titular vía alerta en interfaz + Socket.io.
6. Escritura muestra badge "PLD PENDIENTE" en el DataGrid.

**Flujo alternativo (sin umbral):**
- Si el tipo de trámite no tiene umbral (poderes irrevocables, personas morales, créditos) → siempre pasa al paso 4.

**Post-condición:** `ExpedientePLD` creado y ligado a la `Escritura`.

---

## 6. Flujo de Alto Nivel

### 6.1 Ciclo de Vida de un Aviso PLD

```
                         ESCRITURA REGISTRADA
                                │
                    ┌───────────▼───────────┐
                    │   Motor de Reglas      │
                    │   ¿Es Actividad        │
                    │   Vulnerable?          │
                    └───────────┬───────────┘
                                │
               ┌────────────────┴────────────────┐
               │ NO                              │ SÍ
               ▼                                 ▼
        Sin obligación              ┌────────────────────┐
        PLD por esta                │  Crea ExpedientePLD │
        escritura                   │  Estatus: PEND_DATOS│
                                    └──────────┬─────────┘
                                               │
                              ┌────────────────▼───────────────┐
                              │  ABOGADO completa expediente    │
                              │  • Beneficiario Final           │
                              │  • Identificación oficial       │
                              │  • Verificación PEP             │
                              │  • Forma de pago (no efectivo)  │
                              └────────────────┬───────────────┘
                                               │
                              ┌────────────────▼───────────────┐
                              │  Estatus: LISTO_REVISION        │
                              │  ADMIN PLD revisa integridad    │
                              └────────────────┬───────────────┘
                                               │
                                    ┌──────────┴──────────┐
                                    │                      │
                              ┌─────▼─────┐        ┌──────▼──────┐
                              │  APROBADO │        │  RECHAZADO  │
                              │           │        │  (regresa   │
                              └─────┬─────┘        │   a edición)│
                                    │              └─────────────┘
                              ┌─────▼─────────────────────────┐
                              │  Sistema genera XML (fep.xsd)  │
                              │  Estatus: XML_GENERADO         │
                              └─────┬─────────────────────────┘
                                    │
                              ┌─────▼─────────────────────────┐
                              │  Usuario descarga XML          │
                              │  Firma con e.firma en SPPLD    │
                              │  Sube al portal SAT            │
                              └─────┬─────────────────────────┘
                                    │
                              ┌─────▼─────────────────────────┐
                              │  Registra acuse en sistema     │
                              │  Estatus: TRANSMITIDO          │
                              │  Folio SAT guardado            │
                              └───────────────────────────────┘
```

### 6.2 Flujo Paralelo: DeclaraNot

```
  ESCRITURA FIRMADA
         │
  ┌──────▼──────────────────────┐
  │ ¿Tipo: Compraventa/Donación/│
  │  Adjudicación/Corp/Socios?  │
  └──────┬──────────────────────┘
         │ SÍ
  ┌──────▼──────────────────────┐
  │  Plazo: 15 días hábiles     │
  │  desde fecha de firma       │
  │  Alerta D-5, D-2, D-0       │
  └──────┬──────────────────────┘
         │
  ┌──────▼──────────────────────┐
  │ Sistema genera TXT           │
  │ pipe-delimited UTF-8 CRLF   │
  │ Tipo 24/25/26/27 según acto │
  └──────┬──────────────────────┘
         │
  ┌──────▼──────────────────────┐
  │ Usuario sube TXT a          │
  │ DeclaraNot (portal SAT)     │
  │ Registra acuse en sistema   │
  └─────────────────────────────┘
```

### 6.3 Flujo Aviso Urgente 24 Horas (Art. 7 Bis)

```
  EVENTO SOSPECHOSO DETECTADO
  (operación inusual, cliente nervioso,
   documentos dudosos, inconsistencias)
         │
  ┌──────▼──────────────────────┐
  │  Abogado activa "Operación  │
  │  Sospechosa" en expediente  │
  └──────┬──────────────────────┘
         │
  ┌──────▼──────────────────────┐
  │  Sistema marca: URGENTE_24H │
  │  Inicia cuenta regresiva    │
  │  Alerta inmediata al ADMIN  │
  └──────┬──────────────────────┘
         │  (máx 24 horas)
  ┌──────▼──────────────────────┐
  │  Generación XML urgente     │
  │  (operación puede NO haberse│
  │   consumado — igual avisa)  │
  └──────┬──────────────────────┘
         │
  ┌──────▼──────────────────────┐
  │  Transmisión al SPPLD       │
  │  con marcador de urgencia   │
  │  Registro de acuse           │
  └─────────────────────────────┘
```

---

## 7. Obligaciones Cubiertas

### 7.1 Mapa de Obligaciones LFPIORPI → Funcionalidad

| Obligación Legal | Art. | Funcionalidad del Módulo |
|---|---|---|
| Identificar al cliente (KYC) | Art. 18 | Expediente PLD + integración ClienteGeneral |
| Identificar al Beneficiario Final | Art. 18 | Captura BF en expediente PLD |
| No aceptar efectivo sobre umbral | Art. 32 | Validación forma de pago en expediente |
| Presentar aviso mensual | Art. 17 | Generación XML + control de vencimiento |
| Aviso en cero (sin operaciones) | RCG | Generación automática mes sin ops |
| Aviso de 24 horas (sospechoso) | Art. 7 Bis | Flujo urgente con cuenta regresiva |
| Conservar expediente 10 años | Art. 18-bis | Control de retención documental |
| Verificar listas negras | RCG | Integración listas PEP/OFAC/ONU |
| Auditoría anual | Art. 18-quater | Reporte de auditoría exportable |
| Acumulación 6 meses | 2025 reform | Motor de acumulación rolling |
| Responder req. SAT en 10 días | 2025 reform | Alertas de requerimientos SAT |
| No dar aviso al cliente | Art. 46 | Instrucciones internas — no funcional |

### 7.2 Tipos de Avisos Soportados

| Tipo | Descripción | Cuándo |
|---|---|---|
| **Aviso Regular** | Operación que supera umbral | Al cerrar mes con operaciones elegibles |
| **Aviso en Cero** | Mes sin operaciones vulnerables | Automático día 1-17 de cada mes |
| **Aviso 24 Horas** | Operación sospechosa o inusual | Inmediato al detectar |
| **Aviso Complementario** | Corrección de aviso anterior | Manual, cuando hay error |

---

## 8. Lo que NO cubre este módulo

| Elemento | Justificación | Fase |
|---|---|---|
| Firma e.firma automática | SAT SPPLD no expone API. El firmado es un proceso de browser con token USB. | Manual siempre |
| Transmisión directa al SAT | No existe API REST pública del SAT para SPPLD. Proceso: generar XML → usuario lo sube. | Manual siempre |
| OCR de identificaciones | Requiere integración con servicio de OCR (Tesseract/AWS Textract). Alta complejidad. | Fase 3 |
| IA para detección de patrones | Machine learning para perfiles de riesgo. Requiere dataset histórico. | Fase 4 |
| RUPA | Registro Único de Personas Acreditadas — sistema SAT separado para identificación presencial. | Evaluación futura |
| Multi-notaría | El sistema actual es mono-notaría. Expansión requiere rediseño de tenancy. | Fuera de alcance |

---

## 9. Restricciones y Supuestos

### 9.1 Restricciones Técnicas

| Restricción | Detalle |
|---|---|
| **Sin modificar rutas existentes** | Las rutas de Escrituras, Protocolito y ClienteGeneral no cambiarán su signature ni su comportamiento actual. |
| **Sin cambiar modelos existentes** | Los modelos Mongoose actuales no se modifican. Los nuevos campos PLD van en colecciones separadas. |
| **Sin bloquear el flujo notarial** | Una alerta PLD nunca impide guardar una escritura. Es una obligación paralela. |
| **Backend Node.js / Express 5** | No se introduce otro runtime ni framework. |
| **MongoDB** | No se agrega otro motor de base de datos. Los nuevos documentos van en MongoDB. |
| **Roles existentes** | Se usa el sistema de roles actual (ADMIN, ABOGADO). Se agrega sub-rol "OFICIAL_CUMPLIMIENTO" solo en permisos, no en modelo. |
| **Formato XML fep.xsd** | La generación XML debe validarse contra el esquema oficial. Sin este paso no se puede transmitir al SPPLD. |

### 9.2 Supuestos

| Supuesto | Impacto si es falso |
|---|---|
| El SAT no cambia el esquema `fep.xsd` durante el desarrollo | Requeriría ajustar el generador XML |
| La Notaría tiene e.firma vigente para el RFC titular | Sin e.firma no se puede firmar el XML en SPPLD |
| Los valores de UMA se actualizan en enero de cada año | El motor de reglas debe tener actualización manual del valor UMA |
| El usuario descargará el XML y lo subirá manualmente al SPPLD | Si SAT abre API en el futuro, se puede automatizar |
| Los datos de ClienteGeneral existentes son suficientes como base KYC | Requiere campos adicionales para PLD (tipoIdentificacion, núm. identificacion, vigencia) |
| La Notaría tiene acceso a internet estable para descargar listas PEP | Sin esto, la verificación de listas debe ser manual |

---

## 10. Riesgos de Alto Nivel

| ID | Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|---|
| R01 | SAT cambia formato XML sin aviso previo | Media | Crítico | Parametrizar versión del esquema; monitor de cambios |
| R02 | UMA no actualizada en sistema → umbral incorrecto | Alta | Alto | Panel de configuración; alerta anual en enero |
| R03 | Escritura sin presupuesto vinculado → sin valorOperacion | Alta | Alto | Motor de reglas usa `valorAvaluo` como fallback |
| R04 | Abogado no completa expediente PLD antes del día 17 | Alta | Crítico | Alerta escalonada D-10, D-5, D-2, D-0 |
| R05 | Datos de ClienteGeneral incompletos para XML | Media | Alto | Validación de campos obligatorios antes de generar XML |
| R06 | Múltiples escrituras para mismo cliente → acumulación no detectada | Media | Alto | Motor de acumulación rolling 6 meses |
| R07 | Aviso sospechoso no reportado en 24h | Baja | Crítico | Cuenta regresiva visible; alerta a ADMIN si no se actúa |
| R08 | Pérdida de acuse SAT | Media | Alto | Almacenamiento en MongoDB + backup en filesystem |
| R09 | Cambio de legislación durante desarrollo | Media | Alto | Arquitectura modular; motor de reglas configurable |
| R10 | Falta de capacitación del personal | Alta | Medio | UX simplificada; checklist guiado en cada paso |

---

## 11. Criterios de Éxito

### 11.1 Criterios de Aceptación del Módulo

Para considerar el módulo completamente operativo deben cumplirse **todos** los siguientes:

```
□ 100% de escrituras elegibles tienen ExpedientePLD creado automáticamente
□ XML generado pasa validación contra fep.xsd sin errores
□ TXT generado carga correctamente en DeclaraNot (prueba real)
□ Sistema detecta acumulación 6 meses y genera alerta
□ Aviso en Cero se genera automáticamente en meses sin operaciones
□ Verificación PEP funciona contra lista actualizada
□ Acuses SAT se almacenan y son recuperables
□ Dashboard muestra semáforo verde/amarillo/rojo de cumplimiento
□ Reporte de auditoría anual exporta correctamente
□ Audit log es inalterable (no hay endpoint de DELETE en ExpedientePLD)
□ Roles existentes no se rompen por la adición del módulo
□ Performance: la detección automática agrega <200ms al tiempo de guardado de escritura
```

### 11.2 Métricas de Cumplimiento en Producción

| Métrica | Meta |
|---|---|
| Avisos transmitidos a tiempo (antes del día 17) | ≥ 99% |
| Expedientes con BF capturado al momento de transmisión | 100% |
| Falsos negativos (escrituras elegibles sin expediente) | 0 |
| Tiempo promedio de generación XML | < 2 segundos |
| Retención de acuses | 100% (cero pérdidas) |

---

## 12. Dependencias con Otros Documentos

| Documento | Dependencia |
|---|---|
| [02-arquitectura.md](02-arquitectura.md) | Diseño técnico de componentes, rutas API, estructura de carpetas |
| [03-modelo-datos.md](03-modelo-datos.md) | Schemas MongoDB de todas las colecciones PLD nuevas |
| [04-motor-reglas.md](04-motor-reglas.md) | Lógica de detección de actividades vulnerables y umbrales |
| [05-expediente-pld.md](05-expediente-pld.md) | Flujo completo del expediente por operación |
| [06-beneficiario-final.md](06-beneficiario-final.md) | Captura de BF y Beneficiario Controlador |
| [07-integracion-sat.md](07-integracion-sat.md) | Especificaciones XML fep.xsd y TXT DeclaraNot |
| [08-dashboard.md](08-dashboard.md) | Pantallas de cumplimiento y semáforo |
| [11-roadmap.md](11-roadmap.md) | Fases de implementación y criterios Go/No-Go |
| [12-riesgos.md](12-riesgos.md) | Análisis completo de riesgos con planes de mitigación |
| [13-backlog.md](13-backlog.md) | User stories priorizadas por fase |

---

## 13. Preguntas Pendientes

> Estas preguntas deben resolverse **antes de comenzar el desarrollo**. Algunas afectan decisiones de arquitectura.

| ID | Pregunta | Afecta | Urgencia |
|---|---|---|---|
| P01 | ¿La Notaría ya tiene cuenta en SPPLD activa? ¿Ha presentado avisos anteriores? | Flujo de prueba, datos de migración | ALTA |
| P02 | ¿Quién será el Oficial de Cumplimiento responsable (nombre, RFC)? | Configuración inicial, XML SPPLD | ALTA |
| P03 | ¿Se tiene la e.firma (.cer + .key) vigente del RFC de la Notaría? | Proceso de firma XML | ALTA |
| P04 | ¿Existen avisos presentados anteriormente que deban migrarse al sistema? | Módulo de migración histórica | MEDIA |
| P05 | ¿La Notaría tiene acceso a la lista PEP oficial del SAT/UIF en formato electrónico? | Módulo de verificación PEP | ALTA |
| P06 | ¿El tipo de trámite "Ratificación de Firmas" genera obligación PLD? (es debatido en la práctica notarial) | Motor de reglas | MEDIA |
| P07 | ¿El campo `cliente` en Escritura (actualmente texto libre) se va a vincular a `ClienteGeneral` en algún momento? | Modelo de datos PLD | ALTA |
| P08 | ¿Los presupuestos siempre tendrán `valorOperacion` antes de que se deba generar el aviso? | Lógica de umbrales | ALTA |
| P09 | ¿Se desea conservar los XML generados en el filesystem del servidor o solo en MongoDB? | Arquitectura de almacenamiento | MEDIA |
| P10 | ¿Se requiere que el módulo PLD sea accesible para el rol ASISTENTE con permisos limitados? | Control de acceso | MEDIA |

---

## Glosario

| Término | Definición |
|---|---|
| **LFPIORPI** | Ley Federal para la Prevención e Identificación de Operaciones con Recursos de Procedencia Ilícita |
| **UIF** | Unidad de Inteligencia Financiera (adscrita a SHCP) |
| **SPPLD** | Sistema del Portal de Prevención de Lavado de Dinero (portal SAT para enviar avisos) |
| **DeclaraNot** | Sistema SAT para declaraciones fiscales de actos notariales (CFF Art. 27) |
| **fep.xsd** | Esquema XML oficial para la estructura de avisos PLD en el SPPLD |
| **UMA** | Unidad de Medida y Actualización ($117.31/día en 2026, INEGI) |
| **e.firma / FIEL** | Firma Electrónica Avanzada del SAT — certificado digital (.cer) + llave privada (.key) |
| **PEP** | Persona Expuesta Políticamente (funcionarios públicos y familiares cercanos) |
| **KYC** | Know Your Customer — proceso de identificación y verificación del cliente |
| **BF** | Beneficiario Final — persona que obtiene beneficio económico real de la operación |
| **BC** | Beneficiario Controlador — persona que controla ≥25% de una persona moral (CFF) |
| **Aviso en Cero** | Informe mensual indicando que no hubo operaciones vulnerables en el período |
| **Art. 7 Bis** | Artículo LFPIORPI que obliga a reportar operaciones sospechosas en 24 horas |
| **Actividad Vulnerable** | Operación regulada por la LFPIORPI que puede generar obligación de aviso |
| **Sujeto Obligado** | Entidad o persona obligada a cumplir la LFPIORPI (en este caso, la Notaría) |

---

*Documento preparado por el equipo de arquitectura. Versión 1.0 — 2026-06-29.*
*Sujeto a revisión y aprobación antes de iniciar fase de desarrollo.*
*Ver [11-roadmap.md](11-roadmap.md) para cronograma de fases.*
