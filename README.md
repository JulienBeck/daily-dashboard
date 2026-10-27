# Daily-Dashboard

Ein Board für das Daily: Pipeline-Ampel, Sprint-Stories, Merge Requests, Anwesenheit, Timebox —
dunkel, ohne Scrollen, mit einem Jahreszeiten-Theme, das sich alle drei Monate ändert.

Entwurf und Farbbegründung: [`design/ENTWURF.md`](design/ENTWURF.md).
Statisches Mockup ohne Build: [`design/mockup.html`](design/mockup.html).

## Burndown

`/api/burndown` liest `/rest/greenhopper/1.0/rapid/charts/scopechangeburndownchart` — denselben
Endpunkt, den Jiras eigenes Burndown benutzt. Er ist **undokumentiert** und gibt es nur auf Jira
Server/DC; die Rapid-View-ID ist dort die Board-ID aus `jira.boardId`. Ohne `boardId` (also bei
freiem JQL) gibt es keine Historie und der Endpunkt antwortet mit einem Fehler.

Der Proxy rechnet die Änderungsliste in eine Restkurve um (`src/server/burndown.ts`): jeder Eintrag
schiebt ein Issue in den Sprint oder heraus, ändert seine Schätzung oder kippt seine Spalte — die
Summe über alles, was noch im Sprint und nicht fertig ist, ist ein Punkt der Linie. Die Linie ist
eine **Treppe**, keine Schräge: zwischen zwei Änderungen brennt nichts ab, und eine Interpolation
würde Fortschritt an Tagen erfinden, an denen keiner war.

Die Ideallinie ist eine Gerade vom Umfang bei Sprintbeginn auf null bei Sprintende. Jiras eigene
Guideline knickt zusätzlich bei Scope-Änderungen und freien Tagen — für das Board ist die Gerade
die ehrlichere Vereinfachung, die Scope-Änderung steht als Zahl daneben.

## Aufbau

```
Browser (SPA, kein Token)
   │  /api/board /api/pipelines /api/mrs /api/sprint /api/epics
   │  /api/commits /api/calendar /api/avatar /api/burndown
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

| Pfad | Inhalt |
|---|---|
| `src/shared/` | Saison- und Ampellogik, ohne IO, von beiden Seiten genutzt |
| `src/server/` | Fastify-Proxy, GitLab- und Jira-Anbindung, Cache |
| `src/web/` | React-Oberfläche, Icons, Komponenten |
| `design/` | Entwurf, Mockup, Farbvalidator |

Ausgerollt wird nicht aus diesem Repository: das macht `daily-dashboard-kube` auf
`source.ceyoniq.com`. Dort liegen die echte Konfiguration, die Tokens und die Manifeste —
dieses Repository ist öffentlich und darf nichts davon enthalten.

## Kalender

**Stand 2026-10-23: nicht angebunden.** Das Panel bleibt leer, Abwesenheiten kommen aus der
Handliste `absences` (siehe „Urlaube eintragen").

### Warum der ICS-Weg ausfällt

Gebaut ist er für einen **veröffentlichten ICS-Link** (Outlook Web → Kalender → Veröffentlichen).
Den Knopf gibt es in unserem Tenant nicht, und laut IT soll es ihn auch nicht geben. Das ist
nachvollziehbar: ein veröffentlichter Link ist **unauthentifiziert** — wer ihn hat, liest den
Kalender, ohne sich anzumelden, ohne Protokoll und ohne Entzugsmöglichkeit außer dem Wechsel der
Adresse. Nicht weiter darauf drängen; der Weg unten ist der bessere Antrag.

Der Code bleibt, er ist nicht das Problem: `src/server/ics.ts` löst Serientermine auf (`FREQ`
täglich/wöchentlich/monatlich/jährlich, `INTERVAL`, `BYDAY`, `COUNT`, `UNTIL`, abgesagte
Einzeltermine über `EXDATE`). Steht irgendwann eine ICS-Adresse zur Verfügung — ein fremder
Kalender, ein Raumkalender, ein Export —, genügt weiterhin `CALENDAR_ICS_URL`.

Zwei bewusste Grenzen dieses Parsers:

- **Zeitzonen**: nur ein abschließendes `Z` wird als UTC gelesen. Eine `TZID`, die wir nicht
  auflösen können, gilt als Ortszeit — das Board läuft in derselben Zeitzone wie der Kalender.
- **Die ICS-Adresse ist das Geheimnis.** Wer sie hat, liest den Kalender. Sie gehört in die `.env`
  und nirgendwo sonst hin.

### Der eingeschlagene Weg: Microsoft Graph

Entschieden am 2026-10-23, **noch nicht gebaut**. Der Proxy holt sich selbst ein Token und liest
je Teammitglied `/v1.0/users/<mail>/calendarView`. Serientermine löst Graph selbst auf, der
ICS-Parser wird dafür nicht gebraucht.

Was die IT anlegen muss — genau das und nicht mehr:

| Schritt | Inhalt |
|---|---|
| App-Registrierung | nur für die eigene Organisation, kein Redirect nötig |
| Anwendungsberechtigung | `Calendars.Read` (**nicht** delegiert) samt Admin-Consent |
| Eingrenzung | `New-ApplicationAccessPolicy` auf genau die Postfächer aus `team[].email` |

Die Eingrenzung ist das Argument für den Antrag: ohne sie dürfte die App **jedes** Postfach im
Tenant lesen, mit ihr genau vier. Das ist nachweislich enger als ein veröffentlichter Link und
jederzeit entziehbar.

Zurück kommen drei Werte — Tenant-ID, Client-ID, Client-Secret. Die ersten beiden sind keine
Geheimnisse, das Secret schon und es verfällt; es gehört zu den Tokens, nicht in `config/`.

Offen, bis die Freigabe da ist: `src/server/graph.ts` gibt es noch nicht, `calendar.sources`
kennt noch keinen Graph-Typ, und `daily-dashboard-kube` reicht bislang nur `CALENDAR_ICS_URL`
durch.

## Einrichten

```bash
cp .env.example .env                                      # GITLAB_TOKEN eintragen (Scope read_api)
cp dashboard.config.json dashboard.config.local.json      # Gruppe, Ausschlussliste, Jira-Adresse, Team
$EDITOR dashboard.config.local.json
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
| `DASHBOARD_CONFIG_FILE` | welche Datei gemountet wird. **Ohne sie ist es die Beispieldatei** mit `Alice`, `Bob` und `example-group` — das Board bleibt dann leer. Für echte Daten auf `./dashboard.config.local.json` zeigen |
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

Gelesen wird, in dieser Reihenfolge: `DASHBOARD_CONFIG_JSON` (die ganze Konfiguration als
Umgebungsvariable — so kommt sie im Cluster an), `DASHBOARD_CONFIG` (Pfad),
`dashboard.config.local.json`, `dashboard.config.json`.

Die eingecheckte `dashboard.config.json` ist ein **Beispiel mit neutralen Werten**. Namen,
Mailadressen und interne Adressen gehören in die nicht versionierte
`dashboard.config.local.json` — dieses Repository ist öffentlich.

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
| `activity.hours` / `activity.perMember` | Rückblick in **Stunden** (Vorgabe 36) und wie viele **Repositories** je Person unter dem Namen stehen — siehe „Was habe ich gestern gemacht" |
| `activity.sinceLastWorkday` | Vorgabe **true**: der Rückblick reicht immer bis 0:00 des letzten Werktags, am Montag also bis Freitag |
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

## Was habe ich gestern gemacht

Unter jedem Namen stehen die Repositories, in denen diese Person zuletzt gearbeitet hat —
**eine Zeile je Repository**, nicht je Push. Darin der Titel des jüngsten Commits, und rechts
`×n`, wenn mehr als einer dazugehört. Für das Daily reicht das: der Name des Repositories genügt,
um sich zu erinnern, worum es ging.

Der Baum steht **offen**, ein Klick auf den Namen klappt ihn zu und wieder auf. Die Entscheidung
merkt sich `localStorage` unter `people-open`, und zwar nur als Abweichung: ein Name, der dort
nicht steht, ist offen. Zugeklappt als Vorgabe war ein Fehlgriff — der einzige Hinweis darauf,
dass etwas da ist, war ein Zähler in 10 px, und damit sah ein voller Tag aus wie ein leerer.

Läuft die Liste über die Kachelhöhe hinaus, scrollt sie. Das Board soll sonst ohne Scrollen
auskommen; hier ist eine Leiste das kleinere Übel, denn vorher wurde der Überhang wortlos
abgeschnitten.

Das Fenster hat zwei Untergrenzen, es gilt die **frühere** von beiden:

| Grenze | Schlüssel | Was sie leistet |
|---|---|---|
| Stundenschnitt | `activity.hours`, Vorgabe **36** | Nicht 24: wer um 9:00 vor dem Board steht, will den gestrigen Nachmittag sehen, und der liegt dann schon 18 Stunden zurück |
| Letzter Arbeitstag | `activity.sinceLastWorkday`, Vorgabe **an** | zieht den Schnitt auf **0:00 des letzten Werktags** vor, wenn er sonst später läge |

Die zweite Grenze gibt es wegen des Montags: 36 Stunden reichen von Montag 9:00 nur bis Samstag
21:00, und damit fällt der ganze Freitag heraus — ausgerechnet der Tag, den man bis zum Daily am
sichersten vergessen hat.

| Tag, 9:00 | nur Stunden | mit `sinceLastWorkday` |
|---|---|---|
| Dienstag–Freitag | vorvorgestern 21:00 | **unverändert** — die Stunden reichen ohnehin weiter zurück als 0:00 des Vortags |
| Montag | Samstag 21:00 | **Freitag 0:00** |
| Sonntag | Freitag 21:00 | **Freitag 0:00** |

Die Regel greift also nur dort, wo das Stundenfenster zu kurz wird, und ändert den Rest der Woche
nichts. Wer sie nicht will, setzt den Schlüssel auf `false`.

Antwortet `/api/commits` oder `/api/calendar` gar nicht, steht der Grund als Zeile in der Kachel.
Ohne das sieht eine kaputte Quelle genauso aus wie ein ruhiger Tag, und man sucht den Fehler an
der falschen Stelle. Welche Quelle für wen leer bleibt, steht zusätzlich im Proxy-Log.

Feiertage kennt sie nicht. Nach einem Montagsfeiertag zeigt der Dienstag den leeren Montag statt
des Freitags; das ist bewusst nicht gelöst, weil es einen Feiertagskalender bräuchte.

**Die Falle dabei:** GitLabs `after=` in `/events` ist **tagesgenau und ausschließend**.
`after=2026-10-22` liefert erst Ereignisse ab dem 23. Wer dort das Datum von „heute minus ein Tag"
einsetzt, bekommt damit **nur den heutigen Tag** — und merkt es nicht, weil es am Tag des Schreibens
richtig aussieht. Deshalb zwei Stufen:

| Stufe | Wo | Was |
|---|---|---|
| Vorfilter | `sinceOf` | fragt GitLab einen Tag **vor** dem Stundenschnitt, um die ausschließende Grenze zu überspringen |
| Schnitt | `eventsInWindow` | wirft danach alles weg, was älter als `cutoffOf` ist — auf die Minute |

Die API-Seite darf also großzügig sein; genau ist erst der zweite Schritt.

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
