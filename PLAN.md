# Plan maestro — MicroPréstamos

Fecha de referencia: 12 de septiembre de 2026  
Mercado asumido: Argentina  
Moneda inicial: ARS  
Estado: MVP técnico implementado en modo demo; quedan integraciones, QA E2E, publicación y bloqueos legales/operativos antes de producción.

## 1. Objetivo del producto

Construir un MVP completo para solicitar, revisar, otorgar y administrar micropréstamos de bajo monto, compuesto por:

- identidad visual y logo (generar imageners si es necesario);
- sitio público responsive para explicar el servicio y descargar un APK firmado;
- panel web administrativo sencillo;
- aplicación Android nativa;
- backend Supabase con Auth, Postgres, Storage y Edge Functions;
- contrato de integración seguro para un futuro flujo de n8n/WhatsApp;
- pruebas, documentación, seguridad, despliegue y manual operativo.

El producto inicial será deliberadamente pequeño. No incluirá scoring con IA, cobranza automática, débitos bancarios, n8n, WhatsApp, iOS, marketplace, referidos ni múltiples monedas.

## 2. Condiciones que bloquean la salida con dinero real

El software puede construirse y probarse con datos ficticios antes de resolver estos puntos, pero no podrá pasar a producción real ni desembolsar dinero hasta contar con:

1. Persona jurídica y titular legal del servicio definidos.
2. Revisión de un abogado/contador especializado en crédito al consumo en Argentina.
3. Confirmación de inscripción y obligaciones aplicables ante BCRA como proveedor no financiero de crédito.
4. Textos aprobados de términos, privacidad, consentimiento, contrato, revocación y canal de reclamos.
5. Fórmula legalmente validada de TNA, TEA, CFT y CFTEA; no alcanza con mostrar un porcentaje plano.
6. Política de originación, mora, refinanciación, cobranzas, fraude, KYC y, si corresponde, prevención de lavado.
7. Registro y gestión de la base de datos personales ante la autoridad competente, con plazos de conservación y procedimientos de acceso, rectificación y supresión.
8. Cuenta de Vercel apta para uso comercial y Supabase Pro o superior para producción.
9. Proveedor de OTP por teléfono, credenciales y números de prueba.
10. Cuenta bancaria/origen de fondos y proceso verificable para desembolsos y conciliaciones.

La primera versión operativa tendrá aprobación humana. Una decisión exclusivamente automatizada no será criterio de finalización del MVP.

## 3. Decisiones de arquitectura

### Repositorio

Monorepo Git con esta estructura objetivo:

```text
/
├─ apps/
│  ├─ web/                 # Next.js + TypeScript: landing y /admin
│  └─ android/             # Kotlin + Jetpack Compose
├─ packages/
│  └─ contracts/           # OpenAPI/JSON Schema y fixtures compartidos
├─ supabase/
│  ├─ migrations/
│  ├─ functions/
│  ├─ tests/
│  ├─ seed.sql
│  └─ config.toml
├─ brand/                  # SVG, PNG, iconos, paleta y guía breve
├─ docs/                   # arquitectura, privacidad, operación y despliegue
├─ .github/workflows/
├─ README.md
└─ .env.example
```

### Web

- Next.js estable, TypeScript estricto y App Router.
- Un solo proyecto Vercel:
  - `/`: landing pública;
  - `/descargar`: redirección o página de descarga de la última versión;
  - `/privacidad`, `/terminos`, `/contacto`: páginas legales;
  - `/admin`: panel privado.
- UI sobria, responsive y accesible; el panel prioriza claridad sobre ornamentación.
- El navegador nunca recibe secretos de Supabase ni credenciales de integración.

### Android nativo

- Kotlin, Jetpack Compose, Material 3, Navigation Compose y arquitectura por capas.
- Gradle con versiones fijadas y build reproducible.
- Cliente autenticado contra Supabase; las operaciones sensibles pasan por Edge Functions.
- Captura/selección de documentos, subida segura, validaciones, reintentos y estados claros.
- APK release firmado; secretos y keystore nunca se guardan en Git.

### Supabase

- Auth para clientes y administradores.
- Postgres para datos transaccionales.
- Storage privado para DNI, constancias y comprobantes.
- Edge Functions como frontera de seguridad y contrato para web, Android y n8n.
- RLS y privilegios mínimos en toda tabla expuesta; preferencia por esquemas privados para datos sensibles.
- Migraciones versionadas, seed solo con datos ficticios y pruebas pgTAP/RLS.
- Secret key/service role exclusivamente del lado servidor.

### Descarga del APK

- La landing vive en Vercel.
- El binario firmado se publica como GitHub Release o almacenamiento de objetos apto para binarios; `/descargar` apunta a la versión estable.
- Cada versión muestra número, fecha, tamaño, requisitos mínimos y SHA-256.
- Nunca publicar un APK debug.

## 4. Diseño de marca

Nombre de trabajo: **MicroPréstamos**. Antes del lanzamiento debe comprobarse disponibilidad comercial/marcaria.

Dirección visual propuesta:

- personalidad: cercana, rápida, transparente y responsable;
- símbolo: monograma `MP` redondeado con una flecha ascendente discreta, sin imitar la identidad de un banco;
- azul profundo `#12304A` para confianza;
- verde `#19A974` para acciones positivas;
- fondo `#F5F8FA`, texto `#13202B`, alerta `#C43D3D`;
- tipografía libre y legible, con números tabulares para importes;
- lenguaje: directo, sin promesas engañosas como “aprobado garantizado”.

Entregables:

- logo horizontal y símbolo en SVG;
- PNG transparente en 1024, 512, 192 y 64 px;
- favicon;
- icono adaptativo Android (foreground/background);
- splash simple;
- mini guía de uso, espaciado, color y contraste;
- versión monocromática y prueba sobre fondo claro/oscuro.

## 5. Experiencia pública y de cliente

### Landing `/`

Secciones mínimas:

1. Propuesta de valor sin afirmar aprobación garantizada.
2. Explicación en tres pasos: registrarse, solicitar, recibir una decisión.
3. Simulador ilustrativo con monto, porcentaje y cuotas, mostrando total e importe de cuota.
4. Requisitos y documentación.
5. Información obligatoria de tasas/costos cuando sea validada legalmente.
6. Botón de descarga de APK.
7. Preguntas frecuentes.
8. Seguridad, privacidad, contacto y reclamos.
9. Pie con razón social, CUIT, domicilio, responsable de atención y enlaces legales cuando estén disponibles.

### Flujo Android

1. Pantalla de bienvenida y versión mínima soportada.
2. Aceptación versionada de términos, privacidad y tratamiento/cesión de datos.
3. Verificación de teléfono por OTP. WhatsApp no será el factor de autenticación hasta implementar y auditar esa integración.
4. Datos personales mínimos: nombre y apellido, DNI/CUIL, fecha de nacimiento, teléfono, correo opcional y domicilio.
5. Dos contactos de emergencia exactos: nombre, vínculo y teléfono, con declaración del cliente sobre autorización para aportar esos datos.
6. Documentación: frente y dorso de DNI y constancia de CBU/titularidad; selfie solo si la revisión legal/KYC la exige.
7. CBU de 22 dígitos, validación de formato y confirmación visible del titular antes del desembolso.
8. Simulación: monto, porcentaje, cuotas, periodicidad, primera fecha, total e indicadores legales.
9. Resumen y consentimiento expreso antes de enviar.
10. Estado de solicitud y motivo genérico de rechazo; revisión humana disponible.
11. Para préstamos activos: cronograma, cuotas pagadas/pendientes y comprobantes.

El cliente podrá guardar un borrador. No se debe conceder crédito solo por completar el formulario.

## 6. Panel administrativo sencillo

### Acceso

- Login independiente para personal autorizado.
- Roles iniciales: `superadmin`, `analista`, `cobranzas`, `solo_lectura`.
- MFA obligatorio para `superadmin` y recomendado/activable para todos.
- Bloqueo de acceso administrativo desde cuentas de cliente.

### Pantallas

- Resumen: solicitudes nuevas, en revisión, aprobadas, activas, vencidas y cobradas.
- Solicitudes: filtros por estado/fecha/DNI/teléfono y paginación.
- Ficha de cliente: datos enmascarados por defecto, contactos, documentos mediante URL firmada de corta duración y bitácora.
- Cotizador: capital, interés, cuotas, periodicidad y fechas.
- Decisión: aprobar/rechazar con motivo, actor, fecha y evidencia.
- Desembolso: registrar CBU enmascarado, monto, fecha y referencia de transferencia; no iniciar transferencias bancarias en este MVP.
- Préstamo: cronograma, saldo, estado y observaciones.
- Pagos: alta/corrección controlada, comprobante y conciliación manual.
- Usuarios/roles y configuración de productos, solo para superadmin.
- Auditoría: consulta de acciones sensibles, sin edición.

No se permite borrar físicamente préstamos, pagos, decisiones ni auditorías desde el panel.

## 7. Modelo de datos mínimo

Todos los importes se almacenan como `numeric(14,2)` o centavos enteros, nunca `float`. Todas las fechas importantes usan `timestamptz`; fechas civiles como nacimiento usan `date`.

### Identidad y permisos

- `profiles`: vínculo con `auth.users`, identidad mínima y estado.
- `admin_memberships`: usuario, rol, estado y fechas.
- `consent_events`: versión, tipo de consentimiento, fecha, IP/hash técnico y canal.

### Cliente

- `clients`: identidad, teléfono, correo opcional, domicilio y estado de verificación.
- `emergency_contacts`: exactamente dos contactos por solicitud completa.
- `bank_accounts`: CBU, alias opcional, titular, verificación y máscara; una cuenta principal por cliente.
- `client_documents`: tipo, ruta Storage, hash, MIME, tamaño, estado de revisión y vencimiento opcional.

### Crédito

- `loan_products`: límites de monto, porcentaje, cuotas permitidas, periodicidad y vigencia.
- `loan_applications`: producto, monto pedido, cotización inmutable, estado y canal de origen.
- `application_decisions`: decisión, motivo, actor humano/sistema, versión de reglas y evidencia.
- `loans`: snapshot contractual de capital, interés, total, tasas legales, fechas y estado.
- `installments`: número, vencimiento, capital, interés, cargos aprobados, total, pagado y estado.
- `disbursements`: monto, cuenta destino enmascarada, referencia, estado y fecha.
- `payments`: monto, fecha, medio, referencia, estado y usuario que registró.
- `payment_allocations`: distribución de cada pago entre cuotas.

### Integración y auditoría

- `integration_clients`: identificador, permisos y estado; nunca guardar secretos en claro.
- `integration_requests`: idempotency key, hash de payload, resultado y expiración.
- `webhook_outbox`: eventos pendientes, intentos, próximo intento y último error.
- `audit_log`: actor, acción, entidad, antes/después redactado, IP, user-agent y fecha; append-only.
- `system_settings`: configuración no secreta versionada.

### Restricciones clave

- DNI/CUIL y teléfono normalizados con índices únicos donde corresponda.
- CBU de 22 dígitos y checksum/validación implementada y probada.
- porcentaje entre límites configurables; cuotas enteras positivas.
- una transición de estado inválida debe fallar en base de datos, no solo en UI.
- ninguna cuota puede quedar con importes negativos.
- suma de cuotas = total contractual, ajustando el redondeo en la última cuota.
- pagos y decisiones conservan trazabilidad histórica.

## 8. Regla financiera del MVP

La interpretación inicial de “monto + porcentaje en cuotas” será interés plano fijo:

```text
interés = redondear(capital × porcentaje / 100, 2)
total = capital + interés + cargos_aprobados
cuota_base = redondear(total / cantidad_cuotas, 2)
última_cuota = total - suma(cuotas_anteriores)
```

Condiciones:

- `cargos_aprobados = 0` en el MVP salvo aprobación legal explícita.
- El porcentaje, total y plan se congelan al aceptar el contrato.
- La periodicidad inicial será mensual; cualquier variante se configura como producto.
- Mora, punitorios, IVA, refinanciación y pago anticipado requieren reglas legales separadas; no se improvisan.
- El backend calcula; web y Android solo muestran el resultado devuelto.
- Se implementan pruebas de redondeo, primera/última cuota, límites y fechas.
- Antes de publicar una oferta se agregan TNA, TEA, CFT y CFTEA según fórmula validada profesionalmente.

## 9. API y preparación para n8n/WhatsApp

n8n no accederá directamente a tablas ni recibirá la secret key de Supabase. Llamará a Edge Functions versionadas.

Contrato inicial:

- `POST /integration/v1/quotes`: calcula una oferta no vinculante.
- `POST /integration/v1/applications`: crea o actualiza una solicitud por idempotency key.
- `GET /integration/v1/applications/{external_id}`: consulta estado seguro.
- `POST /integration/v1/applications/{id}/submit`: envía el expediente completo.
- `POST /integration/v1/decisions`: reservado para una futura decisión automatizada; deshabilitado en producción inicial.
- webhook saliente `application.status_changed` mediante patrón outbox.

Controles:

- autenticación servidor-a-servidor con secreto rotatorio o JWT de servicio de alcance limitado;
- firma HMAC, timestamp, nonce y tolerancia temporal;
- idempotency key obligatoria para escrituras;
- permisos por endpoint e IP allowlist si la infraestructura lo permite;
- rate limit, tamaño máximo de payload y validación de esquema;
- correlación (`request_id`) y log sin documentos, CBU completo ni datos innecesarios;
- reintentos con backoff y cola de eventos fallidos;
- endpoint de salud sin datos sensibles;
- OpenAPI y colección de ejemplos ficticios.

El futuro otorgamiento automático deberá invocar el mismo motor de reglas y la misma máquina de estados que usa el panel, registrar versión de reglas y permitir revisión humana.

## 10. Seguridad y privacidad

- Modelo de amenazas documentado antes de exponer datos reales.
- RLS y grants mínimos verificados por pruebas negativas para cliente, admin y anónimo.
- Tablas sensibles en esquema no expuesto cuando sea práctico.
- Buckets privados; URLs firmadas con duración corta y autorización previa.
- Validación de extensión, MIME real, tamaño y hash de cada documento.
- Enmascarado de DNI, teléfono y CBU en listados y logs.
- Secretos solo en Supabase/Vercel/GitHub Secrets; `.env.example` contiene nombres, no valores.
- CORS con orígenes concretos; CSP, HSTS, cookies `Secure`, `HttpOnly` y `SameSite`.
- Rate limiting, CAPTCHA/antiabuso donde haya acceso público y bloqueo por intentos.
- Auditoría append-only para lectura de documentos, decisiones, cambios de CBU, desembolsos y pagos.
- Política de retención y borrado/anominización alineada con obligaciones legales.
- Exportación/corrección/supresión de datos mediante flujo administrativo verificable.
- Consentimientos versionados y separados para datos del cliente, contactos y comunicaciones.
- Copias de seguridad verificadas; recordar que el backup de Postgres no incluye los objetos de Storage.
- Restauración ensayada con datos ficticios.
- Análisis de dependencias y secretos en CI.

## 11. Fases de ejecución y criterio de salida

### Fase 0 — Descubrimiento y bloqueo legal

- Registrar decisiones pendientes en `docs/decisions.md`.
- Confirmar razón social, CUIT, domicilio, representante, contacto, montos, tasas, cuotas y periodicidad.
- Obtener textos legales o usar borradores claramente marcados “NO APTO PARA PRODUCCIÓN”.
- Definir credenciales externas y entornos `local`, `staging`, `production`.

Salida: matriz de decisiones completa y lista de bloqueos visible.

### Fase 1 — Base del repositorio

- Crear monorepo, linters, formatos, scripts y CI.
- Configurar entornos sin secretos y documentación de arranque.
- Reservar cuanto antes el proyecto Vercel `microprestamos`; el nombre no puede garantizarse hasta crearlo.

Salida: web, Android y Supabase compilan/arrancan en local con CI verde.

### Fase 2 — Marca

- Diseñar logo, paleta, tipografía e iconos.
- Exportar y probar todos los formatos.

Salida: activos consistentes en web y Android, contraste AA y sin recursos temporales.

### Fase 3 — Supabase

- Modelar y migrar tablas, constraints, índices, RLS, Storage y seeds ficticios.
- Implementar Auth, roles y pruebas de aislamiento.
- Añadir funciones de cálculo y transiciones de estado.

Salida: migraciones reproducibles desde cero, tests de DB/RLS verdes y asesores de seguridad sin hallazgos críticos.

### Fase 4 — API/Edge Functions

- Endpoints de cliente, admin e integración.
- Validación, errores estables, idempotencia, auditoría y OpenAPI.

Salida: pruebas contractuales y negativas pasan; ningún endpoint sensible funciona sin permiso.

### Fase 5 — Web pública y admin

- Construir landing, páginas legales, descarga y panel.
- Implementar flujo de revisión, decisión, desembolso manual y pagos.

Salida: pruebas unitarias y Playwright; recorrido administrativo completo con fixtures.

### Fase 6 — Android

- Implementar onboarding, OTP, datos, dos contactos, documentos, CBU, simulación, envío y estado.
- Manejar proceso matado, reconexión, reintentos y errores de permisos.

Salida: unit tests, pruebas instrumentadas principales, APK release firmado instalable y smoke test en dispositivo/emulador.

### Fase 7 — Integración n8n preparada

- Publicar contrato, credenciales de prueba, ejemplos e idempotencia.
- Simular n8n con un cliente de prueba; no construir n8n.

Salida: crear/cotizar/consultar una solicitud desde el mock sin acceso directo a DB.

### Fase 8 — Seguridad, cumplimiento y QA integral

- Threat model, revisión RLS, privacidad, accesibilidad y pruebas de abuso.
- Recorrido E2E completo y restauración.
- Resolver todos los hallazgos críticos/altos.

Salida: checklist firmado; solo datos ficticios mientras haya bloqueos legales.

### Fase 9 — Staging y producción

- Desplegar Supabase y Vercel mediante CI.
- Publicar APK firmado y verificar SHA-256.
- Configurar dominio, monitoreo, alertas, backups y runbook.

Salida: smoke tests en producción, rollback documentado y dominio operativo. La salida con dinero real exige cerrar todos los bloqueos de la sección 2.

## 12. Prueba integral obligatoria

Con datos ficticios, un test debe demostrar:

1. registro y autenticación de un cliente;
2. carga de datos, exactamente dos contactos, CBU y documentos;
3. cálculo determinista de una oferta;
4. envío de solicitud;
5. visualización por un analista autorizado y denegación para otro cliente/anónimo;
6. aprobación humana con auditoría;
7. registro de desembolso y generación exacta de cuotas;
8. registro de pago y actualización de saldo;
9. consulta de estado por el cliente;
10. repetición de una llamada de integración sin duplicar la operación;
11. acceso a documento mediante URL firmada y expiración posterior;
12. bloqueo de una transición, rol o payload inválido.

## 13. Definición global de terminado

El objetivo solo se considera terminado cuando:

- no quedan pantallas, rutas, activos ni migraciones de ejemplo sin terminar;
- web y Android usan el mismo cálculo proveniente del backend;
- todas las migraciones se aplican en limpio y pueden revertirse de forma documentada;
- pruebas DB/RLS, API, web, Android y E2E están verdes;
- no hay secretos en Git ni hallazgos críticos/altos conocidos;
- APK release está firmado, publicado, descargable e instalable;
- landing y admin están desplegados, con admin inaccesible para usuarios comunes;
- Supabase production tiene RLS, Storage privado, alertas y backup operativo;
- OpenAPI y manual n8n están completos aunque n8n no esté implementado;
- manual de operación, incidentes, backup, restauración y rollback existe;
- los bloqueos externos restantes están claramente marcados; si afectan dinero real, el sistema permanece en modo demo.

## 14. Operación del objetivo en Codex

- Iniciar con `/goal` y pegar el contenido de `CODEX_GOAL.md`.
- Trabajar en hitos pequeños, mantener `docs/progress.md` y verificar cada hito antes de continuar.
- No declarar terminado por haber agotado tiempo o contexto.
- Ante una credencial, cuenta o decisión legal faltante, continuar con todo lo que admita fixtures y mocks; registrar el bloqueo exacto.
- No desplegar ni crear recursos externos sin que estén disponibles las cuentas y credenciales correspondientes.
- No usar datos reales hasta que el entorno de producción y los bloqueos legales estén resueltos.

## 15. Referencias verificadas

- Codex, objetivos duraderos: https://learn.chatgpt.com/use-cases/follow-goals
- Vercel, dominios `vercel.app`: https://vercel.com/docs/domains/working-with-domains
- Vercel Hobby y uso comercial: https://vercel.com/docs/plans/hobby
- Supabase, checklist de producción: https://supabase.com/docs/guides/deployment/going-into-prod
- Supabase, RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase, Storage: https://supabase.com/docs/guides/storage/security/access-control
- Supabase, Edge Functions: https://supabase.com/docs/guides/functions
- BCRA, inscripción de otros proveedores no financieros: https://www.bcra.gob.ar/solicitar-inscripcion-actualizacion-o-dar-de-baja-para-otros-proveedores-no-financieros-de-credito/
- BCRA, régimen informativo PNFC: https://www.bcra.gob.ar/regimen-informativo-proveedores-no-financieros-faq/
- Ley 24.240, Defensa del Consumidor: https://www.argentina.gob.ar/normativa/nacional/638/actualizacion
- Ley 25.326, Protección de Datos Personales: https://www.argentina.gob.ar/normativa/nacional/64790/actualizacion
