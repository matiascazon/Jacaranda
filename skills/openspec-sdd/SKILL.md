---
name: openspec-sdd
description: >-
  Specification-Driven Development de OpenSpec: autorar propuestas openspec/
  con espec up-first, dividir cambios en tareas incrementalmente ejecutables y
  cerrar ciclos con validate + agents/tasks/*.md. Usar al arrancar cualquier
  cambio significativo.
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: specification-driven-development
---

# OpenSpec / Specification-Driven Development

## What I do

Sigo el ciclo OpenSpec para producir cambios con espec primero:

1. **Spec up-first**: antes de tocar código, escribe `openspec/proposals/<slug>/spec.md` describiendo el comportamiento esperado con casos de ejemplo (`**What** ... -> **Expected behavior**`), siguiendo `openspec/beyond-code/templates.md`.
2. **Aceptación**: cada caso responde a una acceptance criteria; lo que no se puede especificar sin ver código va a un task step con su acceptance check en `agents/tasks/*.md`.
3. **Tareas incrementales**: reduce la propuesta a pasos pequeños (`agents/tasks/001-foo.md`), uno activo a la vez, cada uno con prueba de aceptación truncada al alcance y que no rompa casos previos.
4. **Cierre**: al finalizar `openspec validate`, luego `openspec proposals finalize <slug>` y luego `openspec agents autofix` (o `openspec agents list`) para marcar tareas completadas.
5. **Contexto del entorno**: al encarar trabajo no puramente de espec, respeta los agentes de la empresa (`~/.agents/`) y skills globales relacionados.

## When to use me

Usar al inicio de cualquier cambio de comportamiento o feature. Solo proyecto: no actuar como agente autónomo ni modificar archivos fuera del convenio del repositorio. No crear OpenSpec si el project no lo requiere aún — preguntar primero.