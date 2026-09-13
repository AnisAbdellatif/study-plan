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
/** Drag data must be serialisable, so the backlog (null) travels as a sentinel. */
const BACKLOG = '__backlog__'

export interface ModulePosition {
  code: string
  /** Null means the backlog. */
  columnId: string | null
  index: number
}

export type MoveHandler = (code: string, targetColumnId: string | null, targetIndex?: number) => void

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

/** Makes a module card draggable and a drop target for reordering. Returns state for visual feedback. */
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
        canDrop: ({ source }) => source.data.type === MODULE && source.data.code !== code,
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

/** Makes a whole column a drop target, so cards can be dropped into empty space or empty columns. */
export function useColumnDropTarget(ref: RefObject<HTMLElement | null>, columnId: string | null) {
  const [isOver, setOver] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    return dropTargetForElements({
      element,
      getData: () => ({ type: COLUMN, column: encodeColumn(columnId) }),
      canDrop: ({ source }) => source.data.type === MODULE,
      onDragEnter: () => setOver(true),
      onDragLeave: () => setOver(false),
      onDrop: () => setOver(false),
    })
  }, [ref, columnId])

  return { isOver }
}

/** Listens for finished drags anywhere on the page and translates them into plan moves. */
export function useModuleDropMonitor(onMove: MoveHandler): void {
  const latest = useRef(onMove)
  useEffect(() => {
    latest.current = onMove
  }, [onMove])

  useEffect(
    () =>
      monitorForElements({
        canMonitor: ({ source }) => source.data.type === MODULE,
        onDrop: ({ source, location }) => {
          const dragged = readModule(source.data)
          const target = location.current.dropTargets[0]
          if (!dragged || !target) return

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
            latest.current(dragged.code, decodeColumn(onCard.column), index)
            return
          }

          if (target.data.type === COLUMN && typeof target.data.column === 'string') {
            latest.current(dragged.code, decodeColumn(target.data.column))
          }
        },
      }),
    [],
  )
}

/** Scrolls a module list while a module is dragged near its top or bottom edge. */
export function useListAutoScroll(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = ref.current
    if (!element) return
    return autoScrollForElements({
      element,
      canScroll: ({ source }) => source.data.type === MODULE,
    })
  }, [ref])
}
