// backend/services/poderInspeccionService.js
// Lee el texto de un .docx de Poder (ya redactado por el abogado, con el
// cliente) y le pide a Claude que lo revise antes de que se tome el número
// de escritura — detecta huecos/errores comunes y da un porcentaje. Es
// informativo: no bloquea, el abogado decide si toma el número de todos
// modos (candado de negocio definido así a propósito).
const mammoth = require('mammoth');
const Anthropic = require('@anthropic-ai/sdk');
const ClienteGeneral = require('../models/ClienteGeneral');

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5';

// Documentos de poder suelen ser largos; recortamos para controlar costo y
// porque lo que importa para esta revisión (comparecientes, facultades,
// cláusulas) normalmente está completo bastante antes de este límite.
const MAX_CHARS = 60000;

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const err = new Error('ANTHROPIC_API_KEY no está configurada en el servidor.');
    err.code = 'NO_API_KEY';
    throw err;
  }
  return new Anthropic({ apiKey });
}

async function extraerTexto(buffer) {
  const { value } = await mammoth.extractRawText({ buffer });
  return String(value || '').trim();
}

// Vista previa de solo lectura (encabezados/negritas/listas básicas) — NUNCA
// se usa para guardar ni para tocar el .docx real, solo para que el abogado
// vea el contenido sin tener que abrir Word.
async function convertirAPreviewHtml(buffer) {
  try {
    const { value } = await mammoth.convertToHtml({ buffer });
    return String(value || '');
  } catch {
    return '';
  }
}

const SYSTEM_PROMPT = `Eres un asistente que apoya a una notaría pública mexicana revisando un documento de PODER ya redactado por un abogado, justo antes de que se le asigne número de escritura.

Tu trabajo es detectar huecos, inconsistencias o errores comunes en poderes notariales mexicanos, por ejemplo:
- Datos de comparecientes (poderdante/apoderado) incompletos: nombre, CURP, RFC, domicilio, estado civil, nacionalidad, identificación.
- Facultades del poder mal redactadas, ambiguas, o que falten (ej. "actos de administración", "actos de dominio", "pleitos y cobranzas") si el tipo de poder las requiere.
- Cláusulas estándar faltantes (revocación de poderes anteriores, limitaciones, vigencia si aplica).
- Si te indico que el poder es REVOCABLE: debe quedar claro que el otorgante puede revocarlo en cualquier momento (cláusula de revocabilidad), y marca como hallazgo si el texto lo redacta como irrevocable o es ambiguo.
- Si te indico que el poder es IRREVOCABLE: debe incluir la cláusula de irrevocabilidad y la causa/razón que la sustenta (p. ej. ser condición de un contrato bilateral), y marca como hallazgo si falta esa causa o el texto no lo declara irrevocable.
- Inconsistencias de nombres/fechas dentro del mismo documento.
- Errores ortográficos o de redacción graves (no estilo, solo lo que afecte claridad o validez).
- Placeholders sin llenar (ej. "{{NOMBRE}}", "XXXX", espacios en blanco evidentes, "[dato pendiente]").
- Concordancia de número (singular/plural) y género al referirse a los comparecientes: cuenta cuántos
  poderdantes y cuántos apoderados hay en el documento y revisa que el texto use singular o plural de
  forma consistente con esa cantidad (ej. si solo hay un poderdante, debe decir "el compareciente"/"la
  compareciente", "el señor"/"la señora", NO "los comparecientes"/"los señores"; si hay varios, debe usar
  plural de forma consistente). Revisa también que el género sea el correcto para cada persona según como
  el propio documento la nombra (ej. "la compareciente" para una mujer, no "el compareciente"). Señala
  como hallazgo cualquier mezcla de singular/plural para la misma persona o género incorrecto, citando la
  frase exacta donde ocurre.

Si te doy una lista de "Datos registrados en el sistema", compara cada dato contra el texto del documento y repórtalo en "comparacionDatos": para cada persona/campo di si aparece en el documento y si coincide exactamente (nombre completo, CURP, RFC, domicilio) — los nombres pueden variar ligeramente en orden o mayúsculas, pero CURP y RFC deben coincidir carácter por carácter. Si no te doy esa lista, deja "comparacionDatos" vacío.

NO inventes números de artículo ni cites leyes específicas — no tienes acceso al texto legal real, solo señala el hallazgo de redacción/consistencia. NO evalúes formato de Word (tipografía, márgenes) ni des opinión legal sobre si el poder "conviene" al cliente — solo completitud y consistencia del contenido para protocolizarse.

REGLA IMPORTANTE sobre "resumen" y "hallazgos": el "resumen" es solo 1-2 frases generales. CADA problema que menciones en el resumen DEBE aparecer también como un ítem individual en "hallazgos". Nunca dejes "hallazgos" vacío si el resumen menciona algún problema. NO calcules ni reportes porcentaje: el sistema lo calcula solo a partir de la gravedad de tus hallazgos.

Cada hallazgo lleva:
- "problema": qué está mal y cómo corregirlo, en una frase concreta.
- "ubicacion": dónde está en el documento, en lenguaje que el abogado pueda ubicar a simple vista (ej. "Encabezado", "Comparecencia, primer párrafo", "Cláusula VIII – Actividad Vulnerable", "Cierre, Cláusula X"). Si el problema es algo que NO aparece en el documento (cláusula faltante), dilo así: "No aparece en el documento (debería ir en …)".
- "cita": copia LITERAL y EXACTA, carácter por carácter, de 4 a 15 palabras del documento donde ocurre el problema (se usa para subrayarla automáticamente en la vista previa, así que no la parafrasees, no cambies mayúsculas ni puntuación, no unas fragmentos distantes). Si el problema es algo que falta y no hay texto que citar, deja "cita" vacía. Un hallazgo por cada lugar distinto donde ocurre el problema (si "el compareciente" aparece mal en tres frases, son tres hallazgos).

- "correccion": el texto EXACTO que debería quedar en el documento, listo para copiar y pegar en Word. Si hay "cita", escribe cómo debe quedar esa misma frase ya corregida (mismo estilo y redacción del documento, solo con el arreglo aplicado; si necesita más contexto que la cita, reescribe la frase completa). Si el problema es algo que falta, redacta la cláusula o texto completo a insertar y en "ubicacion" indica dónde. NO inventes datos que no estén en el documento ni en los "Datos registrados en el sistema" (nombres, CURP, RFC, domicilios, fechas, causas concretas): usa un marcador entre corchetes como [CAUSA DE LA IRREVOCABILIDAD] o [CURP DEL OTORGANTE] para que el abogado lo complete. NO cites números de artículo ni leyes específicas. Si no hay forma razonable de dar el texto (ej. solo hay que verificar algo), deja "correccion" vacía.
- "gravedad": clasifica con estos criterios, de forma consistente:
  · "critico": afecta la validez o la identificación — poder irrevocable sin causa o sin cláusula de irrevocabilidad; poder revocable redactado como irrevocable; datos de identificación del otorgante o apoderado faltantes; otorgante o apoderado designado de forma contradictoria; facultades esenciales ausentes o contradictorias; placeholders sin llenar en datos clave; cita legal que contradice el texto.
  · "importante": no invalida pero debe corregirse — error de concordancia de género o número; cláusula estándar faltante; inconsistencias de nombres o fechas; facultades ambiguas.
  · "menor": ortografía o redacción que no afecta el sentido.

Los datos del sistema que no coincidan con el documento (CURP, RFC, nombre, domicilio) repórtalos SOLO en "comparacionDatos" con coincide=false, NO los repitas en "hallazgos" (el sistema ya los descuenta por su cuenta).

Llama SIEMPRE a la herramienta "reportar_inspeccion_poder" con tu resultado. Si el documento se ve completo y consistente, "hallazgos" va vacío.`;

// Tool-use en vez de pedirle el JSON como texto libre: la API valida y
// estructura la respuesta contra este schema, así que no depende de que el
// modelo escriba puntuación perfecta a mano (ya nos pasó: una vez devolvió
// un ";" en lugar de "," y tronaba el JSON.parse de texto libre).
const TOOLS = [
  {
    name: 'reportar_inspeccion_poder',
    description: 'Reporta el resultado de la revisión del documento de Poder.',
    input_schema: {
      type: 'object',
      properties: {
        resumen: {
          type: 'string',
          description: '1-2 frases con el hallazgo más importante, o confirmando que se ve completo',
        },
        hallazgos: {
          type: 'array',
          description: 'Un ítem por cada problema encontrado, con su ubicación y cita literal; arreglo vacío si no hay ninguno',
          items: {
            type: 'object',
            properties: {
              problema: { type: 'string', description: 'Qué está mal y cómo corregirlo' },
              ubicacion: { type: 'string', description: 'Dónde está en el documento (sección, cláusula o párrafo)' },
              cita: { type: 'string', description: 'Fragmento LITERAL de 4-15 palabras copiado exacto del documento; vacío si el problema es algo que falta' },
              correccion: { type: 'string', description: 'Texto exacto sugerido para reemplazar la cita (o para insertar si falta algo), listo para pegar en Word; marcadores [ASÍ] para datos que no se tengan; vacío si no aplica' },
              gravedad: { type: 'string', enum: ['critico', 'importante', 'menor'], description: 'critico | importante | menor (ver criterios del prompt)' },
            },
            required: ['problema', 'ubicacion', 'cita', 'correccion', 'gravedad'],
          },
        },
        comparacionDatos: {
          type: 'array',
          description: 'Verificación de los datos del sistema (si se proporcionaron) contra el texto del documento. Vacío si no se dieron datos a comparar.',
          items: {
            type: 'object',
            properties: {
              persona: { type: 'string', description: 'A quién pertenece el dato, ej. "Juan Pérez (Poderdante)"' },
              campo: { type: 'string', description: 'Qué dato es: Nombre, CURP, RFC o Domicilio' },
              esperado: { type: 'string', description: 'El valor que viene del sistema' },
              coincide: { type: 'boolean', description: 'true si aparece en el documento y coincide; false si falta o no coincide' },
              nota: { type: 'string', description: 'Breve aclaración si coincide=false, o vacío' },
            },
            required: ['persona', 'campo', 'esperado', 'coincide'],
          },
        },
      },
      required: ['resumen', 'hallazgos'],
    },
  },
];

// Puntos que resta cada hallazgo según su gravedad. El porcentaje lo calcula
// el servidor con esta fórmula fija (la IA ya NO decide el número), así que el
// mismo documento con los mismos hallazgos siempre da el mismo porcentaje.
const PESOS = { critico: 20, importante: 8, menor: 2 };
const GRAVEDADES = Object.keys(PESOS);

// Dato del sistema que no coincide con el documento: CURP/RFC son críticos
// (identifican a la persona); nombre/domicilio, importantes.
function gravedadDeDato(campo) {
  return /curp|rfc/i.test(campo) ? 'critico' : 'importante';
}

function calcularPorcentaje(hallazgos, comparacionDatos) {
  const desglose = { critico: 0, importante: 0, menor: 0 };
  hallazgos.forEach(h => { desglose[h.gravedad] += 1; });
  comparacionDatos.filter(d => !d.coincide).forEach(d => { desglose[gravedadDeDato(d.campo)] += 1; });
  const descuento = GRAVEDADES.reduce((s, g) => s + desglose[g] * PESOS[g], 0);
  return {
    porcentaje: Math.max(0, 100 - descuento),
    desglose: { ...desglose, descuento, pesos: PESOS },
  };
}

function normalizarResultado(input) {
  const resumen = String(input?.resumen || '').trim();
  const hallazgos = Array.isArray(input?.hallazgos)
    ? input.hallazgos.map(h => ({
        problema: String(h?.problema || '').trim(),
        ubicacion: String(h?.ubicacion || '').trim(),
        cita: String(h?.cita || '').trim(),
        correccion: String(h?.correccion || '').trim(),
        gravedad: GRAVEDADES.includes(h?.gravedad) ? h.gravedad : 'importante',
      })).filter(h => h.problema)
    : [];
  const comparacionDatos = Array.isArray(input?.comparacionDatos)
    ? input.comparacionDatos.map(d => ({
        persona: String(d?.persona || '').trim(),
        campo: String(d?.campo || '').trim(),
        esperado: String(d?.esperado || '').trim(),
        coincide: Boolean(d?.coincide),
        nota: String(d?.nota || '').trim(),
      })).filter(d => d.persona && d.campo)
    : [];
  // "sugerencias" (texto plano) se deriva de los hallazgos: es lo que se
  // guarda en Escritura/Protocolito (arreglo de strings) y lo que usa el
  // frontend si no hay hallazgos estructurados.
  const sugerencias = hallazgos.map(h => (h.ubicacion ? `[${h.ubicacion}] ${h.problema}` : h.problema));
  const { porcentaje, desglose } = calcularPorcentaje(hallazgos, comparacionDatos);
  return {
    porcentaje,
    desglose,
    resumen,
    sugerencias,
    hallazgos,
    comparacionDatos,
  };
}

// Arma el bloque de "datos registrados en el sistema" que se le manda a
// Claude como TEXTO (no instrucciones) para que los compare contra el
// documento. contexto.personas viene de ClienteGeneral (Poderdante/Apoderado
// ya capturados en "Registrar Datos Generales"); contexto.subtipo es
// Revocable/Irrevocable.
function buildContextoBlock(contexto) {
  const personas = Array.isArray(contexto?.personas) ? contexto.personas : [];
  const subtipo = String(contexto?.subtipo || '').trim();

  if (!personas.length && !subtipo) return '';

  let bloque = '';
  if (subtipo) {
    bloque += `Tipo de poder seleccionado en el sistema: ${subtipo}.\n\n`;
  }
  if (personas.length) {
    bloque += 'Datos registrados en el sistema para este trámite (verifica cada uno contra el documento y repórtalo en "comparacionDatos"):\n';
    personas.forEach((p, i) => {
      const nombre = p.nombre_completo || `Persona ${i + 1}`;
      const rol = p.rol ? ` (${p.rol})` : '';
      bloque += `- ${nombre}${rol}: CURP=${p.curp || 'N/D'}, RFC=${p.rfc || 'N/D'}, Domicilio=${p.domicilio || 'N/D'}\n`;
    });
  }
  return bloque.trim();
}

/**
 * @param {Buffer} buffer - contenido del .docx subido
 * @param {{subtipo?: string, personas?: Array}} [contexto] - datos ya capturados en el sistema (ClienteGeneral) para comparar contra el documento; opcional
 * @returns {Promise<{porcentaje:number|null, resumen:string, sugerencias:string[], comparacionDatos:Array, textoLargo:boolean}>}
 */
async function inspeccionarPoder(buffer, contexto) {
  const textoCompleto = await extraerTexto(buffer);
  if (!textoCompleto) {
    throw Object.assign(new Error('No se pudo leer texto del documento (¿está vacío o es una imagen escaneada?).'), { code: 'SIN_TEXTO' });
  }

  const textoLargo = textoCompleto.length > MAX_CHARS;
  const texto = textoLargo ? textoCompleto.slice(0, MAX_CHARS) : textoCompleto;
  const contextoBlock = buildContextoBlock(contexto);

  const userContent = contextoBlock
    ? `${contextoBlock}\n\nTexto del documento de Poder a revisar:\n\n"""\n${texto}\n"""`
    : `Texto del documento de Poder a revisar:\n\n"""\n${texto}\n"""`;

  const anthropic = getClient();
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    tools: TOOLS,
    tool_choice: { type: 'tool', name: 'reportar_inspeccion_poder' },
    messages: [
      { role: 'user', content: userContent },
    ],
  });

  const toolUse = msg?.content?.find(c => c.type === 'tool_use' && c.name === 'reportar_inspeccion_poder');

  let resultado;
  if (toolUse?.input) {
    resultado = normalizarResultado(toolUse.input);
  } else {
    // No debería pasar con tool_choice forzado, pero por si acaso no
    // tumbamos el flujo — el candado es informativo, así que degradamos a
    // "no se pudo calificar" en vez de bloquear tomar el número.
    resultado = { porcentaje: null, resumen: 'No se pudo interpretar la respuesta de la IA.', sugerencias: [], hallazgos: [], comparacionDatos: [], desglose: null };
  }

  const previewHtml = await convertirAPreviewHtml(buffer);

  return { ...resultado, textoLargo, previewHtml };
}

// ===== Helpers compartidos por cualquier módulo que tome Poderes =====
// (Escrituras y Protocolito, hoy; ambos los usan EXACTAMENTE igual — vive
// aquí para que no haya dos copias que se puedan desalinear.)

function esTramitePoder(tipo) {
  return /poder/i.test(String(tipo || ''));
}

function getSubtipoPoder(tipo) {
  const t = String(tipo || '').toLowerCase();
  if (t.includes('irrevocable')) return 'Irrevocable';
  if (t.includes('revocable')) return 'Revocable';
  return '';
}

// Arma el contexto (datos ya capturados del cliente + subtipo) que se le
// pasa a la IA para comparar contra el documento del Poder. Si no hay
// clienteId o no hay ClienteGeneral capturados, regresa un contexto "vacío"
// — la inspección sigue funcionando igual, solo sin esa comparativa.
async function buildPoderContexto(clienteId, tipoTramite) {
  const subtipo = getSubtipoPoder(tipoTramite);
  let personas = [];
  if (clienteId) {
    const num = Number(clienteId);
    if (Number.isFinite(num)) {
      try {
        const docs = await ClienteGeneral.find({ clienteId: num }).lean();
        personas = docs.map(d => ({
          nombre_completo: d.nombre_completo || '',
          rol: d.rol || '',
          curp: d.curp || '',
          rfc: d.rfc || '',
          domicilio: d.domicilio || '',
        }));
      } catch (e) {
        console.error('buildPoderContexto ClienteGeneral ERROR:', e.message);
      }
    }
  }
  return { subtipo, personas };
}

module.exports = { inspeccionarPoder, extraerTexto, esTramitePoder, getSubtipoPoder, buildPoderContexto };
