# Jacaranda

Bootstrapper portable de entornos de agentes de código. Detecta, instala y
configura en un solo `jacaranda init` tus agentes y sus herramientas
complementarias, de forma idempotente y sin romper configuraciones existentes.

## Instalación

```bash
npm install -g jacaranda
```

Requiere Node.js >= 20 (OpenSpec lo exige; ya lo tienes si usas agentes).

## Uso

```bash
jacaranda init                # detecta, instala y configura (pide confirmacion)
jacaranda init --dry-run      # muestra el plan sin tocar nada
jacaranda init --yes          # aprueba instalaciones sin preguntar
jacaranda doctor              # diagnostica el entorno
```

Estado y backups quedan en `~/.jacaranda/` (`state.json`, `skills/`, `backups/`).

## Qué configura

| Herramienta | Qué hace Jacaranda |
|---|---|
| OpenCode | npm global `opencode-ai` |
| Pi | npm global `@earendil-works/pi-coding-agent` (con `--ignore-scripts`) |
| OpenSpec | npm global `@fission-ai/openspec` + `openspec init --tools opencode,pi` |
| Engram | instalación asistida + `engram setup opencode|pi` (delegado al CLI oficial) |
| Skills | `~/.jacaranda/skills` (fuente única) enlazada a `~/.agents/skills` desde donde opencode y pi las leen |

Principios:

- **Delegación**: Jacaranda nunca reinventa herramientas; llama a los CLIs
  oficiales (`engram setup`, `openspec init`) y solo verifica el resultado.
- **Idempotencia**: correr `jacaranda init` N veces deja el mismo estado.
- **Seguridad**: nada se sobrescribe sin backup (`~/.jacaranda/backups/`); una
  config editada a mano se detecta en `jacaranda doctor`.
- **Configs del usuario son sagradas**: Jacaranda no borra ni reemplaza
  configs existentes de agentes.

## Cómo funciona

```
jacaranda init
  detect (node/npm/opencode/pi/openspec/engram)
    -> plan (deseado vs actual, solo acciones que faltan)
      -> ejecuta (con confirmacion, lock y backups)
        -> manifest + reporte
```

## Desarrollo

```bash
npm install
npm test        # build + node --test (node:test, sin dependencias de test)
npm run build
```

Estructura:

- `src/platform/` — rutas por OS, exec de procesos (cmd.exe en Windows), links
- `src/core/` — manifest (state.json), detección, config-edit (JSONC/diff),
  plan, skills
- `src/integrations/` — engram y openspec (delegación a CLIs oficiales)
- `src/adapters/` — opencode y pi (rutas de config, MCP, skill targets)
- `src/commands/` — init y doctor (orquestación)
- `skills/` — skills bundleadas (`openspec-sdd`, `engram-memory`)
- `test/` — tests que corren sobre `dist/` compilado

## Licencia

MIT