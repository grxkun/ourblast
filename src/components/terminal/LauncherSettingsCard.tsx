import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { LAUNCHPADS, resolveLaunchpad } from "@/lib/terminal/launchpad";
import { DEFAULT_LAUNCHER_SETTINGS } from "@/lib/terminal/xLauncher";
import { getLauncherSettings, saveLauncherSettings } from "@/lib/terminal/xLauncher.functions";

/** The four launcher settings an operator can change. Nothing else. */
export function LauncherSettingsCard() {
  const queryClient = useQueryClient();
  const read = useServerFn(getLauncherSettings);
  const write = useServerFn(saveLauncherSettings);
  const [form, setForm] = useState(DEFAULT_LAUNCHER_SETTINGS);

  const settings = useQuery({ queryKey: ["launcher-settings"], queryFn: () => read({}) });
  useEffect(() => {
    if (settings.data) setForm(settings.data);
  }, [settings.data]);

  const save = useMutation({
    mutationFn: async () => write({ data: form }),
    onSuccess: (result) => {
      setForm(result);
      void queryClient.invalidateQueries({ queryKey: ["launcher-settings"] });
      toast.success("Launcher settings saved");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const pad = resolveLaunchpad(form.defaultLaunchpad);

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide">X launcher</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="default-pad">Default launchpad</Label>
          <select
            id="default-pad"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={pad.id}
            onChange={(event) => setForm({ ...form, defaultLaunchpad: event.target.value })}
          >
            {LAUNCHPADS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
                {option.integrated ? "" : " — not ready yet"}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="fee">OurBlast fee (% of creator fee)</Label>
          <Input
            id="fee"
            type="number"
            min={0}
            max={50}
            step={1}
            value={form.ourblastFeePercent}
            onChange={(event) => setForm({ ...form, ourblastFeePercent: Number(event.target.value) })}
          />
        </div>
        <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2">
          <Label htmlFor="devbuy" className="text-sm">Developer buy</Label>
          <Switch id="devbuy" checked={form.devBuyEnabled} onCheckedChange={(value) => setForm({ ...form, devBuyEnabled: value })} />
        </div>
        <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2">
          <Label htmlFor="auto" className="text-sm">Automatic launch</Label>
          <Switch
            id="auto"
            checked={form.autoLaunchEnabled}
            disabled={!pad.integrated}
            onCheckedChange={(value) => setForm({ ...form, autoLaunchEnabled: value })}
          />
        </div>
      </div>
      {pad.integrated ? null : (
        <p className="mt-3 text-xs text-muted-foreground">
          Automatic launch stays off until {pad.label} launching is verified.
        </p>
      )}
      <Button className="mt-4" size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
        Save settings
      </Button>
    </section>
  );
}
