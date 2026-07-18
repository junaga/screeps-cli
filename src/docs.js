import { readFile } from 'node:fs/promises'

const docsDirectory = new URL('../docs/', import.meta.url)

export async function readDocsManifest() {
  return JSON.parse(await readFile(new URL('manifest.json', docsDirectory), 'utf8'))
}

export async function readDocsPage(file) {
  return readFile(new URL(file, docsDirectory), 'utf8')
}
