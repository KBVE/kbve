package main

import (
    "net"
    "testing"
    "time"
)

func TestStartServers(t *testing.T) {

	go StartServers(":9002", ":9003")
    time.Sleep(1 * time.Second)

    udpAddr, err := net.ResolveUDPAddr("udp", ":9002")
    if err != nil {
        t.Fatalf("Failed to resolve UDP address: %v", err)
    }

    udpConn, err := net.DialUDP("udp", nil, udpAddr)
    if err != nil {
        t.Fatalf("Failed to connect to UDP server: %v", err)
    }
    defer udpConn.Close()

    grpcConn, err := net.Dial("tcp", ":9003")
    if err != nil {
        t.Fatalf("Failed to connect to gRPC server: %v", err)
    }
    defer grpcConn.Close()
}

