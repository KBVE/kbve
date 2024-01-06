// package: 
// file: kbveproto.proto

/* tslint:disable */
/* eslint-disable */

import * as grpc from "grpc";
import * as kbveproto_pb from "./kbveproto_pb";

interface IMessageRpcService extends grpc.ServiceDefinition<grpc.UntypedServiceImplementation> {
    getApikey: IMessageRpcService_IgetApikey;
    getAppwrite: IMessageRpcService_IgetAppwrite;
    getAuth: IMessageRpcService_IgetAuth;
    getGlobal: IMessageRpcService_IgetGlobal;
    getN8n: IMessageRpcService_IgetN8n;
    getProfile: IMessageRpcService_IgetProfile;
    getSetting: IMessageRpcService_IgetSetting;
    getUser: IMessageRpcService_IgetUser;
}

interface IMessageRpcService_IgetApikey extends grpc.MethodDefinition<kbveproto_pb.EnquireApikeyRequest, kbveproto_pb.Apikey> {
    path: "/MessageRpc/getApikey";
    requestStream: false;
    responseStream: false;
    requestSerialize: grpc.serialize<kbveproto_pb.EnquireApikeyRequest>;
    requestDeserialize: grpc.deserialize<kbveproto_pb.EnquireApikeyRequest>;
    responseSerialize: grpc.serialize<kbveproto_pb.Apikey>;
    responseDeserialize: grpc.deserialize<kbveproto_pb.Apikey>;
}
interface IMessageRpcService_IgetAppwrite extends grpc.MethodDefinition<kbveproto_pb.EnquireAppwriteRequest, kbveproto_pb.Appwrite> {
    path: "/MessageRpc/getAppwrite";
    requestStream: false;
    responseStream: false;
    requestSerialize: grpc.serialize<kbveproto_pb.EnquireAppwriteRequest>;
    requestDeserialize: grpc.deserialize<kbveproto_pb.EnquireAppwriteRequest>;
    responseSerialize: grpc.serialize<kbveproto_pb.Appwrite>;
    responseDeserialize: grpc.deserialize<kbveproto_pb.Appwrite>;
}
interface IMessageRpcService_IgetAuth extends grpc.MethodDefinition<kbveproto_pb.EnquireAuthRequest, kbveproto_pb.Auth> {
    path: "/MessageRpc/getAuth";
    requestStream: false;
    responseStream: false;
    requestSerialize: grpc.serialize<kbveproto_pb.EnquireAuthRequest>;
    requestDeserialize: grpc.deserialize<kbveproto_pb.EnquireAuthRequest>;
    responseSerialize: grpc.serialize<kbveproto_pb.Auth>;
    responseDeserialize: grpc.deserialize<kbveproto_pb.Auth>;
}
interface IMessageRpcService_IgetGlobal extends grpc.MethodDefinition<kbveproto_pb.EnquireGlobalRequest, kbveproto_pb.Global> {
    path: "/MessageRpc/getGlobal";
    requestStream: false;
    responseStream: false;
    requestSerialize: grpc.serialize<kbveproto_pb.EnquireGlobalRequest>;
    requestDeserialize: grpc.deserialize<kbveproto_pb.EnquireGlobalRequest>;
    responseSerialize: grpc.serialize<kbveproto_pb.Global>;
    responseDeserialize: grpc.deserialize<kbveproto_pb.Global>;
}
interface IMessageRpcService_IgetN8n extends grpc.MethodDefinition<kbveproto_pb.EnquireN8nRequest, kbveproto_pb.N8n> {
    path: "/MessageRpc/getN8n";
    requestStream: false;
    responseStream: false;
    requestSerialize: grpc.serialize<kbveproto_pb.EnquireN8nRequest>;
    requestDeserialize: grpc.deserialize<kbveproto_pb.EnquireN8nRequest>;
    responseSerialize: grpc.serialize<kbveproto_pb.N8n>;
    responseDeserialize: grpc.deserialize<kbveproto_pb.N8n>;
}
interface IMessageRpcService_IgetProfile extends grpc.MethodDefinition<kbveproto_pb.EnquireProfileRequest, kbveproto_pb.Profile> {
    path: "/MessageRpc/getProfile";
    requestStream: false;
    responseStream: false;
    requestSerialize: grpc.serialize<kbveproto_pb.EnquireProfileRequest>;
    requestDeserialize: grpc.deserialize<kbveproto_pb.EnquireProfileRequest>;
    responseSerialize: grpc.serialize<kbveproto_pb.Profile>;
    responseDeserialize: grpc.deserialize<kbveproto_pb.Profile>;
}
interface IMessageRpcService_IgetSetting extends grpc.MethodDefinition<kbveproto_pb.EnquireSettingRequest, kbveproto_pb.Setting> {
    path: "/MessageRpc/getSetting";
    requestStream: false;
    responseStream: false;
    requestSerialize: grpc.serialize<kbveproto_pb.EnquireSettingRequest>;
    requestDeserialize: grpc.deserialize<kbveproto_pb.EnquireSettingRequest>;
    responseSerialize: grpc.serialize<kbveproto_pb.Setting>;
    responseDeserialize: grpc.deserialize<kbveproto_pb.Setting>;
}
interface IMessageRpcService_IgetUser extends grpc.MethodDefinition<kbveproto_pb.EnquireUserRequest, kbveproto_pb.User> {
    path: "/MessageRpc/getUser";
    requestStream: false;
    responseStream: false;
    requestSerialize: grpc.serialize<kbveproto_pb.EnquireUserRequest>;
    requestDeserialize: grpc.deserialize<kbveproto_pb.EnquireUserRequest>;
    responseSerialize: grpc.serialize<kbveproto_pb.User>;
    responseDeserialize: grpc.deserialize<kbveproto_pb.User>;
}

export const MessageRpcService: IMessageRpcService;

export interface IMessageRpcServer {
    getApikey: grpc.handleUnaryCall<kbveproto_pb.EnquireApikeyRequest, kbveproto_pb.Apikey>;
    getAppwrite: grpc.handleUnaryCall<kbveproto_pb.EnquireAppwriteRequest, kbveproto_pb.Appwrite>;
    getAuth: grpc.handleUnaryCall<kbveproto_pb.EnquireAuthRequest, kbveproto_pb.Auth>;
    getGlobal: grpc.handleUnaryCall<kbveproto_pb.EnquireGlobalRequest, kbveproto_pb.Global>;
    getN8n: grpc.handleUnaryCall<kbveproto_pb.EnquireN8nRequest, kbveproto_pb.N8n>;
    getProfile: grpc.handleUnaryCall<kbveproto_pb.EnquireProfileRequest, kbveproto_pb.Profile>;
    getSetting: grpc.handleUnaryCall<kbveproto_pb.EnquireSettingRequest, kbveproto_pb.Setting>;
    getUser: grpc.handleUnaryCall<kbveproto_pb.EnquireUserRequest, kbveproto_pb.User>;
}

export interface IMessageRpcClient {
    getApikey(request: kbveproto_pb.EnquireApikeyRequest, callback: (error: grpc.ServiceError | null, response: kbveproto_pb.Apikey) => void): grpc.ClientUnaryCall;
    getApikey(request: kbveproto_pb.EnquireApikeyRequest, metadata: grpc.Metadata, callback: (error: grpc.ServiceError | null, response: kbveproto_pb.Apikey) => void): grpc.ClientUnaryCall;
    getApikey(request: kbveproto_pb.EnquireApikeyRequest, metadata: grpc.Metadata, options: Partial<grpc.CallOptions>, callback: (error: grpc.ServiceError | null, response: kbveproto_pb.Apikey) => void): grpc.ClientUnaryCall;
    getAppwrite(request: kbveproto_pb.EnquireAppwriteRequest, callback: (error: grpc.ServiceError | null, response: kbveproto_pb.Appwrite) => void): grpc.ClientUnaryCall;
    getAppwrite(request: kbveproto_pb.EnquireAppwriteRequest, metadata: grpc.Metadata, callback: (error: grpc.ServiceError | null, response: kbveproto_pb.Appwrite) => void): grpc.ClientUnaryCall;
    getAppwrite(request: kbveproto_pb.EnquireAppwriteRequest, metadata: grpc.Metadata, options: Partial<grpc.CallOptions>, callback: (error: grpc.ServiceError | null, response: kbveproto_pb.Appwrite) => void): grpc.ClientUnaryCall;
    getAuth(request: kbveproto_pb.EnquireAuthRequest, callback: (error: grpc.ServiceError | null, response: kbveproto_pb.Auth) => void): grpc.ClientUnaryCall;
    getAuth(request: kbveproto_pb.EnquireAuthRequest, metadata: grpc.Metadata, callback: (error: grpc.ServiceError | null, response: kbveproto_pb.Auth) => void): grpc.ClientUnaryCall;
    getAuth(request: kbveproto_pb.EnquireAuthRequest, metadata: grpc.Metadata, options: Partial<grpc.CallOptions>, callback: (error: grpc.ServiceError | null, response: kbveproto_pb.Auth) => void): grpc.ClientUnaryCall;
    getGlobal(request: kbveproto_pb.EnquireGlobalRequest, callback: (error: grpc.ServiceError | null, response: kbveproto_pb.Global) => void): grpc.ClientUnaryCall;
    getGlobal(request: kbveproto_pb.EnquireGlobalRequest, metadata: grpc.Metadata, callback: (error: grpc.ServiceError | null, response: kbveproto_pb.Global) => void): grpc.ClientUnaryCall;
    getGlobal(request: kbveproto_pb.EnquireGlobalRequest, metadata: grpc.Metadata, options: Partial<grpc.CallOptions>, callback: (error: grpc.ServiceError | null, response: kbveproto_pb.Global) => void): grpc.ClientUnaryCall;
    getN8n(request: kbveproto_pb.EnquireN8nRequest, callback: (error: grpc.ServiceError | null, response: kbveproto_pb.N8n) => void): grpc.ClientUnaryCall;
    getN8n(request: kbveproto_pb.EnquireN8nRequest, metadata: grpc.Metadata, callback: (error: grpc.ServiceError | null, response: kbveproto_pb.N8n) => void): grpc.ClientUnaryCall;
    getN8n(request: kbveproto_pb.EnquireN8nRequest, metadata: grpc.Metadata, options: Partial<grpc.CallOptions>, callback: (error: grpc.ServiceError | null, response: kbveproto_pb.N8n) => void): grpc.ClientUnaryCall;
    getProfile(request: kbveproto_pb.EnquireProfileRequest, callback: (error: grpc.ServiceError | null, response: kbveproto_pb.Profile) => void): grpc.ClientUnaryCall;
    getProfile(request: kbveproto_pb.EnquireProfileRequest, metadata: grpc.Metadata, callback: (error: grpc.ServiceError | null, response: kbveproto_pb.Profile) => void): grpc.ClientUnaryCall;
    getProfile(request: kbveproto_pb.EnquireProfileRequest, metadata: grpc.Metadata, options: Partial<grpc.CallOptions>, callback: (error: grpc.ServiceError | null, response: kbveproto_pb.Profile) => void): grpc.ClientUnaryCall;
    getSetting(request: kbveproto_pb.EnquireSettingRequest, callback: (error: grpc.ServiceError | null, response: kbveproto_pb.Setting) => void): grpc.ClientUnaryCall;
    getSetting(request: kbveproto_pb.EnquireSettingRequest, metadata: grpc.Metadata, callback: (error: grpc.ServiceError | null, response: kbveproto_pb.Setting) => void): grpc.ClientUnaryCall;
    getSetting(request: kbveproto_pb.EnquireSettingRequest, metadata: grpc.Metadata, options: Partial<grpc.CallOptions>, callback: (error: grpc.ServiceError | null, response: kbveproto_pb.Setting) => void): grpc.ClientUnaryCall;
    getUser(request: kbveproto_pb.EnquireUserRequest, callback: (error: grpc.ServiceError | null, response: kbveproto_pb.User) => void): grpc.ClientUnaryCall;
    getUser(request: kbveproto_pb.EnquireUserRequest, metadata: grpc.Metadata, callback: (error: grpc.ServiceError | null, response: kbveproto_pb.User) => void): grpc.ClientUnaryCall;
    getUser(request: kbveproto_pb.EnquireUserRequest, metadata: grpc.Metadata, options: Partial<grpc.CallOptions>, callback: (error: grpc.ServiceError | null, response: kbveproto_pb.User) => void): grpc.ClientUnaryCall;
}

export class MessageRpcClient extends grpc.Client implements IMessageRpcClient {
    constructor(address: string, credentials: grpc.ChannelCredentials, options?: object);
    public getApikey(request: kbveproto_pb.EnquireApikeyRequest, callback: (error: grpc.ServiceError | null, response: kbveproto_pb.Apikey) => void): grpc.ClientUnaryCall;
    public getApikey(request: kbveproto_pb.EnquireApikeyRequest, metadata: grpc.Metadata, callback: (error: grpc.ServiceError | null, response: kbveproto_pb.Apikey) => void): grpc.ClientUnaryCall;
    public getApikey(request: kbveproto_pb.EnquireApikeyRequest, metadata: grpc.Metadata, options: Partial<grpc.CallOptions>, callback: (error: grpc.ServiceError | null, response: kbveproto_pb.Apikey) => void): grpc.ClientUnaryCall;
    public getAppwrite(request: kbveproto_pb.EnquireAppwriteRequest, callback: (error: grpc.ServiceError | null, response: kbveproto_pb.Appwrite) => void): grpc.ClientUnaryCall;
    public getAppwrite(request: kbveproto_pb.EnquireAppwriteRequest, metadata: grpc.Metadata, callback: (error: grpc.ServiceError | null, response: kbveproto_pb.Appwrite) => void): grpc.ClientUnaryCall;
    public getAppwrite(request: kbveproto_pb.EnquireAppwriteRequest, metadata: grpc.Metadata, options: Partial<grpc.CallOptions>, callback: (error: grpc.ServiceError | null, response: kbveproto_pb.Appwrite) => void): grpc.ClientUnaryCall;
    public getAuth(request: kbveproto_pb.EnquireAuthRequest, callback: (error: grpc.ServiceError | null, response: kbveproto_pb.Auth) => void): grpc.ClientUnaryCall;
    public getAuth(request: kbveproto_pb.EnquireAuthRequest, metadata: grpc.Metadata, callback: (error: grpc.ServiceError | null, response: kbveproto_pb.Auth) => void): grpc.ClientUnaryCall;
    public getAuth(request: kbveproto_pb.EnquireAuthRequest, metadata: grpc.Metadata, options: Partial<grpc.CallOptions>, callback: (error: grpc.ServiceError | null, response: kbveproto_pb.Auth) => void): grpc.ClientUnaryCall;
    public getGlobal(request: kbveproto_pb.EnquireGlobalRequest, callback: (error: grpc.ServiceError | null, response: kbveproto_pb.Global) => void): grpc.ClientUnaryCall;
    public getGlobal(request: kbveproto_pb.EnquireGlobalRequest, metadata: grpc.Metadata, callback: (error: grpc.ServiceError | null, response: kbveproto_pb.Global) => void): grpc.ClientUnaryCall;
    public getGlobal(request: kbveproto_pb.EnquireGlobalRequest, metadata: grpc.Metadata, options: Partial<grpc.CallOptions>, callback: (error: grpc.ServiceError | null, response: kbveproto_pb.Global) => void): grpc.ClientUnaryCall;
    public getN8n(request: kbveproto_pb.EnquireN8nRequest, callback: (error: grpc.ServiceError | null, response: kbveproto_pb.N8n) => void): grpc.ClientUnaryCall;
    public getN8n(request: kbveproto_pb.EnquireN8nRequest, metadata: grpc.Metadata, callback: (error: grpc.ServiceError | null, response: kbveproto_pb.N8n) => void): grpc.ClientUnaryCall;
    public getN8n(request: kbveproto_pb.EnquireN8nRequest, metadata: grpc.Metadata, options: Partial<grpc.CallOptions>, callback: (error: grpc.ServiceError | null, response: kbveproto_pb.N8n) => void): grpc.ClientUnaryCall;
    public getProfile(request: kbveproto_pb.EnquireProfileRequest, callback: (error: grpc.ServiceError | null, response: kbveproto_pb.Profile) => void): grpc.ClientUnaryCall;
    public getProfile(request: kbveproto_pb.EnquireProfileRequest, metadata: grpc.Metadata, callback: (error: grpc.ServiceError | null, response: kbveproto_pb.Profile) => void): grpc.ClientUnaryCall;
    public getProfile(request: kbveproto_pb.EnquireProfileRequest, metadata: grpc.Metadata, options: Partial<grpc.CallOptions>, callback: (error: grpc.ServiceError | null, response: kbveproto_pb.Profile) => void): grpc.ClientUnaryCall;
    public getSetting(request: kbveproto_pb.EnquireSettingRequest, callback: (error: grpc.ServiceError | null, response: kbveproto_pb.Setting) => void): grpc.ClientUnaryCall;
    public getSetting(request: kbveproto_pb.EnquireSettingRequest, metadata: grpc.Metadata, callback: (error: grpc.ServiceError | null, response: kbveproto_pb.Setting) => void): grpc.ClientUnaryCall;
    public getSetting(request: kbveproto_pb.EnquireSettingRequest, metadata: grpc.Metadata, options: Partial<grpc.CallOptions>, callback: (error: grpc.ServiceError | null, response: kbveproto_pb.Setting) => void): grpc.ClientUnaryCall;
    public getUser(request: kbveproto_pb.EnquireUserRequest, callback: (error: grpc.ServiceError | null, response: kbveproto_pb.User) => void): grpc.ClientUnaryCall;
    public getUser(request: kbveproto_pb.EnquireUserRequest, metadata: grpc.Metadata, callback: (error: grpc.ServiceError | null, response: kbveproto_pb.User) => void): grpc.ClientUnaryCall;
    public getUser(request: kbveproto_pb.EnquireUserRequest, metadata: grpc.Metadata, options: Partial<grpc.CallOptions>, callback: (error: grpc.ServiceError | null, response: kbveproto_pb.User) => void): grpc.ClientUnaryCall;
}
