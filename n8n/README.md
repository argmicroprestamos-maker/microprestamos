# n8n + WhatsApp

Este módulo inicia el canal asistido de MicroPréstamos. El workflow recibe un evento normalizado desde la API casera, firma la petición con HMAC y usa exclusivamente `integration-v1`; n8n no accede a tablas ni recibe la service role de Supabase.

## Flujo inicial

1. El bot pregunta si el cliente puede instalar la app o necesita asistencia por WhatsApp.
2. Si elige app, entrega `https://microprestamos.vercel.app/descargar` y mantiene disponible la asistencia.
3. Si elige WhatsApp, pide consentimiento explícito.
4. Recopila datos personales, exactamente dos contactos, CBU y titular.
5. Solicita DNI frente, DNI dorso y constancia de CBU.
6. Pide el monto y muestra un resumen enmascarado.
7. La confirmación pasa el caso a revisión humana; este flujo no aprueba ni desembolsa dinero.

En cualquier momento, `ASESOR`, `HUMANO`, `OPERADOR` o `AYUDA` deriva la conversación.

## Desarrollo local

1. Copiar `.env.example` como `.env` y generar secretos largos distintos.
2. Ejecutar `docker compose up -d` dentro de `n8n/`.
3. Abrir `http://localhost:5678`, crear el propietario local e importar los workflows de `workflows/`.
4. Activar el workflow y enviar `fixtures/inbound-text.json` al webhook de prueba.

Hay dos workflows separados:

- `whatsapp-intake-core.json` usa un Webhook genérico para probar el diálogo sin Meta.
- `whatsapp-intake-production.json` usa un webhook y peticiones HTTP para adaptarse a la API casera de WhatsApp.

El workflow de producción se importa inactivo y debe permanecer así hasta cargar las credenciales y la URL pública.

## Configuración pendiente de la API casera

- Instancia n8n pública con HTTPS.
- URL base y ruta para enviar mensajes (`CUSTOM_WA_API_BASE_URL` y `CUSTOM_WA_API_SEND_PATH`).
- Encabezado y valor de autenticación para las llamadas salientes.
- Secreto del webhook entrante en `x-webhook-secret`, `x-api-key` o `Authorization: Bearer`.
- El mismo `N8N_SHARED_SECRET` configurado como secreto de la Edge Function.

### Contrato provisional

El webhook acepta un objeto directo, dentro de `body`, `message` o `data`. Necesita remitente (`from`, `sender` o `phone`), identificador único (`id`, `message_id` o `event_id`) y `type`. Para archivos o audios puede recibir `media`, `file`, `audio`, `image` o `document`, con `id`/`file_id`/`url`, tipo MIME y nombre.

La salida provisional hace `POST` a la ruta configurada con `{ "to", "type", "text" }`; ya deja reservados `file` y `audio`. Ajustaremos este adaptador a los nombres exactos de la API sin cambiar el resto del sistema.

No registrar cuerpos completos, documentos, DNI o CBU en el historial de ejecuciones de producción. Configurar poda de ejecuciones y retención antes de usar datos reales.
