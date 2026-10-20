// Copyright 2026 Oliver Weinrich
// SPDX-License-Identifier: Apache-2.0

// gateway-pair implements optional, single-peer enrollment over pinned TLS.
package main

import (
	"bytes"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"log"
	"math/big"
	"net"
	"net/http"
	"net/netip"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

type state struct {
	Role        string
	Private     string
	Public      string
	Peer        string
	PeerAddress string
	Endpoint    string
	Certificate []byte
	TLSKey      []byte
	Token       string
	Expires     time.Time
}
type registration struct {
	Public  string
	Address string
}
type answer struct {
	Public  string
	Address string
}

var data = env("PAIR_DATA_DIR", "/data")

func env(k, fallback string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return fallback
}
func fail(err error) {
	if err != nil {
		log.Fatal(err)
	}
}
func save(s state) error {
	b, err := json.Marshal(s)
	if err != nil {
		return err
	}
	f, err := os.CreateTemp(data, ".state-*")
	if err != nil {
		return err
	}
	defer os.Remove(f.Name())
	if _, err = f.Write(b); err != nil {
		f.Close()
		return err
	}
	if err = f.Sync(); err != nil {
		f.Close()
		return err
	}
	if err = f.Close(); err != nil {
		return err
	}
	return os.Rename(f.Name(), filepath.Join(data, "state.json"))
}
func load() (s state, err error) {
	b, err := os.ReadFile(filepath.Join(data, "state.json"))
	if err != nil {
		return s, err
	}
	err = json.Unmarshal(b, &s)
	return
}

// All state mutations, including independent invite/renew commands, share this lock.
func locked(fn func() error) error {
	if err := os.MkdirAll(data, 0700); err != nil {
		return err
	}
	f, err := os.OpenFile(filepath.Join(data, "state.lock"), os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return err
	}
	defer f.Close()
	if err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX); err != nil {
		return err
	}
	defer syscall.Flock(int(f.Fd()), syscall.LOCK_UN)
	return fn()
}
func newToken(s *state) error {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return err
	}
	s.Token = hex.EncodeToString(b)
	s.Expires = time.Now().Add(10 * time.Minute)
	return nil
}
func initialize(role string) error {
	return locked(func() error {
		s, err := load()
		if err == nil {
			if s.Role != role {
				return errors.New("Datenvolume gehört zur anderen Rolle")
			}
			return nil
		}
		if !os.IsNotExist(err) {
			return err
		}
		private, err := exec.Command("wg", "genkey").Output()
		if err != nil {
			return err
		}
		cmd := exec.Command("wg", "pubkey")
		cmd.Stdin = bytes.NewReader(private)
		public, err := cmd.Output()
		if err != nil {
			return err
		}
		s = state{Role: role, Private: strings.TrimSpace(string(private)), Public: strings.TrimSpace(string(public))}
		if role == "server" {
			key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
			if err != nil {
				return err
			}
			serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
			if err != nil {
				return err
			}
			cert := &x509.Certificate{SerialNumber: serial, Subject: pkix.Name{CommonName: "Tunlivo enrollment"}, NotBefore: time.Now().Add(-time.Minute), NotAfter: time.Now().AddDate(10, 0, 0), KeyUsage: x509.KeyUsageDigitalSignature, ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}}
			der, err := x509.CreateCertificate(rand.Reader, cert, cert, &key.PublicKey, key)
			if err != nil {
				return err
			}
			encoded, err := x509.MarshalECPrivateKey(key)
			if err != nil {
				return err
			}
			s.Certificate = pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
			s.TLSKey = pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: encoded})
			if err := newToken(&s); err != nil {
				return err
			}
		}
		return save(s)
	})
}
func code(s state) string {
	block, _ := pem.Decode(s.Certificate)
	if block == nil {
		return ""
	}
	hash := sha256.Sum256(block.Bytes)
	return "wg1." + hex.EncodeToString(hash[:]) + "." + s.Token
}
func keyOK(k string) bool {
	b, e := base64.StdEncoding.DecodeString(k)
	return e == nil && len(b) == 32 && k != base64.StdEncoding.EncodeToString(make([]byte, 32))
}
func address(v string) (string, error) {
	p, err := netip.ParsePrefix(v)
	if err != nil || !p.Addr().Is4() {
		return "", errors.New("IPv4-Tunneladresse mit Präfix erforderlich")
	}
	return p.Addr().String() + "/32", nil
}
func endpointOK(v string) bool {
	h, p, e := net.SplitHostPort(v)
	n, e2 := strconv.Atoi(p)
	return e == nil && e2 == nil && n > 0 && n <= 65535 && h != "" && !strings.ContainsAny(h, " \t\r\n/[]:")
}
func serve() error {
	if err := initialize("server"); err != nil {
		return err
	}
	own, err := address(os.Getenv("WG_ADDRESS"))
	if err != nil {
		return err
	}
	expected, err := address(env("PAIR_PEER_ADDRESS", "10.66.66.2/32"))
	if err != nil {
		return err
	}
	s, err := load()
	if err != nil {
		return err
	}
	if s.Peer != "" && s.PeerAddress != expected {
		return errors.New("PAIR_PEER_ADDRESS stimmt nicht mit gespeicherter Kopplung überein")
	}
	cert, err := tls.X509KeyPair(s.Certificate, s.TLSKey)
	if err != nil {
		return err
	}
	mux := pairHandler(own, expected)
	port := env("PAIR_PORT", "51821")
	if !endpointOK("localhost:" + port) {
		return errors.New("Ungültiger PAIR_PORT")
	}
	listener, err := net.Listen("tcp", ":"+port)
	if err != nil {
		return err
	}
	if s.Peer == "" {
		if time.Now().Before(s.Expires) {
			fmt.Println("Einladung (10 Minuten ab Erstellung gültig): " + code(s))
		} else {
			log.Print("Einladung abgelaufen; mit gateway-pair renew erneuern.")
		}
	}
	server := &http.Server{Handler: mux, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 10 * time.Second, IdleTimeout: 10 * time.Second, MaxHeaderBytes: 4096, TLSConfig: &tls.Config{MinVersion: tls.VersionTLS13, Certificates: []tls.Certificate{cert}}, ErrorLog: log.New(io.Discard, "", 0)}
	return server.Serve(tls.NewListener(listener, server.TLSConfig))
}
func pairHandler(own, expected string) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/pair", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		var reply answer
		status := http.StatusForbidden
		err := locked(func() error {
			current, err := load()
			if err != nil {
				return err
			}
			supplied := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
			if time.Now().After(current.Expires) || subtle.ConstantTimeCompare([]byte(supplied), []byte(current.Token)) != 1 {
				return nil
			}
			var req registration
			dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024))
			dec.DisallowUnknownFields()
			if err := dec.Decode(&req); err != nil {
				status = http.StatusBadRequest
				return nil
			}
			if dec.Decode(new(any)) != io.EOF || !keyOK(req.Public) || req.Address != expected || req.Public == current.Public {
				status = http.StatusBadRequest
				return nil
			}
			// An interrupted response may be retried by the same identity only.
			if current.Peer != "" && current.Peer != req.Public {
				status = http.StatusConflict
				return nil
			}
			if current.Peer == "" {
				current.Peer = req.Public
				current.PeerAddress = expected
				if err := save(current); err != nil {
					return err
				}
				log.Print("Kopplung gespeichert; Einladung für weitere Clients gesperrt.")
			}
			reply = answer{Public: current.Public, Address: own}
			status = http.StatusOK
			return nil
		})
		if err != nil {
			log.Print("Kopplung konnte nicht gespeichert werden")
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		if status != http.StatusOK {
			w.WriteHeader(status)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		json.NewEncoder(w).Encode(reply)
	})
	return mux
}
func pinnedTLS(pin []byte) *tls.Config {
	return &tls.Config{MinVersion: tls.VersionTLS13,
		// The invitation pins the exact self-signed certificate instead of a CA/name.
		InsecureSkipVerify: true,
		VerifyConnection: func(cs tls.ConnectionState) error {
			if len(cs.PeerCertificates) == 0 {
				return errors.New("Serverzertifikat fehlt")
			}
			hash := sha256.Sum256(cs.PeerCertificates[0].Raw)
			if subtle.ConstantTimeCompare(hash[:], pin) != 1 {
				return errors.New("Server-Fingerabdruck stimmt nicht")
			}
			return nil
		},
	}
}
func join() error {
	if err := initialize("client"); err != nil {
		return err
	}
	s, err := load()
	if err != nil {
		return err
	}
	if s.Peer != "" {
		return nil
	}
	parts := strings.Split(os.Getenv("PAIR_CODE"), ".")
	if len(parts) != 3 || parts[0] != "wg1" {
		return errors.New("PAIR_CODE fehlt oder ist ungültig")
	}
	pin, e := hex.DecodeString(parts[1])
	secret, e2 := hex.DecodeString(parts[2])
	if e != nil || e2 != nil || len(pin) != 32 || len(secret) != 32 {
		return errors.New("Ungültiger PAIR_CODE")
	}
	endpoint := os.Getenv("WG_ENDPOINT")
	host := os.Getenv("PAIR_SERVER")
	if !endpointOK(endpoint) || !endpointOK(host) {
		return errors.New("WG_ENDPOINT und PAIR_SERVER müssen HOST:PORT enthalten")
	}
	own, err := address(os.Getenv("WG_ADDRESS"))
	if err != nil {
		return err
	}
	expected, err := address(env("PAIR_PEER_ADDRESS", "10.66.66.1/32"))
	if err != nil {
		return err
	}
	config := pinnedTLS(pin)
	transport := &http.Transport{TLSClientConfig: config, Proxy: nil}
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport, Timeout: 10 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return errors.New("Umleitungen sind nicht erlaubt") }}
	body, _ := json.Marshal(registration{Public: s.Public, Address: own})
	for attempt := 0; attempt < 30; attempt++ {
		req, err := http.NewRequest(http.MethodPost, "https://"+host+"/pair", bytes.NewReader(body))
		if err != nil {
			return err
		}
		req.Header.Set("Authorization", "Bearer "+parts[2])
		req.Header.Set("Content-Type", "application/json")
		res, err := client.Do(req)
		if err != nil {
			time.Sleep(2 * time.Second)
			continue
		}
		var reply answer
		decodeErr := json.NewDecoder(io.LimitReader(res.Body, 1024)).Decode(&reply)
		res.Body.Close()
		if res.StatusCode != http.StatusOK {
			return fmt.Errorf("Kopplung abgelehnt (HTTP %d); Code, Ablaufzeit und Adressen prüfen", res.StatusCode)
		}
		if decodeErr != nil || !keyOK(reply.Public) || reply.Address != expected {
			return errors.New("Ungültige Kopplungsantwort")
		}
		s.Peer = reply.Public
		s.PeerAddress = expected
		s.Endpoint = endpoint
		return locked(func() error { return save(s) })
	}
	return errors.New("Kopplung nicht erreichbar oder Server-Fingerabdruck falsch")
}
func run() error {
	if len(os.Args) != 2 {
		return errors.New("Befehl: serve, join, ready, config, invite oder renew")
	}
	switch os.Args[1] {
	case "serve":
		return serve()
	case "join":
		return join()
	case "ready":
		s, e := load()
		if e != nil {
			return e
		}
		if s.Peer == "" {
			return errors.New("Kopplung ausstehend")
		}
		return nil
	case "config":
		s, e := load()
		if e != nil {
			return e
		}
		if s.Peer == "" {
			return errors.New("Kopplung ausstehend")
		}
		endpoint, keepalive := "-", "0"
		if s.Role == "client" {
			endpoint = env("WG_ENDPOINT", s.Endpoint)
			keepalive = "25"
			if !endpointOK(endpoint) {
				return errors.New("Ungültiger WG_ENDPOINT")
			}
		}
		expected := env("PAIR_PEER_ADDRESS", s.PeerAddress)
		if expected != s.PeerAddress {
			return errors.New("Tunneladresse passt nicht zur gespeicherten Kopplung")
		}
		if e := os.MkdirAll("/run/gateway", 0700); e != nil {
			return e
		}
		if e := os.WriteFile("/run/gateway/private.key", []byte(s.Private), 0600); e != nil {
			return e
		}
		return os.WriteFile("/run/gateway/peer", []byte(s.Peer+" "+s.PeerAddress+" "+endpoint+" "+keepalive), 0600)
	case "invite", "renew":
		return locked(func() error {
			s, e := load()
			if e != nil {
				return e
			}
			if s.Role != "server" || s.Peer != "" {
				return errors.New("Einladung nur auf ungekoppeltem Server möglich")
			}
			if os.Args[1] == "renew" {
				if e := newToken(&s); e != nil {
					return e
				}
				if e := save(s); e != nil {
					return e
				}
			}
			if time.Now().After(s.Expires) {
				return errors.New("Einladung abgelaufen; gateway-pair renew verwenden")
			}
			fmt.Println(code(s))
			return nil
		})
	}
	return errors.New("Unbekannter Befehl")
}
func main() { log.SetFlags(0); fail(run()) }
