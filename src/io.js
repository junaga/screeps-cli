import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, extname, relative, resolve, sep } from 'node:path'

export function parseValue(value) {
  if (value === undefined) return undefined
  try { return JSON.parse(value) } catch { return value }
}

export async function readModules(directory) {
  const root = resolve(directory)
  const modules = {}

  async function visit(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const entryPath = resolve(path, entry.name)
      if (entry.isDirectory()) {
        await visit(entryPath)
        continue
      }
      const extension = extname(entry.name)
      if (!entry.isFile() || !['.js', '.wasm'].includes(extension)) continue
      const name = relative(root, entryPath).slice(0, -extension.length).split(sep).join('/')
      const content = await readFile(entryPath)
      modules[name] = extension === '.wasm' ? { binary: content.toString('base64') } : content.toString('utf8')
    }
  }

  await visit(root)
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
