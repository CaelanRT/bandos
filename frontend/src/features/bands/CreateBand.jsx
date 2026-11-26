import { useMutationIntent } from '../../mutations/useMutationIntent.js'
import { MutationRecovery } from '../../mutations/MutationRecovery.jsx'
import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import { useSession } from '../../app/sessionContext.js'
import { resolveCreationOrigin } from '../../app/destination.js'
import { UnsavedNavigationDialog } from '../../app/UnsavedNavigation.jsx'
import { useUnsavedNavigation } from '../../app/useUnsavedNavigation.js'
import { composeValidators, maxLength, required } from '../../utils/validation.js'
import { createBand } from './api.js'
import { cacheSavedBand, useBands, useStarterInstruments } from './queries.js'
import { BandShell } from './BandViews.jsx'

const MAX_SLOTS = 50
const validateName = composeValidators(required('Enter a band name.'), maxLength(50))
const validateCustomInstrument = composeValidators(required('Enter an instrument name.'), maxLength(50))
const validateSlotLabel = composeValidators(required('Enter a slot label.'), maxLength(50))

function createSlot(key) {
  return { key, mode: 'starter', instrumentId: '', instrumentName: '', label: '', labelEdited: false }
}

function validateSlot(slot, starterIds) {
  const errors = {}
  if (slot.mode === 'custom') {
    const customError = validateCustomInstrument(slot.instrumentName.trim())
    if (customError) errors.customName = customError
  } else {
    const id = Number(slot.instrumentId)
    if (!slot.instrumentId || !Number.isSafeInteger(id) || id <= 0 || (starterIds && !starterIds.has(id))) {
      errors.instrument = 'Select an instrument.'
    }
  }
  const labelError = validateSlotLabel(slot.label.trim())
  if (labelError) errors.label = labelError
  return errors
}

function suggestStarterSelection(slots, targetKey, selectedId, starterName) {
  const others = slots.filter((slot) => slot.key !== targetKey)
  const hasSameStarter = others.some((slot) => slot.mode === 'starter' && slot.instrumentId === selectedId)
  if (!hasSameStarter) {
    return slots.map((slot) => slot.key !== targetKey ? slot : {
      ...slot, mode: 'starter', instrumentId: selectedId, instrumentName: '',
      label: slot.labelEdited ? slot.label : starterName,
    })
  }
  const firstLabel = `${starterName} 1`
  const renamed = slots.map((slot) => {
    if (slot.key === targetKey || slot.mode !== 'starter' || slot.instrumentId !== selectedId) return slot
    if (!slot.labelEdited && slot.label.trim().toLowerCase() === starterName.toLowerCase() && firstLabel.length <= 50) {
      return { ...slot, label: firstLabel }
    }
    return slot
  })
  const usedLabels = new Set(renamed
    .filter((slot) => slot.key !== targetKey)
    .map((slot) => slot.label.trim().toLowerCase()))
  let number = 2
  while (usedLabels.has(`${starterName} ${number}`.toLowerCase())) number += 1
  const suggested = `${starterName} ${number}`.length <= 50 ? `${starterName} ${number}` : starterName.slice(0, 50)
  return renamed.map((slot) => slot.key !== targetKey ? slot : {
    ...slot, mode: 'starter', instrumentId: selectedId, instrumentName: '',
    label: slot.labelEdited ? slot.label : suggested,
  })
}

export function CreateBand() {
  const bands = useBands()
  const starterInstruments = useStarterInstruments()
  const client = useQueryClient()
  const { authenticatedRequest, user } = useSession()
  const mutation = useMutationIntent(authenticatedRequest)
  const location = useLocation()
  const navigate = useNavigate()
  const origin = resolveCreationOrigin(location.state?.creationOrigin)
  const [name, setName] = useState('')
  const [touched, setTouched] = useState(false)
  const [fieldError, setFieldError] = useState(null)
  const [slots, setSlots] = useState(() => [createSlot(1)])
  const [slotTouched, setSlotTouched] = useState({})
  const [slotErrors, setSlotErrors] = useState({})
  const [instrumentationError, setInstrumentationError] = useState(null)
  const [leaderInstrumentIds, setLeaderInstrumentIds] = useState([])
  const [leaderError, setLeaderError] = useState(null)
  const [formError, setFormError] = useState(null)
  const [pending, setPending] = useState(false)
  const [focusRequest, setFocusRequest] = useState(0)
  const [retryAt, setRetryAt] = useState(null)
  const nextSlotKey = useRef(2)
  const field = useRef(null)
  const notice = useRef(null)
  const leaderFieldset = useRef(null)
  const slotRefs = useRef(new Map())
  const focusTargetRef = useRef(null)
  const submitting = useRef(false)
  const lifetime = useRef(null)

  const catalog = starterInstruments.data ?? []
  const starterIds = starterInstruments.data ? new Set(catalog.map((item) => item.instrumentId)) : null
  const isBaseline = name === '' && leaderInstrumentIds.length === 0 && slots.length === 1 &&
    slots[0].mode === 'starter' && slots[0].instrumentId === '' && slots[0].instrumentName === '' && slots[0].label === ''
  const { blocker, allowNavigation } = useUnsavedNavigation(!isBaseline || mutation.unresolved)

  function requestFocus(target) {
    focusTargetRef.current = target
    setFocusRequest((value) => value + 1)
  }

  useEffect(() => {
    const controller = new AbortController()
    lifetime.current = controller
    return () => controller.abort()
  }, [])
  useEffect(() => {
    if (formError && !focusTargetRef.current) notice.current?.focus()
  }, [formError])
  useEffect(() => {
    if (!focusRequest || pending) return
    const target = focusTargetRef.current
    focusTargetRef.current = null
    if (!target) return
    if (target.type === 'name') field.current?.focus()
    else if (target.type === 'leader') leaderFieldset.current?.focus()
    else if (target.type === 'slot') slotRefs.current.get(`${target.key}:${target.part}`)?.focus()
    else if (target.type === 'notice') notice.current?.focus()
  }, [focusRequest, pending])

  function setSlotRef(key, part) {
    const id = `${key}:${part}`
    return (node) => {
      if (node) slotRefs.current.set(id, node)
      else slotRefs.current.delete(id)
    }
  }

  function updateSlotError(slot, part) {
    const errors = validateSlot(slot, starterIds)
    setSlotErrors((current) => {
      const existing = { ...(current[slot.key] ?? {}) }
      if (errors[part]) existing[part] = errors[part]
      else delete existing[part]
      if (part === 'instrument') delete existing.customName
      if (Object.keys(existing).length === 0) {
        const { [slot.key]: _removed, ...rest } = current
        return rest
      }
      return { ...current, [slot.key]: existing }
    })
  }

  function markSlotTouched(slot, part) {
    const touchKey = `${slot.key}:${part}`
    setSlotTouched((current) => ({ ...current, [touchKey]: true }))
    updateSlotError(slot, part)
  }

  function handleInstrumentChange(slotKey, rawValue) {
    let updatedSlots
    if (rawValue === 'custom') {
      updatedSlots = slots.map((slot) => slot.key !== slotKey ? slot : {
        ...slot, mode: 'custom', instrumentId: '', instrumentName: '',
        label: slot.labelEdited ? slot.label : '',
      })
    } else if (rawValue === '') {
      updatedSlots = slots.map((slot) => slot.key !== slotKey ? slot : {
        ...slot, mode: 'starter', instrumentId: '', instrumentName: '',
        label: slot.labelEdited ? slot.label : '',
      })
    } else {
      const selected = catalog.find((item) => String(item.instrumentId) === rawValue)
      updatedSlots = selected
        ? suggestStarterSelection(slots, slotKey, rawValue, selected.name)
        : slots.map((slot) => slot.key !== slotKey ? slot : { ...slot, mode: 'starter', instrumentId: rawValue, instrumentName: '' })
    }
    setSlots(updatedSlots)
    setInstrumentationError(null)
    const updated = updatedSlots.find((slot) => slot.key === slotKey)
    if (updated) {
      if (slotTouched[`${slotKey}:instrument`]) updateSlotError(updated, 'instrument')
      if (slotTouched[`${slotKey}:label`]) updateSlotError(updated, 'label')
      if (rawValue === 'custom') requestFocus({ type: 'slot', key: slotKey, part: 'customName' })
    }
  }

  function handleCustomNameChange(slotKey, value) {
    const updatedSlots = slots.map((slot) => slot.key !== slotKey ? slot : {
      ...slot, instrumentName: value, label: slot.labelEdited ? slot.label : value,
    })
    setSlots(updatedSlots)
    const updated = updatedSlots.find((slot) => slot.key === slotKey)
    if (updated) {
      if (slotTouched[`${slotKey}:customName`]) updateSlotError(updated, 'customName')
      if (slotTouched[`${slotKey}:label`]) updateSlotError(updated, 'label')
    }
  }

  function handleLabelChange(slotKey, value) {
    const updatedSlots = slots.map((slot) => slot.key !== slotKey ? slot : {
      ...slot, label: value, labelEdited: true,
    })
    setSlots(updatedSlots)
    const updated = updatedSlots.find((slot) => slot.key === slotKey)
    if (updated && slotTouched[`${slotKey}:label`]) updateSlotError(updated, 'label')
  }

  function addSlot() {
    if (pending || mutation.locked || slots.length >= MAX_SLOTS) return
    const key = nextSlotKey.current++
    setSlots((current) => [...current, createSlot(key)])
    setInstrumentationError(null)
    requestFocus({ type: 'slot', key, part: 'instrument' })
  }

  function removeSlot(index) {
    if (pending || mutation.locked || slots.length <= 1) return
    const removed = slots[index]
    const nextSlots = slots.filter((_, currentIndex) => currentIndex !== index)
    setSlots(nextSlots)
    setInstrumentationError(null)
    setSlotErrors((current) => {
      const { [removed.key]: _deleted, ...rest } = current
      return rest
    })
    const targetSlot = nextSlots[Math.min(index, nextSlots.length - 1)]
    if (targetSlot) requestFocus({ type: 'slot', key: targetSlot.key, part: 'instrument' })
  }

  function toggleLeaderInstrument(instrumentId) {
    setLeaderError(null)
    setLeaderInstrumentIds((current) => current.includes(instrumentId)
      ? current.filter((id) => id !== instrumentId)
      : [...current, instrumentId].sort((a, b) => a - b))
  }

  async function reloadLatest() {
    const key = nextSlotKey.current++
    setName('')
    setTouched(false)
    setFieldError(null)
    setSlots([createSlot(key)])
    setSlotTouched({})
    setSlotErrors({})
    setInstrumentationError(null)
    setLeaderInstrumentIds([])
    setLeaderError(null)
    setFormError(null)
    if (starterInstruments.isError) await starterInstruments.refetch()
  }

  async function submit(event) {
    event.preventDefault()
    if (mutation.locked && !mutation.isRetry()) return
    if (submitting.current) return
    if (retryAt && Date.now() < retryAt) { notice.current?.focus(); return }

    if (!mutation.isRetry()) {
      const nameError = validateName(name.trim())
      const nextSlotErrors = {}
      const nextSlotTouched = {}
      let firstInvalid = nameError ? { type: 'name' } : null

      const nextInstrumentationError = slots.length < 1
        ? 'Add at least 1 instrument slot.'
        : slots.length > MAX_SLOTS
          ? `Use at most ${MAX_SLOTS} instrument slots.`
          : null

      for (const slot of slots) {
        nextSlotTouched[`${slot.key}:instrument`] = true
        nextSlotTouched[`${slot.key}:customName`] = true
        nextSlotTouched[`${slot.key}:label`] = true
        const errors = validateSlot(slot, starterIds)
        if (Object.keys(errors).length > 0) {
          nextSlotErrors[slot.key] = errors
          if (!firstInvalid) {
            const part = errors.instrument ? 'instrument' : errors.customName ? 'customName' : 'label'
            firstInvalid = { type: 'slot', key: slot.key, part }
          }
        }
      }

      setTouched(true)
      setFieldError(nameError)
      setSlotTouched((current) => ({ ...current, ...nextSlotTouched }))
      setSlotErrors(nextSlotErrors)
      setInstrumentationError(nextInstrumentationError)
      setLeaderError(null)
      setFormError(null)

      if (firstInvalid || nextInstrumentationError) {
        requestFocus(firstInvalid ?? { type: 'notice' })
        return
      }
    }

    submitting.current = true
    setPending(true)
    const signal = lifetime.current.signal
    const payload = {
      name: name.trim(),
      instrumentation: slots.map((slot) => slot.mode === 'custom'
        ? { instrumentName: slot.instrumentName.trim(), label: slot.label.trim() }
        : { instrumentId: Number(slot.instrumentId), label: slot.label.trim() }),
      ...(leaderInstrumentIds.length > 0 ? { leaderInstrumentIds: [...leaderInstrumentIds] } : {}),
    }

    try {
      const band = await createBand(mutation.request, payload, user.userId, signal)
      if (signal.aborted) return
      mutation.complete()
      if (await cacheSavedBand(client, band, signal)) {
        allowNavigation()
        navigate(`/bands/${band.bandId}/members`, { replace: true, state: { openAddMember: true } })
      }
    } catch (error) {
      if (signal.aborted || error.code === 'AUTHENTICATION_REQUIRED' || error.name === 'AbortError') return
      if (mutation.handleError(error)) return
      if (error.code === 'VALIDATION_ERROR') {
        const details = Array.isArray(error.details) ? error.details : []
        const nextSlotErrors = {}
        const remaining = []
        let nextNameError = null
        let nextInstrumentationError = null
        let nextLeaderError = null
        let firstTarget = null

        for (const detail of details) {
          if (detail.field === 'name') {
            nextNameError = detail.message
            firstTarget ??= { type: 'name' }
          } else if (detail.field === 'instrumentation') {
            nextInstrumentationError = detail.message
          } else if (detail.field === 'leaderInstrumentIds' || /^leaderInstrumentIds\.\d+$/.test(detail.field)) {
            nextLeaderError = detail.message
            firstTarget ??= { type: 'leader' }
          } else {
            const match = /^instrumentation\.(\d+)\.(instrumentId|instrumentName|label)$/.exec(detail.field)
            const targetSlot = match ? slots[Number(match[1])] : null
            if (targetSlot) {
              const part = match[2] === 'instrumentId' ? 'instrument' : match[2] === 'instrumentName' ? 'customName' : 'label'
              nextSlotErrors[targetSlot.key] = { ...(nextSlotErrors[targetSlot.key] ?? {}), [part]: detail.message }
              firstTarget ??= { type: 'slot', key: targetSlot.key, part }
            } else if (detail.message) {
              remaining.push(detail.message)
            }
          }
        }

        setFieldError(nextNameError)
        setSlotErrors(nextSlotErrors)
        setInstrumentationError(nextInstrumentationError)
        setLeaderError(nextLeaderError)
        setFormError(remaining.join(' ') || (details.length ? null : 'Check the band details and try again.'))
        if (firstTarget) requestFocus(firstTarget)
        else if (remaining.length || !details.length) requestFocus({ type: 'notice' })
      } else if (error.code === 'TOO_MANY_ATTEMPTS') {
        setRetryAt(error.retryAt ?? null)
        setFormError(error.retryAt
          ? `Too many attempts. Try again after ${new Date(error.retryAt).toLocaleTimeString()}.`
          : 'Too many attempts. Please wait before trying again.')
      } else {
        setFormError('The request was rejected. Review your details and try again.')
      }
    } finally {
      submitting.current = false
      if (!signal.aborted) setPending(false)
    }
  }

  const controlsDisabled = pending || mutation.locked
  const atSlotLimit = slots.length >= MAX_SLOTS

  return <BandShell bands={bands} context="Create a band">
    <div className="band-editor">
      <h1>Create a band</h1>
      <form className="band-form" onSubmit={submit} noValidate>
        {formError && <p ref={notice} role="alert" tabIndex="-1">{formError}</p>}
        <MutationRecovery mutation={mutation} pending={pending} onRetry={() => submit({ preventDefault() {} })} onReload={reloadLatest} />
        <label htmlFor="band-name">Band name</label>
        <input ref={field} id="band-name" name="name" value={name} disabled={controlsDisabled}
          aria-invalid={Boolean(fieldError)} aria-describedby={`band-name-hint${fieldError ? ' band-name-error' : ''}`}
          onBlur={() => { setTouched(true); setFieldError(validateName(name.trim())) }}
          onChange={(event) => {
            setName(event.target.value)
            if (touched) setFieldError(validateName(event.target.value.trim()))
          }} />
        <p id="band-name-hint">1–50 characters. Bands can share the same name.</p>
        {fieldError && <p id="band-name-error">{fieldError}</p>}

        <fieldset className="band-instrumentation" aria-describedby="instrumentation-hint">
          <legend>Instrumentation</legend>
          <p id="instrumentation-hint" className="field-hint">
            Add 1–{MAX_SLOTS} instrument slots ({slots.length} of {MAX_SLOTS}). Repeated instruments and custom instruments are allowed. No musician assignment is required.
          </p>
          {starterInstruments.isPending && <p role="status">Loading starter instruments…</p>}
          {starterInstruments.isError && <div className="instrumentation-catalog-error" role="alert">
            <p>We couldn’t load starter instruments. You can retry or add custom instruments.</p>
            <button type="button" disabled={starterInstruments.isFetching || controlsDisabled} onClick={() => starterInstruments.refetch()}>
              {starterInstruments.isFetching ? 'Retrying…' : 'Retry starter instruments'}
            </button>
          </div>}
          {instrumentationError && <p className="field-error" role="alert">{instrumentationError}</p>}
          <ol className="instrumentation-list">
            {slots.map((slot, index) => {
              const errors = slotErrors[slot.key] ?? {}
              const rowNumber = index + 1
              const selectId = `slot-instrument-${slot.key}`
              const customId = `slot-custom-${slot.key}`
              const labelId = `slot-label-${slot.key}`
              return <li key={slot.key} className="instrumentation-row">
                <div className="instrumentation-field">
                  <label htmlFor={selectId}>Slot {rowNumber} instrument</label>
                  <select ref={setSlotRef(slot.key, 'instrument')} id={selectId}
                    value={slot.mode === 'custom' ? 'custom' : slot.instrumentId}
                    disabled={controlsDisabled}
                    aria-invalid={Boolean(errors.instrument)}
                    aria-describedby={errors.instrument ? `${selectId}-error` : undefined}
                    onBlur={() => markSlotTouched(slot, 'instrument')}
                    onChange={(event) => handleInstrumentChange(slot.key, event.target.value)}>
                    <option value="">Select an instrument</option>
                    {catalog.map((instrument) => (
                      <option key={instrument.instrumentId} value={String(instrument.instrumentId)}>{instrument.name}</option>
                    ))}
                    <option value="custom">Custom instrument</option>
                  </select>
                  {errors.instrument && <p id={`${selectId}-error`} className="field-error">{errors.instrument}</p>}
                </div>

                {slot.mode === 'custom' && <div className="instrumentation-field">
                  <label htmlFor={customId}>Slot {rowNumber} custom instrument name</label>
                  <input ref={setSlotRef(slot.key, 'customName')} id={customId} value={slot.instrumentName}
                    disabled={controlsDisabled}
                    aria-invalid={Boolean(errors.customName)}
                    aria-describedby={`${customId}-hint${errors.customName ? ` ${customId}-error` : ''}`}
                    onBlur={() => markSlotTouched(slot, 'customName')}
                    onChange={(event) => handleCustomNameChange(slot.key, event.target.value)} />
                  <p id={`${customId}-hint`} className="field-hint">1–50 characters. Matching names share one band instrument.</p>
                  {errors.customName && <p id={`${customId}-error`} className="field-error">{errors.customName}</p>}
                </div>}

                <div className="instrumentation-field">
                  <label htmlFor={labelId}>Slot {rowNumber} label</label>
                  <input ref={setSlotRef(slot.key, 'label')} id={labelId} value={slot.label}
                    disabled={controlsDisabled}
                    aria-invalid={Boolean(errors.label)}
                    aria-describedby={errors.label ? `${labelId}-error` : undefined}
                    onBlur={() => markSlotTouched(slot, 'label')}
                    onChange={(event) => handleLabelChange(slot.key, event.target.value)} />
                  {errors.label && <p id={`${labelId}-error`} className="field-error">{errors.label}</p>}
                </div>

                <div className="instrumentation-row-actions">
                  <button type="button" disabled={controlsDisabled || slots.length <= 1}
                    aria-label={`Remove slot ${rowNumber}`}
                    onClick={() => removeSlot(index)}>Remove</button>
                </div>
              </li>
            })}
          </ol>
          <div className="instrumentation-actions">
            <button type="button" disabled={controlsDisabled || atSlotLimit} onClick={addSlot}>Add slot</button>
            {atSlotLimit && <p className="field-hint" role="status">Maximum of {MAX_SLOTS} instrument slots reached.</p>}
          </div>
        </fieldset>

        <fieldset ref={leaderFieldset} tabIndex="-1" className="band-leader-instruments" aria-describedby="leader-instruments-hint">
          <legend>Your instruments (optional)</legend>
          <p id="leader-instruments-hint" className="field-hint">
            Optional. Choose starter instruments you play in this band. Custom instrument eligibility can be edited later in Members.
          </p>
          {leaderError && <p className="field-error" role="alert">{leaderError}</p>}
          {catalog.length > 0 && <div className="leader-instrument-list">
            {catalog.map((instrument) => {
              const checkboxId = `leader-instrument-${instrument.instrumentId}`
              return <label key={instrument.instrumentId} className="leader-instrument-option" htmlFor={checkboxId}>
                <input id={checkboxId} type="checkbox"
                  checked={leaderInstrumentIds.includes(instrument.instrumentId)}
                  disabled={controlsDisabled}
                  onChange={() => toggleLeaderInstrument(instrument.instrumentId)} />
                <span>{instrument.name}</span>
              </label>
            })}
          </div>}
        </fieldset>

        <div className="form-actions">
          <button type="submit" disabled={controlsDisabled}>
            {pending ? 'Creating band…' : 'Create band'}
          </button>
          <button type="button" disabled={pending} onClick={() => navigate(origin)}>Cancel</button>
        </div>
        {pending && <p role="status">Creating band…</p>}
      </form>
    </div>
    <UnsavedNavigationDialog unresolved={mutation.unresolved} blocker={blocker} pending={pending} />
  </BandShell>
}
