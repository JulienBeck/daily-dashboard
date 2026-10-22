import { useState } from 'react'
import type {
  CalendarByMember,
  CalendarEntry,
  CommitRow,
  TeamMember,
  UpcomingAbsence,
} from '../../shared/types.js'
import { IconChevron, IconMerge, IconPeople, IconTimer } from '../icons.js'

interface Props {
  team: TeamMember[]
  commits: Record<string, CommitRow[]>
  calendar: CalendarByMember
}

const time = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' })
const weekday = new Intl.DateTimeFormat('de-DE', { weekday: 'short' })
const date = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' })

export function awayOf(member: TeamMember, calendar: CalendarByMember): string | null {
  return calendar[member.name]?.away ?? member.away
}

export function nextAwayOf(next: UpcomingAbsence | null): string | null {
  if (!next) return null
  const day = new Date(`${next.from}T00:00:00`)
  if (next.inDays === 1) return `${next.label} ab morgen`
  if (next.inDays <= 6) return `${next.label} ab ${weekday.format(day)}`
  return `${next.label} ab ${date.format(day)}`
}

export function isOver(entry: CalendarEntry, now: Date): boolean {
  return new Date(entry.end).getTime() <= now.getTime()
}

export function leadOf(entry: CalendarEntry, yesterday: boolean): string {
  const when = entry.allDay ? 'ganztägig' : time.format(new Date(entry.start))
  return yesterday ? `gestern ${when}` : when
}

function Line({
  icon,
  lead,
  text,
  trail,
  dim,
  title,
}: {
  icon: React.ReactNode
  lead: string
  text: string
  trail?: string
  dim: boolean
  title: string
}) {
  return (
    <li
      className={`flex items-baseline gap-1.5 text-[11px] ${dim ? 'text-muted' : 'text-ink-2'}`}
      title={title}
    >
      <span className="shrink-0 translate-y-0.5 text-muted">{icon}</span>
      <span className="num shrink-0 text-muted">{lead}</span>
      <span className={`truncate ${dim ? '' : 'text-ink'}`}>{text}</span>
      {trail ? <span className="num ml-auto shrink-0">{trail}</span> : null}
    </li>
  )
}

export function People({ team, commits, calendar }: Props) {
  const present = team.filter((member) => awayOf(member, calendar) === null).length
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem('people-open') ?? '{}') as Record<string, boolean>
    } catch {
      return {}
    }
  })

  const toggle = (name: string) =>
    setOpen((previous) => {
      const next = { ...previous, [name]: !previous[name] }
      localStorage.setItem('people-open', JSON.stringify(next))
      return next
    })

  return (
    <section className="panel grid min-h-0 grid-rows-[auto_1fr]">
      <div className="panel-head">
        <IconPeople className="text-sm" />
        <span className="flex-1">Heute im Daily</span>
        <span className="num normal-case">
          {present} / {team.length}
        </span>
      </div>

      <ul className="grid content-start gap-3 overflow-hidden text-[13px]" role="list">
        {team.map((member) => {
          const away = awayOf(member, calendar)
          const soon = away ? null : nextAwayOf(member.nextAway)
          const pushes = commits[member.name] ?? []
          const day = calendar[member.name]
          const agenda = [
            ...(day?.yesterday ?? []).map((entry) => ({ entry, yesterday: true })),
            ...(day?.today ?? []).map((entry) => ({ entry, yesterday: false })),
          ]

          const count = pushes.length + agenda.length
          const expanded = Boolean(open[member.name])

          return (
            <li key={member.name}>
              <button
                type="button"
                onClick={() => toggle(member.name)}
                disabled={count === 0}
                aria-expanded={count === 0 ? undefined : expanded}
                className={`flex w-full items-center gap-2.5 text-left ${
                  away ? 'text-muted' : 'text-ink-2'
                } ${count > 0 ? 'hover:text-ink' : 'cursor-default'}`}
              >
                {member.avatar ? (
                  <img
                    src={member.avatar}
                    alt={member.name}
                    className={`size-6 shrink-0 rounded-full border border-white/10 ${
                      away ? 'opacity-45' : ''
                    }`}
                    width={24}
                    height={24}
                  />
                ) : (
                  <span
                    className={`grid size-6 shrink-0 place-items-center rounded-full border border-white/10 bg-card text-[10px] font-bold ${
                      away ? 'opacity-45' : ''
                    }`}
                  >
                    {member.initials}
                  </span>
                )}
                {member.name}
                {count > 0 ? (
                  <>
                    <IconChevron
                      className={`shrink-0 text-[11px] text-muted transition-transform ${
                        expanded ? 'rotate-90' : ''
                      }`}
                    />
                    <span className="num rounded-full bg-card px-1.5 text-[10px] text-muted">
                      {count}
                    </span>
                  </>
                ) : null}
                {away ? <span className="ml-auto text-[11px]">{away}</span> : null}
                {soon ? (
                  <span
                    className="ml-auto shrink-0 text-[11px] text-muted"
                    title={`${member.nextAway!.from} bis ${member.nextAway!.to}`}
                  >
                    {soon}
                  </span>
                ) : null}
              </button>

              {expanded && count > 0 ? (
                <ul className="mt-1 ml-[34px] grid gap-0.5 border-l border-rule pl-2.5" role="list">
                  {pushes.map((commit) => (
                    <Line
                      key={`c-${commit.at}-${commit.title}`}
                      icon={<IconMerge className="text-[11px]" />}
                      lead={commit.project}
                      text={commit.title}
                      trail={commit.count > 1 ? `×${commit.count}` : undefined}
                      dim={false}
                      title={`${commit.project}${commit.ref ? ` · ${commit.ref}` : ''} · ${commit.count} Commits`}
                    />
                  ))}
                  {agenda.map(({ entry, yesterday }) => (
                    <Line
                      key={`e-${entry.start}-${entry.summary}`}
                      icon={<IconTimer className="text-[11px]" />}
                      lead={leadOf(entry, yesterday)}
                      text={entry.summary}
                      dim={yesterday || isOver(entry, new Date())}
                      title={entry.summary}
                    />
                  ))}
                </ul>
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
