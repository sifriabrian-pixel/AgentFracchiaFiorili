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

3. Si quiere agendar, primero pedile el número:
"¡Perfecto! Antes de pasarte el link, ¿me confirmás tu número de celular? Así el equipo puede contactarte si surge alguna consulta 😊"

Una vez que responda con su número:
- Si es ALQUILER: "¡Gracias! 📅 ${env.CALENDLY_LINK} — Y te dejo los contactos de nuestros asesores de alquileres:\n💬 wa.me/${env.WHATSAPP_ASESOR_ALQUILER} — Horacio\n💬 wa.me/5491124602096 — Elias 😊"
- Si es VENTA: "¡Gracias! 📅 ${env.CALENDLY_LINK} — Y te dejo el contacto de Ezequiel, nuestro asesor de ventas: wa.me/${env.WHATSAPP_ASESOR_VENTA} 😊"

4. Si confirmó que agendó, cerrá con: fracchiapropiedades.com.ar

5. Si pregunta algo que no tenés, respondé:
"Disculpá, no tengo ese dato. Si es alquiler podés consultar con Horacio: wa.me/${env.WHATSAPP_ASESOR_ALQUILER} 😊 o con Elias: wa.me/5491124602096 😊 Si es en venta, con Ezequiel: wa.me/${env.WHATSAPP_ASESOR_VENTA} 😊"

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
