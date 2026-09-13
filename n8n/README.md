# n8n + WhatsApp

Este módulo inicia el canal asistido de MicroPréstamos. El workflow recibe un evento normalizado o un webhook de Meta, firma la petición con HMAC y usa exclusivamente `integration-v1`; n8n no accede a tablas ni recibe la service role de Supabase.

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
3. Abrir `http://localhost:5678`, crear el propietario local e importar `workflows/whatsapp-intake-core.json`.
4. Activar el workflow y enviar `fixtures/inbound-text.json` al webhook de prueba.

El workflow comienza con un Webhook genérico para poder probarlo sin Meta. Al conectar producción se sustituye ese disparador por **WhatsApp Trigger / Messages** y se agrega **WhatsApp Business Cloud / Message Send** para cada elemento de `messages` devuelto por Supabase.

## Credenciales pendientes para WhatsApp real

- Instancia n8n pública con HTTPS.
- Meta Developer App en modo Live y Business Portfolio.
- WhatsApp Business Account ID, Phone Number ID y Access Token.
- OAuth2 Client ID/Secret para WhatsApp Trigger.
- El mismo `N8N_SHARED_SECRET` configurado como secreto de la Edge Function.

No registrar cuerpos completos, documentos, DNI o CBU en el historial de ejecuciones de producción. Configurar poda de ejecuciones y retención antes de usar datos reales.

