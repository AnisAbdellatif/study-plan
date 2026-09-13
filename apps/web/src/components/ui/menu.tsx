import { Menu } from '@base-ui/react/menu'
import { Check } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'

export const MenuRoot = Menu.Root
export const MenuTrigger = Menu.Trigger
export const MenuGroup = Menu.Group
export const MenuRadioGroup = Menu.RadioGroup

export function MenuContent({
  children,
  align = 'end',
}: {
  children: ReactNode
  align?: 'start' | 'center' | 'end'
}) {
  return (
    <Menu.Portal>
      <Menu.Positioner align={align} className="z-50 outline-none">
        <Menu.Popup className="mt-1 max-h-[70vh] max-w-[calc(100vw-1rem)] min-w-56 overflow-y-auto rounded-lg bg-white p-1 text-sm shadow-lg ring-1 ring-zinc-200 outline-none dark:bg-zinc-900 dark:ring-zinc-800">
          {children}
        </Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  )
}

type MenuItemProps = Omit<ComponentProps<typeof Menu.Item>, 'className'> & { className?: string }

export function MenuItem({ className, ...props }: MenuItemProps) {
  return (
    <Menu.Item
      className={cn(
        'flex cursor-default items-center gap-2 rounded-md px-3 py-2.5 outline-none select-none data-[disabled]:opacity-50 sm:px-2 sm:py-1.5 data-[highlighted]:bg-zinc-100 dark:data-[highlighted]:bg-zinc-800',
        className,
      )}
      {...props}
    />
  )
}

export function MenuGroupLabel({ children }: { children: ReactNode }) {
  return (
    <Menu.GroupLabel className="px-2 pt-2 pb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
      {children}
    </Menu.GroupLabel>
  )
}

export function MenuSeparator() {
  return <Menu.Separator className="my-1 h-px bg-zinc-200 dark:bg-zinc-800" />
}

type MenuRadioItemProps = Omit<ComponentProps<typeof Menu.RadioItem>, 'className'> & { className?: string }

/** A choice in a `MenuRadioGroup`, with a check mark on the selected one. Closes the menu when picked. */
export function MenuRadioItem({ className, children, ...props }: MenuRadioItemProps) {
  return (
    <Menu.RadioItem
      closeOnClick
      className={cn(
        'flex cursor-default items-center gap-2 rounded-md px-3 py-2.5 outline-none select-none data-[highlighted]:bg-zinc-100 sm:px-2 sm:py-1.5 dark:data-[highlighted]:bg-zinc-800',
        className,
      )}
      {...props}
    >
      <span className="flex size-4 items-center justify-center">
        <Menu.RadioItemIndicator>
          <Check aria-hidden className="size-4" />
        </Menu.RadioItemIndicator>
      </span>
      {children}
    </Menu.RadioItem>
  )
}
