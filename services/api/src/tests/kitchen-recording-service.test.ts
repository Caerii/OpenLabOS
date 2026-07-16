import assert from "node:assert/strict";
import {
  KitchenRecordingService,
  KitchenRecordingServiceError,
} from "../ai/kitchen/application/recording-service.js";

function createHarness(opts: { active?: boolean; failStop?: boolean } = {}) {
  let active = opts.active === true;
  const calls: string[] = [];
  const service = new KitchenRecordingService({
    startNativeRecording: async (protocolId) => {
      calls.push(`start:${protocolId || ""}`);
      active = true;
      return {
        success: true,
        state: {
          active: true,
          activeVideoPath: "/storage/emulated/0/LabOS/media/current.mp4",
        },
        health: { recording: true },
      };
    },
    stopNativeRecording: async (reason) => {
      calls.push(`stop:${reason || ""}`);
      if (opts.failStop) throw new Error("camera command failed");
      if (!active) {
        return {
          success: true,
          alreadyStopped: true,
          state: { active: false },
          health: { recording: false },
        };
      }
      active = false;
      return {
        success: true,
        state: {
          active: false,
          lastVideoPath: "/storage/emulated/0/LabOS/media/segment.mp4",
          stoppedAt: "2026-04-30T12:00:10.000Z",
        },
        health: {
          recording: false,
          lastVideoPath: "/storage/emulated/0/LabOS/media/segment.mp4",
        },
      };
    },
    refreshNativeRecordingStatus: async () => ({
      state: {
        active,
        activeVideoPath: active ? "/storage/emulated/0/LabOS/media/current.mp4" : "",
      },
      health: {
        recording: active,
        activeVideoPath: active ? "/storage/emulated/0/LabOS/media/current.mp4" : "",
      },
    }),
  });
  return { service, calls, isActive: () => active };
}

async function main() {
  {
    const { service, calls } = createHarness();
    await service.startRunRecording("kitchen-tea-v1");
    assert.deepEqual(calls, ["start:kitchen-tea-v1"]);
  }

  {
    const { service, calls, isActive } = createHarness({ active: false });
    await service.ensureRecordingForNextStep("kitchen-tea-v1");
    assert.equal(isActive(), true);
    assert.deepEqual(calls, ["start:kitchen-tea-v1"]);
  }

  {
    const { service, calls } = createHarness({ active: true });
    await service.ensureRecordingForNextStep("kitchen-tea-v1");
    assert.deepEqual(calls, []);
  }

  {
    const { service, isActive } = createHarness({ active: true });
    const snapshot = await service.captureStepSegmentRecording({ requireActive: true, stopForSegment: false });
    assert.equal(snapshot.active, true);
    assert.equal(snapshot.activeVideoPath, "/storage/emulated/0/LabOS/media/current.mp4");
    assert.equal(isActive(), true);
  }

  {
    const { service, calls, isActive } = createHarness({ active: true });
    const snapshot = await service.captureStepSegmentRecording({ requireActive: true, stopForSegment: true });
    assert.equal(snapshot.active, false);
    assert.equal(snapshot.lastVideoPath, "/storage/emulated/0/LabOS/media/segment.mp4");
    assert.equal(isActive(), false);
    assert.deepEqual(calls, ["stop:step_segment_complete"]);
  }

  {
    const { service } = createHarness({ active: false });
    await assert.rejects(
      () => service.captureStepSegmentRecording({ requireActive: true, stopForSegment: false }),
      /Native recording is not active/,
    );
  }

  {
    const { service } = createHarness({ active: false });
    await assert.rejects(
      () => service.captureStepSegmentRecording({ requireActive: true, stopForSegment: true }),
      (error: any) => error instanceof KitchenRecordingServiceError
        && error.message === "Native recording is not active for this step segment"
        && error.status === 400,
    );
  }

  {
    const { service } = createHarness({ active: true, failStop: true });
    await assert.rejects(
      () => service.captureStepSegmentRecording({ requireActive: true, stopForSegment: true }),
      (error: any) => error instanceof KitchenRecordingServiceError
        && error.status === 502
        && /Failed to stop native recording/.test(error.message),
    );
  }

  console.log("[kitchen-recording-service] all checks passed");
}

await main();
