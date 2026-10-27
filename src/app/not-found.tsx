import Link from "next/link"

export default function NotFound() {
  return (
    <div className="flex flex-col items-start gap-3 py-10">
      <h1 className="text-2xl font-semibold">Not in the book</h1>
      <p className="text-sm text-muted-foreground">That voice, call, or ticker is not stored.</p>
      <Link href="/" className="text-sm text-phosphor hover:underline">
        Back to the tape
      </Link>
    </div>
  )
}
