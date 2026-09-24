import {
  BookOpen,
  Boxes,
  Database,
  Disc3,
  File,
  FileArchive,
  FileCode,
  FileSpreadsheet,
  FileText,
  Film,
  Image,
  Music,
  PenTool,
  Presentation,
  Type,
} from "lucide-react";
import type { Item, Kind } from "@shared/types";
import { cn } from "@/lib/utils";

const ICONS: Record<Kind, typeof File> = {
  document: FileText,
  spreadsheet: FileSpreadsheet,
  presentation: Presentation,
  image: Image,
  video: Film,
  audio: Music,
  code: FileCode,
  archive: FileArchive,
  installer: Disc3,
  data: Database,
  design: PenTool,
  font: Type,
  ebook: BookOpen,
  other: File,
};

export function FileGlyph({ item, className }: { item: Pick<Item, "kind" | "type">; className?: string }) {
  const Icon = item.type === "unit" ? Boxes : (ICONS[item.kind] ?? File);
  return (
    <Icon
      className={cn("size-3.5 shrink-0", item.type === "unit" ? "text-sea" : "text-muted-foreground", className)}
      strokeWidth={1.75}
    />
  );
}
