/** The shape of a message file with every text replaced by `string`, so translations must have the same keys. */
export type Messages<T> = { [K in keyof T]: T[K] extends string ? string : Messages<T[K]> }
