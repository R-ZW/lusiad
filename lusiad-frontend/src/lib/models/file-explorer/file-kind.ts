/** File policy, independent of PSI and path separators. */
export const isJavaPath = (path: string) => /[^\\/]+\.java$/i.test(path)
export const isJavaFileName = (name: string) => name.trim().length > 5 && !/[\\/]/.test(name.trim()) && isJavaPath(name.trim())

/** A pasted full Java filename is accepted without duplicating the fixed suffix. */
export const javaBaseName = (value: string) => value.replace(/\.java\s*$/i, '')
export const completeJavaName = (base: string) => `${base.trim()}.java`
export const validJavaBaseName = (base: string) => Boolean(base.trim()) && !/[.\\/]/.test(base.trim())
