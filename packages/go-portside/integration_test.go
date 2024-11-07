package goportside

import (
	"context"
	"net"
	"sync"
	"testing"
	"time"

	"packages/go-portside/grpcport"
	pb "packages/go-portside/proto"
	"packages/go-portside/udp"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

func TestServerIntegration(t *testing.T) {
	var wg sync.WaitGroup
	errChan := make(chan error, 2)

	wg.Add(2)

	go func() {
		defer wg.Done()
		udp.StartUDPServer(":9000")
	}()

	go func() {
		defer wg.Done()
		if err := grpcport.StartGRPCServer(":9001"); err != nil {
			errChan <- err
		}
	}()

	time.Sleep(2 * time.Second)

	// Test gRPC communication.
	t.Run("gRPC Communication", func(t *testing.T) {
		clientConn, err := grpc.NewClient(":9001", grpc.WithTransportCredentials(insecure.NewCredentials()))
		if err != nil {
			t.Fatalf("Failed to connect to gRPC server: %v", err)
		}
		defer clientConn.Close()

		client := pb.NewMultiplayerServiceClient(clientConn)

		req := &pb.PlayerRequest{
			SessionHash: "test_hash",
			PlayerId:    "player_123",
			X:           10.0,
			Y:           20.0,
		}
		resp, err := client.SendPlayerData(context.Background(), req)
		if err != nil {
			t.Fatalf("gRPC call failed: %v", err)
		}

		if resp.Status != "OK" {
			t.Errorf("Expected gRPC status OK, got %s", resp.Status)
		}
	})

	// Test UDP communication.
	t.Run("UDP Communication", func(t *testing.T) {
		addr, err := net.ResolveUDPAddr("udp", ":9000")
		if err != nil {
			t.Fatalf("Failed to resolve UDP address: %v", err)
		}

		conn, err := net.DialUDP("udp", nil, addr)
		if err != nil {
			t.Fatalf("Failed to connect to UDP server: %v", err)
		}
		defer conn.Close()

		message := []byte("Test message")
		_, err = conn.Write(message)
		if err != nil {
			t.Fatalf("Failed to send UDP message: %v", err)
		}

		buffer := make([]byte, 1024)
		conn.SetReadDeadline(time.Now().Add(2 * time.Second))
		n, _, err := conn.ReadFromUDP(buffer)
		if err != nil {
			t.Fatalf("Failed to read from UDP server: %v", err)
		}

		received := string(buffer[:n])
		if received != "Test message" {
			t.Errorf("Expected 'Test message', got %s", received)
		}
	})

	// Wait for goroutines to finish
	wg.Wait()

	// Close the error channel after all goroutines are done
	close(errChan)

	// Check for any errors from the goroutines
	for err := range errChan {
		if err != nil {
			t.Fatalf("Server encountered an error: %v", err)
		}
	}
}
