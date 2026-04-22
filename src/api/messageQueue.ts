import api from './client'

export interface QueuedMessage {
  id: string
  body: string
  queued_at: string
  source: string
  max_age_hours: number
  context_at_queue: { current_work?: string; active_plan?: string } | null
  promoted_at: string | null
  delivered_at: string | null
  cancelled_at: string | null
}

export async function listPending(): Promise<QueuedMessage[]> {
  const { data } = await api.get<QueuedMessage[]>('/message-queue')
  return data
}

export async function getById(id: string): Promise<QueuedMessage> {
  const { data } = await api.get<QueuedMessage>(`/message-queue/${id}`)
  return data
}

export async function updateMessage(
  id: string,
  patch: { body?: string; max_age_hours?: number },
): Promise<QueuedMessage> {
  const { data } = await api.patch<QueuedMessage>(`/message-queue/${id}`, patch)
  return data
}

export async function cancelMessage(id: string): Promise<void> {
  await api.delete(`/message-queue/${id}`)
}

export async function promoteMessage(id: string): Promise<void> {
  await api.post(`/message-queue/${id}/promote`)
}
