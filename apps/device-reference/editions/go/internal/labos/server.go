package labos

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"sync"
	"time"
)

var OnePixelJPEG = []byte{
	0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x03, 0x02, 0x02, 0x03, 0x02,
	0x02, 0x03, 0x03, 0x03, 0x03, 0x04, 0x03, 0x03, 0x04, 0x05, 0x08, 0x05,
	0x05, 0x04, 0x04, 0x05, 0x0a, 0x07, 0x07, 0x06, 0x08, 0x0c, 0x0a, 0x0c,
	0x0c, 0x0b, 0x0a, 0x0b, 0x0b, 0x0d, 0x0e, 0x12, 0x10, 0x0d, 0x0e, 0x11,
	0x0e, 0x0b, 0x0b, 0x10, 0x16, 0x10, 0x11, 0x13, 0x14, 0x15, 0x15, 0x15,
	0x0c, 0x0f, 0x17, 0x18, 0x16, 0x14, 0x18, 0x12, 0x14, 0x15, 0x14, 0xff,
	0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
	0xff, 0xc4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
	0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x08, 0xff, 0xc4,
	0x00, 0x14, 0x10, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
	0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff, 0xda, 0x00, 0x08,
	0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x37, 0xff, 0xd9,
}

type Event struct {
	At      time.Time      `json:"at"`
	Type    string         `json:"type"`
	Details map[string]any `json:"details,omitempty"`
}

type State struct {
	mu              sync.Mutex
	startedAt       time.Time
	streaming       bool
	recording       bool
	frameCount      int64
	recordingPath   string
	lastVideoPath   string
	lastFrameServed time.Time
	events          []Event
	requestCounts   map[string]int64
	totalRequests   int64
}

func NewState() *State {
	s := &State{startedAt: time.Now(), requestCounts: map[string]int64{}}
	s.appendEventLocked("service_started", map[string]any{"edition": "go"})
	return s
}

type Options struct {
	StreamFrames     int
	StreamIntervalMs int
}

type Server struct {
	state   *State
	mux     *http.ServeMux
	options Options
}

func NewServer(state *State) *Server {
	return NewServerWithOptions(state, Options{})
}

func NewServerWithOptions(state *State, options Options) *Server {
	if state == nil {
		state = NewState()
	}
	if options.StreamFrames <= 0 {
		options.StreamFrames = 50
	}
	if options.StreamIntervalMs <= 0 {
		options.StreamIntervalMs = 200
	}
	s := &Server{state: state, mux: http.NewServeMux(), options: options}
	s.registerRoutes()
	return s
}

func (s *Server) Handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		s.recordRequest(r.Method, r.URL.Path)
		s.mux.ServeHTTP(w, r)
	})
}

func (s *Server) registerRoutes() {
	s.mux.HandleFunc("/api/health", s.handleHealth)
	s.mux.HandleFunc("/api/device/status", s.handleDeviceStatus)
	s.mux.HandleFunc("/api/labos/status", s.handleLabosStatus)
	s.mux.HandleFunc("/api/preview/start", s.handlePreviewStart)
	s.mux.HandleFunc("/api/preview/stop", s.handlePreviewStop)
	s.mux.HandleFunc("/api/preview/health", s.handlePreviewHealth)
	s.mux.HandleFunc("/api/preview/frame", s.handleFrame)
	s.mux.HandleFunc("/api/preview/stream", s.handleStream)
	s.mux.HandleFunc("/api/preview/recording/start", s.handleRecordingStart)
	s.mux.HandleFunc("/api/preview/recording/stop", s.handleRecordingStop)
	s.mux.HandleFunc("/api/preview/recording/status", s.handleRecordingStatus)
	s.mux.HandleFunc("/api/events", s.handleEvents)
	s.mux.HandleFunc("/api/diagnostics", s.handleDiagnostics)
	s.mux.HandleFunc("/api/metrics", s.handleMetrics)
	s.mux.HandleFunc("/api/control/reset", s.handleReset)
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	s.state.mu.Lock()
	uptime := time.Since(s.state.startedAt).Milliseconds()
	s.state.mu.Unlock()
	writeJSON(w, map[string]any{
		"ok":       true,
		"service":  "labos-device-go",
		"edition":  "go",
		"version":  "0.2.0",
		"uptimeMs": uptime,
	})
}

func (s *Server) handleDeviceStatus(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, map[string]any{
		"connected": true,
		"device":    "local-go-edition",
		"transport": "loopback",
	})
}

func (s *Server) handleLabosStatus(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, map[string]any{
		"isInstalled": true,
		"isRunning":   true,
		"edition":     "go",
		"modules": []map[string]any{{
			"name":                 "go-single-binary",
			"installed":            true,
			"isLatest":             true,
			"installedVersionName": "0.2.0",
			"builtVersionName":     "0.2.0",
		}},
	})
}

func (s *Server) handlePreviewStart(w http.ResponseWriter, r *http.Request) {
	if !allowMethod(w, r, http.MethodPost) {
		return
	}
	s.state.mu.Lock()
	changed := !s.state.streaming
	s.state.streaming = true
	if changed {
		s.state.appendEventLocked("preview_started", nil)
	}
	s.state.mu.Unlock()
	writeJSON(w, map[string]any{"success": true, "streaming": true, "changed": changed})
}

func (s *Server) handlePreviewStop(w http.ResponseWriter, r *http.Request) {
	if !allowMethod(w, r, http.MethodPost) {
		return
	}
	s.state.mu.Lock()
	changed := s.state.streaming
	s.state.streaming = false
	if changed {
		s.state.appendEventLocked("preview_stopped", nil)
	}
	s.state.mu.Unlock()
	writeJSON(w, map[string]any{"success": true, "streaming": false, "changed": changed})
}

func (s *Server) handlePreviewHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, s.previewHealth())
}

func (s *Server) previewHealth() map[string]any {
	s.state.mu.Lock()
	defer s.state.mu.Unlock()
	return map[string]any{
		"streaming":       s.state.streaming,
		"fps":             0,
		"frameCount":      s.state.frameCount,
		"frameReachable":  true,
		"frameBytes":      len(OnePixelJPEG),
		"recording":       s.state.recording,
		"activeVideoPath": nullable(s.state.recordingPath),
		"lastVideoPath":   nullable(s.state.lastVideoPath),
		"lastFrameServed": nullableTime(s.state.lastFrameServed),
	}
}

func (s *Server) handleFrame(w http.ResponseWriter, _ *http.Request) {
	s.recordFrameServed()
	w.Header().Set("content-type", "image/jpeg")
	_, _ = w.Write(OnePixelJPEG)
}

func (s *Server) handleStream(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("content-type", "multipart/x-mixed-replace; boundary=labos")
	ticker := time.NewTicker(time.Duration(s.options.StreamIntervalMs) * time.Millisecond)
	defer ticker.Stop()
	for i := 0; i < s.options.StreamFrames; i++ {
		select {
		case <-r.Context().Done():
			return
		case <-ticker.C:
			s.recordFrameServed()
			_, _ = fmt.Fprintf(w, "--labos\r\ncontent-type: image/jpeg\r\ncontent-length: %d\r\n\r\n", len(OnePixelJPEG))
			_, _ = w.Write(OnePixelJPEG)
			_, _ = w.Write([]byte("\r\n"))
			flusher.Flush()
		}
	}
}

func (s *Server) handleRecordingStart(w http.ResponseWriter, r *http.Request) {
	if !allowMethod(w, r, http.MethodPost) {
		return
	}
	s.state.mu.Lock()
	changed := !s.state.recording
	if changed {
		s.state.recordingPath = fmt.Sprintf("/tmp/labos-go-recording-%d.mp4", time.Now().UnixMilli())
		s.state.appendEventLocked("recording_started", map[string]any{"path": s.state.recordingPath})
	}
	s.state.recording = true
	active := s.state.recordingPath
	s.state.mu.Unlock()
	writeJSON(w, map[string]any{"success": true, "recording": true, "changed": changed, "activeVideoPath": active})
}

func (s *Server) handleRecordingStop(w http.ResponseWriter, r *http.Request) {
	if !allowMethod(w, r, http.MethodPost) {
		return
	}
	s.state.mu.Lock()
	changed := s.state.recording
	last := s.state.recordingPath
	s.state.recording = false
	if changed {
		s.state.lastVideoPath = last
		s.state.appendEventLocked("recording_stopped", map[string]any{"path": last})
	}
	s.state.recordingPath = ""
	s.state.mu.Unlock()
	writeJSON(w, map[string]any{"success": true, "recording": false, "changed": changed, "lastVideoPath": nullable(last)})
}

func (s *Server) handleRecordingStatus(w http.ResponseWriter, _ *http.Request) {
	s.state.mu.Lock()
	defer s.state.mu.Unlock()
	writeJSON(w, map[string]any{
		"recording":       s.state.recording,
		"activeVideoPath": nullable(s.state.recordingPath),
		"lastVideoPath":   nullable(s.state.lastVideoPath),
		"source":          "go-edition",
	})
}

func (s *Server) handleEvents(w http.ResponseWriter, _ *http.Request) {
	s.state.mu.Lock()
	events := append([]Event(nil), s.state.events...)
	s.state.mu.Unlock()
	writeJSON(w, map[string]any{"events": events, "count": len(events)})
}

func (s *Server) handleDiagnostics(w http.ResponseWriter, _ *http.Request) {
	s.state.mu.Lock()
	eventCount := len(s.state.events)
	uptime := time.Since(s.state.startedAt).Milliseconds()
	s.state.mu.Unlock()
	writeJSON(w, map[string]any{
		"edition":          "go",
		"capabilities":     []string{"http-api", "synthetic-frame", "event-log", "mjpeg-stream", "idempotent-recording"},
		"eventCount":       eventCount,
		"uptimeMs":         uptime,
		"frameFixtureLen":  len(OnePixelJPEG),
		"streamFrames":     s.options.StreamFrames,
		"streamIntervalMs": s.options.StreamIntervalMs,
	})
}

func (s *Server) handleMetrics(w http.ResponseWriter, _ *http.Request) {
	s.state.mu.Lock()
	requestCounts := make(map[string]int64, len(s.state.requestCounts))
	for key, value := range s.state.requestCounts {
		requestCounts[key] = value
	}
	totalRequests := s.state.totalRequests
	frameCount := s.state.frameCount
	uptimeMs := time.Since(s.state.startedAt).Milliseconds()
	s.state.mu.Unlock()
	writeJSON(w, map[string]any{
		"edition":       "go",
		"totalRequests": totalRequests,
		"requestCounts": requestCounts,
		"frameCount":    frameCount,
		"uptimeMs":      uptimeMs,
	})
}

func (s *Server) handleReset(w http.ResponseWriter, r *http.Request) {
	if !allowMethod(w, r, http.MethodPost) {
		return
	}
	s.state.mu.Lock()
	s.state.streaming = false
	s.state.recording = false
	s.state.frameCount = 0
	s.state.recordingPath = ""
	s.state.lastVideoPath = ""
	s.state.lastFrameServed = time.Time{}
	s.state.events = nil
	s.state.requestCounts = map[string]int64{}
	s.state.totalRequests = 0
	s.state.appendEventLocked("state_reset", nil)
	s.state.mu.Unlock()
	writeJSON(w, map[string]any{"success": true, "reset": true})
}

func (s *Server) recordFrameServed() {
	s.state.mu.Lock()
	s.state.frameCount++
	s.state.lastFrameServed = time.Now()
	if s.state.frameCount == 1 || s.state.frameCount%25 == 0 {
		s.state.appendEventLocked("frame_served", map[string]any{"frameCount": s.state.frameCount})
	}
	s.state.mu.Unlock()
}

func (s *Server) recordRequest(method string, path string) {
	s.state.mu.Lock()
	key := method + " " + path
	s.state.requestCounts[key]++
	s.state.totalRequests++
	s.state.mu.Unlock()
}

func (s *State) appendEventLocked(kind string, details map[string]any) {
	s.events = append(s.events, Event{At: time.Now().UTC(), Type: kind, Details: details})
	if len(s.events) > 200 {
		s.events = s.events[len(s.events)-200:]
	}
}

func allowMethod(w http.ResponseWriter, r *http.Request, method string) bool {
	if r.Method == method {
		return true
	}
	http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	return false
}

func writeJSON(w http.ResponseWriter, value any) {
	w.Header().Set("content-type", "application/json")
	_ = json.NewEncoder(w).Encode(value)
}

func nullable(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func nullableTime(value time.Time) any {
	if value.IsZero() {
		return nil
	}
	return value.UTC().Format(time.RFC3339Nano)
}

func ParsePositiveEnv(value string, fallback int) int {
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed <= 0 {
		return fallback
	}
	return parsed
}
