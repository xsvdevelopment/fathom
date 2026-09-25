import { ArrowDown, ArrowLeft, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { KIND_LABEL } from "@shared/kinds";
import { expandTemplate, matchRule } from "@shared/rules";
import { KINDS, type Kind, type Rule, type RuleWhen } from "@shared/types";
import { TitleBar } from "@/components/fathom/titlebar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { formatCount, plural } from "@/lib/utils";
import { useApp } from "@/store/app";

const MB = 1024 * 1024;

function describe(w: RuleWhen): string {
  const parts: string[] = [];
  if (w.nameContains) parts.push(`name contains “${w.nameContains}”`);
  if (w.glob) parts.push(`name matches ${w.glob}`);
  if (w.exts?.length) parts.push(`extension is ${w.exts.join(", ")}`);
  if (w.pathContains) parts.push(`path contains “${w.pathContains}”`);
  if (w.kind) parts.push(`is ${KIND_LABEL[w.kind].toLowerCase()}`);
  if (w.minBytes != null) parts.push(`at least ${w.minBytes / MB} MB`);
  if (w.maxBytes != null) parts.push(`at most ${w.maxBytes / MB} MB`);
  if (w.olderThanDays != null) parts.push(`older than ${w.olderThanDays} days`);
  if (w.newerThanDays != null) parts.push(`from the last ${w.newerThanDays} days`);
  return parts.join(" and ") || "no conditions yet";
}

const csv = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

export function RulesScreen() {
  const settings = useApp((s) => s.settings)!;
  const save = useApp((s) => s.saveSettings);
  const goto = useApp((s) => s.goto);
  const items = useApp((s) => s.items);
  const hasPlan = items.length > 0;
  const [editing, setEditing] = useState<Rule | null>(null);
  const rules = settings.rules;

  const setRules = (next: Rule[]) => void save({ rules: next });
  const move = (i: number, d: -1 | 1) => {
    const next = [...rules];
    const [r] = next.splice(i, 1);
    next.splice(i + d, 0, r!);
    setRules(next);
  };
  const upsert = (r: Rule) => {
    setRules(rules.some((x) => x.id === r.id) ? rules.map((x) => (x.id === r.id ? r : x)) : [...rules, r]);
    setEditing(null);
  };

  return (
    <div className="flex h-full flex-col">
      <TitleBar onHome={() => goto(hasPlan ? "studio" : "home")} />
      <main className="mx-auto flex w-full max-w-4xl min-h-0 flex-1 flex-col overflow-y-auto px-8 pb-10">
        <div className="py-6">
          <Button variant="ghost" size="sm" className="-ml-3 mb-2" onClick={() => goto(hasPlan ? "studio" : "home")}>
            <ArrowLeft />
            {hasPlan ? "Back to the plan" : "Back"}
          </Button>
          <h1 className="font-serif text-4xl tracking-tight">Rules &amp; settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your rules run before Fathom's own judgment, top to bottom. The first rule that fits a file decides where it goes.
          </p>
        </div>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-2xs font-medium tracking-[0.14em] text-muted-foreground uppercase">Your rules</h2>
            <Button
              size="sm"
              onClick={() => setEditing({ id: crypto.randomUUID(), name: "", enabled: true, when: {}, target: "" })}
              data-testid="add-rule"
            >
              <Plus />
              New rule
            </Button>
          </div>
          {rules.length === 0 ? (
            <p className="rounded-xl bg-card p-6 text-sm text-muted-foreground">
              No rules yet. Try one like “name contains <span className="font-mono">invoice</span> → <span className="font-mono">Finance/Invoices/{"{year}"}</span>”.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {rules.map((r, i) => {
                const n = hasPlan ? items.filter((it) => matchRule(it, r, Date.now())).length : null;
                return (
                  <li key={r.id} className="flex items-center gap-3 rounded-xl bg-card p-3 pl-4 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
                    <Switch checked={r.enabled} onCheckedChange={(v) => setRules(rules.map((x) => (x.id === r.id ? { ...x, enabled: v } : x)))} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{r.name || "Untitled rule"}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        If {describe(r.when)} → <span className="font-mono">{r.target}</span>
                        {n !== null ? ` · matches ${plural(n, "file")} in this scan` : ""}
                      </p>
                    </div>
                    <Button size="icon" variant="ghost" className="size-8" disabled={i === 0} onClick={() => move(i, -1)} title="Move up">
                      <ArrowUp />
                    </Button>
                    <Button size="icon" variant="ghost" className="size-8" disabled={i === rules.length - 1} onClick={() => move(i, 1)} title="Move down">
                      <ArrowDown />
                    </Button>
                    <Button size="icon" variant="ghost" className="size-8" onClick={() => setEditing(r)} title="Edit">
                      <Pencil />
                    </Button>
                    <Button size="icon" variant="ghost" className="size-8" onClick={() => setRules(rules.filter((x) => x.id !== r.id))} title="Delete rule">
                      <Trash2 />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="mt-10">
          <h2 className="mb-3 text-2xs font-medium tracking-[0.14em] text-muted-foreground uppercase">Scanning</h2>
          <div className="flex flex-col divide-y divide-border rounded-xl bg-card shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
            <Toggle
              label="Find exact copies"
              hint="Compares file contents. Copies go to _Fathom Review/Duplicates and are never deleted."
              checked={settings.findDuplicates}
              onChange={(v) => void save({ findDuplicates: v })}
            />
            <Toggle
              label="Read photo dates"
              hint="Uses the date a photo was taken (EXIF) to file it by year. Slower on big photo libraries."
              checked={settings.readExif}
              onChange={(v) => void save({ readExif: v })}
            />
            <TextSetting
              label="Also skip"
              hint="Names of files or folders to ignore, comma-separated. * works as a wildcard."
              value={settings.extraSkips.join(", ")}
              placeholder="node_modules_old, *.tmp"
              onSave={(v) => void save({ extraSkips: csv(v) })}
            />
            <TextSetting
              label="Also keep whole"
              hint="If a folder contains a file with one of these names, it moves as one piece, like a code project."
              value={settings.extraMarkers.join(", ")}
              placeholder=".keepwhole, project.yml"
              onSave={(v) => void save({ extraMarkers: csv(v) })}
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Scanning settings apply to your next scan. Rules apply to the current plan right away.</p>
        </section>
      </main>

      {editing ? <RuleEditor rule={editing} onCancel={() => setEditing(null)} onSave={upsert} /> : null}
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-6 p-4">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function TextSetting({ label, hint, value, placeholder, onSave }: { label: string; hint: string; value: string; placeholder: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  return (
    <div className="flex items-center justify-between gap-6 p-4">
      <span className="max-w-sm">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <Input className="h-9 max-w-72" value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onSave(v)} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

const num = (s: string) => (s.trim() === "" || Number.isNaN(Number(s)) ? undefined : Number(s));

function RuleEditor({ rule, onCancel, onSave }: { rule: Rule; onCancel: () => void; onSave: (r: Rule) => void }) {
  const items = useApp((s) => s.items);
  const [name, setName] = useState(rule.name);
  const [target, setTarget] = useState(rule.target);
  const [w, setW] = useState({
    nameContains: rule.when.nameContains ?? "",
    glob: rule.when.glob ?? "",
    exts: rule.when.exts?.join(", ") ?? "",
    pathContains: rule.when.pathContains ?? "",
    kind: rule.when.kind ?? "",
    minMb: rule.when.minBytes != null ? String(rule.when.minBytes / MB) : "",
    maxMb: rule.when.maxBytes != null ? String(rule.when.maxBytes / MB) : "",
    older: rule.when.olderThanDays != null ? String(rule.when.olderThanDays) : "",
    newer: rule.when.newerThanDays != null ? String(rule.when.newerThanDays) : "",
  });
  const set = (k: keyof typeof w) => (e: { target: { value: string } }) => setW({ ...w, [k]: e.target.value });

  const draft: Rule = useMemo(() => {
    const when: RuleWhen = {};
    if (w.nameContains.trim()) when.nameContains = w.nameContains.trim();
    if (w.glob.trim()) when.glob = w.glob.trim();
    if (csv(w.exts).length) when.exts = csv(w.exts);
    if (w.pathContains.trim()) when.pathContains = w.pathContains.trim();
    if (w.kind) when.kind = w.kind as Kind;
    const min = num(w.minMb);
    const max = num(w.maxMb);
    if (min != null) when.minBytes = Math.round(min * MB);
    if (max != null) when.maxBytes = Math.round(max * MB);
    if (num(w.older) != null) when.olderThanDays = num(w.older);
    if (num(w.newer) != null) when.newerThanDays = num(w.newer);
    return { ...rule, name: name.trim() || target.trim() || "Rule", target: target.trim(), when };
  }, [w, name, target, rule]);

  const hits = useMemo(() => items.filter((i) => matchRule(i, draft, Date.now())), [items, draft]);
  const valid = draft.target && Object.keys(draft.when).length > 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{rule.name ? "Edit rule" : "New rule"}</DialogTitle>
          <DialogDescription>Every condition you fill in must hold. Leave the rest empty.</DialogDescription>
        </DialogHeader>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Field label="Name contains">
            <Input className="h-9" value={w.nameContains} onChange={set("nameContains")} placeholder="invoice" />
          </Field>
          <Field label="Name pattern">
            <Input className="h-9" value={w.glob} onChange={set("glob")} placeholder="IMG_*.jpg" />
          </Field>
          <Field label="Extensions">
            <Input className="h-9" value={w.exts} onChange={set("exts")} placeholder="pdf, docx" />
          </Field>
          <Field label="Path contains">
            <Input className="h-9" value={w.pathContains} onChange={set("pathContains")} placeholder="Clients/Acme" />
          </Field>
          <Field label="Kind of file">
            <select value={w.kind} onChange={set("kind")} className="h-9 rounded-md bg-secondary px-3 text-sm shadow-[0_0_0_1px_rgba(255,255,255,0.08)] outline-none">
              <option value="">Any</option>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="At least (MB)">
              <Input className="h-9" value={w.minMb} onChange={set("minMb")} inputMode="decimal" />
            </Field>
            <Field label="At most (MB)">
              <Input className="h-9" value={w.maxMb} onChange={set("maxMb")} inputMode="decimal" />
            </Field>
          </div>
          <Field label="Older than (days)">
            <Input className="h-9" value={w.older} onChange={set("older")} inputMode="numeric" />
          </Field>
          <Field label="From the last (days)">
            <Input className="h-9" value={w.newer} onChange={set("newer")} inputMode="numeric" />
          </Field>
        </div>
        <div className="mt-4 grid grid-cols-[1fr_2fr] gap-3">
          <Field label="Rule name">
            <Input className="h-9" value={name} onChange={(e) => setName(e.target.value)} placeholder="Invoices" />
          </Field>
          <Field label="Put it in">
            <Input className="h-9 font-mono" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Finance/Invoices/{year}" />
          </Field>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          You can use <span className="font-mono">{"{year}"}</span> <span className="font-mono">{"{month}"}</span>{" "}
          <span className="font-mono">{"{kind}"}</span> <span className="font-mono">{"{ext}"}</span> <span className="font-mono">{"{parent}"}</span> in the folder path.
        </p>
        {items.length ? (
          <div className="mt-4 rounded-lg bg-muted/50 p-3 text-xs">
            <p className="text-muted-foreground">Matches {plural(hits.length, "file")} in the current scan</p>
            <ul className="mt-1 flex flex-col gap-0.5 font-mono">
              {hits.slice(0, 5).map((i) => (
                <li key={i.id} className="truncate">
                  {i.rel} <span className="text-muted-foreground">→ {draft.target ? expandTemplate(draft.target, i) : "…"}</span>
                </li>
              ))}
              {hits.length > 5 ? <li className="text-muted-foreground">…and {formatCount(hits.length - 5)} more</li> : null}
            </ul>
          </div>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={() => onSave(draft)} disabled={!valid} data-testid="save-rule">
            Save rule
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
