import { useState } from "react";

import { avatarFromAddress, shortAddress } from "@/lib/blast";
import { cn } from "@/lib/utils";

export function PlayerAvatar({
  address,
  avatarUrl,
  size = 40,
  className,
}: {
  address: string;
  avatarUrl?: string | null | undefined;
  size?: number;
  className?: string;
}) {
  const [broken, setBroken] = useState<string | null>(null);
  const { emoji, from, to } = avatarFromAddress(address || "0x0");
  const showImage = Boolean(avatarUrl) && broken !== avatarUrl;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border",
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
      {showImage ? (
        <img
          src={avatarUrl!}
          alt=""
          className="size-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setBroken(avatarUrl ?? null)}
        />
      ) : (
        emoji
      )}
    </span>
  );
}

export function PlayerName({
  address,
  nickname,
  className,
}: {
  address: string;
  nickname?: string | null | undefined;
  className?: string;
}) {
  return (
    <span className={cn("font-body font-semibold", className)}>
      {nickname?.trim() ? nickname : shortAddress(address)}
    </span>
  );
}
