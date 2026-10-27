import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

export function VoiceAvatar({
  src,
  username,
  className,
}: {
  src?: string | null
  username: string
  className?: string
}) {
  return (
    <Avatar className={className ?? "size-9"}>
      <AvatarImage src={src || `/avatars/${username}`} alt="" />
      <AvatarFallback>{username.slice(0, 2).toUpperCase()}</AvatarFallback>
    </Avatar>
  )
}
