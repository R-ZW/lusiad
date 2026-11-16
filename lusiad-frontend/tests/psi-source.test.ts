import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizePsiSource } from '../src/lib/services/model-comparison/psi-source.ts'

test('PSI input normalizes Windows and mixed separators while preserving code and literal escapes', () => {
  const windows = 'class Demo {\r\n  String text = "\\r\\n — café";\r\n}\r\n'
  const lf = 'class Demo {\n  String text = "\\r\\n — café";\n}\n'
  assert.equal(normalizePsiSource(windows), lf)
  assert.equal(normalizePsiSource(windows.replace(/\r\n/g, '\r')), lf)
  assert.equal(normalizePsiSource('class Demo {\r\n  void run() {}\r}\n'), 'class Demo {\n  void run() {}\n}\n')
  assert.equal(normalizePsiSource(lf), lf)
  assert.equal(normalizePsiSource(''), '')
})
