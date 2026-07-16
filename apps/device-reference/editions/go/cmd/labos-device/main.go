package main

import (
	"log"
	"net/http"
	"os"

	"openlabos.dev/labos/device/editions/go/internal/labos"
)

func main() {
	addr := os.Getenv("LABOS_GO_ADDR")
	if addr == "" {
		addr = "127.0.0.1:8091"
	}
	options := labos.Options{
		StreamFrames:     labos.ParsePositiveEnv(os.Getenv("LABOS_STREAM_FRAMES"), 50),
		StreamIntervalMs: labos.ParsePositiveEnv(os.Getenv("LABOS_STREAM_INTERVAL_MS"), 200),
	}
	server := labos.NewServerWithOptions(labos.NewState(), options)
	log.Printf("LabOS Go edition listening on http://%s", addr)
	log.Fatal(http.ListenAndServe(addr, server.Handler()))
}
