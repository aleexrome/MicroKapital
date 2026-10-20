# MicroKapital — notas de trabajo con Claude Code

## Workflow de PRs

**Regla fijada por el usuario (prioritaria):** cada cambio que pide es
un **PR único y nuevo**. El usuario mergea cada PR al momento, por lo
que cualquier commit posterior en la misma branch queda huérfano fuera
de main.

Procedimiento obligatorio para cada cambio solicitado:
1. `git fetch origin main`
2. `git reset --hard origin/main`
3. Aplicar los cambios.
4. `git add -A && git commit -m "…"`
5. `git push -u origin claude/handle-non-working-days-ZVBbP --force`
6. Abrir **PR nuevo** vía `mcp__github__create_pull_request` con título
   descriptivo del cambio solo.

Nunca intentar reutilizar un PR existente ni agregar commits "encima
del anterior" asumiendo que seguirá abierto. Si por error se puschan
varios commits antes de que mergeara, usar cherry-pick + nuevo PR.

## Branch de trabajo

`claude/handle-non-working-days-ZVBbP` — todos los PRs se abren con
`head` = esta branch y `base` = `main`.
