import { useEffect, useRef, useState } from 'react'

export function MutationRecovery({ mutation, onRetry, onReload, pending = false }) {
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const notice = useRef(null)
  useEffect(() => { if (mutation.state) notice.current?.focus() }, [mutation.state])
  if (!mutation.state) return null

  async function reload() {
    if (loading) return
    setLoading(true); setFailed(false)
    try {
      await onReload()
      mutation.complete()
      setConfirming(false)
    } catch {
      setFailed(true)
    } finally { setLoading(false) }
  }

  return <div className="event-notice" role="alert" tabIndex="-1" ref={notice}>
    {mutation.state === 'uncertain' ? <>
      <p>We couldn’t confirm the save. Retry the same request to recover its outcome. Editing is paused so another submission cannot duplicate it.</p>
      <button type="button" disabled={pending} onClick={() => mutation.retry(onRetry)}>Retry same request</button>
    </> : mutation.state === 'mismatch' ? <p>The request key does not match the original request. This is a client request error. Do not submit another save; reopen the resource to reconcile its current state.</p> : <>
      <p>This record changed since you loaded it. Your draft is preserved. Reloading will discard your unsaved changes.</p>
      {!confirming ? <button type="button" disabled={pending} onClick={() => setConfirming(true)}>Reload latest</button> : <>
        <p>Discard your unsaved changes and load the latest record?</p>
        <button type="button" disabled={loading} onClick={() => setConfirming(false)}>Keep draft</button>
        <button type="button" disabled={loading} onClick={reload}>{loading ? 'Reloading…' : 'Discard changes and reload'}</button>
      </>}
      {failed && <p>Reload failed. Your draft is still here. Try reloading again.</p>}
    </>}
  </div>
}
