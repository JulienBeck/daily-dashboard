import { type MouseEvent, type ReactNode, useEffect } from 'react'

export function Window({
  label,
  onClose,
  className = '',
  children,
}: {
  label: string
  onClose: () => void
  className?: string
  children: ReactNode
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const closeOutside = (event: MouseEvent) => {
    if (event.target === event.currentTarget) onClose()
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/65 p-6" onClick={closeOutside}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`panel relative max-h-[86vh] w-[min(760px,94vw)] px-6 py-5 ${className}`}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={`${label} schließen`}
          className="metal-button absolute -top-2.5 -right-2.5 z-10 size-8 text-[20px] leading-none font-bold"
        >
          ×
        </button>
        {children}
      </section>
    </div>
  )
}
