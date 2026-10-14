import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { getXConnectionStatus } from "@/lib/terminal/x-oauth.functions";

const MAX_SIDE = 192;

/** Crops to a centred square, shrinks to MAX_SIDE px and returns a compact JPEG data URL. */
async function shrinkImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not read that image"));
      el.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = MAX_SIDE;
    canvas.height = MAX_SIDE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not process image");
    ctx.drawImage(
      img,
      (img.naturalWidth - side) / 2,
      (img.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      MAX_SIDE,
      MAX_SIDE,
    );
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function AvatarEditor({
  userId,
  hasAvatar,
  onSaved,
}: {
  userId: string;
  hasAvatar: boolean;
  onSaved: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const xStatusFn = useServerFn(getXConnectionStatus);
  const xStatus = useQuery({
    queryKey: ["x-connection", userId],
    queryFn: () => xStatusFn(),
    staleTime: 60_000,
  });
  const xAvatar = xStatus.data?.account?.avatarUrl?.replace("_normal.", "_400x400.");

  const save = async (value: string | null, message: string) => {
    setBusy(true);
    const { error } = await supabase.from("profiles").update({ avatar_url: value }).eq("id", userId);
    setBusy(false);
    if (error) toast.error("Could not update your picture");
    else {
      toast.success(message);
      onSaved();
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Pick an image file");
    if (file.size > 15 * 1024 * 1024) return toast.error("That image is too large (max 15 MB)");
    try {
      setBusy(true);
      const dataUrl = await shrinkImage(file);
      await save(dataUrl, "Profile picture updated");
    } catch (e) {
      setBusy(false);
      toast.error(e instanceof Error ? e.message : "Could not use that image");
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="rounded-full border-2 border-border bg-primary px-3 py-1.5 font-body text-xs font-bold uppercase text-primary-foreground disabled:opacity-60"
      >
        {busy ? "Saving…" : "Upload photo"}
      </button>
      {xAvatar ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void save(xAvatar, "Using your X picture")}
          className="rounded-full border-2 border-border px-3 py-1.5 font-body text-xs font-bold uppercase disabled:opacity-60"
        >
          Use X picture
        </button>
      ) : null}
      {hasAvatar ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void save(null, "Back to your arcade emoji")}
          className="rounded-full border-2 border-border px-3 py-1.5 font-body text-xs font-bold uppercase text-muted-foreground disabled:opacity-60"
        >
          Use emoji
        </button>
      ) : null}
    </div>
  );
}
