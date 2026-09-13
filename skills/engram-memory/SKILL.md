---
name: engram-memory
description: >-
  Usa Engram como memoria persistente entre sesiones: reconsulta contexto
  previo con mem_context/mem_search, guarda decisiones y bugs con mem_save,
  y registra el final de la sesión con mem_session_summary. Aplicar al iniciar
  y cerrar toda sesión de trabajo.
license: MIT
compatibility: opencode
metadata:
  audience: agents
  workflow: persistent-memory
---

# Engram / Memoria Persistente

## What I do

Integro Engram (MCP server) como memoria entre sesiones del agente:

- **Al iniciar**: llamar `mem_current_project` (para detectar proyecto/scope) y
  `mem_context` u `mem_session_start` para recuperar decisiones y trabajo previo
  en lugar de partir de cero. Repasar observaciones relevantes con `mem_search`
  (query en lenguaje natural, filtros por project/type/scope si hacen falta).
- **Durante el trabajo**: guardar proactivamente con `mem_save` todo hallazgo:
  decisiones de arquitectura, bugs (qué estaba mal, por qué, cómo se arregló),
  convenciones, configs nuevas. Estructura `**What**/**Why**/**Where**/**Learned**`.
  Si `mem_save` reporta `judgment_required`, revisar los candidatos y emitir
  `mem_judge` (relación: supersedes/related/not_conflict...) según la heurística.
- **Al cerrar**: `mem_session_summary` con secciones Goal/Instructions/Discoveries/
  Accomplished/Next Steps/Relevant Files, y `mem_session_end`.

## When to use me

Usar en toda sesión de agente con Engram disponible. Nunca exponer contenido de
memorias fuera de la herramienta; no borrar ni juzgar memorias de otros proyectos
sin autorización. Si Engram no está configurado, avisar que `jacaranda init`
puede instalarlo.