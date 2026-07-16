import 'dart:async';

import 'package:flutter/material.dart';

import 'device_contract.dart';

void main() {
  runApp(const LabosDeviceApp());
}

class LabosDeviceApp extends StatelessWidget {
  const LabosDeviceApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'LabOS Device',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xff00c27a),
          brightness: Brightness.dark,
        ),
        useMaterial3: true,
      ),
      home: DeviceHomeScreen(controller: DemoLabosDeviceController()),
    );
  }
}

class DeviceHomeScreen extends StatefulWidget {
  const DeviceHomeScreen({required this.controller, super.key});

  final LabosDeviceController controller;

  @override
  State<DeviceHomeScreen> createState() => _DeviceHomeScreenState();
}

class _DeviceHomeScreenState extends State<DeviceHomeScreen> {
  DeviceSnapshot snapshot = const DeviceSnapshot(
    connected: false,
    streaming: false,
    recording: false,
    frameCount: 0,
    frameBytes: 0,
    fps: 0,
    edition: 'flutter',
  );
  DeviceDiagnostics diagnostics = const DeviceDiagnostics(
    edition: 'flutter',
    capabilities: [],
    eventCount: 0,
    uptimeMs: 0,
  );
  List<DeviceEvent> events = const [];
  Timer? refreshTimer;
  bool busy = false;

  @override
  void initState() {
    super.initState();
    refresh();
    refreshTimer = Timer.periodic(const Duration(seconds: 1), (_) => refresh());
  }

  @override
  void dispose() {
    refreshTimer?.cancel();
    if (widget.controller is DemoLabosDeviceController) {
      (widget.controller as DemoLabosDeviceController).dispose();
    }
    super.dispose();
  }

  Future<void> refresh() async {
    final next = await widget.controller.snapshot();
    final nextDiagnostics = await widget.controller.diagnostics();
    final nextEvents = await widget.controller.events();
    if (!mounted) return;
    setState(() {
      snapshot = next;
      diagnostics = nextDiagnostics;
      events = nextEvents;
    });
  }

  Future<void> run(Future<DeviceSnapshot> Function() action) async {
    setState(() => busy = true);
    try {
      final next = await action();
      final nextDiagnostics = await widget.controller.diagnostics();
      final nextEvents = await widget.controller.events();
      if (!mounted) return;
      setState(() {
        snapshot = next;
        diagnostics = nextDiagnostics;
        events = nextEvents;
      });
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              colors: [Color(0xff061c17), Color(0xff0d1210), Color(0xff13271f)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _Header(snapshot: snapshot, diagnostics: diagnostics),
                const SizedBox(height: 18),
                _StatusGrid(snapshot: snapshot, diagnostics: diagnostics),
                const SizedBox(height: 18),
                _ControlPanel(
                  snapshot: snapshot,
                  busy: busy,
                  events: events,
                  onPreviewPressed: () => run(
                    snapshot.streaming ? widget.controller.stopPreview : widget.controller.startPreview,
                  ),
                  onRecordingPressed: () => run(
                    snapshot.recording ? widget.controller.stopRecording : widget.controller.startRecording,
                  ),
                  onResetPressed: () => run(widget.controller.reset),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.snapshot, required this.diagnostics});

  final DeviceSnapshot snapshot;
  final DeviceDiagnostics diagnostics;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 42,
          height: 42,
          decoration: BoxDecoration(
            color: const Color(0xff00c27a).withValues(alpha: 0.16),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: const Color(0xff00c27a).withValues(alpha: 0.5)),
          ),
          child: const Icon(Icons.science_outlined, color: Color(0xff4effb7)),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'LabOS Glass',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
              ),
              Text(
                '${snapshot.edition} contract UI · ${diagnostics.capabilities.length} capabilities',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Colors.white70),
              ),
            ],
          ),
        ),
        _Pill(label: snapshot.connected ? 'connected' : 'offline', active: snapshot.connected),
      ],
    );
  }
}

class _StatusGrid extends StatelessWidget {
  const _StatusGrid({required this.snapshot, required this.diagnostics});

  final DeviceSnapshot snapshot;
  final DeviceDiagnostics diagnostics;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 10,
      runSpacing: 10,
      children: [
        _StatusTile(label: 'Preview', value: snapshot.streaming ? 'Live' : 'Idle'),
        _StatusTile(label: 'Recording', value: snapshot.recording ? 'On' : 'Off'),
        _StatusTile(label: 'Frames', value: '${snapshot.frameCount}'),
        _StatusTile(label: 'FPS', value: snapshot.fps.toStringAsFixed(1)),
        _StatusTile(label: 'Events', value: '${diagnostics.eventCount}'),
        _StatusTile(label: 'Uptime', value: '${(diagnostics.uptimeMs / 1000).toStringAsFixed(0)}s'),
      ],
    );
  }
}

class _StatusTile extends StatelessWidget {
  const _StatusTile({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 104,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(color: Colors.white60, fontSize: 12)),
          const SizedBox(height: 8),
          Text(value, style: Theme.of(context).textTheme.titleMedium),
        ],
      ),
    );
  }
}

class _ControlPanel extends StatelessWidget {
  const _ControlPanel({
    required this.snapshot,
    required this.busy,
    required this.events,
    required this.onPreviewPressed,
    required this.onRecordingPressed,
    required this.onResetPressed,
  });

  final DeviceSnapshot snapshot;
  final bool busy;
  final List<DeviceEvent> events;
  final VoidCallback onPreviewPressed;
  final VoidCallback onRecordingPressed;
  final VoidCallback onResetPressed;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.22),
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Device controls', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 14),
            FilledButton.icon(
              onPressed: busy ? null : onPreviewPressed,
              icon: Icon(snapshot.streaming ? Icons.stop_circle_outlined : Icons.play_circle_outline),
              label: Text(snapshot.streaming ? 'Stop preview' : 'Start preview'),
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: busy ? null : onRecordingPressed,
              icon: Icon(snapshot.recording ? Icons.videocam_off_outlined : Icons.videocam_outlined),
              label: Text(snapshot.recording ? 'Stop native recording' : 'Start native recording'),
            ),
            const SizedBox(height: 8),
            TextButton.icon(
              onPressed: busy ? null : onResetPressed,
              icon: const Icon(Icons.restart_alt_outlined),
              label: const Text('Reset prototype state'),
            ),
            const SizedBox(height: 14),
            _PathRow(label: 'Active', value: snapshot.activeVideoPath),
            _PathRow(label: 'Last', value: snapshot.lastVideoPath),
            const SizedBox(height: 12),
            Text('Recent events', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Expanded(child: _EventTimeline(events: events)),
            const SizedBox(height: 10),
            const Text(
              'Production mode swaps the demo controller for PlatformLabosDeviceController and implements the method channel in Android.',
              style: TextStyle(color: Colors.white70),
            ),
          ],
        ),
      ),
    );
  }
}

class _PathRow extends StatelessWidget {
  const _PathRow({required this.label, required this.value});

  final String label;
  final String? value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          SizedBox(width: 52, child: Text(label, style: const TextStyle(color: Colors.white60))),
          Expanded(
            child: Text(
              value ?? 'none',
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: value == null ? Colors.white38 : Colors.white),
            ),
          ),
        ],
      ),
    );
  }
}

class _EventTimeline extends StatelessWidget {
  const _EventTimeline({required this.events});

  final List<DeviceEvent> events;

  @override
  Widget build(BuildContext context) {
    if (events.isEmpty) {
      return const Center(child: Text('No events yet', style: TextStyle(color: Colors.white38)));
    }
    return ListView.separated(
      itemCount: events.length,
      separatorBuilder: (_, __) => const SizedBox(height: 6),
      itemBuilder: (context, index) {
        final event = events[index];
        return Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Row(
            children: [
              const Icon(Icons.bolt_outlined, color: Color(0xff4effb7), size: 18),
              const SizedBox(width: 8),
              Expanded(child: Text(event.type, style: const TextStyle(fontWeight: FontWeight.w700))),
              Text(_time(event.at), style: const TextStyle(color: Colors.white54, fontSize: 12)),
            ],
          ),
        );
      },
    );
  }

  String _time(DateTime value) {
    final local = value.toLocal();
    String two(int v) => v.toString().padLeft(2, '0');
    return '${two(local.hour)}:${two(local.minute)}:${two(local.second)}';
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.label, required this.active});

  final String label;
  final bool active;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: (active ? const Color(0xff00c27a) : Colors.white).withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(label, style: TextStyle(color: active ? const Color(0xff64ffc0) : Colors.white70)),
    );
  }
}

