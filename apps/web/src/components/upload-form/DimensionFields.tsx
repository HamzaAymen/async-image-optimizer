"use client";

import type { FieldErrors, UseFormRegister } from "react-hook-form";
import type { UploadFormValues } from "@/lib/upload-schema";

type DimensionFieldsProps = {
  register: UseFormRegister<UploadFormValues>;
  errors: FieldErrors<UploadFormValues>;
};

const fields = [
  { name: "width", label: "Width" },
  { name: "height", label: "Height" },
] as const;

export function DimensionFields({ register, errors }: DimensionFieldsProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {fields.map(({ name, label }) => (
        <label key={name} className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-foreground">{label}</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            placeholder="auto"
            {...register(name)}
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-foreground/40"
          />
          {errors[name] && (
            <span className="text-xs text-status-failed">
              {errors[name]?.message as string}
            </span>
          )}
        </label>
      ))}
    </div>
  );
}
