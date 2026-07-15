import * as React from "react";
import { AlertTriangle, BarChart3, ExternalLink, Gauge, Settings2, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import type { UsageMetric, UsageSettings, UsageSnapshot, UsageWarning } from "@/types";

function strongestWarning(usage: UsageSnapshot | null): UsageWarning {
  const ranks: UsageWarning[] = ["safe", "warning", "high", "critical", "stopped", "unconfigured"];
  const warnings = [usage?.gemini?.requests.warning, usage?.gemini?.tokens?.warning, usage?.geminiGrounding?.requests.warning, usage?.googlePlaces?.requests.warning].filter(Boolean) as UsageWarning[];
  return warnings.sort((a, b) => ranks.indexOf(b) - ranks.indexOf(a))[0] || "unconfigured";
}

function UsageRow({ label, metric }: { label: string; metric?: UsageMetric }) {
  if (!metric) return <div className="text-sm text-[#65706f]">{label}: unavailable</div>;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-xs"><span className="font-semibold text-[#4f5a58]">{label}</span><span className="tabular-nums text-[#161616]">{metric.used.toLocaleString()} / {metric.cap?.toLocaleString() || "-"}</span></div>
      <Progress value={metric.percent} warning={metric.warning} />
    </div>
  );
}

function warningCopy(warning: UsageWarning) {
  if (warning === "stopped") return "Local cap reached. Billable actions are stopped.";
  if (warning === "critical") return "At least 95% of a local cap is used.";
  if (warning === "high") return "At least 85% of a local cap is used.";
  if (warning === "warning") return "At least 70% of a local cap is used.";
  if (warning === "safe") return "Local usage protection is active.";
  return "Protection is not configured. Billable actions are disabled.";
}

export function UsageFlyout({ usage, open, onOpenChange, onRefresh, onSaved }: { usage: UsageSnapshot | null; open: boolean; onOpenChange: (open: boolean) => void; onRefresh: () => void; onSaved: (usage: UsageSnapshot) => void }) {
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [values, setValues] = React.useState<UsageSettings>({ geminiDailyRequestCap: 20, geminiDailyTokenCap: 100000, geminiGroundingDailyRequestCap: 100, googlePlacesMonthlyRequestCap: 100 });
  const [error, setError] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const warning = strongestWarning(usage);

  React.useEffect(() => {
    if (settingsOpen && usage?.settings) setValues(usage.settings);
  }, [settingsOpen, usage]);

  async function saveSettings(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const response = await fetch("/api/usage/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not save usage settings.");
      onSaved(result as UsageSnapshot);
      setSettingsOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save usage settings.");
    } finally {
      setSaving(false);
    }
  }

  const WarningIcon = warning === "stopped" || warning === "critical" ? ShieldAlert : warning === "safe" ? ShieldCheck : AlertTriangle;

  return (
    <>
      {open ? <button className="fixed inset-0 z-30 cursor-default" aria-label="Close usage panel" onClick={() => onOpenChange(false)} /> : null}
      {open ? (
        <section className="absolute right-3 top-[58px] z-40 w-[min(380px,calc(100vw-24px))] rounded-[8px] border border-[#bbc6c4] bg-white p-4 shadow-xl" aria-label="Local API usage">
          <div className="flex items-start gap-3 border-b border-[#e0e5e4] pb-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-[6px] bg-[#e8efee]"><WarningIcon className="size-4" /></span><div><h2 className="text-sm font-extrabold">Local usage protection</h2><p className="mt-1 text-xs leading-5 text-[#65706f]">{warningCopy(warning)}</p></div></div>
          <div className="space-y-4 py-4"><UsageRow label="Gemini requests today" metric={usage?.gemini?.requests} /><UsageRow label="Gemini tokens today" metric={usage?.gemini?.tokens} /><UsageRow label="Gemini grounded searches today" metric={usage?.geminiGrounding?.requests} /><UsageRow label="Places searches this month" metric={usage?.googlePlaces?.requests} /></div>
          <div className="grid grid-cols-2 gap-3 border-t border-[#e0e5e4] py-3 text-xs text-[#65706f]"><div><span className="block font-bold text-[#161616]">Gemini reset</span>{usage?.gemini?.resetsAt ? new Date(usage.gemini.resetsAt).toLocaleString() : "Unavailable"}</div><div><span className="block font-bold text-[#161616]">Places reset</span>{usage?.googlePlaces?.resetsAt ? new Date(usage.googlePlaces.resetsAt).toLocaleString() : "Unavailable"}</div></div>
          <p className="mb-3 text-xs leading-5 text-[#65706f]">These are local app counters. Google dashboards are authoritative.</p>
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setSettingsOpen(true)}><Settings2 className="size-3.5" />Settings</Button><Button size="sm" variant="ghost" onClick={onRefresh}><Gauge className="size-3.5" />Refresh</Button><a className="inline-flex h-8 items-center gap-1.5 rounded-[6px] px-2.5 text-xs font-bold text-[#3f5f79] hover:bg-[#e4f0f5]" href="https://aistudio.google.com/usage" target="_blank" rel="noreferrer"><BarChart3 className="size-3.5" />Gemini <ExternalLink className="size-3" /></a><a className="inline-flex h-8 items-center gap-1.5 rounded-[6px] px-2.5 text-xs font-bold text-[#3f5f79] hover:bg-[#e4f0f5]" href="https://console.cloud.google.com/billing" target="_blank" rel="noreferrer">Cloud <ExternalLink className="size-3" /></a></div>
        </section>
      ) : null}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen} title="Usage protection settings" description="Set positive local caps. Counters reset automatically at their period boundary.">
        <form className="space-y-4 p-5" onSubmit={saveSettings}>
          <label className="block space-y-1.5 text-xs font-bold text-[#53605e]">Gemini daily request cap<Input type="number" min="1" required value={values.geminiDailyRequestCap} onChange={(e) => setValues({ ...values, geminiDailyRequestCap: Number(e.target.value) })} /></label>
          <label className="block space-y-1.5 text-xs font-bold text-[#53605e]">Gemini daily token cap<Input type="number" min="1" required value={values.geminiDailyTokenCap} onChange={(e) => setValues({ ...values, geminiDailyTokenCap: Number(e.target.value) })} /></label>
          <label className="block space-y-1.5 text-xs font-bold text-[#53605e]">Gemini grounding daily request cap<Input type="number" min="1" required value={values.geminiGroundingDailyRequestCap ?? ""} onChange={(e) => setValues({ ...values, geminiGroundingDailyRequestCap: Number(e.target.value) })} /></label>
          <label className="block space-y-1.5 text-xs font-bold text-[#53605e]">Google Places monthly request cap<Input type="number" min="1" required value={values.googlePlacesMonthlyRequestCap} onChange={(e) => setValues({ ...values, googlePlacesMonthlyRequestCap: Number(e.target.value) })} /></label>
          {error ? <p className="rounded-[6px] bg-[#f4ccdc] p-3 text-sm font-semibold text-[#6b3147]" role="alert">{error}</p> : null}
          <div className="flex justify-end gap-2 border-t border-[#e0e5e4] pt-4"><Button variant="ghost" onClick={() => setSettingsOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save caps"}</Button></div>
        </form>
      </Dialog>
    </>
  );
}
