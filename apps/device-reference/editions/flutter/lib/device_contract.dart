import 'dart:async';

import 'package:flutter/services.dart';

class DeviceSnapshot {
  const DeviceSnapshot({
    required this.connected,
    required this.streaming,
    required this.recording,
    required this.frameCount,
    required this.frameBytes,
    required this.fps,
    required this.edition,
    this.activeVideoPath,
    this.lastVideoPath,
  });

  final bool connected;
  final bool streaming;
  final bool recording;
  final int frameCount;
  final int frameBytes;
  final double fps;
  final String edition;
  final String? activeVideoPath;
  final String? lastVideoPath;

  DeviceSnapshot copyWith({
    bool? connected,
    bool? streaming,
    bool? recording,
    int? frameCount,
    int? frameBytes,
    double? fps,
    String? edition,
    String? activeVideoPath,
    String? lastVideoPath,
  }) {
    return DeviceSnapshot(
      connected: connected ?? this.connected,
      streaming: streaming ?? this.streaming,
      recording: recording ?? this.recording,
      frameCount: frameCount ?? this.frameCount,
      frameBytes: frameBytes ?? this.frameBytes,
      fps: fps ?? this.fps,
      edition: edition ?? this.edition,
      activeVideoPath: activeVideoPath ?? this.activeVideoPath,
      lastVideoPath: lastVideoPath ?? this.lastVideoPath,
    );
  }

  factory DeviceSnapshot.fromMap(Map<Object?, Object?> map) {
    return DeviceSnapshot(
      connected: map['connected'] == true,
      streaming: map['streaming'] == true,
      recording: map['recording'] == true,
      frameCount: _int(map['frameCount']),
      frameBytes: _int(map['frameBytes']),
      fps: _double(map['fps']),
      edition: '${map['edition'] ?? 'flutter'}',
      activeVideoPath: map['activeVideoPath'] as String?,
      lastVideoPath: map['lastVideoPath'] as String?,
    );
  }

  static int intValue(Object? value) => _int(value);

  static double doubleValue(Object? value) => _double(value);

  static int _int(Object? value) {
    if (value is int) return value;
    if (value is num) return value.toInt();
    return int.tryParse('$value') ?? 0;
  }

  static double _double(Object? value) {
    if (value is double) return value;
    if (value is num) return value.toDouble();
    return double.tryParse('$value') ?? 0;
  }
}

class DeviceDiagnostics {
  const DeviceDiagnostics({
    required this.edition,
    required this.capabilities,
    required this.eventCount,
    required this.uptimeMs,
  });

  final String edition;
  final List<String> capabilities;
  final int eventCount;
  final int uptimeMs;

  factory DeviceDiagnostics.fromMap(Map<Object?, Object?> map) {
    final rawCapabilities = map['capabilities'];
    return DeviceDiagnostics(
      edition: '${map['edition'] ?? 'flutter'}',
      capabilities: rawCapabilities is Iterable ? rawCapabilities.map((item) => '$item').toList() : const [],
      eventCount: DeviceSnapshot.intValue(map['eventCount']),
      uptimeMs: DeviceSnapshot.intValue(map['uptimeMs']),
    );
  }
}

class DeviceEvent {
  const DeviceEvent({
    required this.type,
    required this.at,
    this.details = const {},
  });

  final String type;
  final DateTime at;
  final Map<String, Object?> details;

  factory DeviceEvent.fromMap(Map<Object?, Object?> map) {
    final details = <String, Object?>{};
    final rawDetails = map['details'];
    if (rawDetails is Map) {
      for (final entry in rawDetails.entries) {
        details['${entry.key}'] = entry.value;
      }
    }
    return DeviceEvent(
      type: '${map['type'] ?? 'unknown'}',
      at: DateTime.tryParse('${map['at'] ?? ''}') ?? DateTime.now(),
      details: details,
    );
  }
}

abstract interface class LabosDeviceController {
  Future<DeviceSnapshot> snapshot();

  Future<DeviceDiagnostics> diagnostics();

  Future<List<DeviceEvent>> events();

  Future<DeviceSnapshot> startPreview();

  Future<DeviceSnapshot> stopPreview();

  Future<DeviceSnapshot> startRecording();

  Future<DeviceSnapshot> stopRecording();

  Future<DeviceSnapshot> reset();
}

class PlatformLabosDeviceController implements LabosDeviceController {
  PlatformLabosDeviceController({
    MethodChannel channel = const MethodChannel('com.openlab.labos/device'),
  }) : _channel = channel;

  final MethodChannel _channel;

  @override
  Future<DeviceSnapshot> snapshot() async {
    final value = await _channel.invokeMapMethod<Object?, Object?>('snapshot');
    return DeviceSnapshot.fromMap(value ?? const {});
  }

  @override
  Future<DeviceDiagnostics> diagnostics() async {
    final value = await _channel.invokeMapMethod<Object?, Object?>('diagnostics');
    return DeviceDiagnostics.fromMap(value ?? const {});
  }

  @override
  Future<List<DeviceEvent>> events() async {
    final value = await _channel.invokeMapMethod<Object?, Object?>('events');
    final rawEvents = value?['events'];
    if (rawEvents is! Iterable) return const [];
    return rawEvents.whereType<Map<Object?, Object?>>().map(DeviceEvent.fromMap).toList();
  }

  @override
  Future<DeviceSnapshot> startPreview() => _invoke('startPreview');

  @override
  Future<DeviceSnapshot> stopPreview() => _invoke('stopPreview');

  @override
  Future<DeviceSnapshot> startRecording() => _invoke('startRecording');

  @override
  Future<DeviceSnapshot> stopRecording() => _invoke('stopRecording');

  @override
  Future<DeviceSnapshot> reset() => _invoke('reset');

  Future<DeviceSnapshot> _invoke(String method) async {
    final value = await _channel.invokeMapMethod<Object?, Object?>(method);
    return DeviceSnapshot.fromMap(value ?? const {});
  }
}

class DemoLabosDeviceController implements LabosDeviceController {
  DemoLabosDeviceController() {
    _event('service_started');
  }

  final DateTime _startedAt = DateTime.now();
  final List<DeviceEvent> _events = [];

  DeviceSnapshot _snapshot = const DeviceSnapshot(
    connected: true,
    streaming: false,
    recording: false,
    frameCount: 0,
    frameBytes: 0,
    fps: 0,
    edition: 'flutter-demo',
  );

  Timer? _timer;

  void dispose() {
    _timer?.cancel();
  }

  @override
  Future<DeviceSnapshot> snapshot() async => _snapshot;

  @override
  Future<DeviceDiagnostics> diagnostics() async {
    return DeviceDiagnostics(
      edition: _snapshot.edition,
      capabilities: const [
        'interactive-ui',
        'demo-controller',
        'platform-channel-ready',
        'preview-controls',
        'recording-controls',
        'event-log',
      ],
      eventCount: _events.length,
      uptimeMs: DateTime.now().difference(_startedAt).inMilliseconds,
    );
  }

  @override
  Future<List<DeviceEvent>> events() async => List.unmodifiable(_events.reversed.take(12));

  @override
  Future<DeviceSnapshot> startPreview() async {
    final changed = !_snapshot.streaming;
    _snapshot = _snapshot.copyWith(streaming: true, fps: 12, frameBytes: 48000);
    if (changed) _event('preview_started');
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(milliseconds: 250), (_) {
      if (!_snapshot.streaming) return;
      _snapshot = _snapshot.copyWith(frameCount: _snapshot.frameCount + 3);
    });
    return _snapshot;
  }

  @override
  Future<DeviceSnapshot> stopPreview() async {
    final changed = _snapshot.streaming;
    _snapshot = _snapshot.copyWith(streaming: false, fps: 0);
    if (changed) _event('preview_stopped');
    return _snapshot;
  }

  @override
  Future<DeviceSnapshot> startRecording() async {
    final changed = !_snapshot.recording;
    final path = _snapshot.activeVideoPath ??
        '/sdcard/Movies/LabOS/flutter-demo-${DateTime.now().millisecondsSinceEpoch}.mp4';
    _snapshot = _snapshot.copyWith(recording: true, activeVideoPath: path);
    if (changed) _event('recording_started', {'path': path});
    if (!_snapshot.streaming) {
      await startPreview();
      _snapshot = _snapshot.copyWith(recording: true, activeVideoPath: path);
    }
    return _snapshot;
  }

  @override
  Future<DeviceSnapshot> stopRecording() async {
    final changed = _snapshot.recording;
    final last = _snapshot.activeVideoPath;
    _snapshot = DeviceSnapshot(
      connected: _snapshot.connected,
      streaming: _snapshot.streaming,
      recording: false,
      frameCount: _snapshot.frameCount,
      frameBytes: _snapshot.frameBytes,
      fps: _snapshot.fps,
      edition: _snapshot.edition,
      lastVideoPath: last,
    );
    if (changed) _event('recording_stopped', {'path': last});
    return _snapshot;
  }

  @override
  Future<DeviceSnapshot> reset() async {
    _timer?.cancel();
    _snapshot = const DeviceSnapshot(
      connected: true,
      streaming: false,
      recording: false,
      frameCount: 0,
      frameBytes: 0,
      fps: 0,
      edition: 'flutter-demo',
    );
    _events.clear();
    _event('state_reset');
    return _snapshot;
  }

  void _event(String type, [Map<String, Object?> details = const {}]) {
    _events.add(DeviceEvent(type: type, at: DateTime.now(), details: details));
  }
}

