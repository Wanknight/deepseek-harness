/**
 * Cross-copy Remote marker fixture: a class decorated through the BUILT
 * protocol copy (lib/index.js, what a profile-installed third-party package
 * resolves to) while markers are read through the SOURCE copy (src/index.ts,
 * what a source-checkout host runs) — the two-module-instances situation of
 * discussion #5146.
 */

// The typed cordis Context resolves through tsconfig paths to source; the
// throwaway ctx is never inspected.
import { Context } from '@deepseek-ai/cordis'
// The built protocol copy: an ordinary relative file URL, never remapped by
// tsconfig paths (its untyped JS exports must stay BELOW the typed imports so
// they cannot pollute their inference).
// @ts-expect-error the built copy is plain JS with no declarations, on purpose —
// the whole point is running the artifact a profile-installed package would load.
import { TypertRemoteService, Remote } from '../../lib/index.js'
// The source protocol copy: the module the workspace host itself runs.
import { remoteMethods } from '../../src/index.ts'

class CapabilityPolicy extends TypertRemoteService {
  constructor(ctx: Context) {
    super(ctx, 'capabilityPolicyGateway')
  }

  @Remote
  classifyAll(value: string): string {
    return value
  }
}

const instance = new CapabilityPolicy(new Context())
const methods = remoteMethods(instance)
process.stdout.write(JSON.stringify(methods))
