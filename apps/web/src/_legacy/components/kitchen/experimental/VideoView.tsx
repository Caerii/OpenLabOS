import type { DemoExample } from "../demoExamples";
import { DemoShowcaseCard } from "../video/DemoShowcaseCard";
import { ExtractedProtocolView } from "../video/ExtractedProtocolView";
import { PreloadedClipSandboxCard } from "../video/PreloadedClipSandboxCard";
import { VideoExtractorCard } from "../video/VideoExtractorCard";

export default function VideoView({ videoUrl, videoResult, videoExtracting, onUrlChange, onExtract, onSelectDemo }: {
  videoUrl: string;
  videoResult: any;
  videoExtracting: boolean;
  onUrlChange: (v: string) => void;
  onExtract: () => void;
  onSelectDemo: (result: any) => void;
}) {
  return (
    <div className="space-y-5 animate-fade-in">
      <PreloadedClipSandboxCard />
      <VideoExtractorCard url={videoUrl} onUrlChange={onUrlChange} onExtract={onExtract} extracting={videoExtracting} />
      {videoResult && <ExtractedProtocolView result={videoResult} />}
      <DemoShowcaseCard
        onSelect={(ex: DemoExample) =>
          onSelectDemo({
            saved: true,
            protocol: ex.protocol,
            videoUrl: ex.videoUrl,
            latencyMs: ex.latencyMs,
            raw: JSON.stringify(ex.protocol, null, 2),
          })
        }
      />
    </div>
  );
}
