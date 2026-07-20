import { glob, lstat, mkdir, readFile, realpath, unlink, writeFile } from 'node:fs/promises'
import { dirname, extname, relative, resolve, sep } from 'node:path'

export function parseValue(value) {
  if (value === undefined) return undefined
  try { return JSON.parse(value) } catch { return value }
}

export async function readModules(directory) {
  const root = resolve(directory)
  const modules = {}
  const origins = new Map()

  for (const { extension, name, path, symbolicLink } of await moduleFiles(root)) {
    if (symbolicLink) throw new Error(`Module file ${path} is a symbolic link.`)
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
  const paths = new Set()
  for await (const entry of glob('{**/*,**/.*,**/.*/**/*}.{js,wasm}', { cwd: root, withFileTypes: true })) {
    if (!entry.isFile() && !entry.isSymbolicLink()) continue
    const extension = extname(entry.name)
    const path = resolve(entry.parentPath, entry.name)
    const name = relative(root, path).slice(0, -extension.length).split(sep).join('/')
    if (!paths.has(path)) {
      paths.add(path)
      files.push({ extension, name, path, symbolicLink: entry.isSymbolicLink() })
    }
  }
  return files.toSorted((left, right) => left.path.localeCompare(right.path))
}

function validateModuleName(name) {
  const parts = name.split('/')
  if (name.startsWith('.') || name.startsWith('$')) {
    throw new Error(`Invalid module name "${name}". Module names cannot begin with . or $.`)
  }
  if (name.includes('\\') || parts.some(part => !part || part === '.' || part === '..')) {
    throw new Error(`Invalid module name "${name}".`)
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
  const requested = []
  for (const [name, content] of Object.entries(modules || {}).sort(([left], [right]) => left.localeCompare(right))) {
    const binary = content && typeof content === 'object' && typeof content.binary === 'string'
    if (typeof content !== 'string' && !binary) throw new Error(`Module "${name}" has invalid content.`)
    validateModuleName(name)
    requested.push({ binary, content, name })
  }

  await mkdir(directory, { recursive: true })
  const root = await realpath(directory)
  const planned = requested.map(module => ({
    ...module,
    path: modulePath(root, module.name, module.binary ? '.wasm' : '.js')
  }))
  const existing = await moduleFiles(root)
  const linked = existing.find(file => file.symbolicLink)
  if (linked) throw new Error(`Module file ${linked.path} is a symbolic link.`)
  for (const module of planned) {
    await ensureDirectory(root, dirname(module.path))
    await assertWritableModule(module.path)
  }
  if (prune) {
    const expected = new Set(planned.map(module => module.path))
    for (const file of existing) {
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

async function ensureDirectory(root, directory) {
  let current = root
  for (const part of relative(root, directory).split(sep).filter(Boolean)) {
    current = resolve(current, part)
    try {
      const entry = await lstat(current)
      if (entry.isSymbolicLink() || !entry.isDirectory()) {
        throw new Error(`Module directory ${current} is not a real directory.`)
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      await mkdir(current)
    }
  }
}

async function assertWritableModule(path) {
  try {
    const entry = await lstat(path)
    if (entry.isSymbolicLink() || !entry.isFile()) throw new Error(`Module file ${path} is not a regular file.`)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
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
