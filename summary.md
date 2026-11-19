# Session-Übergabe — 2026-11-18

Notiz für die nächste Session. Nicht zum Committen gedacht.

## Stand

| Bereich | Stand |
|---|---|
| Rahmen | Nur noch der Metall-Look mit Jahreszeiten-Deko; Classic-Look, Umschalter, `?look=` entfernt |
| Belohnungen | Postgres (`pg`, Tests gegen PGlite), Questgeber verteilt per Dialog und Inbox, automatische Verteilung am Sprintende, Cutoff = Start des laufenden Sprints |
| Kube | `daily-dashboard-kube`: Postgres als StatefulSet, Secret `daily-dashboard-db` einmalig von der Pipeline erzeugt; App wartet beim Start auf die DB |
| Schließen-Knopf | rot: Questlog über `.btn` (`questlog.css`), übrige Fenster über `.red-button` (`frames.css`) in `components/Window.tsx` |
| Avatar | SVG-Paper-Doll `components/avatar/Figure.tsx`, Charakterbogen `CharacterSheet.tsx`, Katalog `src/shared/avatar.ts` (16 Items, 8 Slots), Tabelle `inventory`, `GET/POST /api/equipment`, Starter-Kit einmalig über `player.outfitted_at` |
| Uncommitted | Rote Knöpfe + Avatar liegen im Working Tree. Vorschlag: `Add animated avatar with equipment slots, red close buttons` |
| ⚠ `pics/avatar.jpeg` | Gestaged, Screenshot aus einem kommerziellen Spiel. Vor dem Commit herausnehmen: `git restore --staged pics/avatar.jpeg` |

Letzte Prüfung: `vitest` 49 Dateien / 1050 Tests grün, `eslint` und `build` sauber, Avatar-Mutationen 26/26, IntelliJ-Lauf mit begründeten Fehlalarmen (Fastify-`reply`, Grazie „gray“).

## Offene Aufgaben (Reihenfolge)

### 1. Ein Quest-Knopf statt zwei

Wunsch: ein einziger Knopf, der vom Zustand abhängt — **Annehmen → Abbrechen/Abgeben**.

| Datei | Befund |
|---|---|
| `src/web/questlog/components/QuestActions.tsx` | Zwei Knöpfe `accept` und `complete`, beide immer sichtbar; enthält noch JSDoc-Kommentare (gegen die Kommentarregel, beim Anfassen entfernen) |
| `src/web/questlog/strings.ts:113-119` | Labels `accept`, `complete`, Hints; ein Label für Abbrechen fehlt noch (de + en) |
| `src/web/questlog/Questlog.tsx:121-130` | Handler `accept`/`complete` über `writeQuest` |

Zu klären:
- „Abbrechen/Abgeben“: Bei angenommener Quest ein Knopf mit zwei Funktionen oder zwei Knöpfe nebeneinander (Abbrechen + Abgeben)? Was macht Abbrechen in Jira — Assignee entfernen, Status zurück auf offen?
- Für Abbrechen gibt es noch keinen Server-Endpunkt.
- Zustand der Quest: `quest.state` (`available` / `active` / `complete`); fremde aktive Quests ausnehmen.

### 2. Questliste im Profil läuft über den unteren Rand

`src/web/components/Profile.tsx` ab Zeile ~156: Die Liste `profile.quests` hat keine Höhenbegrenzung. Das Fenster ist `max-h-[90vh]` (`Window.tsx`), die rechte Spalte braucht `min-h-0` und die Liste `overflow-y-auto`. Danach mit Playwright und vielen Quests prüfen.

### 3. Nur über das Questlog abgeschlossene Quests zählen — Ursache der Goldmünzen

Ursache: Beim ersten Öffnen holt `service.profile()` (`src/server/rewards/service.ts:116-124`) mit `fetchLegacy` (`src/server/rewards/jira.ts:70`) **alle** erledigten Jira-Vorgänge vor dem Cutoff und schreibt sie in `openPlayer` (`src/server/rewards/store.ts:279`) als `distributed_by = 'legacy'` samt Share gut. Daher die Goldmünzen statt 0 Silber.

Dazu kommt `sync()`: Er nimmt jede Quest mit `state === 'complete'` aus den Seiten auf, egal ob sie über das Questlog abgegeben wurde.

Plan:
- Legacy-Import entfernen (`fetchLegacy`, Parameter `legacy` in `openPlayer`, Tests).
- Abgaben über das Questlog markieren: Beim „Quest abgeben“ einen Datensatz schreiben (z. B. Spalte `quest.handed_in_by` / `handed_in_at` oder eine Tabelle). `sync()` und die Profilliste berücksichtigen nur so markierte Quests.
- Bestehende Daten bereinigen: Legacy-Quests und ihre Shares löschen, `player.experience`/`copper` neu berechnen. Lokal per SQL, im Cluster als einmaliger Schritt — mit dem Nutzer abstimmen, weil das die Produktions-DB betrifft.
- Vor dem Bau klären: Zählt eine Quest, die jemand anderes über das Questlog abgegeben hat, für alle Contributors (wie bisher die Verteilung) — oder nur für den Abgebenden?

### 4. Danach: Avatar ausbauen

- Aufwändigere Figur, Hintergrund (Szene hinter der Paper Doll), ggf. passend zur Jahreszeiten-Deko.
- Danach der Laden: Items mit Münzen kaufen; Qualitäten `rare` und `epic` existieren nur als Farben, Items haben noch keine Werte.
- Schema-Änderungen bisher idempotent per `if not exists`. Vor weiteren Änderungen ein versioniertes Migrationsschema einführen.

## Ungeprüft

| Punkt | Warum |
|---|---|
| Produktionspfad mit `pg` und Docker | lokal nie gegen echte Postgres-Instanz gelaufen |
| Kube-Deployment | kein Zugriff auf den Cluster |
| Kube-Repo | kein versioniertes IntelliJ-Inspektionsprofil |
