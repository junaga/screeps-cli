import packageInfo from '../package.json' with { type: 'json' }
import docsManifest from '../docs/manifest.json' with { type: 'json' }

export const CLI_VERSION = packageInfo.version
export const GAME_PROTOCOL = 14
export const DOCS_SITE = 'https://docs.screeps.com/'
export const DOCS_REPOSITORY = 'https://github.com/screeps/docs.git'
export const DOCS_REVISION = docsManifest.revision
export const DOCS_BUILT_AT = docsManifest.builtAt

export function formatVersion() {
  return [
    `CLI:      screeps ${CLI_VERSION}`,
    `Game:     Screeps protocol ${GAME_PROTOCOL}`,
    `Docs:     screeps/docs ${DOCS_REVISION.slice(0, 7)} (built ${DOCS_BUILT_AT})`
  ].join('\n')
}
