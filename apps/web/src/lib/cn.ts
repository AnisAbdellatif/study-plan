import { type ClassValue, clsx } from 'clsx'

export const cn = (...classes: ClassValue[]): string => clsx(classes)
