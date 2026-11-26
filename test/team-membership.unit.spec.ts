import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync('.github/workflows/process-token-issue.yml', 'utf8')
const gate = workflow.split('        id: gate\n')[1].split('\n      - name:')[0]
const script = gate.split('          script: |\n')[1]
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor

function runGate(memberships: Record<string, string | number>) {
  const calls: string[] = []
  const outputs: Record<string, string> = {}
  const reactions: string[] = []
  const github = {
    rest: {
      teams: {
        getMembershipForUserInOrg: async ({ team_slug }: { team_slug: string }) => {
          calls.push(team_slug)
          const state = memberships[team_slug] ?? 404
          if (typeof state === 'number')
            throw Object.assign(new Error('API failure'), { status: state })
          return { data: { state } }
        },
      },
      reactions: {
        createForIssueComment: async ({ content }: { content: string }) => reactions.push(content),
      },
    },
  }
  const context = {
    repo: { owner: 'lifinance', repo: 'customized-token-list' },
    payload: { comment: { id: 123, user: { login: 'reviewer' } } },
  }
  const core = {
    setOutput: (key: string, value: string) => {
      outputs[key] = value
    },
    info: () => {},
    warning: () => {},
  }
  const execute = () =>
    new AsyncFunction('github', 'context', 'core', script)(github, context, core)
  return { calls, outputs, reactions, execute }
}

describe('token issue team gate', () => {
  it('executes the workflow membership gate', () => {
    expect(script).toBeDefined()
  })

  it.each(['fullstack', 'contributors', 'techsupport', 'tech-support'])(
    'authorizes an active member of %s',
    async (team) => {
      const gate = runGate({ [team]: 'active' })
      await gate.execute()
      expect(gate.outputs.authorized).toBe('true')
      expect(gate.reactions).toEqual([])
    }
  )

  it('does not authorize pending membership', async () => {
    const gate = runGate({ fullstack: 'pending' })
    await gate.execute()
    expect(gate.outputs.authorized).toBe('false')
    expect(gate.reactions).toEqual(['-1'])
  })

  it('continues past absent old slugs after the rename', async () => {
    const gate = runGate({ 'tech-support': 'active' })
    await gate.execute()
    expect(gate.outputs.authorized).toBe('true')
    expect(gate.calls).toEqual(['fullstack', 'contributors', 'techsupport', 'tech-support'])
  })

  it('rejects non-members without failing the workflow', async () => {
    const gate = runGate({})
    await gate.execute()
    expect(gate.outputs.authorized).toBe('false')
    expect(gate.reactions).toEqual(['-1'])
  })

  it.each([401, 403, 429, 500])('fails closed on API status %s', async (status) => {
    const gate = runGate({ fullstack: status, contributors: 'active' })
    await expect(gate.execute()).rejects.toThrow('API failure')
    expect(gate.outputs.authorized).toBe('false')
    expect(gate.calls).toEqual(['fullstack'])
    expect(gate.reactions).toEqual([])
  })
})
