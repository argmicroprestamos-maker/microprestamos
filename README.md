# MicroPréstamos

MVP de microcréditos de bajo monto: web pública, panel operativo, aplicación Android nativa y backend Supabase preparado para automatización con n8n.

## Estructura

- `apps/web`: landing pública y panel `/admin`, listo para Vercel.
- `apps/android`: aplicación Kotlin + Jetpack Compose con flujo MVP de bienvenida, datos personales, dos contactos, CBU/documentos, simulación y estado.
- `supabase/migrations`: esquema privado, RLS, Storage y reglas de cálculo.
- `supabase/functions`: APIs de cliente, administración, healthcheck y contrato protegido para n8n.

## Desarrollo web

```powershell
npm install
$env:NEXT_PUBLIC_SUPABASE_URL="https://yncfmpbapocdxcmqdeke.supabase.co"
npm run web:dev
```

El APK release firmado actual está publicado en [GitHub Releases](https://github.com/argmicroprestamos-maker/microprestamos/releases/tag/v0.1.1). El artefacto local se conserva solo para la verificación del build; la web descarga el release público.

## Pruebas

```powershell
npm run smoke
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
Push-Location apps/android; .\gradlew.bat test; Pop-Location
```

Las pruebas pgTAP requieren Docker Desktop iniciado:

```powershell
Push-Location supabase
supabase start
supabase test db
Pop-Location
```

## Seguridad y salida a producción

El esquema mantiene los datos de clientes en el esquema no expuesto `private`, con RLS y bucket de documentos no público. Antes de habilitar desembolsos reales hay que completar revisión legal/regulatoria, configurar Auth, secretos de integración, proveedor de transferencias, backups y monitoreo.
