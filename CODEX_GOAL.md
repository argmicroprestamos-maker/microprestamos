# Objetivo para Codex — construir MicroPréstamos de punta a punta

Construí, verificá, documentá y dejá desplegable un MVP completo llamado **MicroPréstamos** para Argentina, siguiendo `PLAN.md` como especificación normativa del proyecto.

## Alcance obligatorio

1. Crear una identidad visual original y sobria, con logo vectorial, variantes PNG, favicon e icono adaptativo Android.
2. Crear una web Next.js/TypeScript con:
   - landing pública en `/`;
   - descarga de APK release firmado;
   - páginas de privacidad, términos y contacto/reclamos;
   - panel sencillo en `/admin` para solicitudes, clientes, documentos, decisiones, préstamos, cuotas, desembolsos manuales, pagos, roles y auditoría.
3. Crear una app Android verdaderamente nativa con Kotlin y Jetpack Compose para:
   - autenticación/verificación de teléfono;
   - consentimiento versionado;
   - datos personales mínimos;
   - exactamente dos contactos de emergencia;
   - frente/dorso de DNI, constancia de CBU y CBU validado;
   - simulación, envío y seguimiento de la solicitud;
   - consulta del cronograma y pagos de un préstamo activo.
4. Crear el backend Supabase reproducible mediante migraciones:
   - Auth, Postgres, Storage privado y Edge Functions;
   - modelo descrito en `PLAN.md`;
   - RLS, grants mínimos, roles administrativos y auditoría append-only;
   - máquina de estados validada en backend;
   - cálculo único y determinista del préstamo;
   - pruebas pgTAP/RLS y seeds exclusivamente ficticios.
5. Preparar, sin construir n8n, una API de integración versionada para n8n/WhatsApp con OpenAPI, autenticación servidor-a-servidor, firma, idempotencia, rate limit, auditoría y webhook outbox.
6. Configurar CI para lint, tipos, tests, builds, migraciones limpias, análisis de secretos y artefactos release.
7. Documentar arquitectura, instalación, variables, desarrollo local, despliegue, operación, backup, restauración, incidentes, rollback y contrato n8n.
8. Dejar Vercel y Supabase listos para staging/producción y realizar el despliegue solo cuando existan cuentas y credenciales autorizadas.

## Regla financiera inicial

Usá interés plano fijo, con decimal exacto y redondeo monetario:

```text
interés = redondear(capital × porcentaje / 100, 2)
total = capital + interés + cargos_aprobados
cuota_base = redondear(total / cuotas, 2)
última_cuota = total - suma(cuotas_anteriores)
```

En el MVP `cargos_aprobados = 0`. Congelá los valores aceptados en un snapshot contractual. No inventes tasas de mora, IVA, punitorios, TNA, TEA, CFT o CFTEA: implementalos únicamente con una fórmula aprobada y mantené el sistema en modo demo mientras falte esa validación.

## Restricciones innegociables

- El mercado asumido es Argentina y la moneda inicial es ARS.
- La aprobación inicial es humana. No concedas ni desembolses dinero real por una decisión exclusivamente automatizada.
- n8n nunca accede directamente a las tablas y nunca recibe una secret key/service role de Supabase.
- Ningún secreto, keystore, documento real ni dato personal real entra al repositorio.
- Web y Android no duplican reglas financieras ni transiciones de estado; consumen el backend.
- Todo bucket de documentos es privado y todo acceso queda autorizado y auditado.
- Todo dato sensible está enmascarado en listas, logs y errores.
- No borres físicamente préstamos, pagos, decisiones ni auditorías.
- No uses Vercel Hobby para el servicio comercial ni Supabase Free con clientes reales.
- No declares aptitud legal; registrá como bloqueos las decisiones que necesitan abogado, contador, BCRA, AAIP u otro profesional/organismo.
- Preservá cambios ajenos y seguí cualquier `AGENTS.md` aplicable.

## Forma de trabajo persistente

1. Leé por completo `PLAN.md` y relevá el repositorio antes de modificarlo.
2. Consultá documentación oficial vigente antes de fijar versiones o implementar Supabase, Android, Vercel y requisitos regulatorios.
3. Creá `docs/progress.md` con hitos, evidencia, decisiones y bloqueos; actualizalo al terminar cada hito.
4. Trabajá fase por fase según `PLAN.md` y verificá cada una antes de continuar.
5. Si falta una credencial o decisión externa, implementá hasta el límite seguro usando mocks/fixtures, marcá el bloqueo exacto y continuá con las demás fases.
6. Corregí pruebas, builds, migraciones o seguridad antes de avanzar; no aceptes resultados incompletos.
7. Mantené commits pequeños y mensajes descriptivos si el usuario autorizó commits.
8. No te detengas por agotamiento de contexto: retomá desde `docs/progress.md` hasta alcanzar una condición terminal verificable.

## Verificaciones mínimas obligatorias

- instalación limpia de dependencias;
- lint y chequeo de tipos web;
- tests unitarios y E2E web;
- compilación Android debug y release;
- tests unitarios e instrumentados críticos Android;
- inicialización local de Supabase desde cero;
- aplicación completa de migraciones;
- tests pgTAP/RLS y pruebas negativas de autorización;
- tests de Edge Functions y contrato OpenAPI;
- test del cálculo con redondeo y ajuste de última cuota;
- test E2E completo descrito en `PLAN.md`;
- escaneo de secretos y dependencias;
- comprobación del APK firmado, SHA-256, descarga e instalación;
- smoke test de staging y, si está autorizado y desbloqueado, producción;
- inspección final del diff para detectar archivos fuera de alcance o datos sensibles.

## Condición terminal

Marcá el objetivo como completado únicamente cuando se cumpla la definición global de terminado de `PLAN.md` y todas las verificaciones ejecutables estén verdes. Si la única parte pendiente depende de acceso, credenciales o aprobación legal del usuario, no simules éxito: documentá exactamente qué falta, dejá el sistema seguro en modo demo y solicitá ese insumo. Nunca habilites dinero real mientras quede un bloqueo legal, de seguridad, identidad, respaldo o conciliación.
