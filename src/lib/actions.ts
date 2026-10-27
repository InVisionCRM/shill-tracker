"use server"

import { revalidatePath } from "next/cache"
import { addInfluencer, untrackInfluencer } from "./ingest"

export type ActionState = { error?: string; ok?: boolean; username?: string } | null

export async function trackVoice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const username = String(formData.get("username") ?? "")
  const name = String(formData.get("name") ?? "")
  const result = await addInfluencer({ username, name: name || null })
  if ("error" in result && result.error) return { error: result.error }
  if (!("influencer" in result)) return { error: "could not track that handle" }
  revalidatePath("/")
  revalidatePath("/influencers")
  revalidatePath("/leaderboard")
  revalidatePath("/feed")
  return { ok: true, username: result.influencer.username }
}

export async function stopTracking(username: string): Promise<ActionState> {
  const result = await untrackInfluencer(username)
  if ("error" in result) return { error: result.error }
  revalidatePath("/")
  revalidatePath("/influencers")
  revalidatePath("/leaderboard")
  revalidatePath(`/influencers/${username}`)
  return { ok: true, username }
}
