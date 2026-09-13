# Matriz de decisiones

| Tema | Decisión actual | Estado / responsable |
|---|---|---|
| Mercado y moneda | Argentina, ARS | Confirmado para MVP técnico |
| Fórmula MVP | Interés plano fijo; cargos 0 | Requiere validación legal antes de oferta |
| Periodicidad | Mensual | Confirmado para MVP |
| Aprobación | Humana, con roles `analista` y `cobranzas` | Implementado en modelo y API |
| Automatización | n8n/WhatsApp fuera de alcance inicial | Contrato Edge Function preparado |
| Desembolso | Registro manual; no se inicia transferencia | Confirmado por seguridad |
| Identidad | Supabase Auth; OTP telefónico pendiente | Falta proveedor y credenciales |
| Titular legal | Razón social, CUIT y domicilio pendientes | Requiere decisión del propietario |
| Cumplimiento | Revisión BCRA, consumidor y datos personales pendiente | Requiere abogado/contador |
| Tasas legales | TNA, TEA, CFT y CFTEA pendientes | No publicar como oferta hasta validación |
| Hosting | Vercel; dominio solicitado no disponible | Usar alias alternativo o nuevo dominio |
| Base de datos | Supabase `yncfmpbapocdxcmqdeke`, esquema privado | Aplicado y verificado |
| Repositorio | GitHub `argmicroprestamos-maker` | PAT actual no permite crear repositorio |
| Firma Android | Keystore local fuera del repo | Respaldar antes de futuras versiones |

## Regla de bloqueo

Mientras titular legal, textos aprobados, fórmula regulatoria, proveedor OTP y entorno de producción no estén definidos, el sistema debe permanecer en modo demo (`real_money_enabled = false`).
