# Rodri CFO — Setup de la capa de voz (Siri / Shortcuts)

## Qué es esto y por qué existe

`index.html` funciona solo, con localStorage, sin esto.
Esta carpeta es aparte: es lo mínimo necesario para que Siri pueda
leer y escribir tus datos, porque el iPhone no puede acceder al
localStorage de una página web.

Son funciones serverless de Vercel (no un servidor que tengas que
mantener vos) + Vercel KV (una base tipo Redis, gestionada, gratis
en el plan Hobby) como lugar donde vive el dato mientras tanto.

## 1. Subir el código

Copiá la carpeta `api/` a la raíz de tu repo (al lado de `index.html`).

```
git add .
```

```
git commit -m "agrega API de voz para Siri"
```

```
git push
```

## 2. Crear la base en Vercel

1. Entrá al dashboard de tu proyecto en vercel.com
2. Pestaña **Storage** → **Create Database** → elegí **KV**
3. Conectala a este proyecto (Vercel agrega las variables de entorno solo)

## 3. Agregar tu token secreto

En **Settings → Environment Variables** del proyecto, agregá:

```
RODRICFO_API_TOKEN = elegí-una-clave-larga-y-random
```

Volvé a desplegar para que tome la variable nueva:

```
git commit --allow-empty -m "trigger redeploy"
```

```
git push
```

## 4. Instalar la dependencia de KV

En tu proyecto local:

```
npm install @vercel/kv
```

```
git add .
```

```
git commit -m "agrega @vercel/kv"
```

```
git push
```

## 5. Sembrar los datos iniciales (una sola vez)

Con `curl`, `Postman`, o cualquier cliente HTTP:

```
curl -X POST https://TU-DOMINIO.vercel.app/api/voice/init -H "Authorization: Bearer TU-TOKEN"
```

Si responde `{"status":"ok"}`, ya está.

## 6. Probar la API sin Xcode todavía

```
curl https://TU-DOMINIO.vercel.app/api/voice/balance -H "Authorization: Bearer TU-TOKEN"
```

Debería devolverte tu disponible real en `mensaje`.

## 7. El proyecto de Xcode (acá sí hace falta una Mac)

Esta parte no tiene forma de evitar el editor de código — Apple
exige que los App Intents vivan dentro de una app compilada con
Xcode. Pero es la app más simple posible:

1. Abrí Xcode → **File → New → Project → App**
2. Nombre: `RodriCFO` — Interface: SwiftUI — no hace falta lógica de UI propia
3. En el proyecto, agregá el archivo `VoiceIntents.swift` (arrastralo adentro)
4. En `baseURL` y `token` dentro del archivo, poné tu dominio real de Vercel y el mismo `RODRICFO_API_TOKEN`
5. Con tu Apple ID gratuita alcanza para instalarla en tu propio iPhone (Settings del proyecto → Signing & Capabilities → elegí tu cuenta)
6. Conectá el iPhone, corré la app una vez (Cmd+R) — con eso iOS ya registra los App Shortcuts
7. Abrí la app **Atajos** de iOS: vas a ver "Registrar gasto", "Dinero disponible", etc. ya disponibles para usar por Siri o agregar a la pantalla de inicio

Después de ese primer build, no necesitás volver a tocar Xcode salvo que quieras agregar más intents (los otros 14 de la sección 12 de tu spec original siguen el mismo patrón que los 6 que ya están armados).

## Seguridad, tal como lo pediste

- El token protege todos los endpoints — sin él, devuelven 401
- Los gastos por encima del umbral (`voiceConfirmationThreshold`, $100.000 por defecto) no se aplican solos: piden Face ID en el teléfono antes de confirmar contra `/api/voice/confirm`
- "Tengo dinero extra" nunca aplica la distribución sin pasar por esa misma confirmación
- No se guarda audio en ningún punto — solo el texto ya interpretado por Siri
