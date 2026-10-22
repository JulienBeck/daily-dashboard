# Daily-Dashboard

Ein Board für das Daily: Pipeline-Ampel, Sprint-Stories, Merge Requests, Anwesenheit, Timebox —
dunkel, ohne Scrollen, mit einem Jahreszeiten-Theme, das sich alle drei Monate ändert.

Entwurf und Farbbegründung: [`design/ENTWURF.md`](design/ENTWURF.md).
Statisches Mockup ohne Build: [`design/mockup.html`](design/mockup.html).

## Aufbau

```
Browser (SPA, kein Token)
   │  /api/board /api/pipelines /api/mrs /api/sprint /api/epics
   │  /api/commits /api/calendar /api/avatar
   │  POST /api/issues/<key>/lane
   ▼
Fastify-Proxy (GITLAB_TOKEN, JIRA_TOKEN)
   ├─► GitLab GraphQL  /api/graphql
   └─► Jira            /rest/api/{2|3} + /rest/agile/1.0
```

Die Tokens liegen ausschließlich im Proxy. Der Proxy cached je Endpunkt und liefert bei einem
Fehler den letzten erfolgreichen Stand weiter, damit das Board um 9:00 nicht leer ist.

`/api/avatar` holt Jira-Profilbilder, weil der Browser dafür keinen Token hat. Er nimmt nur
Adressen an, die auf der konfigurierten Jira-Instanz liegen — sonst wäre er ein offener Proxy, der
mit deinem Token fremde Ziele abfragt.

Die Bilder der Teilnehmer sucht der Proxy über `/user/search`, der Reihe nach mit `team[].email`,
dessen lokalem Teil vor dem `@` und zuletzt mit `name`. Die zweite Runde ist der wichtige Fall:
**Jira gibt die Mailadresse je nach Datenschutzeinstellung gar nicht heraus**, dann findet die
Suche danach niemanden, wohl aber nach dem Benutzernamen — und der ist meist genau dieser lokale
Teil. Genommen wird nur ein Treffer, der im Benutzernamen, Anzeigenamen oder in der Adresse
**genau** passt, oder der einzige Treffer überhaupt. Ein mehrdeutiger Vorname liefert bewusst
**kein** Bild, sondern die Anfangsbuchstaben: ein fremdes Gesicht im Daily fällt niemandem auf,
ein Kreis mit Kürzeln schon.

Bleibt jemand ohne Bild, steht im Proxy-Log, was versucht wurde und wie viele Treffer kamen:

```
Jira: kein Profilbild für Daniel (D.Dietrich@ceyoniq.com → 0, D.Dietrich → 0, Daniel → 3)
```

Durchweg `0` heißt: dem Token fehlt das globale Recht `Browse users`, oder der Benutzername sieht
anders aus — dann die Adresse durch den Jira-Benutzernamen ersetzen, `email` nimmt beides.

**Die Adresse verlässt den Proxy nicht.** `/api/board` liefert Name, Kürzel, Abwesenheit und
Bildadresse — `email` wird dort abgeschnitten (`forBoard` in `src/server/index.ts`).

## Kalender

Aus einem **veröffentlichten ICS-Link** (Outlook Web → Kalender → Veröffentlichen). Keine
App-Registrierung, keine Admin-Freigabe. Der Parser steckt in `src/server/ics.ts` und kann
Serientermine auflösen: `FREQ` täglich/wöchentlich/monatlich/jährlich, `INTERVAL`, `BYDAY`,
`COUNT`, `UNTIL` und abgesagte Einzeltermine über `EXDATE`.

Zwei bewusste Grenzen:

- **Zeitzonen**: nur ein abschließendes `Z` wird als UTC gelesen. Eine `TZID`, die wir nicht
  auflösen können, gilt als Ortszeit — das Board läuft in derselben Zeitzone wie der Kalender.
- **Die ICS-Adresse ist das Geheimnis.** Wer sie hat, liest den Kalender. Sie gehört in die `.env`
  und nirgendwo sonst hin.

| Pfad | Inhalt |
|---|---|
| `src/shared/` | Saison- und Ampellogik, ohne IO, von beiden Seiten genutzt |
| `src/server/` | Fastify-Proxy, GitLab- und Jira-Anbindung, Cache |
| `src/web/` | React-Oberfläche, Icons, Komponenten |
| `design/` | Entwurf, Mockup, Farbvalidator |

## Einrichten

```bash
cp .env.example .env          # GITLAB_TOKEN eintragen (Scope read_api)
$EDITOR dashboard.config.json # Gruppe, Ausschlussliste, Jira-Adresse, Team
npm install
npm run dev                   # http://localhost:5180
```

`npm run dev` startet Vite und den Proxy gemeinsam. Vite leitet `/api` an `localhost:3399` weiter.

Die `.env` wird über Nodes eingebautes `--env-file-if-exists` geladen — kein `dotenv`-Paket. Das
hängt an den Skripten `dev:api` und `start`; wer den Proxy von Hand startet, muss das Flag selbst
mitgeben. Im Container ist es nicht nötig: dort kommen die Variablen aus Compose.

## Im Container

```bash
docker compose up --build     # http://localhost:8088
```

Zwei Images: `Dockerfile.server` (Proxy) und `Dockerfile.web` (nginx mit dem gebauten Bundle).
`dashboard.config.json` ist gemountet, nicht eingebacken — Datei ändern, `docker compose restart api`,
fertig. Die Tokens kommen aus `.env` neben der Compose-Datei.

| Variable | Wofür |
|---|---|
| `TZ` | entscheidet, welcher Tag „heute" ist — Vorgabe `Europe/Berlin`. Node bringt seine eigene Zeitzonendatenbank mit, im Alpine-Image muss dafür kein `tzdata` nachinstalliert werden |
| `CALENDAR_ICS_URL` | wird durchgereicht, weil `calendar.sources[].env` sie nennt. Fehlt sie, bleibt nur dieses Panel leer |
| `DOCKER_SUBNET` | Notausgang, Vorgabe `172.28.0.0/24` — siehe unten |

**Kein freier Adresspool.** Scheitert `docker compose up` an
`all predefined address pools have been fully subnetted`, liegen Catch-all-Routen auf dem Host
(`0.0.0.0/1` und `128.0.0.0/1`, typisch für einen VPN-Client). Docker überspringt jeden Pool, der
sich mit einer Host-Route überschneidet, und findet dann keinen. Das Compose-Netz hat deshalb ein
**festes Subnetz** statt automatischer Vergabe; kollidiert `172.28.0.0/24` auf deiner Maschine,
setze `DOCKER_SUBNET` in der `.env`. Gegenprobe, ob es wirklich daran liegt:
`docker network create probe` scheitert dann auch ohne jedes Projekt.

**Daemon in WSL, CLI unter Windows.** Läuft der Daemon in einer WSL-Distribution, gehören
Compose-Aufrufe **nach WSL hinein** — der Windows-CLI schickt sonst Windows-Pfade als
Bind-Mount-Quelle, die der Linux-Daemon nicht auflösen kann:

```bash
wsl -d Ubuntu -- bash -lc 'cd /mnt/c/.../daily-dashboard && docker compose up -d'
```

`docker compose config` druckt die Tokens im Klartext; zum reinen Prüfen `-q` anhängen.

Für einen späteren Cluster-Einsatz: `API_UPSTREAM` auf `<service>.<namespace>:3399` setzen,
`BASE_PATH` als Build-Argument, falls die Anwendung unter einem Unterpfad hängen soll.

## Konfiguration

`dashboard.config.json`, ohne Geheimnisse, versionierbar.

| Schlüssel | Wirkung |
|---|---|
| `gitlab.groups` | Gruppen, deren Projekte die Ampel einsammelt — **vollständiger Pfad** samt Obergruppe, also `ceyoniq/fe/ki`, nicht `fe/ki` |
| `gitlab.exclude` | Ausschlussliste, Glob auf demselben vollen Pfad (`ceyoniq/fe/ki/oobabooga*`) |
| `gitlab.staleAfterDays` | ab wann eine alte Pipeline als „ruhend" gilt statt grün |
| `gitlab.hideWithoutPipeline` | Vorgabe `true`: Projekte ohne Pipeline auf dem Default-Branch kommen gar nicht auf die Ampel. Eine *alte* Pipeline bleibt sichtbar — nur „nie gebaut" fliegt raus |

**Ein offenes manuelles Gatter ist kein Fehler.** `manual` und `scheduled` heißen: alle
automatischen Jobs sind durch, jemand muss noch einen Knopf drücken. Die Farbe bleibt deshalb
grün, der Chip trägt stattdessen ein Pausezeichen. Gelb bleibt `canceled` und `skipped` — da hat
jemand eingegriffen oder etwas ist ausgefallen.

Bleibt ein Projekt gelb, obwohl du es für grün hältst: **über den Chip fahren.** Im Tooltip steht
GitLabs eigener Klartext und daneben der technische Status. `gitlab.forceGood` nimmt eine Liste
dieser Werte und zeigt sie trotzdem grün — ein bewusster Notausgang, kein Standard.

Welcher Lauf die Ampelfarbe bestimmt, entscheidet `newestOnRef` in `src/server/gitlab.ts`: unter
allen Pipelines des Default-Branch gewinnt die mit dem **jüngsten `updatedAt`**. Das ist wichtig,
weil ein wiederholter Job die Pipeline aktualisiert, ohne sie neu anzulegen. Kind-Pipelines,
Merge-Request-Läufe und externe Läufe bleiben außen vor — die gehören nicht zum Branch-Build.
| `jira.weekComponents` | Jira-Komponenten, nach denen das Storyboard waagerecht geteilt wird (`["Woche 1", "Woche 2"]`). Vorgänge ohne eine davon landen in einem eigenen Band am Ende |
| `jira.flavor` | `auto`, `server` oder `cloud` — bestimmt API-Pfad und Anmeldeverfahren |
| `jira.boardId` / `jira.jql` | entweder aktiver Sprint eines Boards oder freie Abfrage |
| `jira.storyPointsField` | leer lassen: erst fragt das Board, womit es schätzt (`/board/<id>/configuration`), erst danach wird nach dem Feldnamen gesucht |
| `theme.reminderLeadMonths` | Vorlauf der Theme-Erinnerung, Vorgabe 1 Monat |
| `team` | Namen und Abwesenheiten. `gitlabUser: true` heißt **„das bin ich"** → der Proxy liest `/events` des Token-Besitzers. Ein **String** ist ein Benutzername → `/users/<name>/events`. `false` oder weggelassen → für diese Person werden keine Commits geholt |
| `jira.epicsBoardId` | Board-Nummer aus `…/RapidBoard.jspa?rapidView=<Zahl>`. Der Proxy liest den **Filter des Boards** und baut daraus die Abfrage — so gilt derselbe Bereich wie im Board |
| `jira.epicsStatusCategories` | welche Epics gezeigt werden; Vorgabe `["indeterminate"]` = **In Progress**, also das laufende Theme |
| `jira.epicsJql` | gesetzt überschreibt es Board und Status komplett. **Die tatsächlich gesendete Abfrage steht im Board** hinter dem Abzeichen `JQL` neben der Überschrift — darüberfahren genügt |
| `jira.epicsLimit` | wie viele Epics oben Platz haben (3–4) |
| `jira.laneStatus` | je Spalte eine Liste von **Zielstatus-Namen** für das Verschieben per Drag-and-drop. Leer gelassen nimmt der Proxy den ersten passenden Übergang — siehe „Stories verschieben" |
| `team[].email` | Dienstliche Adresse, mit der die Person in den angebundenen Systemen gefunden wird — heute das Jira-Profilbild. Weggelassen sucht der Proxy nach `name` und nimmt den Treffer nur, wenn er eindeutig ist. Ein Jira-Benutzername tut es auch, die Suche nimmt beides |
| `activity.days` / `activity.perMember` | Rückblick in Tagen und wie viele Pushes je Person unter dem Namen stehen |
| `calendar.sources` | je Person ein Eintrag `{ member, env, own }`. `env` nennt die **Umgebungsvariable**, in der die ICS-Adresse steht — die Adresse selbst bleibt in der `.env`, weil sie das Geheimnis ist |
| `calendar.absenceKeywords` | ganztägige Termine mit einem dieser Wörter im Titel gelten als Abwesenheit und überschreiben `team[].away` |
| `absences` | handgepflegte Urlaubsliste mit Zeitraum — siehe „Urlaube eintragen" |
| `theme.absenceLookaheadDays` | wie weit das Board auf kommende Urlaube vorausschaut, Vorgabe 14 Tage |

## Urlaube eintragen

Solange kein Teamkalender angebunden ist, stehen die Abwesenheiten mit Datum in `absences` —
eine flache Liste, chronologisch oder nicht, der Proxy sucht sich den passenden Eintrag selbst:

```json
{
  "absences": [
    { "member": "Timo", "from": "2026-10-20", "to": "2026-10-24" },
    { "member": "Julien", "from": "2026-12-22", "to": "2027-01-02" },
    { "member": "Daniel", "from": "2026-11-03", "label": "Fortbildung" }
  ]
}
```

| Feld | Regel |
|---|---|
| `member` | muss **wörtlich** einem `team[].name` entsprechen — ein Eintrag ohne Treffer bleibt wirkungslos |
| `from` / `to` | `YYYY-MM-DD`, **`to` zählt mit**: bis einschließlich diesem Tag ist die Person weg. `to` weglassen heißt „ein einzelner Tag" |
| `label` | optional, Vorgabe `Urlaub`. Steht so im Board, also auch `Fortbildung` oder `Elternzeit` |

Ein Eintrag mit kaputtem Datum (`20.10.2026`, `2026-10-20T00:00:00Z`) oder ohne `member` wird
**stillschweigend übergangen** — die übrigen bleiben gültig. Wer einen Urlaub einträgt und ihn
im Board nicht sieht, prüft zuerst Schreibweise des Namens und Datumsformat.

Wer heute dran ist, steht ausgegraut mit dem Label neben dem Namen und zählt nicht zum
`n / m` in der Kopfzeile. Wessen Urlaub bevorsteht, bekommt einen stillen Hinweis rechts —
`Urlaub ab morgen`, innerhalb einer Woche `Urlaub ab Di`, darüber hinaus `Urlaub ab 03.11.`.
Der Hinweis verschwindet, sobald die Person ohnehin als abwesend geführt wird.

Die Quellen überlagern sich in dieser Reihenfolge: **ICS-Kalender** schlägt **`absences`**
schlägt **`team[].away`**. Damit bleibt `team[].away` der datumslose Dauervermerk, während die
Urlaubsliste von selbst wieder abläuft. Welcher Tag „heute" ist, entscheidet die **Zeitzone des
Proxy-Prozesses**; die `docker-compose.yml` setzt dafür `TZ` auf `Europe/Berlin`. Ohne das liefe
der Container in UTC und der Urlaub wechselte im Sommer um 02:00 statt um Mitternacht.

Die Liste wird bei **jedem** `/api/board` neu ausgewertet, nicht zwischengespeichert; eine
geänderte `dashboard.config.json` braucht allerdings einen Neustart des Proxy, weil sie beim
Start gelesen wird.

## Stories verschieben

Eine Karte lässt sich im Daily mit der Maus in eine andere Spalte ziehen; der Proxy führt dazu
einen Jira-Übergang aus. Die Karte springt sofort — die Antwort aus Jira wird nicht abgewartet.
Lehnt Jira ab, rutscht sie zurück und oben rechts im Board steht der Grund (Tooltip).

Die Woche bleibt beim Ziehen unberührt: Bänder sind Komponenten, Spalten sind Status.

Weil eine Spalte eine ganze **Statuskategorie** umfasst, passen oft mehrere Übergänge. Die
Reihenfolge ist:

1. der erste Status aus `jira.laneStatus.<spalte>`, der im Vorgang überhaupt erreichbar ist,
2. sonst der erste angebotene Übergang in die Kategorie der Spalte.

Ohne `laneStatus` landet „In Arbeit" bei einem Workflow mit *In Progress* **und** *In Review*
deshalb auf dem, was Jira zuerst nennt. Tauchen die falschen Status auf: Namen eintragen.

```json
{
  "jira": {
    "laneStatus": {
      "todo": ["To Do", "Offen"],
      "doing": ["In Progress"],
      "done": ["Done", "Erledigt"]
    }
  }
}
```

Gibt es gar keinen passenden Übergang — fehlende Rechte oder ein Workflow, der den Sprung nicht
erlaubt — nennt die Fehlermeldung die Status, die der Vorgang stattdessen anbietet. Der Token
braucht dafür Schreibrechte; ein reiner Lesezugriff ergibt `403`.

## Jahreszeiten

| Monate | Theme | Symbol |
|---|---|---|
| Mrz – Mai | Frühling | Blüte |
| Jun – Aug | Sommer | Sonne |
| Sep – Nov | Herbst | Ahornblatt |
| Dez – Feb | Winter | Schneeflocke |

Die Jahreszeit kommt aus dem Datum und landet als `data-season` am `<html>`-Element; das Theme ist
damit reines CSS. `?season=winter` erzwingt eine andere — gedacht zum Vorführen des kommenden
Themes in der Planung. Ab dem 1. des Vormonats erscheint das Erinnerungsband.

**Der Jahreszeitakzent berührt die Ampelzeile nie.** In drei von vier Jahreszeiten liegt er farblich
fast auf einer Ampelstufe; die Begründung samt Messwerten steht in `design/ENTWURF.md`.

## Prüfen

```bash
npm test     # 124 Tests, Logik und Komponenten
npm run lint
npm run build
```
