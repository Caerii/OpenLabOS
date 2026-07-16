package labos

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHealthRoute(t *testing.T) {
	server := NewServer(NewState())

	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	rec := httptest.NewRecorder()
	server.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec.Code)
	}
	if got := rec.Header().Get("content-type"); got != "application/json" {
		t.Fatalf("expected json content type, got %q", got)
	}
}

func TestRecordingIsIdempotent(t *testing.T) {
	server := NewServer(NewState())

	for i := 0; i < 2; i++ {
		req := httptest.NewRequest(http.MethodPost, "/api/preview/recording/start", nil)
		rec := httptest.NewRecorder()
		server.Handler().ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("start %d expected 200, got %d", i, rec.Code)
		}
	}

	req := httptest.NewRequest(http.MethodPost, "/api/preview/recording/stop", nil)
	rec := httptest.NewRecorder()
	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("stop expected 200, got %d", rec.Code)
	}
}

func TestEventsCaptureStateTransitions(t *testing.T) {
	server := NewServer(NewState())

	for _, path := range []string{"/api/preview/start", "/api/preview/recording/start", "/api/preview/recording/stop"} {
		req := httptest.NewRequest(http.MethodPost, path, nil)
		rec := httptest.NewRecorder()
		server.Handler().ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("%s expected 200, got %d", path, rec.Code)
		}
	}

	req := httptest.NewRequest(http.MethodGet, "/api/events", nil)
	rec := httptest.NewRecorder()
	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("events expected 200, got %d", rec.Code)
	}

	var body struct {
		Count int `json:"count"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body.Count < 4 {
		t.Fatalf("expected at least 4 events, got %d", body.Count)
	}
}

func TestMetricsCountsRequests(t *testing.T) {
	server := NewServer(NewState())

	for i := 0; i < 3; i++ {
		req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
		rec := httptest.NewRecorder()
		server.Handler().ServeHTTP(rec, req)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/metrics", nil)
	rec := httptest.NewRecorder()
	server.Handler().ServeHTTP(rec, req)

	var body struct {
		TotalRequests int64            `json:"totalRequests"`
		RequestCounts map[string]int64 `json:"requestCounts"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body.TotalRequests < 4 {
		t.Fatalf("expected at least 4 requests, got %d", body.TotalRequests)
	}
	if body.RequestCounts["GET /api/health"] != 3 {
		t.Fatalf("expected three health requests, got %d", body.RequestCounts["GET /api/health"])
	}
}

func TestResetClearsRuntimeState(t *testing.T) {
	server := NewServer(NewState())

	req := httptest.NewRequest(http.MethodPost, "/api/preview/recording/start", nil)
	rec := httptest.NewRecorder()
	server.Handler().ServeHTTP(rec, req)

	req = httptest.NewRequest(http.MethodPost, "/api/control/reset", nil)
	rec = httptest.NewRecorder()
	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("reset expected 200, got %d", rec.Code)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/preview/recording/status", nil)
	rec = httptest.NewRecorder()
	server.Handler().ServeHTTP(rec, req)

	var body struct {
		Recording bool `json:"recording"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body.Recording {
		t.Fatal("recording should be false after reset")
	}
}

func TestParsePositiveEnv(t *testing.T) {
	if got := ParsePositiveEnv("42", 7); got != 42 {
		t.Fatalf("expected 42, got %d", got)
	}
	if got := ParsePositiveEnv("-1", 7); got != 7 {
		t.Fatalf("expected fallback 7, got %d", got)
	}
}
