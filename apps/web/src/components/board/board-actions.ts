import type { PlanSemester } from '@study-plan/shared'
import type { MoveHandler, PlaceAreaHandler } from '../../lib/dnd.ts'

/** Everything a column, card or area tile can ask the board to do. Every drag has a menu alternative here. */
export interface BoardActions {
  onMove: MoveHandler
  onGrade: (code: string) => void
  onDetails: (code: string) => void
  onPlaceArea: PlaceAreaHandler
  /** Opens the option picker for an area without choosing. */
  onBrowseArea: (areaId: string) => void
  /** Picks the area for an area choice such as the Nebenfach; null clears the pick. */
  onChooseArea: (choiceId: string, areaId: string | null) => void
  /** Opens the option picker to replace a placeholder. */
  onChoose: (placeholderId: string) => void
  onRemovePlaceholder: (placeholderId: string) => void
  onUnchoose: (code: string) => void
  /** Turns a chosen module back into a placeholder and opens the picker for it. */
  onChooseOther: (code: string) => void
  /** Marks a module as one the student only wants to learn, or lets it count again. */
  onToggleSelfStudy: (code: string) => void
  /** Groups an undecided option with another one in the same semester. */
  onGroup: (code: string, otherCode: string) => void
  onLeaveGroup: (code: string) => void
  /** Keeps this member of a group; the others go back to the unplanned modules. */
  onKeepFromGroup: (code: string) => void
  onAddCustom: () => void
  onEditCustom: (code: string) => void
  onDeleteCustom: (code: string) => void
  /** Inserts an empty semester at this position (0 = before the first). */
  onInsertSemester: (index: number) => void
  onMoveSemester: (semesterId: string, toIndex: number) => void
  /** Asks first when the semester is not empty. */
  onDeleteSemester: (semesterId: string) => void
  /** Regular, part-time, leave or abroad. */
  onSetSemesterKind: (semesterId: string, kind: PlanSemester['kind']) => void
}
