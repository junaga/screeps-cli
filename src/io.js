import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'

export function parseValue(value) {
  if (value === undefined) return undefined
  try { return JSON.parse(value) } catch { return value }
}

export async function readModules(directory) {
  const modules = {}
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !['.js', '.wasm'].includes(extname(entry.name))) continue
    const name = basename(entry.name, extname(entry.name))
    const content = await readFile(join(directory, entry.name))
    modules[name] = extname(entry.name) === '.wasm' ? { binary: content.toString('base64') } : content.toString('utf8')
  }
  if (!Object.keys(modules).length) throw new Error(`No .js or .wasm modules found in ${directory}`)
  return modules
}

export async function writeModules(directory, modules) {
  await mkdir(directory, { recursive: true })
  const written = []
  for (const [name, content] of Object.entries(modules || {})) {
    const binary = content && typeof content === 'object' && typeof content.binary === 'string'
    const path = join(directory, `${name}${binary ? '.wasm' : '.js'}`)
    await writeFile(path, binary ? Buffer.from(content.binary, 'base64') : String(content))
    written.push(path)
  }
  return written
}
