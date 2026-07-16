import { useEffect } from "react";
import { AlertBanner, Badge, Card, CardTitle, Icon, SegmentedControl, StatusDot, TabBar } from "./ui/index";
import { ICON } from "./kitchen/icons";
import ProtocolsView from "./kitchen/ProtocolsView";
import GuidedDemoView from "./kitchen/GuidedDemoView";
import RunView from "./kitchen/RunView";
import { ToolsView, VideoView } from "./kitchen/experimental";
import { type KitchenDemoView, useKitchenDemoController } from "./kitchen/controller";
import { deriveLabOSExperience } from "../lib/labosExperience";

export default function KitchenPanel({ connected }: { connected: boolean }) {
  const { preset, data, ui, actions } = useKitchenDemoController({ connected });
  const flags = data.featureFlags;
  const experience = deriveLabOSExperience(flags, data.featureExperience);
  const showExpertViews = experience.surfaces.kitchenExpertTabs;
  const showAdvancedHeader = experience.surfaces.kitchenAdvancedHeader;
  const guidedView = ui.view === "guided";

  const tabOptions: { id: KitchenDemoView; label: string }[] = [
    { id: "guided", label: "Guided Run" },
    { id: "protocols", label: "Protocols" },
    ...(data.isActive ? [{ id: "run" as const, label: "Active Run" }] : []),
    ...(showExpertViews
      ? [
          { id: "tools" as const, label: "Sandbox" },
          { id: "video" as const, label: "Video" },
        ]
      : []),
  ];

  useEffect(() => {
    if (!showExpertViews && (ui.view === "tools" || ui.view === "video")) {
      actions.setView("guided");
      return;
    }
    if (!data.isActive && ui.view === "run") {
      actions.setView("guided");
    }
  }, [actions.setView, data.isActive, showExpertViews, ui.view]);

  return (
    <div className={guidedView ? "operate-console space-y-4" : "space-y-5"}>
      {guidedView ? (
        <div className="oc-page-header">
          <div>
            <span className="labos-eyebrow oc-page-eyebrow">Protocol console</span>
            <h1 className="oc-page-title">{preset.title}</h1>
            <p className="oc-page-lede">
              Live glasses view, one clear instruction, one primary action.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {data.isActive ? (
              <Badge color="green">
                <StatusDot active pulse size="xs" />
                Run active
              </Badge>
            ) : (
              <Badge color="gray">{experience.label}</Badge>
            )}
          </div>
        </div>
      ) : (
        <Card padding="md">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle
              icon={<Icon d={ICON.flask} size={18} className="text-good-fg" />}
              sub={
                showAdvancedHeader
                  ? "Gemini Robotics ER 1.6 — spatial reasoning and protocol guidance"
                  : "Step-by-step recording and evidence capture"
              }
            >
              {preset.title}
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              {data.isActive && (
                <Badge color="green">
                  <StatusDot active pulse size="xs" />
                  Run active
                </Badge>
              )}
              {showAdvancedHeader ? (
                <span className="text-[11px] text-subtle">
                  {data.protocols.length} protocols · {data.modesData?.modes?.length || 0} ER modes
                </span>
              ) : (
                <Badge color="gray">{experience.label}</Badge>
              )}
            </div>
          </div>
        </Card>
      )}

      {guidedView ? (
        <TabBar
          value={ui.view}
          onChange={actions.setView}
          options={tabOptions}
          ariaLabel="Kitchen demo views"
        />
      ) : (
        <SegmentedControl value={ui.view} onChange={actions.setView} options={tabOptions} />
      )}

      {ui.error && (
        <AlertBanner icon={<Icon d={ICON.alert} size={16} />} onDismiss={() => actions.setError("")}>
          {ui.error}
        </AlertBanner>
      )}

      {ui.view === "guided" && (
        <GuidedDemoView
          connected={connected}
          protocols={data.protocols}
          selectedProtocol={ui.selectedProtocol}
          onSelectProtocol={actions.setSelectedProtocol}
          run={data.run}
          currentStep={data.currentStep}
          isActive={data.isActive}
          preview={data.previewStatus || null}
          labos={data.labosData || null}
          recordingStatus={data.recordingStatus || null}
          voiceHealth={data.voiceHealth || null}
          segmentation={data.segmentationStatus || null}
          runpodGuard={data.runpodGuard || null}
          supervisor={data.supervisorStatus || null}
          featureFlags={flags}
          featureExperience={data.featureExperience}
          buttonMappings={data.buttonMappings}
          buttonConfirmStatus={data.buttonConfirmStatus}
          operatorReadiness={data.operatorReadiness}
          lastAdherence={ui.lastAdherence}
          error={ui.error}
          busy={ui.confirmingStep ? "confirm-step" : ui.guidedBusy}
          savingManifest={ui.savingManifest}
          savedManifestRef={ui.savedManifestRef}
          savedManifests={data.savedManifests}
          onLaunchLabos={actions.launchLabos}
          onStartPreview={actions.startPreview}
          onSetButtonConfirm={actions.setButtonConfirm}
          onStartRun={(protocolId) => {
            actions.setSelectedProtocol(protocolId);
            void actions.startGuidedRun(protocolId);
          }}
          onStartSupervisor={actions.startSupervisor}
          onStopSupervisor={actions.stopSupervisor}
          onConfirmStep={actions.confirmStep}
          onUndoStep={actions.undoStep}
          onAbortRun={actions.confirmAbort}
          onAdherenceTick={actions.runAdherenceTick}
          onSaveManifest={actions.saveManifest}
          onOpenSandbox={() => actions.setView("tools")}
        />
      )}

      {ui.view === "protocols" && (
        <ProtocolsView
          protocols={data.protocols}
          selectedProtocol={ui.selectedProtocol}
          onSelect={actions.setSelectedProtocol}
          onStart={actions.startRunFromProtocols}
          isActive={data.isActive}
        />
      )}

      {ui.view === "run" && (
        <RunView
          run={data.run}
          runData={data.runData}
          currentStep={data.currentStep}
          isActive={data.isActive}
          verifying={ui.verifying}
          confirmingStep={ui.confirmingStep}
          onPause={actions.pauseRun}
          onResume={actions.resumeRun}
          onAbort={actions.confirmAbort}
          onVerify={actions.verifyStep}
          onAdherenceTick={actions.runAdherenceTick}
          adherenceChecking={ui.adherenceChecking}
          autoAdherence={ui.autoAdherence}
          onAutoAdherenceChange={actions.setAutoAdherence}
          lastAdherence={ui.lastAdherence}
          segmentationStatus={data.segmentationStatus || null}
          supervisorStatus={data.supervisorStatus || null}
          featureFlags={flags}
          supervisorChanging={ui.supervisorChanging}
          onStartSupervisor={actions.startSupervisor}
          onStopSupervisor={actions.stopSupervisor}
          onConfirmStep={actions.confirmStep}
          onUndoStep={actions.undoStep}
          onSkip={actions.skipStep}
          onComplete={actions.completeStep}
          onBrowse={() => actions.setView("protocols")}
        />
      )}

      {showExpertViews && ui.view === "tools" && (
        <ToolsView
          analyzing={ui.analyzing}
          lastResult={ui.lastResult}
          searchQuery={ui.searchQuery}
          searchResult={ui.searchResult}
          searching={ui.searching}
          onRunAnalysis={actions.runAnalysis}
          onSearchQueryChange={actions.setSearchQuery}
          onSearch={actions.search}
        />
      )}

      {showExpertViews && ui.view === "video" && (
        <VideoView
          videoUrl={ui.videoUrl}
          videoResult={ui.videoResult}
          videoExtracting={ui.videoExtracting}
          onUrlChange={actions.setVideoUrl}
          onExtract={actions.extractVideo}
          onSelectDemo={actions.setVideoResult}
        />
      )}
    </div>
  );
}
