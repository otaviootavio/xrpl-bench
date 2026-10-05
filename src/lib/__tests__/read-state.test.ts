import { describe, expect, it } from 'vitest'
import { readStateOf } from '../read-state'

describe('readStateOf', () => {
  it('reports a read in error as failed, even over a retained earlier answer', () => {
    // The poll case: TanStack keeps `data` across a failed refetch. Reporting
    // it as `ok` is a stale figure presented as current (§12 rule 2).
    expect(readStateOf({ data: '12', isError: true })).toEqual({ status: 'failed' })
    expect(readStateOf({ data: undefined, isError: true })).toEqual({ status: 'failed' })
  })

  it('reports no data and no error as pending, never as failed', () => {
    expect(readStateOf({ data: undefined, isError: false })).toEqual({ status: 'pending' })
    expect(readStateOf({})).toEqual({ status: 'pending' })
  })

  it('treats an empty value as no figure', () => {
    expect(readStateOf({ data: '', isError: false })).toEqual({ status: 'pending' })
  })

  it('reports a successful read with its value', () => {
    expect(readStateOf({ data: '12', isError: false })).toEqual({ status: 'ok', value: '12' })
    // An empty list is a successful read of an empty collection, not a pending one.
    expect(readStateOf({ data: [] as string[] })).toEqual({ status: 'ok', value: [] })
  })
})
