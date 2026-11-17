import { useEffect, useRef, useState } from 'react'
import type { NewQuestInput } from '../api'
import { useStrings } from '../strings'

const PRIORITIES = ['Blocker', 'Critical', 'Major', 'Medium', 'Minor', 'Trivial']

interface Props {
  open: boolean
  pageTitle: string
  busy: boolean
  error: string | null
  onSubmit: (quest: NewQuestInput) => void
  onClose: () => void
}

export function NewQuestForm({ open, pageTitle, busy, error, onSubmit, onClose }: Props) {
  const t = useStrings()
  const dialog = useRef<HTMLDialogElement>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [points, setPoints] = useState('')
  const [priority, setPriority] = useState('Major')

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open && !element.open) element.showModal()
    if (!open && element.open) element.close()
  }, [open])

  useEffect(() => {
    if (open) {
      setTitle('')
      setDescription('')
      setPoints('')
    }
  }, [open])

  return (
    <dialog className="quest-form" ref={dialog} onCancel={onClose} aria-label={t.formTitle(pageTitle)}>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit({
            title,
            description,
            points: points.trim() === '' ? null : Number(points),
            priority,
          })
        }}
      >
        <h2>{t.formTitle(pageTitle)}</h2>

        <label>
          {t.fieldTitle}
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={255}
            required
            autoFocus
          />
        </label>

        <label>
          {t.fieldBrief}
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>

        <div className="row">
          <label>
            {t.fieldPoints}
            <input
              type="number"
              min="0"
              step="0.5"
              value={points}
              onChange={(event) => setPoints(event.target.value)}
            />
          </label>
          <label>
            {t.fieldPriority}
            <select value={priority} onChange={(event) => setPriority(event.target.value)}>
              {PRIORITIES.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
        </div>

        {error && <p className="form-error">{error}</p>}

        <div className="actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? t.submitting : t.submit}
          </button>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            {t.cancel}
          </button>
        </div>
      </form>
    </dialog>
  )
}
