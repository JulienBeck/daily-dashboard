import { useEffect, useRef } from 'react'
import { useStrings } from '../strings'

interface Props {
  questKey: string | null
  onConfirm: () => void
  onClose: () => void
}

export function AbandonDialog({ questKey, onConfirm, onClose }: Props) {
  const t = useStrings()
  const dialog = useRef<HTMLDialogElement>(null)
  const title = questKey ? t.abandonWarnTitle(questKey) : ''

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (questKey && !element.open) element.showModal()
    if (!questKey && element.open) element.close()
  }, [questKey])

  return (
    <dialog className="quest-form" ref={dialog} onCancel={onClose} aria-label={title}>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          onConfirm()
        }}
      >
        <h2>{title}</h2>
        <p className="form-warning">{t.abandonWarnText}</p>
        <div className="actions">
          <button type="submit" className="btn btn-primary">
            {t.abandonConfirm}
          </button>
          <button type="button" className="btn" onClick={onClose} autoFocus>
            {t.abandonKeep}
          </button>
        </div>
      </form>
    </dialog>
  )
}
