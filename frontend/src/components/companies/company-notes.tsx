"use client";

import * as React from "react";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api";
import { useUpdateCompany } from "@/lib/queries/companies";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";

/** Private notes about a company (only visible to the user). Remount with key={company.id}. */
export function CompanyNotes({ companyId, initial }: { companyId: number; initial: string | null }) {
  const [value, setValue] = React.useState(initial ?? "");
  const [saved, setSaved] = React.useState(initial ?? "");
  const update = useUpdateCompany(companyId);
  const dirty = value !== saved;
  const id = React.useId();

  const save = () =>
    update.mutate(
      { notes: value.trim() || null },
      {
        onSuccess: () => {
          setSaved(value);
          toast.success("Notes saved");
        },
        onError: (e) => toast.error("Couldn't save your notes", { description: `${errorMessage(e)} Your text is still here.` }),
      },
    );

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>
            <label htmlFor={id}>Private notes</label>
          </CardTitle>
          <CardDescription className="flex items-center gap-1.5">
            <Lock className="size-3" aria-hidden /> Only you can see these.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <Textarea
          id={id}
          rows={5}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && dirty) {
              e.preventDefault();
              save();
            }
          }}
          placeholder="Who you talked to, what you liked, questions to ask in an interview…"
        />
        <div className="mt-3 flex items-center justify-end gap-2">
          {dirty && (
            <Button variant="ghost" size="sm" onClick={() => setValue(saved)} disabled={update.isPending}>
              Discard
            </Button>
          )}
          <Button size="sm" onClick={save} disabled={!dirty} loading={update.isPending}>
            Save notes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
