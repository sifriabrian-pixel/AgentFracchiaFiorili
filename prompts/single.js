// prompts/single.js
// Prompt para cuando el lead manda un link con ID exacto de la web propia
// Claude recibe SOLO esa propiedad — sin posibilidad de mezclar datos

export function buildSinglePropertyPrompt(prop, env) {
  const dir = (
    prop.direccion &&
    !prop.direccion.includes('\n') &&
    prop.direccion !== prop.titulo &&
    prop.direccion.length < 80
  ) ? prop.direccion : null

  const lines = [
    'ID: ' + prop.id,
    'URL: ' + prop.url,
    'Título: ' + prop.titulo,
    'Operación: ' + prop.operacion,
    prop.tipo       ? 'Tipo: ' + prop.tipo        : null,
    dir             ? 'Dirección: ' + dir          : null,
    'Precio: ' + prop.precio,
    prop.ambientes   ? 'Ambientes: ' + prop.ambientes   : null,
    prop.dormitorios ? 'Dormitorios: ' + prop.dormitorios : null,
    prop.banos       ? 'Baños: ' + prop.banos       : null,
    prop.supCubierta ? 'Sup. cubierta: ' + prop.supCubierta : null,
    prop.supTotal    ? 'Sup. total: ' + prop.supTotal    : null,
    prop.financiacion?.length ? 'Financiación: ' + prop.financiacion.join(', ') : null,
    prop.descripcion ? 'Descripción: ' + prop.descripcion.substring(0, 400) : null,
  ].filter(Boolean).join('\n')

  const precioLabel = prop.operacion === 'Alquiler' ? prop.precio + '/mes' : prop.precio

  const superficieLinea = (prop.supCubierta || prop.supTotal)
    ? '📐 *Superficie:* ' + (prop.supCubierta || '') + (prop.supCubierta && prop.supTotal ? ' cubiertos / ' : '') + (prop.supTotal ? prop.supTotal + ' totales' : '')
    : null

  const ambientesLinea = prop.ambientes
    ? '🛏️ *Ambientes:* ' + prop.ambientes + ' amb.' + (prop.dormitorios ? ' | ' + prop.dormitorios + ' dorm.' : '') + (prop.banos ? ' | ' + prop.banos + ' baño(s)' : '')
    : null

  const financiacionLinea = prop.financiacion?.length
    ? '💳 *Financiación:* ' + prop.financiacion.join(', ')
    : null

  const fichaFormateada = [
    '🏠 *' + prop.titulo + '*',
    dir ? '📍 *Ubicación:* ' + dir : null,
    '💰 *Precio:* ' + precioLabel,
    superficieLinea,
    ambientesLinea,
    financiacionLinea,
    '🔗 *Ver en web:* ' + prop.url,
  ].filter(Boolean).join('\n')

  const requisitosAlquiler = prop.operacion === 'Alquiler'
    ? '\n\n📋 *Requisitos para alquilar:*\n• 1 garantía propietaria o 3 garantes con recibos de sueldo a conformidad del locador\n• Justificación de ingresos del inquilino\n• Gastos de ingreso: valor del alquiler x 4'
    : ''

  return `Sos Valeria, asistente virtual de Fracchia-Fiorioli Propiedades.

El lead consultó por una propiedad específica. Estos son los datos EXACTOS — usá ÚNICAMENTE estos datos:

${lines}

INSTRUCCIONES:
1. Saludá y presentá esta ficha tal cual, sin modificar ningún dato:

${fichaFormateada}${requisitosAlquiler}

2. Luego preguntá: "¿Esta propiedad se ajusta a lo que estás buscando? ¿Te gustaría coordinar una visita o tenés alguna duda? 😊"

3. Si quiere agendar respondé:
"¡Perfecto! Podés reservar tu visita desde acá 👇
📅 ${env.CALENDLY_LINK}
💬 wa.me/${env.WHATSAPP_ASESOR}
Avisame cuando confirmes la fecha 😊"

4. Si confirmó que agendó, cerrá con: fracchiapropiedades.com.ar

5. Si pregunta algo que no tenés, respondé:
"Disculpá, no tengo ese dato. Para consultarlo podés escribirle a uno de nuestros asesores:\n📱 wa.me/${env.WHATSAPP_CONSULTAS}\n📱 +54 9 11 6701-2528\n📱 +54 9 11 7366-0495 😊"

Siempre cerrá con el bloque de triggers:
<triggers>
{
  "fichaEnviada": false,
  "linkEnviado": false,
  "agendoConfirmado": false,
  "grupoNotificar": false,
  "propiedadInteres": "${(prop.titulo || '').substring(0, 50)}"
}
</triggers>

Respondé en español rioplatense, tono cálido y profesional.`
}
