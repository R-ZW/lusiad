import { BackendApiError } from '../../services/backend-response.ts'

export interface FileTextPreview { text: string; revision: string; encoding: string; bytes: number }
export function decodePreview(bytes: Uint8Array): { text: string; encoding: string } {
  let encoding = 'utf-8', offset = 0
  if (bytes[0] === 0xff && bytes[1] === 0xfe) { encoding = 'utf-16le'; offset = 2 }
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) { encoding = 'utf-16be'; offset = 2 }
  else if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) offset = 3
  let text: string
  try { text = new TextDecoder(encoding, { fatal: true }).decode(bytes.subarray(offset)) }
  catch {
    if (encoding !== 'utf-8') throw new BackendApiError('File', 'Unsupported text encoding', 'file_not_text', 400)
    encoding = 'windows-1252'; text = new TextDecoder(encoding).decode(bytes)
  }
  if (/[\x00-\x08\x0b\x0e-\x1f]/.test(text)) throw new BackendApiError('File', 'Cannot display as text', 'file_not_text', 400)
  return { text, encoding }
}
