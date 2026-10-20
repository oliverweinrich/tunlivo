// Copyright 2026 Oliver Weinrich
// SPDX-License-Identifier: Apache-2.0

package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"
)

func public(n byte) string { return base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{n}, 32)) }
func setup(t *testing.T) state {
	t.Helper()
	old := data
	data = t.TempDir()
	t.Cleanup(func() { data = old })
	s := state{Role: "server", Public: public(1), Token: strings.Repeat("a", 64), Expires: time.Now().Add(time.Minute)}
	if err := save(s); err != nil {
		t.Fatal(err)
	}
	return s
}
func request(h http.Handler, token, key, addr string) int {
	b, _ := json.Marshal(registration{Public: key, Address: addr})
	r := httptest.NewRequest(http.MethodPost, "https://gateway/pair", bytes.NewReader(b))
	r.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w.Code
}
func TestEnrollmentPolicy(t *testing.T) {
	s := setup(t)
	h := pairHandler("10.66.66.1/32", "10.66.66.2/32")
	if c := request(h, "wrong", public(2), "10.66.66.2/32"); c != 403 {
		t.Fatal(c)
	}
	if c := request(h, s.Token, public(2), "10.66.66.99/32"); c != 400 {
		t.Fatal(c)
	}
	if c := request(h, s.Token, "invalid", "10.66.66.2/32"); c != 400 {
		t.Fatal(c)
	}
	if c := request(h, s.Token, public(2), "10.66.66.2/32"); c != 200 {
		t.Fatal(c)
	}
	// Same identity can retry a lost response; a new identity cannot redeem it.
	if c := request(h, s.Token, public(2), "10.66.66.2/32"); c != 200 {
		t.Fatal(c)
	}
	if c := request(h, s.Token, public(3), "10.66.66.2/32"); c != 409 {
		t.Fatal(c)
	}
	saved, err := load()
	if err != nil || saved.Peer != public(2) {
		t.Fatal("peer not persisted", err)
	}
	saved.Expires = time.Now().Add(-time.Second)
	if err := save(saved); err != nil {
		t.Fatal(err)
	}
	if c := request(h, s.Token, public(2), "10.66.66.2/32"); c != 403 {
		t.Fatal(c)
	}
}
func TestConcurrentRedemption(t *testing.T) {
	s := setup(t)
	h := pairHandler("10.66.66.1/32", "10.66.66.2/32")
	var wg sync.WaitGroup
	results := make(chan int, 2)
	for _, n := range []byte{2, 3} {
		wg.Add(1)
		go func(n byte) { defer wg.Done(); results <- request(h, s.Token, public(n), "10.66.66.2/32") }(n)
	}
	wg.Wait()
	close(results)
	counts := map[int]int{}
	for c := range results {
		counts[c]++
	}
	if counts[200] != 1 || counts[409] != 1 {
		t.Fatal(counts)
	}
}
func TestPinnedTLSJoinAndRestart(t *testing.T) {
	setup(t)
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer "+strings.Repeat("a", 64) {
			w.WriteHeader(403)
			return
		}
		json.NewEncoder(w).Encode(answer{Public: public(1), Address: "10.66.66.1/32"})
	}))
	defer server.Close()
	hash := sha256.Sum256(server.Certificate().Raw)
	t.Setenv("PAIR_CODE", "wg1."+hex.EncodeToString(hash[:])+"."+strings.Repeat("a", 64))
	t.Setenv("PAIR_SERVER", strings.TrimPrefix(server.URL, "https://"))
	t.Setenv("WG_ENDPOINT", "example.com:51820")
	t.Setenv("WG_ADDRESS", "10.66.66.2/32")
	client := state{Role: "client", Public: public(2), Private: "private-stays-local"}
	if err := save(client); err != nil {
		t.Fatal(err)
	}
	if err := join(); err != nil {
		t.Fatal(err)
	}
	saved, err := load()
	if err != nil || saved.Peer != public(1) || saved.Private != client.Private {
		t.Fatal(saved, err)
	}
	t.Setenv("PAIR_CODE", "")
	server.Close()
	if err := join(); err != nil {
		t.Fatal("restart required enrollment", err)
	}
}
func TestInvitePin(t *testing.T) {
	s := setup(t)
	server := httptest.NewTLSServer(http.NotFoundHandler())
	defer server.Close()
	s.Certificate = pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: server.Certificate().Raw})
	hash := sha256.Sum256(server.Certificate().Raw)
	if code(s) != "wg1."+hex.EncodeToString(hash[:])+"."+s.Token {
		t.Fatal("wrong pin")
	}
}
func TestInvalidStateIsNotReplaced(t *testing.T) {
	setup(t)
	if err := os.WriteFile(data+"/state.json", []byte("broken"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := initialize("server"); err == nil {
		t.Fatal("corrupt state replaced")
	}
}

func TestWrongFingerprintRejectsServer(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { t.Error("request sent to wrong server") }))
	defer server.Close()
	tr := &http.Transport{TLSClientConfig: pinnedTLS(make([]byte, 32))}
	defer tr.CloseIdleConnections()
	client := &http.Client{Transport: tr, Timeout: time.Second}
	if res, err := client.Get(server.URL); err == nil {
		res.Body.Close()
		t.Fatal("wrong fingerprint accepted")
	}
}
