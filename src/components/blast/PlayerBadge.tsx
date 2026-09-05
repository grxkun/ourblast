import { avatarFromAddress, shortAddress } from "@/lib/blast";
import { cn } from "@/lib/utils";

export function PlayerAvatar({
  address,
  size = 40,
  className,
}: {
  address: string;
  size?: number;
  className?: string;
}) {
  const { emoji, from, to } = avatarFromAddress(address || "0x0");
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border border-border",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.5,
        backgroundImage: `linear-gradient(135deg, ${from}, ${to})`,
      }}
      aria-hidden="true"
    >
      {emoji}
    </span>
  );
}

export function PlayerName({
  address,
  nickname,
  className,
}: {
  address: string;
  nickname?: string | null;
  className?: string;
}) {
  return (
    <span className={cn("font-body font-semibold", className)}>
      {nickname?.trim() ? nickname : shortAddress(address)}
    </span>
  );
}
