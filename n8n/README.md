# n8n + WhatsApp

Este módulo inicia el canal asistido de MicroPréstamos. El workflow recibe un evento normalizado desde la API casera, firma la petición con HMAC y usa exclusivamente `integration-v1`; n8n no accede a tablas ni recibe la service role de Supabase.

## Flujo inicial

1. El bot pregunta si el cliente puede instalar la app o necesita asistencia por WhatsApp.
2. Si elige app, entrega `https://microprestamos.vercel.app/descargar` y mantiene disponible la asistencia.
3. Si elige WhatsApp, pide consentimiento explícito.
4. Recopila datos personales, situación laboral, detalle de empleo o actividad e ingreso mensual.
5. Recopila exactamente dos contactos, CBU y titular.
6. Solicita DNI frente, DNI dorso y constancia de CBU como imágenes o PDF.
7. DeepSeek valida que cada archivo sea legible y del tipo/lado esperado, y extrae sus datos. Los PDF se convierten a una vista de sus primeras tres páginas para el análisis.
8. Repite al cliente los datos extraídos; SÍ continúa y NO deriva a revisión humana.
9. Pide el monto y muestra un resumen enmascarado.
10. La confirmación deja la solicitud pendiente de aprobación humana.
11. La decisión humana se guarda en una bandeja de salida y n8n la comunica por la API casera.

En cualquier momento, `ASESOR`, `HUMANO`, `OPERADOR` o `AYUDA` deriva la conversación.

## Desarrollo local

1. Copiar `.env.example` como `.env` y generar secretos largos distintos.
2. Ejecutar `docker compose up -d` dentro de `n8n/`.
3. Abrir `http://localhost:5678`, crear el propietario local e importar los workflows de `workflows/`.
4. Activar el workflow y enviar `fixtures/inbound-text.json` al webhook de prueba.

Hay tres workflows separados:

- `whatsapp-intake-core.json` usa un Webhook genérico para probar el diálogo sin Meta.
- `whatsapp-intake-production.json` usa un webhook y peticiones HTTP para adaptarse a la API casera de WhatsApp.
- `whatsapp-outbox-production.json` consulta decisiones pendientes, las envía por la API casera y confirma la entrega.

Los workflows de producción se importan inactivos y deben permanecer así hasta cargar la autenticación, la URL de la API y el mismo secreto HMAC en Supabase.

## Configuración de WSP Engine

- En Docker, `CUSTOM_WA_API_BASE_URL=http://host.docker.internal:3001` y `CUSTOM_WA_API_SEND_PATH=/v1/messages/send`.
- WSP Engine recibe llamadas salientes con `Authorization: Bearer <WSP_API_TOKEN>`.
- WSP Engine reenvía mensajes entrantes a `http://127.0.0.1:5678/webhook/microprestamos/whatsapp/custom/inbound` usando `x-webhook-secret`.
- El mismo `N8N_SHARED_SECRET` configurado como secreto de la Edge Function.
- `DEEPSEEK_API_KEY` se configura sólo como secreto de Supabase; nunca se envía a n8n, la web o la app.

### Contrato integrado

El webhook acepta el objeto emitido por WSP Engine con remitente, identificador único y tipo. Las imágenes incluyen base64, tipo MIME y nombre. En un PDF, WSP Engine agrega una vista JPEG sólo para el análisis con `deepseek-flash`; la Edge Function conserva el PDF original en el bucket privado `client-documents`. El límite por adjunto original es 6 MiB.

La salida hace `POST /v1/messages/send` con `{ "to", "type", "text" }` y admite además `file` o `audio`.

No registrar cuerpos completos, documentos, DNI o CBU en el historial de ejecuciones de producción. Configurar poda de ejecuciones y retención antes de usar datos reales.
