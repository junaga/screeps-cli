import { glob, mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname, extname, relative, resolve, sep } from 'node:path'

export function parseValue(value) {
  if (value === undefined) return undefined
  try { return JSON.parse(value) } catch { return value }
}

export async function readModules(directory) {
  const root = resolve(directory)
  const modules = {}
  const origins = new Map()

  for (const { extension, name, path } of await moduleFiles(root)) {
    validateModuleName(name)
    if (origins.has(name)) {
      throw new Error(`Module "${name}" exists in both ${origins.get(name)} and ${path}. Choose .js or .wasm.`)
    }
    const content = await readFile(path)
    modules[name] = extension === '.wasm' ? { binary: content.toString('base64') } : content.toString('utf8')
    origins.set(name, path)
  }
  if (!Object.keys(modules).length) throw new Error(`No .js or .wasm modules found in ${directory}`)
  return modules
}

async function moduleFiles(root) {
  const files = []
  for await (const entry of glob('{**/*,**/.*,**/.*/**/*}.{js,wasm}', { cwd: root, withFileTypes: true })) {
    if (!entry.isFile()) continue
    const extension = extname(entry.name)
    const path = resolve(entry.parentPath, entry.name)
    const name = relative(root, path).slice(0, -extension.length).split(sep).join('/')
    if (!files.some(file => file.path === path)) files.push({ extension, name, path })
  }
  return files.toSorted((left, right) => left.path.localeCompare(right.path))
}

function validateModuleName(name) {
  const parts = name.split('/')
  if (name.startsWith('.') || name.startsWith('$') || name.includes('\\') ||
      parts.some(part => !part || part === '.' || part === '..')) {
    throw new Error(`Invalid module name "${name}". Module names cannot begin with . or $.`)
  }
}

function modulePath(directory, name, extension) {
  validateModuleName(name)
  const root = resolve(directory)
  const path = resolve(root, `${name}${extension}`)
  if (path !== root && !path.startsWith(`${root}${sep}`)) throw new Error(`Invalid module name "${name}"`)
  return path
}

export async function writeModules(directory, modules, { prune = true } = {}) {
  const planned = []
  for (const [name, content] of Object.entries(modules || {}).sort(([left], [right]) => left.localeCompare(right))) {
    const binary = content && typeof content === 'object' && typeof content.binary === 'string'
    if (typeof content !== 'string' && !binary) throw new Error(`Module "${name}" has invalid content.`)
    const path = modulePath(directory, name, binary ? '.wasm' : '.js')
    planned.push({ binary, content, name, path })
  }

  await mkdir(directory, { recursive: true })
  if (prune) {
    const expected = new Set(planned.map(module => module.path))
    for (const file of await moduleFiles(resolve(directory))) {
      if (!expected.has(file.path)) await unlink(file.path)
    }
  }

  const written = []
  for (const { binary, content, path } of planned) {
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
