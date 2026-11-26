import { useEffect, useRef } from 'react'

export function UnsavedNavigationDialog({ blocker, pending = false, unresolved = false, className }) {
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
  return <dialog className={className} ref={dialog} aria-labelledby="unsaved-title" aria-describedby="unsaved-description"
    onKeyDown={(event) => { if (event.key === 'Escape') event.stopPropagation() }}
    onCancel={(event) => { event.preventDefault(); blocker.reset() }}>
    <h2 id="unsaved-title">{unresolved ? 'Recover your previous save' : 'Discard your unsaved changes?'}</h2>
    <p id="unsaved-description">{unresolved ? 'The previous save may have completed. Stay here and recover its outcome before leaving to avoid duplicate changes.' : 'Your changes haven’t been saved.'}</p>
    {pending && !unresolved && <p role="status">A change is being saved. Please wait for the result before leaving.</p>}
    <div className="form-actions">
      <button ref={keep} type="button" onClick={() => blocker.reset()}>Keep editing</button>
      <button type="button" disabled={pending || unresolved} onClick={() => blocker.proceed()}>Discard changes</button>
    </div>
  </dialog>
}
