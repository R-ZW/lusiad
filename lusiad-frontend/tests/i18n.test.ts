import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import test from "node:test"

import {
  DEFAULT_LOCALE,
  formatDateTime,
  resolveLocale,
  resolveLocalizedMessage,
  translate,
  translatePlural,
} from "../src/lib/i18n/core.ts"
import { en, ptBR } from "../src/lib/i18n/messages.ts"



test("Portuguese and English catalogs expose the same keys", () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(ptBR).sort())
})

test("translations interpolate values and apply locale plural rules", () => {
  assert.equal(translate("en", "projects.fallbackName", { id: 7 }), "Project 7")
  assert.equal(translatePlural("pt-BR", "projects.count", 1), "1 projeto cadastrado")
  assert.equal(translatePlural("pt-BR", "projects.count", 2), "2 projetos cadastrados")
  assert.equal(translatePlural("en", "projects.count", 1), "1 registered project")
  assert.equal(translatePlural("en", "projects.count", 2), "2 registered projects")
})

test("unsupported locale values fall back to the configured default", () => {
  assert.equal(resolveLocale("es"), DEFAULT_LOCALE)
  assert.equal(resolveLocale(undefined), DEFAULT_LOCALE)
})

test("structured backend messages resolve by code and preserve their parameters", () => {
  const message = {
    code: "projects.fallbackName" as const,
    params: { id: 12 },
    fallback: "Legacy project 12",
  }

  assert.equal(resolveLocalizedMessage("pt-BR", message), "Projeto 12")
  assert.equal(resolveLocalizedMessage("en", message), "Project 12")
  assert.equal(
    resolveLocalizedMessage("en", { code: "legacy.unknown", fallback: "Legacy database message" }),
    "Legacy database message"
  )
})

test("dates are formatted according to the selected locale", () => {
  const value = new Date(2026, 8, 27, 13, 45)
  assert.match(formatDateTime("pt-BR", value), /27\/09\/2026/)
  assert.match(formatDateTime("en", value), /9\/27\/26|9\/27\/2026/)
})

test("every library category and snippet has a translation", async () => {
  const source = await readFile(
    join(process.cwd(), "src", "lib", "models", "model-editor", "components-panel.model.ts"),
    "utf8"
  )
  const categoryIds = [...source.matchAll(/category:\s*\{[\s\S]*?id:\s*"([^"]+)"/g)].map((match) => match[1])
  const snippetIds = [...source.matchAll(/\{\s*id:\s*"([^"]+)",\s*label:\s*"[^"]+",\s*formalName:/g)].map((match) => match[1])

  for (const key of [
    ...categoryIds.map((id) => `library.category.${id}`),
    ...snippetIds.map((id) => `library.snippet.${id}`),
  ]) {
    assert.ok(key in ptBR, `missing Portuguese key: ${key}`)
    assert.ok(key in en, `missing English key: ${key}`)
  }
})
