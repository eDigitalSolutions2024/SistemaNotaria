// backend/services/poderInspeccionService.js
// Lee el texto de un .docx de Poder (ya redactado por el abogado, con el
// cliente) y le pide a Claude que lo revise antes de que se tome el número
// de escritura — detecta huecos/errores comunes y da un porcentaje. Es
// informativo: no bloquea, el abogado decide si toma el número de todos
// modos (candado de negocio definido así a propósito).
const mammoth = require('mammoth');
const Anthropic = require('@anthropic-ai/sdk');

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

Si te doy una lista de "Datos registrados en el sistema", compara cada dato contra el texto del documento y repórtalo en "comparacionDatos": para cada persona/campo di si aparece en el documento y si coincide exactamente (nombre completo, CURP, RFC, domicilio) — los nombres pueden variar ligeramente en orden o mayúsculas, pero CURP y RFC deben coincidir carácter por carácter. Si no te doy esa lista, deja "comparacionDatos" vacío.

NO inventes números de artículo ni cites leyes específicas — no tienes acceso al texto legal real, solo señala el hallazgo de redacción/consistencia. NO evalúes formato de Word (tipografía, márgenes) ni des opinión legal sobre si el poder "conviene" al cliente — solo completitud y consistencia del contenido para protocolizarse.

Llama SIEMPRE a la herramienta "reportar_inspeccion_poder" con tu resultado. Si el documento se ve completo y consistente, "sugerencias" puede ir vacío y "porcentaje" debe ser alto (90-100).`;

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
        porcentaje: {
          type: 'integer',
          minimum: 0,
          maximum: 100,
          description: 'Qué tan listo está el documento para tomar número de escritura',
        },
        resumen: {
          type: 'string',
          description: '1-2 frases con el hallazgo más importante, o confirmando que se ve completo',
        },
        sugerencias: {
          type: 'array',
          items: { type: 'string' },
          description: 'Mejoras concretas encontradas; arreglo vacío si no hay ninguna',
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
      required: ['porcentaje', 'resumen', 'sugerencias'],
    },
  },
];

function normalizarResultado(input) {
  const porcentaje = Number(input?.porcentaje);
  return {
    porcentaje: Number.isFinite(porcentaje) ? Math.max(0, Math.min(100, Math.round(porcentaje))) : null,
    resumen: String(input?.resumen || '').trim(),
    sugerencias: Array.isArray(input?.sugerencias)
      ? input.sugerencias.map(s => String(s || '').trim()).filter(Boolean)
      : [],
    comparacionDatos: Array.isArray(input?.comparacionDatos)
      ? input.comparacionDatos.map(d => ({
          persona: String(d?.persona || '').trim(),
          campo: String(d?.campo || '').trim(),
          esperado: String(d?.esperado || '').trim(),
          coincide: Boolean(d?.coincide),
          nota: String(d?.nota || '').trim(),
        })).filter(d => d.persona && d.campo)
      : [],
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
    max_tokens: 1500,
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
    resultado = { porcentaje: null, resumen: 'No se pudo interpretar la respuesta de la IA.', sugerencias: [], comparacionDatos: [] };
  }

  const previewHtml = await convertirAPreviewHtml(buffer);

  return { ...resultado, textoLargo, previewHtml };
}

module.exports = { inspeccionarPoder, extraerTexto };
