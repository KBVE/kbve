package udp

import (
    "fmt"
    "net"
)


func StartUDPServer(address string) {
    addr, err := net.ResolveUDPAddr("udp", address)
    if err != nil {
        fmt.Println("Error resolving UDP address:", err)
        return
    }

    conn, err := net.ListenUDP("udp", addr)
    if err != nil {
        fmt.Println("Error starting UDP server:", err)
        return
    }
    defer conn.Close()

    buffer := make([]byte, 1024)
    for {
        n, clientAddr, err := conn.ReadFromUDP(buffer)
        if err != nil {
            fmt.Println("Error reading UDP message:", err)
            continue
        }

        fmt.Printf("Received %d bytes from %s: %s\n", n, clientAddr, string(buffer[:n]))

    }
}