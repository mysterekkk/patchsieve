import type ts from 'typescript';

export type Severity = 'error' | 'warning' | 'note';
export type Confidence = 'high' | 'medium' | 'low';
export type RuleCategory = 'dependencies' | 'error-handling' | 'tests' | 'stubs' | 'reliability' | 'migrations';

export interface Finding {
  ruleId: string;
  severity: Severity;
  confidence: Confidence;
  file: string;
  line: number;
  column: number;
  endLine: number;
  title: string;
  message: string;
  reason: string;
  suggestion: string;
  docsUrl: string;
  onChangedLine: boolean;
  fingerprint: string;
}

/** What a rule reports before the engine fills in severity, docs link, fingerprint, etc. */
export interface RawFinding {
  line: number;
  column: number;
  endLine?: number;
  message: string;
  reason: string;
  confidence?: Confidence;
  /** Overrides the rule's default severity for this finding (config still wins). */
  severity?: Severity;
  /** Stable snippet used for the fingerprint (line numbers are deliberately excluded). */
  anchor: string;
}

export interface SourceFileInfo {
  path: string; // repo-relative, forward slashes
  text: string;
  kind: 'test' | 'production';
  /** 1-based lines added/modified by the change; null means "whole file" (full scan / new file). */
  changedLines: Set<number> | null;
  /** True if the file did not exist at base. */
  isNew: boolean;
}

export interface RuleContext {
  file: SourceFileInfo;
  ts?: ts.SourceFile;
  /** Read another repo file at head (used by dependency rules). Returns undefined if absent. */
  readFile(path: string): string | undefined;
  /** Read a file as it was at base. */
  readBaseFile(path: string): string | undefined;
  /** Paths touched by the change under analysis; null in full-scan mode. */
  changedPaths: Set<string> | null;
  options: Record<string, unknown>;
}

export interface Rule {
  id: string;
  name: string;
  description: string;
  category: RuleCategory;
  defaultSeverity: Severity;
  languages: ('ts' | 'js' | 'json' | 'sql' | 'prisma')[];
  /** Only analyze when the finding is on a changed line (default true). */
  changedLinesOnly?: boolean;
  /** Restrict to file kind. */
  appliesTo?: 'test' | 'production' | 'any';
  /** For manifest rules: match by file basename instead of language. */
  fileNames?: string[];
  check(ctx: RuleContext): RawFinding[];
}

export interface SkippedFile {
  path: string;
  reason: string;
}
