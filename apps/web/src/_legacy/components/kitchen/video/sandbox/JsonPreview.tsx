export function JsonPreview({ value }: { value: any }) {
  return (
    <pre className="text-[11px] text-muted whitespace-pre-wrap bg-border/10 border border-border/15 rounded-lg p-3 max-h-64 overflow-y-auto font-mono leading-relaxed">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
