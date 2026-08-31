import { describe, expect, it } from 'vitest'
import { registerBootWorkspaces } from '../src/profile-boot.ts'

/** A workspaceRegistry double recording every create call, in call order. */
function registryDouble(overrides: Partial<{ create: (path: string) => Promise<unknown> }> = {}) {
  const created: string[] = []
  return {
    created,
    registry: {
      async create(path: string) {
        created.push(path)
        return await overrides.create?.(path) ?? { path }
      },
    },
  }
}

describe('registerBootWorkspaces', () => {
  it('creates a workspace for each --workspace path in argv order', async () => {
    const { created, registry } = registryDouble()
    await registerBootWorkspaces(
      { get: () => registry } as unknown as Parameters<typeof registerBootWorkspaces>[0],
      ['E:/a', 'E:/b'],
    )
    expect(created).toEqual(['E:/a', 'E:/b'])
  })

  it('is a no-op without --workspace paths', async () => {
    const { created, registry } = registryDouble()
    await registerBootWorkspaces(
      { get: () => registry } as unknown as Parameters<typeof registerBootWorkspaces>[0],
      [],
    )
    expect(created).toEqual([])
  })

  it('fails loud when the booted composition mounts no workspace registry', async () => {
    await expect(registerBootWorkspaces(
      { get: () => undefined } as unknown as Parameters<typeof registerBootWorkspaces>[0],
      ['E:/a'],
    )).rejects.toThrow(/workspace/)
  })
})
