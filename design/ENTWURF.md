# Daily-Dashboard — Entwurf

## Context

Für das tägliche Daily fehlt ein Board, das in einem Blick zeigt, wie die Pipelines stehen und
woran der Sprint gerade hängt. Heute sind das mehrere Tabs. Das Dashboard bündelt die intern
ohnehin genutzten Quellen (GitLab, Jira) in einem durchgehenden, dunklen Theme und ergänzt zwei
Eigenheiten des Teams: die Bildampel als kleinstmögliche Pipeline-Zusammenfassung und das
dreimonatliche Jahreszeiten-Theme samt Erinnerung, das nächste zu planen.

Diese Phase liefert **Entwurf und klickbares Mockup**, keinen Produktionscode. Beides liegt in
`daily-dashboard/design/` — `ENTWURF.md` (dieses Dokument), `mockup.html` und der mitgelieferte
Farbvalidator `validate_palette.js`.

## Entschieden

| Frage | Entscheidung |
|---|---|
| Laufzeit | Vite-SPA + schlanker Node-Proxy; Tokens bleiben serverseitig |
| Jira-Variante | unbekannt → Adapterschicht, Server/DC und Cloud beide vorgesehen |
| Ampel-Quelle | alle Projekte einer GitLab-Gruppe, Ausschlussliste in der Config |
| Jahreszeiten | Wechsel am 1. März / Juni / September / Dezember |
| Erinnerung | ab dem 1. des Vormonats (1. Feb / Mai / Aug / Nov) |
| Theme-Stärke | Akzentfarbe + sehr schwacher Hintergrundverlauf |
| Helligkeit | ausschließlich Dark Mode |
| Kacheln | Ampel, Stories, Sprint-Fortschritt, Merge Requests, Uhr + Daily-Timer, Abwesenheiten |
| Styling | Tailwind 4 CSS-first wie `ai-chat`, ohne `@ceyoniq/nwc` |
| Saisonwahl | automatisch aus dem Datum, `?season=winter` überschreibt |

## Projekt und Stack

Neues Verzeichnis `~/IdeaProjects/daily-dashboard`, npm-Workspaces, kein Git-Anlegen durch mich.

| Teil | Pfad | Inhalt |
|---|---|---|
| Frontend | `web/` | Vite + React 19 + TypeScript `strict`, Tailwind 4 |
| Proxy | `server/` | Node + Fastify, hält Tokens, cached, normalisiert |
| Logik ohne IO | `shared/` | Saison- und Statusberechnung, von beiden Seiten genutzt und testbar |
| Mockup | `design/mockup.html` | eine Datei, Fake-Daten inline, kein Build |

Die Konventionen stammen aus `ai-chat` — dem einzigen lokal vorhandenen React-Projekt des Hauses.
Übernommen wird:

| Thema | Vorbild | Umsetzung hier |
|---|---|---|
| Tailwind | `ai-chat/vite.config.ts` (`@tailwindcss/vite`, keine `tailwind.config`) | identisch |
| Design-Tokens | `ai-chat/src/index.css`: CSS-Variablen, per `@theme` an Tailwind | identisch, Variablennamen auf das Dashboard gemünzt |
| Theme-Umschaltung | `ai-chat/src/App.tsx:23` setzt `data-theme` am `documentElement` | dieselbe Mechanik, Attribut `data-season` |
| Tests | `ai-chat/vitest.config.ts`, Vitest + `@testing-library/react`, co-located `X.test.tsx` | identisch |
| Lint | `ai-chat/eslint.config.js`, Flat Config, kein Prettier | identisch |
| Daten holen | nacktes `fetch` + `useState`/`useEffect`, kein react-query | identisch |
| Node-Pin | `ai-chat` hat keinen; `neo-clm-client/.nvmrc` ist die neuere Konvention | `.nvmrc` + `engines` ergänzen |

Nicht übernommen: `@ceyoniq/nwc` und der generierte OpenAPI-Client. Beide hängen an der internen
npm-Registry samt Deploy-Token; das Dashboard soll ohne diesen Umweg baubar bleiben.

Es gibt im gesamten Baum **keinen Vorgänger** für GitLab- oder Jira-API-Zugriff — alle
`/api/v4`-Treffer sind Paket-Registry-URLs. Client und Auth entstehen neu.

Datenfluss:

```
Browser (SPA, kein Token)
   │  /api/pipelines   /api/sprint   /api/mrs   /api/config
   ▼
Fastify-Proxy  (GITLAB_TOKEN, JIRA_TOKEN aus .env)
   ├─► GitLab GraphQL  /api/graphql      Projekte + letzte Pipeline in EINER Abfrage
   └─► Jira-Adapter    /rest/api/{2|3}   Sprint-Issues
```

Der Proxy cached je Endpunkt mit TTL (GitLab 60 s, Jira 120 s) und liefert bei einem Fehler den
letzten erfolgreichen Stand mit `stale: true` zurück. Das Board darf um 9:00 nicht leer sein, nur
weil GitLab gerade hustet — eine veraltete Kachel wird sichtbar markiert, nicht verschwiegen.

## Konfiguration

`dashboard.config.json` im Projektwurzelverzeichnis, ohne Geheimnisse, versionierbar.
Tokens ausschließlich in `.env` (`read_api`-Scope genügt).

```jsonc
{
  "gitlab": {
    "baseUrl": "https://source.ceyoniq.com",
    "groups": ["fe/ki"],
    "includeSubgroups": true,
    "exclude": ["fe/ki/ki-helm-chart", "fe/ki/oobabooga*"],
    "ref": "default",
    "staleAfterDays": 14
  },
  "jira": { "baseUrl": "", "flavor": "auto", "boardId": null, "jql": null },
  "theme": { "seasonStartMonths": [3, 6, 9, 12], "reminderLeadMonths": 1 },
  "team": [{ "name": "", "absent": ["2026-10-20/2026-10-24"] }],
  "refreshSeconds": 60
}
```

`exclude` akzeptiert Glob-Muster auf dem vollen Pfad. Das ist der von dir geforderte Hebel:
Gruppe automatisch einsammeln, einzelne tote Repos (`ki-helm-chart`, `oobabooga`, `ki-nappl-prod`)
gezielt abwählen.

## Die Bildampel

Eine Zeile über die volle Breite, ein Chip je Projekt, nach Schwere sortiert — rot zuerst.
Links davor eine Hero-Zahl als Zusammenfassung: `14 ✓ · 2 ! · 1 ✕`.

Statusabbildung:

| GitLab-Status | Ampel | Farbe | Glyph |
|---|---|---|---|
| `success` | gut | `#0ca30c` | ✓ |
| `failed` | kritisch | `#d03b3b` | ✕ |
| `canceled`, `skipped`, `manual` | Warnung | `#fab219` | ! |
| `running`, `pending`, `created` | läuft | `#898781`, pulsierender Ring, gestrichelter Rand | ↻ |
| keine Pipeline / älter als `staleAfterDays` | ruhend | `#898781` | – |

„Läuft" bekommt bewusst **keine** eigene Farbe. Du hast eine Ampel verlangt — grün, gelb, rot.
Eine vierte Farbe daneben verwässert genau das. Eine laufende Pipeline ist auch kein Zustand,
sondern das Fehlen eines Zustands: sie wird neutral grau gezeigt und trägt die Bewegung als
Unterscheidung, nicht den Farbton.

Jeder Chip trägt **Glyph plus Projektkürzel**, nie Farbe allein — Rot/Grün-Schwäche ist im Team
nicht ausgeschlossen und ein Beamer verfälscht Farben ohnehin. Beim Überfahren: voller Pfad,
Branch, Alter, letzter Commit-Autor, Link zur Pipeline.

## Stories und Sprint

Mitte, größte Fläche: Spalten nach Jira-Statuskategorie (To Do / In Progress / Done), Karten mit
Key, Titel, Kürzel des Zuständigen, Punkten und Flag. Keine Diagrammform — Karten sind hier die
richtige Form, nicht ein Balken über Tickets.

Darüber der Sprint-Fortschritt als **ein** horizontaler gestapelter Balken (Punkte erledigt /
laufend / offen, 2 px Lücke zwischen den Segmenten, direkte Beschriftung) und daneben die
verbleibenden Sprint-Tage als Hero-Zahl.

### Burndown

Der Entwurf hatte ihn ausgeschlossen — er bräuchte Tagesschnappschüsse, die das Board nirgends
speichert. Das gilt nicht mehr: Jira Server führt die Historie selbst und gibt sie über den
Greenhopper-Endpunkt heraus, den die eigene Burndown-Ansicht benutzt. Damit braucht das Board
keinen eigenen Speicher, und die Kurve ist dieselbe, die im Sprint Review an der Wand hängt.

Form: Treppenlinie über der Zeit, weil zwischen zwei Änderungen nichts abbrennt. Zwei Linien —
Rest im Jahreszeitakzent, durchgezogen, 2,5 px; Ideal in `#8b979f`, gestrichelt, 1,6 px. Die
Unterscheidung trägt damit Farbe **und** Strichart, dazu Legende und ein direkt beschrifteter
Endpunkt. Über der Kachel steht der Abstand zur Ideallinie als Zahl mit Vorzeichen, in
`serious` wenn der Sprint hinterherhängt, sonst in `good`.

Keine Tooltips: das Board hängt an der Wand, es zeigt niemand mit der Maus darauf. Was ein Hover
sagen würde — aktueller Rest, Umfang, Abstand zum Ideal — steht deshalb als Text in der Kachel.

**Gemessen gegen die `#25323b`-Fläche, nicht geschätzt:** die naheliegende `--step-3` (`#566670`)
scheidet aus, sie erreicht als dünne Linie nur 2,21:1. `--step-2` (`#8b979f`) erreicht 3:1 und
trennt sich von drei der vier Akzente mit ΔE ≥ 17. Der Winterakzent `#8ec8e0` liegt bei ΔE 14,1
und damit knapp unter der Schwelle von 15 — hier tragen Strichart, Legende und Beschriftung die
Unterscheidung allein. Wer das sauber haben will, muss die Chroma des Winterakzents anheben, und
das verschiebt das ganze Wintertheme.

## Jahreszeiten-Theme

Reine Funktionen in `shared/season.ts`, ohne IO und damit mutationsfest prüfbar:

| Funktion | Verhalten |
|---|---|
| `seasonFor(date)` | Monat 3–5 Frühling, 6–8 Sommer, 9–11 Herbst, 12–2 Winter |
| `nextSeasonStart(date)` | 1. des nächsten durch drei teilbaren Monats, Jahreswechsel eingeschlossen |
| `reminderActive(date)` | wahr ab dem 1. des Vormonats des Wechsels |

Die ermittelte Saison landet als `data-season="autumn"` am `documentElement` — genau der Griff, den
`ai-chat/src/App.tsx:23` für `data-theme` benutzt. Das gesamte Theme ist damit ein CSS-Block je
Saison, kein React-State. `?season=winter` überschreibt die Rechnung, damit sich das kommende Theme
in der Planung vorführen lässt.

### Die Fläche kommt aus den Bildern

Die vier Jahreszeitenbilder in `pics/` tragen alle exakt denselben Hintergrund: **`#25323b`**,
aus allen vier Dateien per Canvas ausgelesen, Median über fünf Randpunkte. Genau dieser Wert ist
die Panelfläche des Boards — damit sitzt das Bild im Kopfbereich ohne sichtbare Kante. Die Seite
dahinter ist eine Stufe dunkler.

| Rolle | Wert |
|---|---|
| Seite | `#1e2831` |
| Panel (= Bildhintergrund) | `#25323b` |
| Karte | `#2d3b46` |
| Linie | `#3a4854` |
| Text / zweite Stufe / gedämpft | `#ffffff` · `#c7d0d6` · `#8b979f` |

Akzentfarben: Farbton aus dem jeweiligen Bild übernommen, dann so weit angehoben, bis er gegen
`#25323b` sicher 3:1 erreicht. Die reinen Bildwerte waren teils zu dunkel (Herbst 2,54:1) oder
zu blass (Winter Chroma 0,04 — las sich grau).

| Saison | Bildwert | Akzent | Kontrast |
|---|---|---|---|
| Frühling | `#bfd7a8` | `#a8d48a` | ≥ 3:1 |
| Sommer | `#f4c13e` | `#f4c13e` | ≥ 3:1 |
| Herbst | `#b1511b` | `#d2691e` | ≥ 3:1 |
| Winter | `#a6c9d8` | `#8ec8e0` | ≥ 3:1 |

Der Akzent färbt Rahmen, Kartenkanten, Überschriftenlinie und einen Hintergrundverlauf von
höchstens 8 % Deckung. Flächen und Text bleiben in jeder Jahreszeit identisch — damit kann
das Theme die Lesbarkeit nicht kippen.

Die hellere Fläche kostet Kontrast: das ursprüngliche Kritisch-Rot `#d03b3b` fiel darauf auf
2,74:1. Es ist deshalb auf **`#e35555`** angehoben. Alle fünf Ampelfarben erreichen damit wieder
3:1. Die Sprint-Rampe ist auf die neue Grauskala gezogen
(`#c7d0d6` → `#8b979f` → `#566670`) und als geordnete Rampe geprüft.

**Gemessene Konflikte, die eine Regel erzwingen:**

| Paar | ΔE normal | ΔE unter Farbsinnstörung |
|---|---|---|
| Herbst-Akzent `#d2691e` ↔ kritisch `#e35555` | 8.0 | — |
| Herbst-Akzent `#d2691e` ↔ gut `#0ca30c` | — | 3.4 (Deuteranopie) |
| Sommer-Akzent `#f4c13e` ↔ Warnung `#fab219` | klein | klein |
| kritisch `#e35555` ↔ gut `#0ca30c` | — | 4.1 (Deuteranopie) |

Werte aus `validate_palette.js` gegen `#25323b`, nicht geschätzt. Jahreszeiten und Ampeln bedienen
denselben kleinen Vorrat an natürlichen Farbtönen, deshalb liegen sie zwangsläufig dicht
beieinander. Daraus folgt eine
harte Regel: **die Ampelzeile ist akzentfrei.** Sie trägt nur die festen Statusfarben, der
Jahreszeitakzent berührt sie nicht — kein Rahmen, kein Verlauf, keine Hervorhebung. Zusätzlich
trägt jeder Chip Glyph und Namen, und unter der Zeile steht eine Legende.

Aus demselben Grund benutzt der Sprint-Balken eine neutrale Graustufenfolge statt einer bunten:
so ist jede Farbe auf dem Board eindeutig zugeordnet — Statusfarben für Zustand, Akzent für die
Jahreszeit, Grau für Mengen.

Rot und Grün liegen unter Deuteranopie zwangsläufig dicht beieinander (ΔE 4.1) — das ist bei jeder
Ampel so. Deshalb trägt jeder Chip ein eigenes Zeichen (Haken gegen Kreuz), jeder nicht-grüne Chip
zusätzlich den Projektnamen, und unter der Zeile steht immer eine Legende. Die Farbe ist nie das
einzige Merkmal.

Die Erinnerung erscheint als Band in der Kopfzeile: „Noch 23 Tage bis Winter — Theme planen", mit
Countdown, per Tag wegklickbar (localStorage). Sie überlagert nichts.

## Layout (1920 × 1080, kein Scrollen)

```
┌─────────────────────────────────────────────────────────────────────┐
│ ● Herbst   Mo 19.10.   Epics…       [ Noch 13 Tage bis Winter ]     │
├─────────────────────────────────────────────────────────────────────┤
│ ⏱ ▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  12:30   [ Pause ]     │
├──────────────┬────────────────────────────────┬────────────────────┤
│ Sprint       │  To Do    In Progress    Done  │  Merge Requests    │
│  6 Tage      │  ┌────┐   ┌────┐       ┌────┐  │   !3  12 Tage alt  │
│  ▓▓▓▓░░░░    │  │    │   │    │       │    │  │   ...              │
├──────────────┤  └────┘   └────┘       └────┘  │                    │
│ Burndown  −3 │                                │                    │
│ ╲▁ ╲▁▁       │                                │                    │
├──────────────┤                                │                    │
│ Team         │                                │                    │
└──────────────┴────────────────────────────────┴────────────────────┘
│ 14✓ 2! 1✕   ● ● ● ● ● ● ● ● ● ● ● ● ● ● ● ● ●        (akzentfrei)   │
└─────────────────────────────────────────────────────────────────────┘
```

12-Spalten-Raster, 3 / 6 / 3. Schrift durchgehend `system-ui`, Zahlen in Tabellen
`tabular-nums`.

Der Daily-Timer sitzt als **zweiter Streifen von oben** über der ganzen Breite: ein Balken, der von
links nach rechts vollläuft, wie der Sitzungsbalken in Teams. Vorher war er eine Kreisuhr unten
rechts neben der Ampel — die ist ersatzlos weg. Oben ist der richtige Platz: die Timebox gilt dem
ganzen Daily, nicht einer Kachel, und ganz unten las ihn im Stehen niemand mehr.

## Jahreszeiten-Symbole statt Wörtern

Im Kopfbereich steht keine Beschriftung mehr, sondern das Bild der laufenden Jahreszeit aus
`pics/`. Weil die Panelfläche exakt dem Bildhintergrund entspricht, sitzt es ohne sichtbare Kante.
Für die kleinen Stellen — Erinnerungsband, Hinweis auf das kommende Theme — bleiben gezeichnete
Symbole (Blüte, Sonne, Ahornblatt, Schneeflocke), weil ein Foto dort zu dicht wird. Auch die
Kachelüberschriften und die Ampelzeichen sind Symbole, nicht Text.

## Mockup — Entwurfsstand, in `design/mockup.html`

Das Mockup ist der Stand **vor** den Bildern: dunkelgrauer Grund, gezeichnetes Ahornblatt statt
Bild. Es bleibt als Entwurfsbeleg liegen; maßgeblich ist die gebaute Anwendung.

Im Browser öffnen, kein Build. Fake-Daten inline.

| Eingabe | Wirkung |
|---|---|
| `1` `2` `3` `4` | Frühling / Sommer / Herbst / Winter |
| `0` | zurück auf automatisch aus dem Datum |
| `r` | Erinnerungsband ein und aus |
| Leertaste | Daily-Timer starten und pausieren |
| `?season=winter` | Jahreszeit per Adresse erzwingen, wie im echten Board vorgesehen |
| Zeiger über einen Ampel-Chip | Pfad, Branch, Alter, Job, letzter Autor |

Alle Ampelzustände inklusive „läuft" und „ruhend" sind vertreten. Der Palettenvalidator läuft als
`<script type="module">` mit und schreibt seinen Bericht in die Konsole — die Farbwahl ist damit
belegt und nicht behauptet.

Im Vorschaumodus rechnet das Mockup mit einem gedachten Datum kurz vor dem jeweiligen Wechsel,
damit sich das Erinnerungsband in jeder Jahreszeit zeigen lässt. Die Kopfzeile schreibt dann
„Vorschau" dazu; die Uhr und das Datum bleiben echt.

## Offene Punkte

| Punkt | Auswirkung |
|---|---|
| Jira-Variante unbekannt | Adapter deckt beide Pfade ab; beim Umsetzen ist eine der zwei Implementierungen tot |
| Jira-Sprint-Auswahl | Board-ID oder freies JQL — hängt an der Variante |
| GitLab-GraphQL-Verfügbarkeit | falls die Instanz es nicht hergibt, Rückfall auf REST mit N+1 und längerem Cache |
| Betriebsort | vorerst `localhost` auf deinem Rechner; ein Container-Deployment ist nachrüstbar, aber nicht Teil des Entwurfs |

## Prüfung

| Was | Wie |
|---|---|
| Mockup | `design/mockup.html` im Browser öffnen, alle vier Jahreszeiten durchschalten, Konsolenbericht des Validators lesen |
| Saisonlogik | Vitest über `shared/season.ts`, Grenzfälle 28.02./01.03., 30.11./01.12., Jahreswechsel; jeder Test gegen eine mutierte Implementierung gegengeprüft |
| Ampelabbildung | Vitest über die Statusfunktion, alle GitLab-Status einschließlich unbekannter |
| Ganze Suite | `npm test` im Wurzelverzeichnis vor Abschluss, nicht nur die berührten Dateien |
