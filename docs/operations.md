# Manual operativo MVP

## Modo demo

`system_settings.environment.real_money_enabled` debe permanecer en `false` hasta cerrar los bloqueos legales. Las decisiones iniciales son humanas; n8n solo podrá cotizar/crear solicitudes mediante Edge Functions.

## Revisión de solicitudes

1. Ingresar en `/admin` con una cuenta Auth que tenga una fila activa en `private.admin_memberships`.
2. Revisar identidad, dos contactos consentidos, DNI frente/dorso y constancia de CBU.
3. Registrar la decisión con motivo y evidencia; nunca borrar la solicitud.
4. Si se aprueba, generar el préstamo y cronograma desde la función transaccional.
5. Registrar el desembolso manual con CBU enmascarado y referencia; no iniciar transferencias desde el MVP.
6. Registrar pagos y comprobantes, conservando auditoría.

## Incidentes

- Exposición de secreto: revocar/rotar inmediatamente el secreto afectado, revisar `audit_log` y logs de Edge Functions.
- Documento incorrecto: marcarlo `rejected`, conservar el motivo y solicitar una nueva carga; no borrar el objeto sin cumplir la retención legal.
- Pago duplicado: detener la conciliación, buscar por referencia/idempotency key y corregir mediante una nueva entrada auditada.
- Error de cálculo: congelar aprobaciones, comparar `rules_version`, ejecutar pruebas SQL y revertir la versión de Edge Function.

## Backup y restauración

- Activar backups administrados en el proyecto Supabase de producción y probar restauración periódicamente en un proyecto aislado.
- Respaldar Storage por separado: el backup de Postgres no incluye objetos.
- Registrar fecha, responsable, alcance y resultado de cada restauración en el runbook de operación.

## Rollback

- Web: volver al deployment Vercel anterior.
- Edge Functions: redeployar la versión anterior identificada por `version`/hash.
- Base de datos: aplicar una migración correctiva hacia adelante; no usar `DROP` ni reset sobre producción.
- Android: publicar una versión con `versionCode` mayor; nunca reutilizar el mismo código de versión.
