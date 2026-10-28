"use client"

import { useActionState, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { stopTracking, trackVoice, type ActionState } from "@/lib/actions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

export function TrackVoiceDialog({ defaultOpen = false }: { defaultOpen?: boolean } = {}) {
  const router = useRouter()
  const [open, setOpen] = useState(defaultOpen)
  const [state, action, pending] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await trackVoice(prev, formData)
      if (result?.ok && result.username) {
        toast.success(`Tracking @${result.username}`)
        setOpen(false)
        router.push(`/influencers/${result.username}`)
      }
      return result
    },
    null,
  )
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>Track a voice</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Track an X account</DialogTitle>
          <DialogDescription>
            The handle is stored for your ingest bot. Posts arrive when the bot POSTs them. Nothing is fetched from X
            by this app.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="username">Handle</FieldLabel>
              <Input id="username" name="username" placeholder="macro_moon" required autoComplete="off" />
              <FieldDescription>Letters, numbers, underscore. The @ is optional.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="name">Display name</FieldLabel>
              <Input id="name" name="name" placeholder="Optional, until the first ingest" />
            </Field>
          </FieldGroup>
          {state?.error ? <p className="text-sm text-loss">{state.error}</p> : null}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Track"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function UntrackButton({ username, defaultOpen = false }: { username: string; defaultOpen?: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(defaultOpen)
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant="outline" />}>Stop tracking</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Stop tracking @{username}?</AlertDialogTitle>
          <AlertDialogDescription>
            The archive stays. The bot will no longer see this handle on GET /api/influencers.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Keep
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => {
              start(async () => {
                const result = await stopTracking(username)
                if (result?.error) {
                  toast.error(result.error)
                  return
                }
                toast.success(`Untracked @${username}`)
                setOpen(false)
                router.push("/influencers")
              })
            }}
          >
            Stop tracking
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
