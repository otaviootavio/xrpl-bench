import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'xrpl'
import { resetXrplClientFactory, resetXrplClients, setXrplClientFactory } from '../client'
import { destinationInfoQueryOptions } from '../query-reads'

/**
 * A token sent back to its own issuer is redeemed: the issuer holds no trust
 * line to itself and needs none. The destination check must not warn
 * "Recipient can't hold this token" for it, nor read its lines to decide.
 */

const ISSUER = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'
const HOLDER = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh'
const ASSET = `USD|${ISSUER}`

function installClient(lines: unknown[] = []) {
  const commands: string[] = []
  setXrplClientFactory(
    () =>
      ({
        connect: async () => {},
        isConnected: () => true,
        disconnect: async () => {},
        request: async (req: { command: string }) => {
          commands.push(req.command)
          switch (req.command) {
            case 'server_info':
              return { result: { info: {} } }
            case 'account_info':
              return { result: { account_data: { Balance: '100000000', OwnerCount: 0, Sequence: 1, Flags: 0 } } }
            case 'account_lines':
              return { result: { lines } }
            default:
              throw new Error(`unexpected ${req.command}`)
          }
        },
      }) as unknown as Client,
  )
  return commands
}

beforeEach(() => resetXrplClients())
afterEach(() => {
  resetXrplClients()
  resetXrplClientFactory()
})

describe('destinationInfoQueryOptions and a token sent to its issuer', () => {
  it('answers hasTrustLine true for the issuer without reading its lines', async () => {
    const commands = installClient()
    const info = await destinationInfoQueryOptions('testnet', ISSUER, ASSET).queryFn()
    expect(info).toMatchObject({ exists: true, hasTrustLine: true })
    expect(commands).toContain('account_info')
    expect(commands).not.toContain('account_lines')
  })

  it('still reads the lines of any other destination, and reports a missing line', async () => {
    const commands = installClient([])
    const info = await destinationInfoQueryOptions('testnet', HOLDER, ASSET).queryFn()
    expect(info.hasTrustLine).toBe(false)
    expect(commands).toContain('account_lines')
  })
})
