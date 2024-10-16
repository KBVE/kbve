package grpc

import (
    "context"
    "fmt"
    "net"

    pb "path_to_your_proto_package"
    "google.golang.org/grpc"
)

type server struct {
    pb.UnimplementedMultiplayerServiceServer
}

func (s *server) SendPlayerData(ctx context.Context, req *pb.PlayerRequest) (*pb.PlayerResponse, error) {
    fmt.Printf("Received data: %+v\n", req)
    return &pb.PlayerResponse{Status: "OK", Message: "Data received"}, nil
}

func StartGRPCServer(address string) error {
    lis, err := net.Listen("tcp", address)
    if err != nil {
        return err
    }

    grpcServer := grpc.NewServer()
    pb.RegisterMultiplayerServiceServer(grpcServer, &server{})

    fmt.Printf("Starting gRPC server at %s\n", address)
    return grpcServer.Serve(lis)
}
