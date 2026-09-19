# WEBINSOLITO H24 AUTOPILOT — CURRENT MISSION

## OWNER-APPROVED PHASE

**GRAPHICS ONLY.**

Until this file is explicitly changed by the owner, the autonomous loop must improve only the visual quality of Webinsolito.

### Allowed
- Home visual design
- typography
- spacing
- responsive layout
- category card design
- category icon quality and consistency
- backgrounds, borders, shadows and depth
- search box presentation only
- lightweight micro-interactions
- visual accessibility
- visual consistency
- performance-safe CSS/SVG refinements
- screenshot and regression-test improvements related to visual QA

### Forbidden
- new apps
- new features
- changing app logic
- changing search logic or intent matching
- changing routing
- changing data sources
- changing business logic
- adding logins/accounts
- adding paid services
- adding recurring-cost dependencies
- removing working functions
- modifying production `main` directly

## EVERY AUTONOMOUS RUN

1. Start from the latest `candidate/h24-autopilot`.
2. Inspect the rendered result and the latest code.
3. Choose ONE highest-impact visual weakness.
4. Make one coherent improvement only.
5. Run relevant tests.
6. Capture desktop, tablet and mobile evidence when the change is visual.
7. Compare before/after honestly.
8. If it is not clearly better, iterate or revert.
9. Open a PR back to `candidate/h24-autopilot`.
10. Report exactly what changed, what was tested, and what remains uncertain.

## VISUAL TARGET

Webinsolito must stop looking like:
- a generic dashboard
- a directory of empty cards
- a school project
- a cheap template
- a collection of random icons

It should increasingly look:
- premium
- distinctive
- coherent
- fast
- modern
- useful
- intentionally designed

The desired reaction is earned by the actual interface:

> “Ma che cazzo di sito è questo? Qui posso fare praticamente tutto.”

Do not place that sentence on the site. The product should make the user feel it.

## SAFETY / QUALITY GATE

Production `main` is protected conceptually: the H24 loop evolves only the candidate branch.

A change may be auto-merged only into `candidate/h24-autopilot`, never into `main`, and only after automated checks complete successfully.

If checks fail, are missing, or the change is ambiguous, do not merge it.
