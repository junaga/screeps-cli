import { glob, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, extname, relative, resolve, sep } from 'node:path'

export function parseValue(value) {
  if (value === undefined) return undefined
  try { return JSON.parse(value) } catch { return value }
}

export async function readModules(directory) {
  const root = resolve(directory)
  const modules = {}

  for await (const entry of glob('{**/*,**/.*,**/.*/**/*}.{js,wasm}', { cwd: root, withFileTypes: true })) {
    if (!entry.isFile()) continue
    const extension = extname(entry.name)
    const path = resolve(entry.parentPath, entry.name)
    const name = relative(root, path).slice(0, -extension.length).split(sep).join('/')
    const content = await readFile(path)
    modules[name] = extension === '.wasm' ? { binary: content.toString('base64') } : content.toString('utf8')
  }
  if (!Object.keys(modules).length) throw new Error(`No .js or .wasm modules found in ${directory}`)
  return modules
}

function modulePath(directory, name, extension) {
  const parts = name.split('/')
  if (name.includes('\\') || parts.some(part => !part || part === '.' || part === '..')) {
    throw new Error(`Invalid module name "${name}"`)
  }
  const root = resolve(directory)
  const path = resolve(root, `${name}${extension}`)
  if (path !== root && !path.startsWith(`${root}${sep}`)) throw new Error(`Invalid module name "${name}"`)
  return path
}

export async function writeModules(directory, modules) {
  await mkdir(directory, { recursive: true })
  const written = []
  for (const [name, content] of Object.entries(modules || {})) {
    const binary = content && typeof content === 'object' && typeof content.binary === 'string'
    const path = modulePath(directory, name, binary ? '.wasm' : '.js')
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, binary ? Buffer.from(content.binary, 'base64') : String(content))
    written.push(path)
  }
  return written
}

function sameModule(left, right) {
  if (typeof left === 'string' || typeof right === 'string') return left === right
  return left?.binary === right?.binary
}

export function compareModules(local, remote) {
  const names = [...new Set([...Object.keys(local || {}), ...Object.keys(remote || {})])].sort()
  const result = { added: [], changed: [], removed: [], unchanged: [] }
  for (const name of names) {
    if (!(name in (remote || {}))) result.added.push(name)
    else if (!(name in (local || {}))) result.removed.push(name)
    else if (sameModule(local[name], remote[name])) result.unchanged.push(name)
    else result.changed.push(name)
  }
  return result
}
