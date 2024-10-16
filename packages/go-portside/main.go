package main

import (
	"packages/go-portside/grpc"
	"packages/go-portside/udp"
	"sync"
)

func StartServers(udpAddr, grpcAddr string) error {
	var wg sync.WaitGroup
	wg.Add(2)

	go func() {
		defer wg.Done()
		udp.StartUDPServer(udpAddr)
	}()

	go func() {
		defer wg.Done()
		if err := grpc.StartGRPCServer(grpcAddr); err != nil {
			panic(err)
		}
	}()

	wg.Wait()
	return nil
}

func main() {
	StartServers(":9000", ":9001")
}
