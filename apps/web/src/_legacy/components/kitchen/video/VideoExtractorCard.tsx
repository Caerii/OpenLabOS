import { Card, CardHeader, CardTitle, Icon, SearchInput, Spinner } from "../../ui";
import { ICON } from "../icons";

export function VideoExtractorCard({
  url,
  onUrlChange,
  onExtract,
  extracting,
}: {
  url: string;
  onUrlChange: (v: string) => void;
  onExtract: () => void;
  extracting: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle
          icon={<Icon d={ICON.video} size={16} className="text-accentText" />}
          sub="ER 1.6 watches videos and generates full LabOS protocols with step verification prompts."
        >
          Extract Protocol from YouTube Video
        </CardTitle>
      </CardHeader>
      <SearchInput
        value={url}
        onChange={onUrlChange}
        onSubmit={onExtract}
        placeholder="https://www.youtube.com/watch?v=..."
        loading={extracting}
        buttonLabel="Extract Protocol"
      />
      {extracting && (
        <div className="flex items-center gap-2 text-xs text-muted mt-3">
          <Spinner size={14} />
          Watching video and analyzing steps... This may take 30-120 seconds.
        </div>
      )}
    </Card>
  );
}

