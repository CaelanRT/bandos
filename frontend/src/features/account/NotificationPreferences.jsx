import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useActivityQuery, userActivityRequest } from '../../app/activityQueries.js'
import { useSession } from '../../app/sessionContext.js'
import { getPreferences, preferenceFields, preferenceKeys, savePreferences } from './preferences.js'

const categoryOptions = [
  {
    name: 'invitations',
    label: 'Invitations',
    description: 'New scheduled event invitations and rehearsal poll invitations.',
  },
  {
    name: 'eventUpdates',
    label: 'Event updates',
    description: 'Saved event detail changes and reconfirmation notices.',
  },
  {
    name: 'removalsAndCancellations',
    label: 'Removals and cancellations',
    description: 'Removed invitations, band membership removal, and cancelled upcoming events or open polls.',
  },
  {
    name: 'invitationResponses',
    label: 'Invitation responses',
    description: 'Initial or changed event invitation responses sent to the band leader.',
  },
  {
    name: 'pollUpdates',
    label: 'Poll updates',
    description: 'Added, changed, or deleted poll options and meaningful poll timezone changes.',
  },
  {
    name: 'pollResponses',
    label: 'Poll responses',
    description: 'Saved poll availability changes sent to the band leader.',
  },
]

function pickBooleans(preferences) {
  return Object.fromEntries(preferenceFields.map((field) => [field, preferences[field]]))
}

function retryMessage(retryAt) {
  return retryAt
    ? `Too many attempts. Try again after ${new Date(retryAt).toLocaleTimeString()}.`
    : 'Too many attempts. Please wait before trying again.'
}

export function NotificationPreferences({ disabled, onStateChange }) {
  const client = useQueryClient()
  const { authenticatedRequest } = useSession()
  const query = useActivityQuery({
    queryKey: preferenceKeys.current,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    queryFn: ({ signal, activity }) => getPreferences(
      activity === 'user' ? userActivityRequest(authenticatedRequest) : authenticatedRequest,
      signal,
    ),
  })

  const [baseline, setBaseline] = useState(null)
  const [values, setValues] = useState(null)
  const [pending, setPending] = useState(false)
  const [stale, setStale] = useState(false)
  const [confirmReload, setConfirmReload] = useState(false)
  const [reloading, setReloading] = useState(false)
  const [reloadFailed, setReloadFailed] = useState(false)
  const [formError, setFormError] = useState('')
  const [message, setMessage] = useState('')
  const [retryAt, setRetryAt] = useState(null)
  const submitting = useRef(false)
  const lifetime = useRef(null)
  const notice = useRef(null)
  const staleNotice = useRef(null)

  const dirty = Boolean(baseline && values && preferenceFields.some((field) => values[field] !== baseline[field]))

  if (query.data && !dirty && !pending && !stale && (
    !baseline || baseline.version !== query.data.version ||
    preferenceFields.some((field) => baseline[field] !== query.data[field])
  )) {
    setBaseline(query.data)
    setValues(pickBooleans(query.data))
  }

  useEffect(() => {
    const controller = new AbortController()
    lifetime.current = controller
    return () => controller.abort()
  }, [])

  useEffect(() => {
    onStateChange({ dirty, pending: pending || reloading, locked: stale })
  }, [dirty, pending, reloading, stale, onStateChange])

  useEffect(() => {
    if (formError) notice.current?.focus()
  }, [formError])

  useEffect(() => {
    if (stale) staleNotice.current?.focus()
  }, [stale])

  useEffect(() => {
    if (!retryAt) return
    const timer = setTimeout(() => setRetryAt(null), Math.max(0, retryAt - Date.now()))
    return () => clearTimeout(timer)
  }, [retryAt])

  async function reloadLatest() {
    if (reloading) return
    setReloading(true)
    setReloadFailed(false)
    const signal = lifetime.current.signal
    try {
      const latest = await getPreferences(userActivityRequest(authenticatedRequest), signal)
      if (signal.aborted) return
      client.setQueryData(preferenceKeys.current, latest)
      setBaseline(latest)
      setValues(pickBooleans(latest))
      setStale(false)
      setConfirmReload(false)
      setFormError('')
      setRetryAt(null)
      setMessage('Latest notification preferences loaded.')
    } catch (error) {
      if (signal.aborted || error.name === 'AbortError' || error.code === 'AUTHENTICATION_REQUIRED') return
      setReloadFailed(true)
    } finally {
      if (!signal.aborted) setReloading(false)
    }
  }

  async function submit(event) {
    event.preventDefault()
    if (!baseline || !values || submitting.current || disabled || stale || reloading) return
    if (retryAt && Date.now() < retryAt) { notice.current?.focus(); return }
    if (!dirty) return
    submitting.current = true
    setPending(true)
    setFormError('')
    setMessage('')
    const signal = lifetime.current.signal
    try {
      const saved = await savePreferences(
        authenticatedRequest,
        { expectedVersion: baseline.version, ...values },
        signal,
      )
      if (signal.aborted) return
      client.setQueryData(preferenceKeys.current, saved)
      setBaseline(saved)
      setValues(pickBooleans(saved))
      setStale(false)
      setConfirmReload(false)
      setReloadFailed(false)
      setRetryAt(null)
      setMessage(saved.enabled
        ? 'Notification preferences saved.'
        : 'Notification preferences saved. Optional email notifications are turned off.')
    } catch (error) {
      if (signal.aborted || error.name === 'AbortError' || error.code === 'AUTHENTICATION_REQUIRED') return
      if (error.code === 'STALE_VERSION') {
        setStale(true)
        setConfirmReload(false)
        setReloadFailed(false)
      } else if (error.code === 'TOO_MANY_ATTEMPTS') {
        setRetryAt(error.retryAt ?? null)
        setFormError(retryMessage(error.retryAt))
      } else if (error.code === 'VALIDATION_ERROR') {
        const detailMessage = (error.details ?? []).map((detail) => detail.message).join(' ')
        setFormError(detailMessage || 'Check your notification preferences and try again.')
      } else {
        setFormError('We couldn’t save your notification preferences. Your previous saved settings remain active, and your draft is preserved. Try saving again.')
      }
    } finally {
      submitting.current = false
      if (!signal.aborted) setPending(false)
    }
  }

  function cancel() {
    if (!baseline || pending || reloading) return
    setValues(pickBooleans(baseline))
    setStale(false)
    setConfirmReload(false)
    setReloadFailed(false)
    setFormError('')
    setMessage('')
    setRetryAt(null)
  }

  const formLocked = disabled || pending || stale || reloading

  return (
    <section className="account-profile" aria-labelledby="notification-preferences-heading">
      <h2 id="notification-preferences-heading">Email notification preferences</h2>
      <p>
        These email preferences apply across all of your bands. Essential security, email verification,
        email change, and password recovery messages still send even when notifications are turned off.
      </p>
      <p>
        Changing email preferences never changes your invitations, band access, personal datebook,
        or reconfirmation requirements.
      </p>
      {!baseline && query.isPending && <p>Loading notification preferences…</p>}
      {!baseline && query.isError && (
        <div className="event-notice" role="alert">
          <p>We couldn’t load your notification preferences. Try again.</p>
          <button type="button" disabled={query.isFetching} onClick={() => query.refetch()}>
            {query.isFetching ? 'Retrying…' : 'Retry loading preferences'}
          </button>
        </div>
      )}
      {baseline && values && (
        <form className="band-form account-form" aria-label="Email notification preferences" onSubmit={submit} noValidate>
          {message && <p role="status">{message}</p>}
          {formError && <p ref={notice} role="alert" tabIndex="-1">{formError}</p>}
          {stale && (
            <div className="event-notice" role="alert" tabIndex="-1" ref={staleNotice}>
              <p>Your notification preferences changed since you loaded them. Your draft is preserved. Reloading will discard your unsaved changes.</p>
              {!confirmReload ? (
                <button type="button" disabled={pending || reloading} onClick={() => setConfirmReload(true)}>
                  Reload latest preferences
                </button>
              ) : (
                <>
                  <p>Discard your unsaved preference changes and load the latest settings?</p>
                  <button type="button" disabled={reloading} onClick={() => setConfirmReload(false)}>Keep draft</button>
                  <button type="button" disabled={reloading} onClick={reloadLatest}>
                    {reloading ? 'Reloading…' : 'Discard changes and reload'}
                  </button>
                </>
              )}
              {reloadFailed && <p>Reload failed. Your draft is still here. Try reloading again.</p>}
            </div>
          )}
          <div className="account-preference-master">
            <div className="account-preference-option">
              <input
                id="pref-enabled"
                name="enabled"
                type="checkbox"
                checked={values.enabled}
                disabled={formLocked}
                aria-describedby="pref-enabled-description"
                onChange={(event) => {
                  setValues((current) => ({ ...current, enabled: event.target.checked }))
                  setMessage('')
                  setFormError('')
                }}
              />
              <div className="account-preference-text">
                <label className="account-preference-label" htmlFor="pref-enabled">Email notifications</label>
                <span id="pref-enabled-description" className="account-preference-description">
                  Master switch for optional band email notifications.
                </span>
              </div>
            </div>
            {!values.enabled && (
              <p className="account-preference-note">
                Optional band email notifications are turned off. Your category selections below are preserved and will apply again when you re-enable notifications.
              </p>
            )}
          </div>
          <fieldset className="account-preference-group" disabled={formLocked || !values.enabled}>
            <legend>Notification categories</legend>
            {categoryOptions.map(({ name, label, description }) => (
              <div className="account-preference-option" key={name}>
                <input
                  id={`pref-${name}`}
                  name={name}
                  type="checkbox"
                  checked={values[name]}
                  aria-describedby={`pref-${name}-description`}
                  onChange={(event) => {
                    setValues((current) => ({ ...current, [name]: event.target.checked }))
                    setMessage('')
                    setFormError('')
                  }}
                />
                <div className="account-preference-text">
                  <label className="account-preference-label" htmlFor={`pref-${name}`}>{label}</label>
                  <span id={`pref-${name}-description`} className="account-preference-description">{description}</span>
                </div>
              </div>
            ))}
          </fieldset>
          <div className="form-actions">
            <button type="submit" disabled={formLocked || !dirty || Boolean(retryAt)}>
              {pending ? 'Saving…' : 'Save preferences'}
            </button>
            <button type="button" disabled={pending || reloading || (!dirty && !stale && !formError)} onClick={cancel}>
              Cancel preferences
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
