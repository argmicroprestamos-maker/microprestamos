# Despliegue

## Web

El proyecto está configurado para Next.js en Vercel con `vercel.json`. Variables requeridas:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

La publicación debe incluir `apps/web/public/downloads/microprestamos.apk` y su JSON de metadatos. Antes de asociar un dominio, verificar que el proyecto esté bajo la cuenta correcta y que el plan permita el uso comercial.

## Android

El build reproducible se ejecuta con `apps/android/gradlew assembleRelease`. Antes de probar OTP, copiar `apps/android/local.properties.example` como `apps/android/local.properties` y completar únicamente `SUPABASE_PUBLISHABLE_KEY`; es una clave pública apta para el cliente. Nunca usar una secret/service-role key en Android. El keystore de release nunca debe entrar al repositorio. El APK actual fue firmado localmente y su SHA-256 está en `docs/progress.md`.

## Supabase

Las migraciones ya se aplicaron al proyecto de desarrollo. Configurar los secretos de Edge Functions desde Supabase; nunca poner `SUPABASE_SERVICE_ROLE_KEY` en web, Android o GitHub.
