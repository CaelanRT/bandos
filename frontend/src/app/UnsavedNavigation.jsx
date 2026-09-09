import { useEffect, useRef } from 'react'

export function UnsavedNavigationDialog({ blocker, pending = false }) {
  const dialog = useRef(null)
  const keep = useRef(null)
  const blocked = blocker.state === 'blocked'
  useEffect(() => {
    if (!blocked) return
    const previous = document.activeElement
    const element = dialog.current
    element.showModal()
    keep.current.focus()
    return () => {
      element.close()
      if (previous?.isConnected) previous.focus()
    }
  }, [blocked])
  if (!blocked) return null
  return <dialog ref={dialog} aria-labelledby="unsaved-title" aria-describedby="unsaved-description"
    onKeyDown={(event) => { if (event.key === 'Escape') event.stopPropagation() }}
    onCancel={(event) => { event.preventDefault(); blocker.reset() }}>
    <h2 id="unsaved-title">Discard your unsaved changes?</h2>
    <p id="unsaved-description">Your changes haven’t been saved.</p>
    {pending && <p role="status">A change is being saved. Please wait for the result before leaving.</p>}
    <div className="form-actions">
      <button ref={keep} type="button" onClick={() => blocker.reset()}>Keep editing</button>
      <button type="button" disabled={pending} onClick={() => blocker.proceed()}>Discard changes</button>
    </div>
  </dialog>
}
