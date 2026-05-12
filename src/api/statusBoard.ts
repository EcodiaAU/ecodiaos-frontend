/**
 * statusBoard API - CRUD operations for status_board rows.
 *
 * Origin: fork_mp1ym10n_303c2a, 2026-05-12 - FE inline-edit feature
 */
import api from './client'

export interface StatusRow {
  id: string
  entity_type: string
  entity_ref: string | null
  name: string
  status: string | null
  next_action: string | null
  next_action_by: string | null
  next_action_due: string | null
  priority: number | null
  archived_at: string | null
  last_touched: string | null
  context: string | null
  created_at: string | null
  updated_at: string | null
}

export type NextActionBy = 'ecodiaos' | 'tate' | 'client' | 'external'
export type EntityType =
  | 'client' | 'project' | 'thread' | 'task'
  | 'opportunity' | 'personal' | 'legal' | 'infrastructure'

export interface ListParams {
  priority?: string        // e.g. "1,2"
  next_action_by?: string  // e.g. "tate,ecodiaos"
  entity_type?: string     // e.g. "client,project"
  search?: string
  include_archived?: boolean
  limit?: number
}

export interface CreatePayload {
  entity_type?: EntityType
  entity_ref?: string
  name: string
  status?: string
  next_action?: string
  next_action_by?: NextActionBy
  next_action_due?: string | null
  priority?: number
  context?: string
}

export interface UpdatePayload {
  status?: string
  next_action?: string
  next_action_by?: NextActionBy
  next_action_due?: string | null
  priority?: number
  context?: string
  name?: string
  entity_type?: EntityType
}

export async function listRows(params: ListParams = {}): Promise<StatusRow[]> {
  const q: Record<string, string> = {}
  if (params.priority) q.priority = params.priority
  if (params.next_action_by) q.next_action_by = params.next_action_by
  if (params.entity_type) q.entity_type = params.entity_type
  if (params.search) q.search = params.search
  if (params.include_archived) q.include_archived = 'true'
  if (params.limit) q.limit = String(params.limit)

  const res = await api.get('/status-board', { params: q })
  const data = res.data
  return Array.isArray(data) ? data : (data?.rows ?? [])
}

export async function createRow(payload: CreatePayload): Promise<StatusRow> {
  const res = await api.post('/status-board', payload)
  return res.data.row
}

export async function updateRow(id: string, payload: UpdatePayload): Promise<StatusRow> {
  const res = await api.patch(`/status-board/${id}`, payload)
  return res.data.row
}

export async function archiveRow(id: string): Promise<StatusRow> {
  const res = await api.post(`/status-board/${id}/archive`)
  return res.data.row
}

export async function unarchiveRow(id: string): Promise<StatusRow> {
  const res = await api.post(`/status-board/${id}/unarchive`)
  return res.data.row
}

export async function bulkArchive(ids: string[]): Promise<{ archived: string[]; count: number }> {
  const res = await api.post('/status-board/bulk-archive', { ids })
  return res.data
}

export async function bulkPriority(ids: string[], priority: number): Promise<{ updated: string[]; count: number }> {
  const res = await api.post('/status-board/bulk-priority', { ids, priority })
  return res.data
}
