import api from './client'

export interface TranscriptSegment {
  speaker: string | null
  start_ms: number
  end_ms: number
  text: string
}

export interface TranscriptData {
  full_text: string
  engine: 'whisper' | 'deepgram'
  diarised: boolean
  segments: TranscriptSegment[]
  paragraphs: TranscriptSegment[]
}

export interface Meeting {
  id: string
  title: string | null
  started_at: string
  ended_at: string | null
  duration_seconds: number | null
  audio_size_bytes: number | null
  transcription_status: 'pending' | 'processing' | 'done' | 'error' | 'uploaded_awaiting_transcription'
  transcription_error: string | null
  transcript_text: string | null
  transcript_json: TranscriptData | null
  speaker_names: Record<string, string>
  transcript_diarised: boolean
  transcript_engine: 'whisper' | 'deepgram' | null
  client_id: string | null
  client_name: string | null
  created_at: string
  audio_signed_url?: string | null
}

export async function listMeetings(limit = 20, offset = 0) {
  const res = await api.get<{ meetings: Meeting[]; total: number }>('/meetings', {
    params: { limit, offset },
  })
  return res.data
}

export async function getMeeting(id: string) {
  const res = await api.get<Meeting>(`/meetings/${id}`)
  return res.data
}

export async function createMeeting(opts?: { title?: string; client_id?: string; project_id?: string }) {
  const res = await api.post<{ id: string; started_at: string }>('/meetings', opts || {})
  return res.data
}

export async function uploadChunk(meetingId: string, chunkIndex: number, blob: Blob) {
  const form = new FormData()
  form.append('chunk', blob, `${chunkIndex}.webm`)
  form.append('chunkIndex', String(chunkIndex))
  const res = await api.post<{ ok: boolean; chunkIndex: number; stored: boolean }>(
    `/meetings/${meetingId}/chunk`,
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
  return res.data
}

export async function stopMeeting(meetingId: string, durationSeconds?: number) {
  const res = await api.post<{ ok: boolean; transcription_status: string; idempotent?: boolean }>(
    `/meetings/${meetingId}/stop`,
    { duration_seconds: durationSeconds },
  )
  return res.data
}

export async function retranscribeMeeting(meetingId: string) {
  const res = await api.post<{ transcript_text: string; transcript_json: TranscriptData; transcript_revised_at: string }>(
    `/meetings/${meetingId}/retranscribe`,
  )
  return res.data
}

export async function updateSpeakers(meetingId: string, speakers: Record<string, string>) {
  const res = await api.patch<{ speaker_names: Record<string, string> }>(
    `/meetings/${meetingId}/speakers`,
    { speakers },
  )
  return res.data
}

export async function updateTranscript(meetingId: string, transcriptText: string) {
  const res = await api.patch<{ transcript_text: string }>(
    `/meetings/${meetingId}/transcript`,
    { transcript_text: transcriptText },
  )
  return res.data
}

export async function updateMeeting(meetingId: string, opts: { title?: string }) {
  const res = await api.patch<Meeting>(`/meetings/${meetingId}`, opts)
  return res.data
}

export async function deleteMeeting(meetingId: string) {
  await api.delete(`/meetings/${meetingId}`)
}

export function getExportUrl(meetingId: string, format: 'md' | 'txt' = 'md') {
  const base = (import.meta.env.VITE_API_URL || '/api')
  return `${base}/meetings/${meetingId}/export?format=${format}`
}
