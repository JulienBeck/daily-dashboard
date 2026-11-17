import { useEffect, type MouseEvent } from 'react'
import { Questlog } from './Questlog'
import './questlog.css'

interface Props {
  issueKey: string
  onClose: () => void
}

export default function QuestlogOverlay({ issueKey, onClose }: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('.ql dialog[open]')) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const closeOutside = (event: MouseEvent) => {
    if (event.target === event.currentTarget) onClose()
  }

  return (
    <div className="ql" role="dialog" aria-modal="true" aria-label="Questlog" onClick={closeOutside}>
      <div className="ql-root" onClick={closeOutside}>
        <Questlog initialKey={issueKey} />
      </div>
      <button type="button" className="collapse ql-close" aria-label="Questlog schließen" onClick={onClose}>
        ×
      </button>
    </div>
  )
}
