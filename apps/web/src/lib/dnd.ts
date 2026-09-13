/**
 * The only file that knows about the drag-and-drop library. Components use these hooks, so replacing
 * Pragmatic drag and drop (for example with dnd-kit, if touch dragging disappoints on real phones)
 * only touches this file. Dragging is an enhancement: every move is also available from the card menu.
 */

import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine'
import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { autoScrollForElements } from '@atlaskit/pragmatic-drag-and-drop-auto-scroll/element'
import {
  attachClosestEdge,
  type Edge,
  extractClosestEdge,
} from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge'
import { getReorderDestinationIndex } from '@atlaskit/pragmatic-drag-and-drop-hitbox/util/get-reorder-destination-index'
import { type RefObject, useEffect, useRef, useState } from 'react'

export type { Edge }

const MODULE = 'plan-module'
const COLUMN = 'plan-column'
/** A choice area tile from the backlog; dropping it creates a placeholder. */
const AREA_SLOT = 'plan-area-slot'
/** A semester column, dragged by its header to reorder the semesters. */
const SEMESTER = 'plan-semester'
/** Drag data must be serialisable, so the backlog (null) travels as a sentinel. */
const BACKLOG = '__backlog__'

export interface ModulePosition {
  code: string
  /** Null means the backlog. */
  columnId: string | null
  index: number
}

export type MoveHandler = (code: string, targetColumnId: string | null, targetIndex?: number) => void

/** Places a placeholder for `areaId` in a semester, at `targetIndex` or the end. */
export type PlaceAreaHandler = (areaId: string, semesterId: string, targetIndex?: number) => void

const encodeColumn = (columnId: string | null): string => columnId ?? BACKLOG
const decodeColumn = (value: string): string | null => (value === BACKLOG ? null : value)

function readModule(
  data: Record<string | symbol, unknown>,
): { code: string; column: string; index: number } | null {
  if (data.type !== MODULE) return null
  const { code, column, index } = data
  return typeof code === 'string' && typeof column === 'string' && typeof index === 'number'
    ? { code, column, index }
    : null
}

function readSemester(data: Record<string | symbol, unknown>): { semesterId: string; index: number } | null {
  if (data.type !== SEMESTER) return null
  const { semesterId, index } = data
  return typeof semesterId === 'string' && typeof index === 'number' ? { semesterId, index } : null
}

function readAreaSlot(data: Record<string | symbol, unknown>): string | null {
  return data.type === AREA_SLOT && typeof data.areaId === 'string' ? data.areaId : null
}

const isBoardDrag = (data: Record<string | symbol, unknown>): boolean =>
  data.type === MODULE || data.type === AREA_SLOT

/** Makes a module or placeholder card draggable and a drop target for reordering. Returns state for visual feedback. */
export function useDraggableModule(ref: RefObject<HTMLElement | null>, position: ModulePosition) {
  const [isDragging, setDragging] = useState(false)
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null)
  const { code, columnId, index } = position

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const data = { type: MODULE, code, column: encodeColumn(columnId), index }

    return combine(
      draggable({
        element,
        getInitialData: () => data,
        onDragStart: () => setDragging(true),
        onDrop: () => setDragging(false),
      }),
      dropTargetForElements({
        element,
        canDrop: ({ source }) =>
          (source.data.type === MODULE && source.data.code !== code) ||
          (source.data.type === AREA_SLOT && columnId !== null),
        getData: ({ input }) => attachClosestEdge(data, { element, input, allowedEdges: ['top', 'bottom'] }),
        getIsSticky: () => true,
        onDrag: ({ self, source }) => {
          const dragged = readModule(source.data)
          const edge = extractClosestEdge(self.data)
          // Hide the indicator where dropping would leave the card where it already is.
          const isNoop =
            dragged !== null &&
            dragged.column === data.column &&
            ((dragged.index === index - 1 && edge === 'top') ||
              (dragged.index === index + 1 && edge === 'bottom'))
          setClosestEdge(isNoop ? null : edge)
        },
        onDragLeave: () => setClosestEdge(null),
        onDrop: () => setClosestEdge(null),
      }),
    )
  }, [ref, code, columnId, index])

  return { isDragging, closestEdge }
}

/**
 * Makes a whole column a drop target, so cards can be dropped into empty space or empty columns. Semester columns
 * (with a `semesterIndex`) also accept a dragged semester and report on which side it would land.
 */
export function useColumnDropTarget(
  ref: RefObject<HTMLElement | null>,
  columnId: string | null,
  semesterIndex: number | null = null,
) {
  const [isOver, setOver] = useState(false)
  const [semesterEdge, setSemesterEdge] = useState<Edge | null>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const data = { type: COLUMN, column: encodeColumn(columnId), index: semesterIndex ?? -1 }
    return dropTargetForElements({
      element,
      getData: ({ input, source }) =>
        source.data.type === SEMESTER
          ? attachClosestEdge(data, { element, input, allowedEdges: ['left', 'right'] })
          : data,
      canDrop: ({ source }) =>
        source.data.type === MODULE ||
        (source.data.type === AREA_SLOT && columnId !== null) ||
        (source.data.type === SEMESTER && semesterIndex !== null),
      onDragEnter: ({ source }) => {
        if (source.data.type !== SEMESTER) setOver(true)
      },
      onDrag: ({ self, source }) => {
        const dragged = readSemester(source.data)
        if (!dragged || semesterIndex === null) return
        const edge = extractClosestEdge(self.data)
        // No marker where dropping would leave the semester where it already is.
        const isNoop =
          dragged.index === semesterIndex ||
          (dragged.index === semesterIndex - 1 && edge === 'left') ||
          (dragged.index === semesterIndex + 1 && edge === 'right')
        setSemesterEdge(isNoop ? null : edge)
      },
      onDragLeave: () => {
        setOver(false)
        setSemesterEdge(null)
      },
      onDrop: () => {
        setOver(false)
        setSemesterEdge(null)
      },
    })
  }, [ref, columnId, semesterIndex])

  return { isOver, semesterEdge }
}

/** Makes a semester column draggable by its header (the handle), to reorder the semesters. */
export function useDraggableSemester(
  ref: RefObject<HTMLElement | null>,
  handleRef: RefObject<HTMLElement | null>,
  semesterId: string | null,
  index: number | null,
) {
  const [isDragging, setDragging] = useState(false)

  useEffect(() => {
    const element = ref.current
    const dragHandle = handleRef.current
    if (!element || !dragHandle || semesterId === null || index === null) return
    return draggable({
      element,
      dragHandle,
      getInitialData: () => ({ type: SEMESTER, semesterId, index }),
      onDragStart: () => setDragging(true),
      onDrop: () => setDragging(false),
    })
  }, [ref, handleRef, semesterId, index])

  return { isDragging }
}

/** Listens for dropped semesters and turns the drop position into a new index. */
export function useSemesterDropMonitor(onMoveSemester: (semesterId: string, toIndex: number) => void): void {
  const latest = useRef(onMoveSemester)
  useEffect(() => {
    latest.current = onMoveSemester
  }, [onMoveSemester])

  useEffect(
    () =>
      monitorForElements({
        canMonitor: ({ source }) => source.data.type === SEMESTER,
        onDrop: ({ source, location }) => {
          const dragged = readSemester(source.data)
          const target = location.current.dropTargets.find(
            (candidate) => candidate.data.type === COLUMN && typeof candidate.data.index === 'number',
          )
          if (!dragged || !target || typeof target.data.index !== 'number' || target.data.index < 0) return
          const toIndex = getReorderDestinationIndex({
            startIndex: dragged.index,
            indexOfTarget: target.data.index,
            closestEdgeOfTarget: extractClosestEdge(target.data),
            axis: 'horizontal',
          })
          if (toIndex !== dragged.index) latest.current(dragged.semesterId, toIndex)
        },
      }),
    [],
  )
}

/** Makes a choice area tile draggable onto semesters, where it becomes a placeholder. */
export function useDraggableAreaSlot(ref: RefObject<HTMLElement | null>, areaId: string) {
  const [isDragging, setDragging] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    return draggable({
      element,
      getInitialData: () => ({ type: AREA_SLOT, areaId }),
      onDragStart: () => setDragging(true),
      onDrop: () => setDragging(false),
    })
  }, [ref, areaId])

  return { isDragging }
}

/** Listens for finished drags anywhere on the page and translates them into plan changes. */
export function useModuleDropMonitor(onMove: MoveHandler, onPlaceArea?: PlaceAreaHandler): void {
  const latest = useRef({ onMove, onPlaceArea })
  useEffect(() => {
    latest.current = { onMove, onPlaceArea }
  }, [onMove, onPlaceArea])

  useEffect(
    () =>
      monitorForElements({
        canMonitor: ({ source }) => isBoardDrag(source.data),
        onDrop: ({ source, location }) => {
          const target = location.current.dropTargets[0]
          if (!target) return

          const areaId = readAreaSlot(source.data)
          if (areaId !== null) {
            const onCard = readModule(target.data)
            const column = onCard
              ? onCard.column
              : target.data.type === COLUMN && typeof target.data.column === 'string'
                ? target.data.column
                : null
            const semesterId = column === null ? null : decodeColumn(column)
            if (semesterId === null) return
            const index = onCard
              ? onCard.index + (extractClosestEdge(target.data) === 'bottom' ? 1 : 0)
              : undefined
            latest.current.onPlaceArea?.(areaId, semesterId, index)
            return
          }

          const dragged = readModule(source.data)
          if (!dragged) return

          const onCard = readModule(target.data)
          if (onCard) {
            const edge = extractClosestEdge(target.data)
            const index =
              onCard.column === dragged.column
                ? getReorderDestinationIndex({
                    startIndex: dragged.index,
                    indexOfTarget: onCard.index,
                    closestEdgeOfTarget: edge,
                    axis: 'vertical',
                  })
                : onCard.index + (edge === 'bottom' ? 1 : 0)
            if (onCard.column === dragged.column && index === dragged.index) return
            latest.current.onMove(dragged.code, decodeColumn(onCard.column), index)
            return
          }

          if (target.data.type === COLUMN && typeof target.data.column === 'string') {
            latest.current.onMove(dragged.code, decodeColumn(target.data.column))
          }
        },
      }),
    [],
  )
}

/** Scrolls the board sideways while a card, area tile or semester is dragged near its left or right edge. */
export function useBoardAutoScroll(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = ref.current
    if (!element) return
    return autoScrollForElements({
      element,
      canScroll: ({ source }) => isBoardDrag(source.data) || source.data.type === SEMESTER,
    })
  }, [ref])
}

/** Scrolls a module list while a module or area tile is dragged near its top or bottom edge. */
export function useListAutoScroll(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = ref.current
    if (!element) return
    return autoScrollForElements({
      element,
      canScroll: ({ source }) => isBoardDrag(source.data),
    })
  }, [ref])
}
