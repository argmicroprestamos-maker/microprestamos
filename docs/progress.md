# Progreso de implementación

## Completado

- Monorepo inicial y scripts de web.
- Marca SVG y guía visual.
- Landing, `/descargar`, `/privacidad`, `/terminos` y `/admin`.
- Migraciones Supabase aplicadas al proyecto `yncfmpbapocdxcmqdeke`.
- RLS, Storage privado, cálculo flat-v1 y creación transaccional de cronograma.
- Edge Functions activas: `health`, `n8n-webhook`, `integration-v1`, `admin-api`.
- Edge Function `client-api` activa y protegida por JWT: perfil, productos, cotización, documentos y solicitudes; Android declara permiso `INTERNET`.
- Contrato OpenAPI inicial.
- Contratos de dominio compartidos en `packages/contracts/domain.ts`; el generador Supabase no expone el esquema `private` intencionalmente.
- Manual operativo agregado en `docs/operations.md` con modo demo, revisión, incidentes, backup/restauración y rollback.
- Matriz de decisiones de fase 0 documentada en `docs/decisions.md`, incluyendo bloqueos legales y de cuentas.
- Auditoría de secretos: no hay keystore ni claves privadas en Git; `npm audit --omit=dev` reporta 0 vulnerabilidades.
- Supabase verificado: 5 Edge Functions ACTIVE y 12 migraciones registradas en el proyecto; el webhook n8n arranca y rechaza llamadas no autenticadas con 401.
- Build Next.js verificado.
- Build Android debug y release unsigned verificados con Gradle 8.10.2/JDK 17.
- APK release `0.1.1` firmado y verificado; publicado en `https://github.com/argmicroprestamos-maker/microprestamos/releases/tag/v0.1.1` con SHA-256 `006E362FAC3E786B61F4298464F5DD7D5CC7F3872539E51AF47EC48D1AAEE80A`.
- Producción Vercel verificada en `https://microprestamos.vercel.app`; la landing y `/descargar` enlazan al release de GitHub.
- Panel `/admin` conectado a Supabase Auth y `admin-api`, con bloqueo por rol.
- Panel `/admin` ahora carga y lista solicitudes recientes reales desde `admin-api`, además del resumen por estado.
- Landing pública incorpora simulador interactivo de monto, porcentaje y cuotas con total e importe de cuota.
- Rutas públicas completas: `/`, `/descargar`, `/privacidad`, `/terminos` y `/contacto`; landing incluye FAQ.
- Build web repetido correctamente después de integrar Auth.
- Dependencias web auditadas: Next.js actualizado a `16.3.5`; `npm audit --omit=dev` ahora reporta 0 vulnerabilidades y `npm run web:build` pasa.
- Smoke test local verificado: landing y `/admin` renderizan; `/downloads/microprestamos.apk` responde HTTP 200, MIME APK y SHA-256 coincide.
- Invariante DB aplicada: no permite posiciones duplicadas y bloquea el envío sin dos contactos consentidos, cuenta principal y los tres documentos requeridos cargados; la revisión ocurre después del envío.
- Máquina de estados aplicada en Postgres para solicitudes, préstamos, cuotas, desembolsos y pagos; cinco triggers verificados.
- Activos de marca exportados: SVG horizontal/símbolo, PNG 1024/512/192/64, favicon e icono 192/64.
- Seed ficticio y prueba pgTAP inicial agregados; `gradlew test` verificado.
- Smoke automatizado (`npm run smoke`) verificado: build web, firma APK, health Supabase y rechazo 401 del API de cliente.
- Cliente Android conectado al backend: OTP por teléfono, JWT, perfil, consentimiento, dos contactos, carga a Storage privado, registro de documentos, cotización y envío de solicitud. Requiere configurar una clave publicable y proveedor SMS para la prueba física.
- Validación de checksum CBU añadida en Postgres y aplicada al alta/actualización de cuentas bancarias.
- Panel de operaciones ampliado con revisión/aprobación/rechazo auditados, creación de préstamo y cuotas, registro manual de desembolso ya realizado y distribución de pagos por cuota; cada operación se vuelve a autorizar en la base de datos.
- Sesión Android cifrada con Android Keystore, refresh token, restauración al reabrir, consulta/actualización del estado de solicitudes y cronograma de cuotas.
- Suite pgTAP ampliada para cálculo, checksum CBU, índices e invariantes de triggers; la ejecución remota de GitHub Actions `verify` pasó con los trabajos web, base y Android.
- Cabeceras web de seguridad configuradas: CSP con orígenes explícitos, HSTS, anti-frame, anti-MIME sniffing, política de permisos y referrer restrictiva.
- Bucket de documentos restringido a 10 MB/JPEG/PNG/PDF; la API descarga cada archivo, comprueba firma MIME, tamaño y SHA-256 antes de registrarlo en el expediente.
- Android valida localmente teléfono E.164, fecha real, CBU con checksum y contactos antes de enviar; cinco pruebas unitarias pasan.
- La frontera n8n exige secreto, HMAC-SHA-256, timestamp de cinco minutos, nonce/idempotency key y límite de 30 solicitudes por minuto; el otorgamiento automatizado sigue deshabilitado.
- La simulación Android invalida la cotización al editar el monto y exige recalcularla antes de enviar la solicitud.
- Se creó `arg.microprestamos@gmail.com` como `superadmin` activo en Supabase Auth; requiere confirmar el correo antes del primer acceso.
- Inicio de n8n/WhatsApp implementado: workflow importable, entorno Docker local y normalización/firma HMAC de eventos.
- Supabase conserva sesiones conversacionales privadas e idempotentes y guía el alta asistida: elección app/WhatsApp, consentimiento, datos personales, dos contactos, CBU, documentos, monto, confirmación y derivación humana.
- `integration-v1` v6 desplegada; el nuevo endpoint `/conversations/inbound` rechaza tráfico sin firma y la máquina de conversación tiene pruebas Deno.
- Workflow de producción preparado como adaptador HTTP para la API casera de WhatsApp; no depende de Meta ni de los nodos oficiales.
- La conversación asistida recopila situación laboral, empleador/actividad e ingreso mensual antes de pasar a revisión humana.
- Panel administrativo preparado para listar, aprobar o rechazar casos de WhatsApp; las decisiones generan una bandeja de salida para n8n.
- Regla preparada para impedir más de un préstamo abierto por cliente.

## Bloqueos antes de producción

- Respaldar keystore de release ubicado fuera del repo en `C:\Users\danif\MicroPrestamos-secrets\microprestamos-release.jks`.
- Confirmar el correo del superadmin y completar MFA después del primer acceso.
- Configurar la URL y el secreto del webhook n8n que enviará los SMS OTP.
- Conectar una instancia n8n pública HTTPS y definir URL, autenticación y contrato definitivo de la API casera de WhatsApp.
- Implementar descarga de archivos y audios desde la API casera hacia Storage y conversión del borrador confirmado en expediente antes de hacer un E2E con documentos reales.
- Instalación en dispositivo Android bloqueada por `INSTALL_FAILED_USER_RESTRICTED`; requiere habilitar instalación USB en el dispositivo.
- Configurar un entorno Vercel comercial antes de recibir clientes reales.
- Mostrar comprobantes de préstamos activos en Android una vez exista un préstamo desembolsado de prueba.
- Crear usuarios/roles de prueba y configurar secretos (`ALLOWED_ORIGIN`, `N8N_SHARED_SECRET`) por entorno.
- Ejecutar una instalación física del APK y un recorrido E2E con usuarios de prueba una vez configurados Auth y el dispositivo; las pruebas unitarias/DB/CI ya están verdes.
