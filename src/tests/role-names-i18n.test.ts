import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

/**
 * Issue #3: all three role names must render in both Thai and English.
 * The Navbar renders t(`role.${user.role}`), so both translation files need
 * every role key. (UI itself is not auto-tested — this checks the resources
 * the rendering relies on.)
 */

const ROLES = ['admin', 'manager', 'sales'] as const

const testsDir = dirname(fileURLToPath(import.meta.url))

function loadTranslation(locale: 'en' | 'th'): Record<string, Record<string, string>> {
  const path = resolve(testsDir, `../locales/${locale}/translation.json`)
  return JSON.parse(readFileSync(path, 'utf-8'))
}

describe('role names render in Thai and English', () => {
  for (const locale of ['en', 'th'] as const) {
    test(`${locale} locale has all three role names`, () => {
      const translation = loadTranslation(locale)
      for (const role of ROLES) {
        expect(translation.role?.[role], `${locale}.role.${role}`).toBeTruthy()
      }
    })
  }

  test('Thai role names differ from the English ones (actually localized)', () => {
    const en = loadTranslation('en').role
    const th = loadTranslation('th').role
    for (const role of ROLES) {
      expect(th[role]).not.toBe(en[role])
    }
  })
})
