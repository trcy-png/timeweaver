import { useEffect, useMemo, useState } from 'react'
import './App.css'

const STORAGE_KEY = 'modular-timer-v1'
const FLOW_STORAGE_KEY = 'flowmodoro-v1'
const THEME_KEY = 'timeweaver-theme-v1'

const SOUND_PRESETS = [
  { id: 'chime', label: 'Chime' },
  { id: 'bell', label: 'Bell' },
  { id: 'piano', label: 'Piano' },
]

const formatTime = (totalSeconds) => {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

const isToday = (timestamp) => {
  const today = new Date()
  const inputDate = new Date(timestamp)
  return (
    today.getFullYear() === inputDate.getFullYear() &&
    today.getMonth() === inputDate.getMonth() &&
    today.getDate() === inputDate.getDate()
  )
}

const createRoutine = (name = 'New routine') => {
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    name,
    createdAt: now,
    blocks: [],
    savedBlocks: [],
  }
}

const createDefaultState = () => {
  const starter = createRoutine('Piano practice')
  starter.blocks = [
    { id: crypto.randomUUID(), name: 'Scales', durationSec: 20 * 60, soundId: 'piano' },
    { id: crypto.randomUUID(), name: 'Finger exercise', durationSec: 20 * 60, soundId: 'chime' },
    { id: crypto.randomUUID(), name: 'Break', durationSec: 10 * 60, soundId: 'bell' },
    { id: crypto.randomUUID(), name: 'Current piece', durationSec: 60 * 60, soundId: 'piano' },
  ]
  starter.savedBlocks = starter.blocks.map((block) => ({
    id: crypto.randomUUID(),
    name: block.name,
    durationSec: block.durationSec,
    soundId: block.soundId,
  }))
  return {
    routines: [starter],
    selectedRoutineId: starter.id,
    blockDraft: { name: '', minutes: 20, seconds: 0, soundId: 'chime' },
    player: {
      routineId: starter.id,
      currentBlockIndex: 0,
      remainingSec: starter.blocks[0].durationSec,
      isRunning: false,
      isComplete: false,
      awaitingNext: false,
      transitionMode: 'auto',
    },
    modularHistory: [],
  }
}

const clampToNumber = (value, min, max) => {
  const asNumber = Number(value)
  if (!Number.isFinite(asNumber)) return min
  return Math.min(max, Math.max(min, Math.floor(asNumber)))
}

const playPresetSound = (soundId) => {
  try {
    const context = new window.AudioContext()
    const now = context.currentTime
    const gain = context.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.connect(context.destination)

    if (soundId === 'bell') {
      const osc = context.createOscillator()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(880, now)
      gain.gain.exponentialRampToValueAtTime(0.08, now + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9)
      osc.connect(gain)
      osc.start(now)
      osc.stop(now + 0.9)
      osc.onended = () => context.close()
      return
    }

    if (soundId === 'piano') {
      const frequencies = [523.25, 659.25, 783.99]
      frequencies.forEach((frequency, index) => {
        const osc = context.createOscillator()
        const noteGain = context.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(frequency, now + index * 0.08)
        noteGain.gain.setValueAtTime(0.0001, now + index * 0.08)
        noteGain.gain.exponentialRampToValueAtTime(0.05, now + index * 0.08 + 0.02)
        noteGain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.08 + 0.5)
        osc.connect(noteGain)
        noteGain.connect(context.destination)
        osc.start(now + index * 0.08)
        osc.stop(now + index * 0.08 + 0.5)
        if (index === frequencies.length - 1) {
          osc.onended = () => context.close()
        }
      })
      return
    }

    const osc = context.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(523.25, now)
    gain.gain.exponentialRampToValueAtTime(0.06, now + 0.03)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6)
    osc.connect(gain)
    osc.start(now)
    osc.stop(now + 0.6)
    osc.onended = () => context.close()
  } catch (error) {
    console.error('Unable to play sound:', error)
  }
}

const loadInitialState = () => {
  const savedState = localStorage.getItem(STORAGE_KEY)
  if (!savedState) return createDefaultState()

  try {
    const parsed = JSON.parse(savedState)
    if (!Array.isArray(parsed.routines) || parsed.routines.length === 0) {
      return createDefaultState()
    }
    const selectedRoutineId = parsed.selectedRoutineId ?? parsed.routines[0].id
    const selectedRoutineIndex = Math.max(
      0,
      parsed.routines.findIndex((routine) => routine.id === selectedRoutineId),
    )
    const normalizedRoutines = parsed.routines.map((routine, index) => ({
      ...routine,
      savedBlocks: Array.isArray(routine.savedBlocks)
        ? routine.savedBlocks
        : index === selectedRoutineIndex && Array.isArray(parsed.savedBlocks)
          ? parsed.savedBlocks
          : [],
    }))
    const selectedRoutine = normalizedRoutines[selectedRoutineIndex]
    const firstDuration = selectedRoutine.blocks[0]?.durationSec ?? 0
    return {
      routines: normalizedRoutines,
      selectedRoutineId: selectedRoutine.id,
      blockDraft: parsed.blockDraft ?? { name: '', minutes: 20, seconds: 0, soundId: 'chime' },
      player: {
        routineId: parsed.player?.routineId ?? selectedRoutine.id,
        currentBlockIndex: parsed.player?.currentBlockIndex ?? 0,
        remainingSec: parsed.player?.remainingSec ?? firstDuration,
        isRunning: Boolean(parsed.player?.isRunning),
        isComplete: Boolean(parsed.player?.isComplete),
        awaitingNext: Boolean(parsed.player?.awaitingNext),
        transitionMode: parsed.player?.transitionMode === 'manual' ? 'manual' : 'auto',
      },
      modularHistory: Array.isArray(parsed.modularHistory) ? parsed.modularHistory : [],
    }
  } catch (error) {
    console.error('Failed to load modular timer state:', error)
    return createDefaultState()
  }
}

const loadFlowState = () => {
  const fallback = {
    ratio: 3,
    mode: 'idle',
    focusStartedAt: null,
    focusElapsedSec: 0,
    breakEndsAt: null,
    breakRemainingSec: 0,
    history: [],
  }
  const savedState = localStorage.getItem(FLOW_STORAGE_KEY)
  if (!savedState) return fallback
  try {
    const parsed = JSON.parse(savedState)
    return {
      ratio: clampToNumber(parsed.ratio ?? 3, 2, 6),
      mode: parsed.mode ?? 'idle',
      focusStartedAt: parsed.focusStartedAt ?? null,
      focusElapsedSec: clampToNumber(parsed.focusElapsedSec ?? 0, 0, 999999),
      breakEndsAt: parsed.breakEndsAt ?? null,
      breakRemainingSec: clampToNumber(parsed.breakRemainingSec ?? 0, 0, 999999),
      history: Array.isArray(parsed.history) ? parsed.history : [],
    }
  } catch (error) {
    console.error('Failed to load Flowmodoro state:', error)
    return fallback
  }
}

function App() {
  const [appMode, setAppMode] = useState('modular')
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) ?? 'light')
  const [initialState] = useState(() => loadInitialState())
  const [routines, setRoutines] = useState(initialState.routines)
  const [selectedRoutineId, setSelectedRoutineId] = useState(initialState.selectedRoutineId)
  const [newRoutineName, setNewRoutineName] = useState('')
  const [blockDraft, setBlockDraft] = useState(initialState.blockDraft)
  const [isAddBlockOpen, setIsAddBlockOpen] = useState(false)
  const [isRoutineOpen, setIsRoutineOpen] = useState(false)
  const [dragData, setDragData] = useState(null)
  const [dragOverIndex, setDragOverIndex] = useState(null)
  const [player, setPlayer] = useState(initialState.player)
  const [modularHistory, setModularHistory] = useState(initialState.modularHistory)
  const [selectedTimelineBlockId, setSelectedTimelineBlockId] = useState(null)
  const [flowState, setFlowState] = useState(() => loadFlowState())

  useEffect(() => {
    if (routines.length === 0 || !selectedRoutineId) return
    const payload = {
      routines,
      selectedRoutineId,
      blockDraft,
      player,
      modularHistory,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  }, [routines, selectedRoutineId, blockDraft, player, modularHistory])

  useEffect(() => {
    localStorage.setItem(FLOW_STORAGE_KEY, JSON.stringify(flowState))
  }, [flowState])

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  useEffect(() => {
    document.body.setAttribute('data-theme', theme)
    return () => {
      document.body.removeAttribute('data-theme')
    }
  }, [theme])

  const selectedRoutine = useMemo(
    () => routines.find((routine) => routine.id === selectedRoutineId) ?? null,
    [routines, selectedRoutineId],
  )
  const routineSavedBlocks = selectedRoutine?.savedBlocks ?? []

  const activeRoutine = useMemo(() => {
    return routines.find((routine) => routine.id === player.routineId) ?? selectedRoutine
  }, [routines, player.routineId, selectedRoutine])

  const totalDurationSec = useMemo(() => {
    if (!activeRoutine) return 0
    return activeRoutine.blocks.reduce((sum, block) => sum + block.durationSec, 0)
  }, [activeRoutine])

  const elapsedSec = useMemo(() => {
    if (!activeRoutine || activeRoutine.blocks.length === 0) return 0
    if (player.isComplete) return totalDurationSec
    const blocksBefore = activeRoutine.blocks
      .slice(0, player.currentBlockIndex)
      .reduce((sum, block) => sum + block.durationSec, 0)
    const currentBlock = activeRoutine.blocks[player.currentBlockIndex]
    if (!currentBlock) return blocksBefore
    return blocksBefore + Math.max(0, currentBlock.durationSec - player.remainingSec)
  }, [activeRoutine, player.currentBlockIndex, player.remainingSec, player.isComplete, totalDurationSec])

  useEffect(() => {
    if (!player.isRunning) return
    const interval = setInterval(() => {
      setPlayer((current) => {
        if (!current.isRunning) return current
        const routine = routines.find((item) => item.id === current.routineId)
        if (!routine || routine.blocks.length === 0) {
          return { ...current, isRunning: false, isComplete: false }
        }
        if (current.remainingSec > 1) {
          return { ...current, remainingSec: current.remainingSec - 1 }
        }

        const finishedBlock = routine.blocks[current.currentBlockIndex]
        if (finishedBlock) {
          playPresetSound(finishedBlock.soundId)
          setModularHistory((entries) => [
            {
              id: crypto.randomUUID(),
              routineId: routine.id,
              routineName: routine.name,
              blockName: finishedBlock.name,
              durationSec: finishedBlock.durationSec,
              completedAt: Date.now(),
            },
            ...entries,
          ])
        }

        const nextIndex = current.currentBlockIndex + 1
        if (nextIndex >= routine.blocks.length) {
          return {
            ...current,
            isRunning: false,
            isComplete: true,
            awaitingNext: false,
            remainingSec: 0,
          }
        }

        if (current.transitionMode === 'manual') {
          return {
            ...current,
            isRunning: false,
            awaitingNext: true,
            remainingSec: 0,
          }
        }

        return {
          ...current,
          currentBlockIndex: nextIndex,
          remainingSec: routine.blocks[nextIndex].durationSec,
          awaitingNext: false,
          isComplete: false,
        }
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [player.isRunning, routines])

  useEffect(() => {
    const interval = setInterval(() => {
      setFlowState((current) => {
        const now = Date.now()
        if (current.mode === 'focus' && current.focusStartedAt) {
          return { ...current, focusElapsedSec: Math.floor((now - current.focusStartedAt) / 1000) }
        }
        if (current.mode === 'break' && current.breakEndsAt) {
          const remaining = Math.max(0, Math.ceil((current.breakEndsAt - now) / 1000))
          if (remaining === 0) {
            playPresetSound('chime')
            return { ...current, mode: 'idle', breakEndsAt: null, breakRemainingSec: 0 }
          }
          return { ...current, breakRemainingSec: remaining }
        }
        return current
      })
    }, 250)
    return () => clearInterval(interval)
  }, [])

  const updateRoutine = (routineId, updater) => {
    setRoutines((current) => current.map((routine) => (routine.id === routineId ? updater(routine) : routine)))
  }

  const setPlayerToRoutineStart = (routine, shouldRun) => {
    const firstDuration = routine.blocks[0]?.durationSec ?? 0
    setPlayer((current) => ({
      ...current,
      routineId: routine.id,
      currentBlockIndex: 0,
      remainingSec: firstDuration,
      isRunning: shouldRun && firstDuration > 0,
      isComplete: false,
      awaitingNext: false,
    }))
  }

  const handleCreateRoutine = () => {
    const name = newRoutineName.trim() || `Routine ${routines.length + 1}`
    const nextRoutine = createRoutine(name)
    setRoutines((current) => [...current, nextRoutine])
    setSelectedRoutineId(nextRoutine.id)
    setPlayer((current) => ({ ...current, routineId: nextRoutine.id, currentBlockIndex: 0, remainingSec: 0 }))
    setNewRoutineName('')
  }

  const handleDeleteRoutine = (routineId) => {
    setRoutines((current) => {
      if (current.length === 1) {
        return [createRoutine('New routine')]
      }
      const next = current.filter((routine) => routine.id !== routineId)
      if (selectedRoutineId === routineId && next.length > 0) {
        setSelectedRoutineId(next[0].id)
        setPlayer((currentPlayer) => ({
          ...currentPlayer,
          routineId: next[0].id,
          currentBlockIndex: 0,
          remainingSec: next[0].blocks[0]?.durationSec ?? 0,
          isRunning: false,
          isComplete: false,
          awaitingNext: false,
        }))
      }
      return next
    })
  }

  const handleAddBlock = () => {
    if (!selectedRoutine) return
    const minutes = clampToNumber(blockDraft.minutes, 0, 999)
    const seconds = clampToNumber(blockDraft.seconds, 0, 59)
    const durationSec = Math.max(1, minutes * 60 + seconds)
    const blockTemplate = {
      id: crypto.randomUUID(),
      name: blockDraft.name.trim() || `Block ${routineSavedBlocks.length + 1}`,
      durationSec,
      soundId: blockDraft.soundId,
    }
    updateRoutine(selectedRoutine.id, (routine) => ({
      ...routine,
      savedBlocks: [blockTemplate, ...(routine.savedBlocks ?? [])],
    }))
    setBlockDraft((current) => ({ ...current, name: '' }))
    setIsAddBlockOpen(false)
  }

  const handleAddSavedBlockToTimeline = (savedBlock, atIndex = null) => {
    if (!selectedRoutine) return
    updateRoutine(selectedRoutine.id, (routine) => {
      const nextBlocks = [...routine.blocks]
      const newBlock = {
        id: crypto.randomUUID(),
        name: savedBlock.name,
        durationSec: savedBlock.durationSec,
        soundId: savedBlock.soundId,
      }
      if (atIndex === null || atIndex < 0 || atIndex > nextBlocks.length) {
        nextBlocks.push(newBlock)
      } else {
        nextBlocks.splice(atIndex, 0, newBlock)
      }
      return { ...routine, blocks: nextBlocks }
    })
  }

  const handleRemoveSelectedTimelineBlock = () => {
    if (!selectedRoutine || !selectedTimelineBlockId) return
    updateRoutine(selectedRoutine.id, (routine) => ({
      ...routine,
      blocks: routine.blocks.filter((item) => item.id !== selectedTimelineBlockId),
    }))
    setSelectedTimelineBlockId(null)
  }

  const reorderBlocks = (fromIndex, toIndex) => {
    if (!selectedRoutine) return
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return
    updateRoutine(selectedRoutine.id, (routine) => {
      const nextBlocks = [...routine.blocks]
      const [moved] = nextBlocks.splice(fromIndex, 1)
      nextBlocks.splice(toIndex, 0, moved)
      return { ...routine, blocks: nextBlocks }
    })
  }

  const handleStart = () => {
    if (!selectedRoutine || selectedRoutine.blocks.length === 0) return
    setPlayerToRoutineStart(selectedRoutine, true)
  }

  const handlePauseResume = () => {
    setPlayer((current) => ({ ...current, isRunning: !current.isRunning }))
  }

  const handleReset = () => {
    if (!selectedRoutine) return
    setPlayerToRoutineStart(selectedRoutine, false)
  }

  const handleNext = () => {
    setPlayer((current) => {
      const routine = routines.find((item) => item.id === current.routineId)
      if (!routine || routine.blocks.length === 0) return current
      const nextIndex = current.currentBlockIndex + 1
      if (nextIndex >= routine.blocks.length) {
        return { ...current, isRunning: false, isComplete: true, awaitingNext: false, remainingSec: 0 }
      }
      return {
        ...current,
        currentBlockIndex: nextIndex,
        remainingSec: routine.blocks[nextIndex].durationSec,
        awaitingNext: false,
        isComplete: false,
        isRunning: true,
      }
    })
  }

  const currentBlock = activeRoutine?.blocks[player.currentBlockIndex] ?? null
  const todayModularHistory = useMemo(
    () => modularHistory.filter((session) => isToday(session.completedAt)),
    [modularHistory],
  )
  const todayModularTotalSec = useMemo(
    () => todayModularHistory.reduce((sum, session) => sum + session.durationSec, 0),
    [todayModularHistory],
  )
  const todayHistory = useMemo(
    () => flowState.history.filter((session) => isToday(session.focusStoppedAt)),
    [flowState.history],
  )
  const todayFlowFocusTotalSec = useMemo(
    () => todayHistory.reduce((sum, session) => sum + session.focusSec, 0),
    [todayHistory],
  )
  const todayFlowBreakTotalSec = useMemo(
    () => todayHistory.reduce((sum, session) => sum + session.breakSec, 0),
    [todayHistory],
  )

  const handleStartFocus = () => {
    const now = Date.now()
    setFlowState((current) => ({
      ...current,
      mode: 'focus',
      focusStartedAt: now,
      focusElapsedSec: 0,
      breakEndsAt: null,
      breakRemainingSec: 0,
    }))
  }

  const handleStopFocus = () => {
    if (flowState.mode !== 'focus' || flowState.focusElapsedSec <= 0) return
    const stoppedAt = Date.now()
    const computedBreakSec = Math.max(1, Math.floor(flowState.focusElapsedSec / flowState.ratio))
    setFlowState((current) => ({
      ...current,
      history: [
        {
          id: crypto.randomUUID(),
          focusSec: current.focusElapsedSec,
          breakSec: computedBreakSec,
          ratioUsed: `1/${current.ratio}`,
          focusStoppedAt: stoppedAt,
        },
        ...current.history,
      ],
      mode: 'break',
      focusStartedAt: null,
      breakEndsAt: stoppedAt + computedBreakSec * 1000,
      breakRemainingSec: computedBreakSec,
    }))
  }

  const handleSkipBreak = () => {
    setFlowState((current) => ({
      ...current,
      mode: 'idle',
      breakEndsAt: null,
      breakRemainingSec: 0,
    }))
  }

  return (
    <main className={`app theme-${theme}`}>
      <header>
        <div className="header-row">
          <div>
            <h1>TimeWeaver</h1>
            <p className="subtitle">
              {appMode === 'flowmodoro'
                ? 'Pomodoro, but goes with your flow.'
                : appMode === 'modular'
                  ? 'Design your flow.'
                  : 'Review today across both timers.'}
            </p>
          </div>
          <div className="theme-toggle" aria-label="Theme picker">
            <button
              type="button"
              className={theme === 'light' ? 'theme-icon active' : 'theme-icon'}
              onClick={() => setTheme('light')}
              title="Light theme"
              aria-label="Light theme"
            >
              ☀
            </button>
            <button
              type="button"
              className={theme === 'dark' ? 'theme-icon active' : 'theme-icon'}
              onClick={() => setTheme('dark')}
              title="Dark theme"
              aria-label="Dark theme"
            >
              🌙
            </button>
            <button
              type="button"
              className={theme === 'pastel' ? 'theme-icon active' : 'theme-icon'}
              onClick={() => setTheme('pastel')}
              title="Bubble pastel theme"
              aria-label="Bubble pastel theme"
            >
              🫧
            </button>
          </div>
        </div>
      </header>
      <section className="tabs">
        <button type="button" className={appMode === 'flowmodoro' ? 'active' : ''} onClick={() => setAppMode('flowmodoro')}>
          Flowmodoro
        </button>
        <button type="button" className={appMode === 'modular' ? 'active' : ''} onClick={() => setAppMode('modular')}>
          ModuTimer
        </button>
        <button type="button" className={appMode === 'summary' ? 'active' : ''} onClick={() => setAppMode('summary')}>
          Summary
        </button>
      </section>

      {appMode === 'modular' ? (
        <>
          <section className="panel runner">
            <h2>Time Flow</h2>
            <p className="mode-label">
              {player.isComplete ? 'Complete' : player.awaitingNext ? 'Waiting for next' : 'Current block'}
            </p>
            <p className="current-name">{currentBlock?.name ?? 'No block selected'}</p>
            <p className="timer-value">{formatTime(player.remainingSec)}</p>
            <p className="progress">
              Progress {formatTime(elapsedSec)} / {formatTime(totalDurationSec)}
            </p>
            <div className="settings-row">
              <span>Transition</span>
              <label>
                <input
                  type="radio"
                  checked={player.transitionMode === 'auto'}
                  onChange={() => setPlayer((current) => ({ ...current, transitionMode: 'auto' }))}
                />
                Auto
              </label>
              <label>
                <input
                  type="radio"
                  checked={player.transitionMode === 'manual'}
                  onChange={() => setPlayer((current) => ({ ...current, transitionMode: 'manual' }))}
                />
                Manual
              </label>
            </div>
            <div className="actions">
              <button type="button" onClick={handleStart} disabled={!selectedRoutine || selectedRoutine.blocks.length === 0}>
                Start
              </button>
              <button type="button" onClick={handlePauseResume} disabled={player.remainingSec === 0 && !player.isRunning}>
                {player.isRunning ? 'Pause' : 'Resume'}
              </button>
              <button type="button" onClick={handleNext} disabled={!activeRoutine || activeRoutine.blocks.length === 0}>
                Next
              </button>
              <button type="button" onClick={handleReset} disabled={!selectedRoutine || selectedRoutine.blocks.length === 0}>
                Reset
              </button>
            </div>
          </section>

          <section className="panel">
            <button type="button" className="add-block-toggle" onClick={() => setIsRoutineOpen(true)}>
              Routine
            </button>
          </section>

          {isAddBlockOpen ? (
            <div className="modal-backdrop" onClick={() => setIsAddBlockOpen(false)}>
              <section className="modal-card" onClick={(event) => event.stopPropagation()}>
                <h2>Create Timeline Block</h2>
                <div className="block-form">
                  <input
                    type="text"
                    value={blockDraft.name}
                    onChange={(event) => setBlockDraft((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Block name (e.g., Break)"
                  />
                  <input
                    type="number"
                    min="0"
                    max="999"
                    value={blockDraft.minutes}
                    onChange={(event) =>
                      setBlockDraft((current) => ({ ...current, minutes: clampToNumber(event.target.value, 0, 999) }))
                    }
                    placeholder="Min"
                  />
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={blockDraft.seconds}
                    onChange={(event) =>
                      setBlockDraft((current) => ({ ...current, seconds: clampToNumber(event.target.value, 0, 59) }))
                    }
                    placeholder="Sec"
                  />
                  <select
                    value={blockDraft.soundId}
                    onChange={(event) => setBlockDraft((current) => ({ ...current, soundId: event.target.value }))}
                  >
                    {SOUND_PRESETS.map((sound) => (
                      <option key={sound.id} value={sound.id}>
                        {sound.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="actions">
                  <button type="button" onClick={() => playPresetSound(blockDraft.soundId)}>
                    Preview
                  </button>
                  <button type="button" onClick={() => setIsAddBlockOpen(false)}>
                    Cancel
                  </button>
                  <button type="button" onClick={handleAddBlock}>
                    Save block
                  </button>
                </div>
              </section>
            </div>
          ) : null}

          {isRoutineOpen ? (
            <div className="modal-backdrop" onClick={() => setIsRoutineOpen(false)}>
              <section className="modal-card" onClick={(event) => event.stopPropagation()}>
                <h2>Manage Project</h2>
                <div className="routine-create">
                  <select
                    value={selectedRoutineId ?? ''}
                    onChange={(event) => {
                      setSelectedRoutineId(event.target.value)
                      setSelectedTimelineBlockId(null)
                    }}
                    aria-label="Saved routines"
                  >
                    {routines.map((routine) => (
                      <option key={routine.id} value={routine.id}>
                        {routine.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={newRoutineName}
                    onChange={(event) => setNewRoutineName(event.target.value)}
                    placeholder="New routine name"
                  />
                </div>
                <div className="actions">
                  <button type="button" onClick={handleCreateRoutine}>
                    Add routine
                  </button>
                  <button
                    type="button"
                    onClick={() => selectedRoutineId && handleDeleteRoutine(selectedRoutineId)}
                    disabled={!selectedRoutineId}
                  >
                    Delete selected
                  </button>
                  <button type="button" onClick={() => setIsRoutineOpen(false)}>
                    Close
                  </button>
                </div>
              </section>
            </div>
          ) : null}

          <section className="panel timeline-workspace">
            <div className="timeline-column">
              <h2>Timeline</h2>
              {!selectedRoutine || selectedRoutine.blocks.length === 0 ? (
                <div
                  className="timeline-dropzone"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (!dragData || dragData.type !== 'saved') return
                    const savedBlock = routineSavedBlocks.find((item) => item.id === dragData.savedBlockId)
                    if (savedBlock) handleAddSavedBlockToTimeline(savedBlock)
                    setDragData(null)
                    setDragOverIndex(null)
                  }}
                >
                  <p className="empty">Drag a saved block here to start your timeline.</p>
                </div>
              ) : (
                <ul className="timeline">
                  {selectedRoutine.blocks.map((block, index) => {
                    const isDraggedTimelineBlock = dragData?.type === 'timeline' && dragData.index === index
                    const isDragOver = dragOverIndex === index
                    return (
                      <li
                        key={block.id}
                        draggable
                        onClick={() => setSelectedTimelineBlockId(block.id)}
                        onDragStart={() => setDragData({ type: 'timeline', index })}
                        onDragEnd={() => {
                          setDragData(null)
                          setDragOverIndex(null)
                        }}
                        onDragOver={(event) => {
                          event.preventDefault()
                          setDragOverIndex(index)
                        }}
                        onDrop={() => {
                          if (!dragData) return
                          if (dragData.type === 'timeline') {
                            reorderBlocks(dragData.index, index)
                          } else if (dragData.type === 'saved') {
                            const savedBlock = routineSavedBlocks.find((item) => item.id === dragData.savedBlockId)
                            if (savedBlock) handleAddSavedBlockToTimeline(savedBlock, index)
                          }
                          setDragData(null)
                          setDragOverIndex(null)
                        }}
                        className={[
                          activeRoutine?.id === selectedRoutine.id && player.currentBlockIndex === index ? 'active' : '',
                          selectedTimelineBlockId === block.id ? 'selected' : '',
                          isDraggedTimelineBlock ? 'dragging' : '',
                          isDragOver ? 'drag-over' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        <span className="drag-handle">::</span>
                        <span className="block-name">{block.name}</span>
                        <span>{formatTime(block.durationSec)}</span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
            <div className="timeline-options-column">
              <h2>Edit Timeline</h2>
              <div className="timeline-options">
                <button type="button" onClick={() => setIsAddBlockOpen(true)}>
                  Add block
                </button>
                <button type="button" onClick={handleRemoveSelectedTimelineBlock} disabled={!selectedTimelineBlockId}>
                  Remove block
                </button>
              </div>
              <h3>Saved Blocks</h3>
              {routineSavedBlocks.length === 0 ? (
                <p className="empty">No saved blocks yet. Add one first.</p>
              ) : (
                <ul className="saved-blocks">
                  {routineSavedBlocks.map((savedBlock) => (
                    <li
                      key={savedBlock.id}
                      draggable
                      onDragStart={() => setDragData({ type: 'saved', savedBlockId: savedBlock.id })}
                      onDragEnd={() => {
                        setDragData(null)
                        setDragOverIndex(null)
                      }}
                    >
                      <span>{savedBlock.name}</span>
                      <span>{formatTime(savedBlock.durationSec)}</span>
                      <button type="button" onClick={() => handleAddSavedBlockToTimeline(savedBlock)}>
                        Add
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </>
      ) : appMode === 'summary' ? (
        <>
          <section className="panel">
            <h2>ModuTimer Summary (Today)</h2>
            <p className="progress">Completed blocks: {todayModularHistory.length}</p>
            <p className="progress">Total time completed: {formatTime(todayModularTotalSec)}</p>
            {todayModularHistory.length === 0 ? (
              <p className="empty">No completed ModuTimer blocks yet today.</p>
            ) : (
              <ul className="timeline summary-list">
                {todayModularHistory.map((entry) => (
                  <li key={entry.id}>
                    <span>{new Date(entry.completedAt).toLocaleTimeString()}</span>
                    <span>{entry.routineName}</span>
                    <span>{entry.blockName}</span>
                    <span>{formatTime(entry.durationSec)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel">
            <h2>Flowmodoro Summary (Today)</h2>
            <p className="progress">Completed sessions: {todayHistory.length}</p>
            <p className="progress">Total focus time: {formatTime(todayFlowFocusTotalSec)}</p>
            <p className="progress">Total break time: {formatTime(todayFlowBreakTotalSec)}</p>
            {todayHistory.length === 0 ? (
              <p className="empty">No completed Flowmodoro sessions yet today.</p>
            ) : (
              <ul className="timeline summary-list">
                {todayHistory.map((session) => (
                  <li key={session.id}>
                    <span>{new Date(session.focusStoppedAt).toLocaleTimeString()}</span>
                    <span>Focus {formatTime(session.focusSec)}</span>
                    <span>Break {formatTime(session.breakSec)}</span>
                    <span>{session.ratioUsed}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : (
        <>
          <section className="panel">
            <h2>Flowmodoro</h2>
            <p>Break ratio: 1/{flowState.ratio}</p>
            <input
              type="range"
              min="2"
              max="6"
              step="1"
              value={flowState.ratio}
              onChange={(event) =>
                setFlowState((current) => ({ ...current, ratio: clampToNumber(event.target.value, 2, 6) }))
              }
              disabled={flowState.mode === 'focus'}
            />
          </section>
          <section className="panel runner">
            <p className="mode-label">
              {flowState.mode === 'break' ? 'Break' : flowState.mode === 'focus' ? 'Focus' : 'Ready'}
            </p>
            <p className="timer-value">
              {formatTime(flowState.mode === 'break' ? flowState.breakRemainingSec : flowState.focusElapsedSec)}
            </p>
            <div className="actions">
              <button type="button" onClick={handleStartFocus} disabled={flowState.mode === 'focus'}>
                Start focus
              </button>
              <button type="button" onClick={handleStopFocus} disabled={flowState.mode !== 'focus'}>
                Stop focus
              </button>
              <button type="button" onClick={handleSkipBreak} disabled={flowState.mode !== 'break'}>
                Skip break
              </button>
            </div>
          </section>
          <section className="panel">
            <h2>Today&apos;s sessions</h2>
            {todayHistory.length === 0 ? (
              <p className="empty">No sessions yet. Start your first focus block.</p>
            ) : (
              <ul className="timeline">
                {todayHistory.map((session) => (
                  <li key={session.id}>
                    <span>{new Date(session.focusStoppedAt).toLocaleTimeString()}</span>
                    <span>Focus {formatTime(session.focusSec)}</span>
                    <span>Break {formatTime(session.breakSec)}</span>
                    <span>{session.ratioUsed}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
      <footer className="site-footer">
        <a href="https://trypng.net" target="_blank" rel="noreferrer">
          trypng.net
        </a>
      </footer>
    </main>
  )
}

export default App
