import path from 'node:path'

export function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join('/')
}
