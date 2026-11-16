import assert from 'node:assert/strict'
import test from 'node:test'
import { isJavaFileName, isJavaPath, javaBaseName, completeJavaName, validJavaBaseName } from '../src/lib/models/file-explorer/file-kind.ts'
import { decodePreview } from '../src/lib/models/file-explorer/text-preview.ts'
test('Java creation policy excludes other suffixes and paths; existing non-Java files stay readable', () => {
  for (const name of ['Main.java', ' Main.JAVA ', 'Árvore.java']) assert.equal(isJavaFileName(name), true)
  for (const name of ['README.md', '.java', 'Main.java.txt', '../Main.java', 'src\\Main.java', '']) assert.equal(isJavaFileName(name), false)
  assert.equal(isJavaPath('D:/src/Main.java'), true)
  assert.equal(isJavaPath('D:/src/README.md'), false)
})
test('text preview preserves CRLF, Unicode, empty input and passive HTML', () => {
  const value = '<script>never executed</script>\r\nÁrvore Ω 😀\r\n'
  assert.equal(decodePreview(new TextEncoder().encode(value)).text, value)
  assert.equal(decodePreview(new Uint8Array()).text, '')
  assert.equal(decodePreview(Uint8Array.from([0xff, 0xfe, 0x41, 0])).text, 'A')
  assert.equal(decodePreview(Uint8Array.from([0xfe, 0xff, 0, 0x41])).text, 'A')
  assert.equal(decodePreview(Uint8Array.from([0x63, 0x61, 0x66, 0xe9])).text, 'café')
  assert.throws(() => decodePreview(Uint8Array.from([0x50, 0x4b, 3, 4, 0])), /Cannot display as text/)
})

test('fixed Java suffix accepts a base or pasted full name without changing the base case', () => {
  for (const input of ['MinhaClasse', 'MinhaClasse.java', 'MinhaClasse.JAVA']) {
    const base = javaBaseName(input)
    assert.equal(validJavaBaseName(base), true)
    assert.equal(completeJavaName(base), 'MinhaClasse.java')
  }
  assert.equal(completeJavaName('package-info'), 'package-info.java')
  for (const input of ['', 'Other.txt', '../Main', 'src\\Main', 'Main.java.java']) assert.equal(validJavaBaseName(javaBaseName(input)), false)
})
