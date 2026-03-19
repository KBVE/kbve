"""Tests for kbve.grpc module."""

import pytest

from kbve.grpc.client import GrpcClient, create_channel
from kbve.grpc.compiler import compile_proto
from kbve.grpc.interceptors import LoggingInterceptor


# ── create_channel ───────────────────────────────────────────────────

def test_create_channel_insecure():
    channel = create_channel("localhost:50051")
    assert channel is not None


def test_create_channel_with_options():
    channel = create_channel(
        "localhost:50051",
        options=[("grpc.max_receive_message_length", 1024)],
    )
    assert channel is not None


# ── GrpcClient ───────────────────────────────────────────────────────

def test_grpc_client_init():
    client = GrpcClient("localhost:50051")
    assert client.target == "localhost:50051"
    assert client._channel is None


def test_grpc_client_stub_without_channel():
    client = GrpcClient("localhost:50051")
    with pytest.raises(RuntimeError, match="Channel not open"):
        client.stub(object)


@pytest.mark.asyncio
async def test_grpc_client_context_manager():
    async with GrpcClient("localhost:50051") as client:
        assert client._channel is not None
    assert client._channel is None


@pytest.mark.asyncio
async def test_grpc_client_close_no_channel():
    client = GrpcClient("localhost:50051")
    await client.close()  # should not raise


@pytest.mark.asyncio
async def test_grpc_client_stub_creation():
    class FakeStub:
        def __init__(self, channel):
            self.channel = channel

    async with GrpcClient("localhost:50051") as client:
        stub = client.stub(FakeStub)
        assert stub.channel is client._channel


# ── check_health (unreachable target) ────────────────────────────────

@pytest.mark.asyncio
async def test_check_health_unreachable():
    from kbve.grpc.client import check_health
    result = await check_health("localhost:1", timeout=0.5)
    assert result["healthy"] is False
    assert result["target"] == "localhost:1"
    assert result["status"] in ("UNREACHABLE", "ERROR")


# ── LoggingInterceptor ───────────────────────────────────────────────

def test_logging_interceptor_init():
    interceptor = LoggingInterceptor()
    assert interceptor is not None


def test_logging_interceptor_is_server_interceptor():
    from grpc import aio
    interceptor = LoggingInterceptor()
    assert isinstance(interceptor, aio.ServerInterceptor)


# ── compile_proto ────────────────────────────────────────────────────

def test_compile_proto_success(tmp_path):
    proto_file = tmp_path / "test.proto"
    proto_file.write_text(
        'syntax = "proto3";\n'
        "package testpkg;\n"
        "message TestMsg { string value = 1; }\n"
    )

    exit_code = compile_proto(
        proto_files=str(proto_file),
        proto_path=str(tmp_path),
        python_out=str(tmp_path),
    )
    assert exit_code == 0
    assert (tmp_path / "test_pb2.py").exists()


def test_compile_proto_with_grpc(tmp_path):
    proto_file = tmp_path / "svc.proto"
    proto_file.write_text(
        'syntax = "proto3";\n'
        "package svcpkg;\n"
        "message Req { string id = 1; }\n"
        "message Res { string data = 1; }\n"
        "service TestSvc { rpc Get(Req) returns (Res); }\n"
    )

    exit_code = compile_proto(
        proto_files=str(proto_file),
        proto_path=str(tmp_path),
        python_out=str(tmp_path),
        grpc_out=str(tmp_path),
    )
    assert exit_code == 0
    assert (tmp_path / "svc_pb2.py").exists()
    assert (tmp_path / "svc_pb2_grpc.py").exists()


def test_compile_proto_with_pyi(tmp_path):
    proto_file = tmp_path / "typed.proto"
    proto_file.write_text(
        'syntax = "proto3";\n'
        "package typedpkg;\n"
        "message TypedMsg { int32 count = 1; }\n"
    )

    exit_code = compile_proto(
        proto_files=str(proto_file),
        proto_path=str(tmp_path),
        python_out=str(tmp_path),
        pyi_out=str(tmp_path),
    )
    assert exit_code == 0
    assert (tmp_path / "typed_pb2.pyi").exists()


def _simple_proto(pkg, msg):
    semi = ";"
    lb = "{"
    rb = "}"
    return (
        f'syntax = "proto3"{semi}\n'
        f"package {pkg}{semi}\n"
        f"message {msg} {lb} string v = 1{semi} {rb}\n"
    )


def test_compile_proto_multiple_files(tmp_path):
    for name in ("a", "b"):
        f = tmp_path / f"{name}.proto"
        f.write_text(_simple_proto(f"{name}pkg", f"{name.upper()}Msg"))

    exit_code = compile_proto(
        proto_files=[
            str(tmp_path / "a.proto"),
            str(tmp_path / "b.proto"),
        ],
        proto_path=str(tmp_path),
        python_out=str(tmp_path),
    )
    assert exit_code == 0
    assert (tmp_path / "a_pb2.py").exists()
    assert (tmp_path / "b_pb2.py").exists()


def test_compile_proto_bad_file(tmp_path):
    proto_file = tmp_path / "bad.proto"
    proto_file.write_text("not valid proto content")

    exit_code = compile_proto(
        proto_files=str(proto_file),
        proto_path=str(tmp_path),
        python_out=str(tmp_path),
    )
    assert exit_code != 0


# ── GrpcServer with interceptors ─────────────────────────────────────

def test_grpc_server_interceptors():
    from kbve.server.grpc_server import GrpcServer
    interceptor = LoggingInterceptor()
    server = GrpcServer(interceptors=[interceptor])
    assert server._interceptors == [interceptor]


def test_grpc_server_add_service_with_name():
    from kbve.server.grpc_server import GrpcServer
    server = GrpcServer()
    server.add_service(lambda s: None, name="test.Service")
    assert "test.Service" in server._service_names


def test_grpc_server_enable_reflection():
    from kbve.server.grpc_server import GrpcServer
    server = GrpcServer()
    server.enable_reflection(extra_names=["kbve.Health"])
    assert server._reflection_enabled is True
    assert "kbve.Health" in server._service_names


def test_grpc_server_reflection_default_off():
    from kbve.server.grpc_server import GrpcServer
    server = GrpcServer()
    assert server._reflection_enabled is False


# ── Module imports ───────────────────────────────────────────────────

def test_grpc_module_imports():
    from kbve.grpc import (
        GrpcClient,
        LoggingInterceptor,
        check_health,
        compile_proto,
        create_channel,
        enable_reflection,
    )
    assert GrpcClient is not None
    assert LoggingInterceptor is not None
    assert callable(check_health)
    assert callable(compile_proto)
    assert callable(create_channel)
    assert callable(enable_reflection)
