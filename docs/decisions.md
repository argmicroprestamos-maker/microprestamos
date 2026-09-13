# Matriz de decisiones

| Tema | Decisión actual | Estado / responsable |
|---|---|---|
| Mercado y moneda | Argentina, ARS | Confirmado para MVP técnico |
| Fórmula MVP | Interés plano fijo; cargos 0 | Validación legal confirmada por el propietario; evidencia fuera del repositorio |
| Periodicidad | Mensual | Confirmado para MVP |
| Aprobación | Humana, con roles `analista` y `cobranzas` | Implementado en modelo y API |
| Automatización | Alta asistida por n8n/WhatsApp | Primera máquina conversacional y workflow de desarrollo implementados; falta Meta real |
| Desembolso | Registro manual; no se inicia transferencia | Confirmado por seguridad |
| Identidad | Supabase Auth; OTP telefónico mediante n8n | Falta URL y secreto del webhook n8n |
| Titular legal | Razón social, CUIT y domicilio pendientes | Requiere decisión del propietario |
| Cumplimiento | Revisión legal confirmada por el propietario | Evidencia fuera del repositorio |
| Tasas legales | TNA, TEA, CFT y CFTEA pendientes | No publicar como oferta hasta validación |
| Hosting | Vercel `microprestamos.vercel.app` | Producción publicada |
| Base de datos | Supabase `yncfmpbapocdxcmqdeke`, esquema privado | Aplicado y verificado |
| Repositorio | GitHub `argmicroprestamos-maker/microprestamos` | Código, release y CI publicados |
| Firma Android | Keystore local fuera del repo | Respaldar antes de futuras versiones |

## Regla de bloqueo

Mientras no esté configurado el webhook/secret de SMS de n8n y no exista un proceso real de desembolso y conciliación, el sistema debe permanecer en modo demo (`real_money_enabled = false`).
