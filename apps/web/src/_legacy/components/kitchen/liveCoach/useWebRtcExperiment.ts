import { useEffect, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  Track,
  createLocalAudioTrack,
  type LocalAudioTrack,
  type RemoteAudioTrack,
} from "livekit-client";
import {
  liveCoachWebRtcConfig,
  liveCoachWebRtcLiveKitSession,
  liveCoachWebRtcRecordMetric,
  liveCoachWebRtcSignal,
  type LiveCoachWebRtcConfig,
  type LiveCoachWebRtcMetricSample,
} from "../../../api";

type ExperimentState = "idle" | "probing" | "local-ready" | "connecting" | "connected" | "error";

type ByteSnapshot = {
  at: number;
  sent: number;
  received: number;
};

function makeSessionId(): string {
  return globalThis.crypto?.randomUUID?.() || `webrtc-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function waitForIceGatheringComplete(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = window.setTimeout(done, 2500);
    function done() {
      window.clearTimeout(timeout);
      pc.removeEventListener("icegatheringstatechange", onState);
      resolve();
    }
    function onState() {
      if (pc.iceGatheringState === "complete") done();
    }
    pc.addEventListener("icegatheringstatechange", onState);
  });
}

function pairIceCandidates(a: RTCPeerConnection, b: RTCPeerConnection) {
  a.onicecandidate = (event) => {
    if (event.candidate) b.addIceCandidate(event.candidate).catch(() => {});
  };
  b.onicecandidate = (event) => {
    if (event.candidate) a.addIceCandidate(event.candidate).catch(() => {});
  };
}

function readStats(
  sessionId: string,
  providerId: string,
  pc: RTCPeerConnection,
  inboundPc: RTCPeerConnection | null,
  previous: ByteSnapshot | null,
): Promise<{ sample: LiveCoachWebRtcMetricSample; snapshot: ByteSnapshot }> {
  return Promise.all([pc.getStats(), inboundPc && inboundPc !== pc ? inboundPc.getStats() : null]).then(([report, inboundReport]) => {
    let sent = 0;
    let received = 0;
    let packetsLost = 0;
    let jitter = 0;
    let rtt = 0;
    let localCandidateType = "";
    let remoteCandidateType = "";

    report.forEach((stat: any) => {
      if (stat.type === "outbound-rtp" && !stat.isRemote) {
        sent += Number(stat.bytesSent || 0);
      }
      if (stat.type === "inbound-rtp" && !stat.isRemote) {
        received += Number(stat.bytesReceived || 0);
        packetsLost += Number(stat.packetsLost || 0);
        jitter = Math.max(jitter, Number(stat.jitter || 0) * 1000);
      }
      if (stat.type === "candidate-pair" && stat.state === "succeeded" && stat.nominated) {
        rtt = Number(stat.currentRoundTripTime || 0) * 1000;
        const local = report.get(stat.localCandidateId) as any;
        const remote = report.get(stat.remoteCandidateId) as any;
        localCandidateType = local?.candidateType || localCandidateType;
        remoteCandidateType = remote?.candidateType || remoteCandidateType;
      }
    });
    inboundReport?.forEach((stat: any) => {
      if (stat.type === "inbound-rtp" && !stat.isRemote) {
        received += Number(stat.bytesReceived || 0);
        packetsLost += Number(stat.packetsLost || 0);
        jitter = Math.max(jitter, Number(stat.jitter || 0) * 1000);
      }
    });

    const at = performance.now();
    const elapsedSec = previous ? Math.max(0.001, (at - previous.at) / 1000) : 0;
    const sample: LiveCoachWebRtcMetricSample = {
      timestamp: new Date().toISOString(),
      providerId,
      sessionId,
      state: pc.connectionState,
      iceState: pc.iceConnectionState,
      bytesSent: sent,
      bytesReceived: received,
      bitrateSentKbps: previous ? Math.round(((sent - previous.sent) * 8) / elapsedSec / 1000) : 0,
      bitrateReceivedKbps: previous ? Math.round(((received - previous.received) * 8) / elapsedSec / 1000) : 0,
      packetsLost,
      jitterMs: Math.round(jitter),
      rttMs: Math.round(rtt),
      localCandidateType,
      remoteCandidateType,
    };

    return { sample, snapshot: { at, sent, received } };
  });
}

async function readLiveKitStats(
  sessionId: string,
  room: Room,
  localAudioTrack: LocalAudioTrack | null,
  remoteAudioTracks: RemoteAudioTrack[],
  previous: ByteSnapshot | null,
): Promise<{ sample: LiveCoachWebRtcMetricSample; snapshot: ByteSnapshot }> {
  const senderStats = await localAudioTrack?.getSenderStats().catch(() => undefined);
  const receiverStats = await Promise.all(
    remoteAudioTracks.map((track) => track.getReceiverStats().catch(() => undefined)),
  );
  const sent = Number(senderStats?.bytesSent || 0);
  const received = receiverStats.reduce((sum, stats) => sum + Number(stats?.bytesReceived || 0), 0);
  const packetsLost = receiverStats.reduce((sum, stats) => sum + Number(stats?.packetsLost || 0), Number(senderStats?.packetsLost || 0));
  const jitter = receiverStats.reduce((max, stats) => Math.max(max, Number(stats?.jitter || 0) * 1000), 0);
  const rtt = Number(senderStats?.roundTripTime || 0) * 1000;
  const at = performance.now();
  const elapsedSec = previous ? Math.max(0.001, (at - previous.at) / 1000) : 0;

  return {
    sample: {
      timestamp: new Date().toISOString(),
      providerId: "livekit",
      sessionId,
      state: room.state,
      iceState: room.state,
      roomName: room.name,
      participants: room.remoteParticipants.size + 1,
      publishedTracks: room.localParticipant.trackPublications.size,
      subscribedTracks: remoteAudioTracks.length,
      bytesSent: sent,
      bytesReceived: received,
      bitrateSentKbps: previous ? Math.round(((sent - previous.sent) * 8) / elapsedSec / 1000) : 0,
      bitrateReceivedKbps: previous ? Math.round(((received - previous.received) * 8) / elapsedSec / 1000) : 0,
      packetsLost,
      jitterMs: Math.round(jitter),
      rttMs: Math.round(rtt),
    },
    snapshot: { at, sent, received },
  };
}

export function useWebRtcExperiment(enabled: boolean, initialConfig?: LiveCoachWebRtcConfig) {
  const [config, setConfig] = useState<LiveCoachWebRtcConfig | undefined>(initialConfig);
  const [state, setState] = useState<ExperimentState>("idle");
  const [message, setMessage] = useState("");
  const [latest, setLatest] = useState<LiveCoachWebRtcMetricSample | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const remotePcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const liveKitRoomRef = useRef<Room | null>(null);
  const liveKitLocalAudioRef = useRef<LocalAudioTrack | null>(null);
  const liveKitRemoteAudioRefs = useRef<RemoteAudioTrack[]>([]);
  const liveKitAudioElsRef = useRef<HTMLMediaElement[]>([]);
  const timerRef = useRef<number | null>(null);
  const snapshotRef = useRef<ByteSnapshot | null>(null);
  const sessionIdRef = useRef(makeSessionId());

  useEffect(() => {
    if (initialConfig) setConfig(initialConfig);
  }, [initialConfig]);

  useEffect(() => {
    if (!enabled) return;
    liveCoachWebRtcConfig().then(setConfig).catch(() => {});
  }, [enabled]);

  function stop() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    snapshotRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    remotePcRef.current?.close();
    remotePcRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    liveKitAudioElsRef.current.forEach((element) => {
      element.pause();
      element.remove();
    });
    liveKitAudioElsRef.current = [];
    liveKitRemoteAudioRefs.current.forEach((track) => track.detach());
    liveKitRemoteAudioRefs.current = [];
    liveKitLocalAudioRef.current?.stop();
    liveKitLocalAudioRef.current = null;
    liveKitRoomRef.current?.disconnect();
    liveKitRoomRef.current = null;
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current.srcObject = null;
      audioElRef.current = null;
    }
    setState("idle");
  }

  async function startLiveKit(activeConfig: LiveCoachWebRtcConfig) {
    const session = await liveCoachWebRtcLiveKitSession({
      protocolId: "kitchen-tea-v1",
      dispatchAgent: true,
      allowDispatchFailure: false,
    });
    sessionIdRef.current = session.roomName;

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      publishDefaults: {
        audioPreset: { maxBitrate: activeConfig.audioBitrateBps },
      },
    });
    liveKitRoomRef.current = room;

    room.on(RoomEvent.ConnectionStateChanged, (connectionState) => {
      setState(connectionState === "connected" ? "connected" : connectionState === "disconnected" ? "idle" : "connecting");
    });
    room.on(RoomEvent.Reconnecting, () => {
      setState("connecting");
      setMessage("LiveKit is reconnecting after a network change.");
    });
    room.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind !== Track.Kind.Audio) return;
      const audioTrack = track as RemoteAudioTrack;
      const element = audioTrack.attach();
      element.autoplay = true;
      element.setAttribute("data-labos-livekit-audio", session.roomName);
      document.body.appendChild(element);
      liveKitRemoteAudioRefs.current.push(audioTrack);
      liveKitAudioElsRef.current.push(element);
      element.play().catch(() => {
        setMessage("LiveKit remote audio is connected, but the browser blocked autoplay. Tap the page once and restart if you cannot hear it.");
      });
    });
    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      track.detach().forEach((element) => {
        element.pause();
        element.remove();
      });
      liveKitRemoteAudioRefs.current = liveKitRemoteAudioRefs.current.filter((remoteTrack) => remoteTrack !== track);
    });
    room.on(RoomEvent.Disconnected, () => {
      setState("idle");
    });

    setMessage(`Connecting to LiveKit room ${session.roomName} with agent ${session.agentName}...`);
    await room.connect(session.url, session.token, {
      autoSubscribe: true,
    });

    const localAudioTrack = await createLocalAudioTrack({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: 48000,
    });
    liveKitLocalAudioRef.current = localAudioTrack;
    await room.localParticipant.publishTrack(localAudioTrack, {
      name: "labos-operator-mic",
      source: Track.Source.Microphone,
    });

    setState("connected");
    setMessage(session.dispatch.created
      ? `LiveKit room is live. Agent dispatch ${session.dispatch.id || "created"} is attached.`
      : "LiveKit room is live. Agent dispatch was skipped.");

    timerRef.current = window.setInterval(async () => {
      const currentRoom = liveKitRoomRef.current;
      if (!currentRoom) return;
      const { sample, snapshot } = await readLiveKitStats(
        session.roomName,
        currentRoom,
        liveKitLocalAudioRef.current,
        liveKitRemoteAudioRefs.current,
        snapshotRef.current,
      ).catch((error) => ({
        sample: {
          timestamp: new Date().toISOString(),
          providerId: "livekit",
          sessionId: session.roomName,
          state: currentRoom.state,
          iceState: currentRoom.state,
          roomName: currentRoom.name,
          message: error?.message || String(error),
        },
        snapshot: snapshotRef.current || { at: performance.now(), sent: 0, received: 0 },
      }));
      snapshotRef.current = snapshot;
      setLatest(sample);
      liveCoachWebRtcRecordMetric(sample).catch(() => {});
    }, 1000);
  }

  async function start() {
    const activeConfig = config || await liveCoachWebRtcConfig();
    setConfig(activeConfig);
    if (!activeConfig.enabled) {
      setState("error");
      setMessage("Experimental WebRTC is disabled on the server.");
      return;
    }
    stop();
    sessionIdRef.current = makeSessionId();
    setMessage("");
    setState(activeConfig.signalingReady ? "connecting" : "probing");

    try {
      if (activeConfig.activeProvider === "livekit" && activeConfig.signalingReady) {
        await startLiveKit(activeConfig);
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      streamRef.current = stream;

      const pc = new RTCPeerConnection({ iceServers: activeConfig.iceServers });
      pcRef.current = pc;
      pc.onconnectionstatechange = () => {
        setState(pc.connectionState === "connected" ? "connected" : pc.connectionState === "failed" ? "error" : "connecting");
      };
      pc.ontrack = (event) => {
        const [remoteStream] = event.streams;
        if (!remoteStream) return;
        const audio = audioElRef.current || new Audio();
        audio.autoplay = true;
        audio.srcObject = remoteStream;
        audioElRef.current = audio;
        audio.play().catch(() => {});
      };

      for (const track of stream.getAudioTracks()) {
        const sender = pc.addTrack(track, stream);
        const params = sender.getParameters();
        params.encodings = [{ ...(params.encodings?.[0] || {}), maxBitrate: activeConfig.audioBitrateBps }];
        await sender.setParameters(params).catch(() => {});
      }
      const dc = pc.createDataChannel("labos-control");
      dc.onopen = () => dc.send(JSON.stringify({ type: "hello", sessionId: sessionIdRef.current }));

      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);
      await waitForIceGatheringComplete(pc);

      if (activeConfig.mode === "loopback") {
        const remotePc = new RTCPeerConnection({ iceServers: activeConfig.iceServers });
        remotePcRef.current = remotePc;
        pairIceCandidates(pc, remotePc);
        remotePc.ondatachannel = (event) => {
          event.channel.onmessage = () => {};
        };
        remotePc.ontrack = () => {
          // Loopback validates RTP delivery without playing mic audio back to the user.
        };
        await remotePc.setRemoteDescription(pc.localDescription!);
        const answer = await remotePc.createAnswer();
        await remotePc.setLocalDescription(answer);
        await waitForIceGatheringComplete(remotePc);
        await pc.setRemoteDescription(remotePc.localDescription!);
        setState("connected");
        setMessage("Browser-local WebRTC loopback is connected. This tests capture, SDP, ICE, RTP, and stats without a gateway.");
      } else if (activeConfig.signalingReady) {
        const response = await liveCoachWebRtcSignal({
          sessionId: sessionIdRef.current,
          providerId: activeConfig.activeProvider,
          kind: "live-coach-audio",
          offer: pc.localDescription,
          audioBitrateBps: activeConfig.audioBitrateBps,
          videoBitrateBps: activeConfig.videoBitrateBps,
        });
        if (!response.answer) throw new Error("WebRTC gateway did not return an answer SDP.");
        await pc.setRemoteDescription(response.answer);
      } else {
        setState("local-ready");
        setMessage(`Provider ${activeConfig.activeProvider} has no signaling URL configured yet.`);
      }

      timerRef.current = window.setInterval(async () => {
        const current = pcRef.current;
        if (!current) return;
        const { sample, snapshot } = await readStats(
          sessionIdRef.current,
          activeConfig.activeProvider,
          current,
          remotePcRef.current,
          snapshotRef.current,
        ).catch((error) => ({
          sample: {
            timestamp: new Date().toISOString(),
            providerId: activeConfig.activeProvider,
            sessionId: sessionIdRef.current,
            state: current.connectionState,
            iceState: current.iceConnectionState,
            message: error?.message || String(error),
          },
          snapshot: snapshotRef.current || { at: performance.now(), sent: 0, received: 0 },
        }));
        snapshotRef.current = snapshot;
        setLatest(sample);
        liveCoachWebRtcRecordMetric(sample).catch(() => {});
      }, 1000);
    } catch (error: any) {
      setState("error");
      setMessage(error?.message || String(error));
      stop();
      setState("error");
    }
  }

  useEffect(() => stop, []);

  return {
    config,
    state,
    message,
    latest,
    start,
    stop,
  };
}
