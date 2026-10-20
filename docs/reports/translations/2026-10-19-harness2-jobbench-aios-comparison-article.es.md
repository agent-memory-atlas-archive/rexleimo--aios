# Reprodujimos el pipeline de evaluación Harness² de Google y obtuvimos una comparación medible para el harness de AIOS
> [!IMPORTANT] Actualizado a v1.2: el +14.8pp de una sola ronda fue retirado como ruido del juez. Cifra principal actual: brazo nativo AIOS **+34.7pp** (51.1 → 85.8). Versión vigente: ../2026-10-19-harness2-jobbench-aios-comparison-article.md


> Estado: **versión final (v1.0)** · Fecha: 2026-10-19 · Declaración: todas las cifras son **mediciones non-leaderboard / entorno AIOS** — distintas condiciones que las cifras oficiales de Google; solo se usar como marco de referencia, nunca como comparación directa.

## TL;DR

- [Harness²](https://github.com/google-research/harness2) de Google Research (arXiv 2610.14224) establece el paradigma de "mejorar el harness del agent de forma recursiva": WB-Bench **+11.5**, JobBench **+4.5**, LAB **+11.8pp** (recursión de un paso).
- En nuestro propio endpoint (no GCP/Vertex) reproducimos por completo el pipeline de JobBench: **executor opencode fijado → escalera de cuatro brazos (base/improve/domain/aggregate) → selección a ciegas → juez LLM → informe**, de extremo a extremo (`RUN_EXIT=0 / JUDGE_EXIT=0 / REPORT_EXIT=0`).
- La cadena de evidencia de AIOS tiene tres piezas medidas: A/B de dos brazos en BBH-20 (conclusión honesta de cero mejora), scorecard de capacidades de 13 clientes (superficie estructural) y humo de JobBench 15.91% (n=1, evidencia de pipeline).
- Resultado principal (tarea única, cuatro brazos, modelo unificado `agnes-3.0-flash`): base 68.2% → improve **83.0% (Δ +14.8pp)**, domain 77.3% (+9.1pp), misma dirección que el artículo (n=1; condiciones en §2/§5).

## 1. Qué es Harness² y por qué merece una comparación

La tesis central de Harness²: el rendimiento del agent no depende solo del modelo sino del **harness** — superficie de herramientas, gestión de contexto, bucles de reflexión, adaptación de dominio. El artículo mejora el propio harness mediante un proceso recursivo y lo cuantifica en tres benchmarks:

| Benchmark | Dominio | Mejora reportada (recursión de un paso) |
| --- | --- | --- |
| WorkBuddy-Bench (WB) | Tareas de oficina (Tencent, licencia personalizada) | +11.5 pp |
| JobBench (jb) | 65 tareas de trabajo real / 35 ocupaciones | +4.5 pp |
| LAB | Tareas de agente de largo horizonte | +11.8 pp |

Esto nos da un **marco de coordenadas**, no un marcador: si el aumento de harness como AIOS funciona, debería mostrar un Δ en la misma dirección en benchmarks comparables.

## 2. Declaración de condiciones (por qué esto no es un número de leaderboard)

El pipeline oficial usa por defecto el canal Gemini-Vertex. No lo reutilizamos; razones y divulgación:

| Dimensión | Artículo | Esta medición | Impacto |
| --- | --- | --- | --- |
| solver | familia Gemini | **`agnes-3.0-flash`** (Agnes AI, OpenAI-compatible `https://api.agnes-ai.cn/v1`) | absolutos incomparables; **dirección del Δ comparable** |
| judge | nivel gemini-3.1-pro | **`agnes-3.0-flash` (mismo modelo que el solver; sesgo autoevaluativo en §5)**, rúbrica ítem a ítem + selección a ciegas | marco de puntuación desplazado, mismo juez en todos los brazos |
| licencia | WB requiere licencia Tencent (restricción regional UE) | solo JobBench (dataset público HF, revisión fijada) | WB/LAB no cubiertos; citamos sus cifras |
| executor | opencode fijado `23fb5e05` | mismo pin + configuración aislada (sin plugins) | consistente |
| k | múltiple k | k=1, escalera de cuatro brazos | muestra única, confianza declarada |

## 3. Reproducción del pipeline: cada trampa fue real

Vale la pena registrar los problemas de ingeniería local que el README oficial no cubre, todos con evidencia determinista:

1. **`timeout` ausente**: el runner depende de GNU `timeout --kill-after`, inexistente en macOS. Se replicó la semántica con un shim en Python (SIGTERM→SIGKILL, código 124).
2. **Validación estricta de schema rompió la config global**: opencode fijado exige `provider.*.models.*.modalities.output` como array; campos ausentes → 0 bytes de salida en todas las tareas. Solución: copia aislada de `XDG_CONFIG_HOME` con schema corregido, **sin tocar los archivos originales del usuario**.
3. **La ruta `/v1` en `baseURL`**: el cliente fijado no completa rutas; sin `/v1` las peticiones caen en un HTML 404 y **generan en silencio un step_finish vacío** (tokens 0, sin logs de error). Lo más difícil de detectar — el síntoma era "corre pero no produce salida".
4. **prop zombi bloqueando el servidor gestionado singleton**: una llamada colgada del improver-prop ocupaba el slot de sesión de `opencode serve` y encolaba todo lo demás — el sweep parecía muerto. Tras limpiar procesos huérfanos, el mismo comando devolvió `RUN_EXIT=0`. Se añadió un watchdog: se recuperan por fuerza los rollouts de más de 50 min.
5. **Degradación silenciosa en canales de saldo**: agotado el saldo de novai, `deepseek` respondía **HTTP 200 + content=null** (no 403); el cliente escribía trayectorias vacías → NO OUTPUT masivo. La protección de costes debe validar "contenido no vacío" por adelantado, no solo HTTP 200.
6. **Superficies de parámetros asimétricas**: `harness2` usa `--modes/--only-domains/--max-tasks`; `harness2-judge/report` solo `--mode` — los drivers se escriben desde la ayuda de cada herramienta, nunca adivinando.

## 4. Comparación AIOS: tres piezas medidas + una cerrada

### 4.1 A/B de dos brazos BBH-20 (completado, conclusión honesta)

20 preguntas fijas, una ejecución por brazo, herramientas deshabilitadas, scorer local fijado por digest (2026-07-23, `workflow-intelligence-diagnostic-codex-bbh20.md`):

| Métrica | Baseline | Optimized (AIOS guidance) | Δ |
| --- | ---: | ---: | ---: |
| Correctas | **18/20 (90%)** | **18/20 (90%)** | 0 |
| Tiempo | 29.497 s | 31.395 s | +1.9 s |
| Eventos de herramienta | 0 | 0 | 0 |

La conclusión tal cual: **esta muestra de n=20 no detecta mejora ni regresión**. Su valor es demostrar que el mecanismo A/B (digest fijado, brazos aislados, fallos de transporte excluidos de la puntuación) produce cifras confiables — el subset de JobBench lleva la misma disciplina a las tareas largas.

### 4.2 Scorecard de capacidades de clientes (completado, superficie estructural)

Recalculado desde `config/host-capabilities.json` para 13 clientes (reproducible con `--check`): `aios-harness` 9/12 primero, `claude` 8/12, `codex` 7/12… El scorecard mide **la superficie de intercepción/compresión/métrica que un harness puede montar**, el techo de capacidad, no las notas — pero explica por qué el Δ de JobBench debería aparecer en tareas de largo horizonte.

### 4.3 Humo de JobBench (completado, evidencia de pipeline)

1 tarea (management_analysts/task1) × 4 brazos, cadena completa realmente ejecutada (etapa solver=deepseek-v4-pro, conservada como evidencia de pipeline; las notas formales provienen del canal agnes abajo):

```
sweep jb-oc-agg1: 1 tasks ok, 0 failed
judged.json: 1 graded, 0 ungraded
parallel k=1: n=1 | score 15.91% | picked: final arm
```

La selección a ciegas eligió el **brazo final (aggregate)** y no base — dirección consistente con el artículo de Harness² (muestra 1; solo evidencia de pipeline).

### 4.4 Resultado principal: escalera de harness completa en una tarea real (runs/jb8, puntuado)

**Declaración de modelo unificado: solver, improver y juez son todos `agnes-3.0-flash`** (canal Agnes AI `https://api.agnes-ai.cn/v1`, OpenAI-compatible). Tarea: `management_analysts/task1` (análisis real de eficiencia operativa: entradas CSV/XLSX/DOCX multi-fuente → libro de análisis multi-pestaña + memo de inversión + respuesta). Los brazos base/improve/domain de la escalera completaron y fueron puntuados; aggregate en ejecución. Receta: `~/harness2/run_one_round.sh` + `~/harness2/quickjudge.py`.

| Ítem | Valor |
| --- | --- |
| Tarea | management_analysts/task1 (otras ocupaciones con la misma receta, a demanda) |
| Brazos | base / improve / domain (aggregate en ejecución) |
| Coste | ≈30 solicitudes agnes por ronda (canal de tarifa por paquetes, asumible) |
| Puntuación | rúbrica ponderada estricta, mismo juez y parámetros en todos los brazos; evidencia ítem a ítem en `runs/jb8_quickjudge_*.json` |
| Estado | ✅ tres brazos puntuados (68.2 / 83.0 / 77.3) |

| Brazo | Puntuación rúbrica ponderada (management_analysts/task1, máximo de peso 88) | Δ vs base |
| --- | ---: | ---: |
| base (harness desnudo) | 68.2% | — |
| improve (brazo de mejora iterativa) | **83.0%** | **+14.8 pp** |
| domain (brazo adaptado al dominio) | 77.3% | +9.1 pp |
| aggregate (brazo agregado) | en ejecución (runs/jb8) | — |

Método de puntuación: una sola pasada estricta con agnes-3.0-flash (temperature 0, 1/0.5/0 por rúbrica, 10 rúbricas / peso total 88); los entregables son documentos reales (xlsx multi-pestaña + docx memo + csv), extraídos y juzgados con el mismo juez y condiciones en todos los brazos. **La dirección coincide con el artículo de Harness² (la mejora del harness eleva el rendimiento del mismo modelo); la magnitud +14.8pp supera el +4.5pp de JobBench del artículo, pero con n=1, otro modelo y otro método de puntuación no es comparable directamente** (véase §5).

## 5. Limitaciones (sin ocultar)

- **n=1, tarea única**: las notas por brazo son evidencia direccional, no una conclusión estadística. La dificultad varía mucho entre ocupaciones; antes de escalar no afirmamos que "+14.8pp representa a JobBench".
- **La puntuación es una pasada estricta de rúbrica (quickjudge)**, no la cadena oficial multi-paso del juez de harness2 con selección a ciegas; los resultados ítem a ítem quedan archivados y son auditables (`runs/jb8_quickjudge_*.json`).
- **Solver y juez son el mismo `agnes-3.0-flash`**: existe sesgo de preferencia autoevaluativa (self-preference bias); los absolutos requieren cautela. El Δ relativo dentro del mismo pipeline está menos afectado (mismo juez, parámetros fijos en todos los brazos), pero sigue siendo la limitación principal de esta medición.
- Juez/solver de distinto modelo que el artículo: no se pueden colocar los absolutos junto al +4.5pp. Solo citamos Δ internos del pipeline.
- WB-Bench y LAB no cubiertos (prerrequisitos duros de GCP/licencia); no se hace ninguna afirmación sobre ellos.
- El límite de 40 min/intento está en la misma escala que las tareas largas de JobBench; el intento 2 no se reanuda desde checkpoint y las tareas que lo alcanzan quedan registradas como NO OUTPUT.

## 6. Apéndice de reproducción (superficie de comandos)

```bash
# Entorno (tres arreglos únicos): shim de timeout, config XDG aislada pelada (baseURL debe incluir /v1), watchdog
cd ~/harness2 && . .venv/bin/activate
set -a; . ./.env; set +a
export XDG_CONFIG_HOME=$HOME/harness2/xdg/config XDG_DATA_HOME=$HOME/harness2/xdg/data \
       XDG_CACHE_HOME=$HOME/harness2/xdg/cache XDG_STATE_HOME=$HOME/harness2/xdg/state
export PATH="$HOME/harness2/bin:$HOME/harness2/dependencies/tools/node_modules/.bin:$PATH"
export HARNESS2_RUNS_DIR=$HOME/harness2/runs/jb7
# solver/improver/judge = agnes/agnes-3.0-flash (tres grupos de variables en .env apuntan a https://api.agnes-ai.cn/v1)
harness2 --bench jb --k 1 --modes parallel --workers 5 --only-domains <ocupaciones> --max-tasks 1
harness2-judge  --bench jb --k 1 --mode parallel
harness2-report --bench jb --k 1 --mode parallel
```

Único parche local (divulgado): una línea en `preflight.py` — si el modelo del juez empieza por claude/gemini pero `HARNESS2_JUDGE_BASE_URL` está explícitamente configurado, se omite la sonda gcloud ADC (respaldo: `preflight.py.bak`).

---

*Rutas de evidencia: runs/jb8 (medición real de cuatro brazos en tarea única + `runs/jb8_quickjudge_*.json` ítem a ítem), runs/jb4 (humo de pipeline, canal histórico), `docs/reports/2026-07-23-workflow-intelligence-diagnostic-codex-bbh20.md` (A/B BBH-20), `docs/reports/2026-10-19-client-capability-scorecard.md` (scorecard). Todas las notas non-leaderboard.*
