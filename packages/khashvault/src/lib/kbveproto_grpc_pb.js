// GENERATED CODE -- DO NOT EDIT!

'use strict';
var grpc = require('grpc');
var kbveproto_pb = require('./kbveproto_pb.js');

function serialize_Apikey(arg) {
  if (!(arg instanceof kbveproto_pb.Apikey)) {
    throw new Error('Expected argument of type Apikey');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_Apikey(buffer_arg) {
  return kbveproto_pb.Apikey.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_Appwrite(arg) {
  if (!(arg instanceof kbveproto_pb.Appwrite)) {
    throw new Error('Expected argument of type Appwrite');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_Appwrite(buffer_arg) {
  return kbveproto_pb.Appwrite.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_Auth(arg) {
  if (!(arg instanceof kbveproto_pb.Auth)) {
    throw new Error('Expected argument of type Auth');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_Auth(buffer_arg) {
  return kbveproto_pb.Auth.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_EnquireApikeyRequest(arg) {
  if (!(arg instanceof kbveproto_pb.EnquireApikeyRequest)) {
    throw new Error('Expected argument of type EnquireApikeyRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_EnquireApikeyRequest(buffer_arg) {
  return kbveproto_pb.EnquireApikeyRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_EnquireAppwriteRequest(arg) {
  if (!(arg instanceof kbveproto_pb.EnquireAppwriteRequest)) {
    throw new Error('Expected argument of type EnquireAppwriteRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_EnquireAppwriteRequest(buffer_arg) {
  return kbveproto_pb.EnquireAppwriteRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_EnquireAuthRequest(arg) {
  if (!(arg instanceof kbveproto_pb.EnquireAuthRequest)) {
    throw new Error('Expected argument of type EnquireAuthRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_EnquireAuthRequest(buffer_arg) {
  return kbveproto_pb.EnquireAuthRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_EnquireGlobalRequest(arg) {
  if (!(arg instanceof kbveproto_pb.EnquireGlobalRequest)) {
    throw new Error('Expected argument of type EnquireGlobalRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_EnquireGlobalRequest(buffer_arg) {
  return kbveproto_pb.EnquireGlobalRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_EnquireN8nRequest(arg) {
  if (!(arg instanceof kbveproto_pb.EnquireN8nRequest)) {
    throw new Error('Expected argument of type EnquireN8nRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_EnquireN8nRequest(buffer_arg) {
  return kbveproto_pb.EnquireN8nRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_EnquireProfileRequest(arg) {
  if (!(arg instanceof kbveproto_pb.EnquireProfileRequest)) {
    throw new Error('Expected argument of type EnquireProfileRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_EnquireProfileRequest(buffer_arg) {
  return kbveproto_pb.EnquireProfileRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_EnquireSettingRequest(arg) {
  if (!(arg instanceof kbveproto_pb.EnquireSettingRequest)) {
    throw new Error('Expected argument of type EnquireSettingRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_EnquireSettingRequest(buffer_arg) {
  return kbveproto_pb.EnquireSettingRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_EnquireUserRequest(arg) {
  if (!(arg instanceof kbveproto_pb.EnquireUserRequest)) {
    throw new Error('Expected argument of type EnquireUserRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_EnquireUserRequest(buffer_arg) {
  return kbveproto_pb.EnquireUserRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_Global(arg) {
  if (!(arg instanceof kbveproto_pb.Global)) {
    throw new Error('Expected argument of type Global');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_Global(buffer_arg) {
  return kbveproto_pb.Global.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_N8n(arg) {
  if (!(arg instanceof kbveproto_pb.N8n)) {
    throw new Error('Expected argument of type N8n');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_N8n(buffer_arg) {
  return kbveproto_pb.N8n.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_Profile(arg) {
  if (!(arg instanceof kbveproto_pb.Profile)) {
    throw new Error('Expected argument of type Profile');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_Profile(buffer_arg) {
  return kbveproto_pb.Profile.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_Setting(arg) {
  if (!(arg instanceof kbveproto_pb.Setting)) {
    throw new Error('Expected argument of type Setting');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_Setting(buffer_arg) {
  return kbveproto_pb.Setting.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_User(arg) {
  if (!(arg instanceof kbveproto_pb.User)) {
    throw new Error('Expected argument of type User');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_User(buffer_arg) {
  return kbveproto_pb.User.deserializeBinary(new Uint8Array(buffer_arg));
}


var MessageRpcService = exports.MessageRpcService = {
  getApikey: {
    path: '/MessageRpc/getApikey',
    requestStream: false,
    responseStream: false,
    requestType: kbveproto_pb.EnquireApikeyRequest,
    responseType: kbveproto_pb.Apikey,
    requestSerialize: serialize_EnquireApikeyRequest,
    requestDeserialize: deserialize_EnquireApikeyRequest,
    responseSerialize: serialize_Apikey,
    responseDeserialize: deserialize_Apikey,
  },
  getAppwrite: {
    path: '/MessageRpc/getAppwrite',
    requestStream: false,
    responseStream: false,
    requestType: kbveproto_pb.EnquireAppwriteRequest,
    responseType: kbveproto_pb.Appwrite,
    requestSerialize: serialize_EnquireAppwriteRequest,
    requestDeserialize: deserialize_EnquireAppwriteRequest,
    responseSerialize: serialize_Appwrite,
    responseDeserialize: deserialize_Appwrite,
  },
  getAuth: {
    path: '/MessageRpc/getAuth',
    requestStream: false,
    responseStream: false,
    requestType: kbveproto_pb.EnquireAuthRequest,
    responseType: kbveproto_pb.Auth,
    requestSerialize: serialize_EnquireAuthRequest,
    requestDeserialize: deserialize_EnquireAuthRequest,
    responseSerialize: serialize_Auth,
    responseDeserialize: deserialize_Auth,
  },
  getGlobal: {
    path: '/MessageRpc/getGlobal',
    requestStream: false,
    responseStream: false,
    requestType: kbveproto_pb.EnquireGlobalRequest,
    responseType: kbveproto_pb.Global,
    requestSerialize: serialize_EnquireGlobalRequest,
    requestDeserialize: deserialize_EnquireGlobalRequest,
    responseSerialize: serialize_Global,
    responseDeserialize: deserialize_Global,
  },
  getN8n: {
    path: '/MessageRpc/getN8n',
    requestStream: false,
    responseStream: false,
    requestType: kbveproto_pb.EnquireN8nRequest,
    responseType: kbveproto_pb.N8n,
    requestSerialize: serialize_EnquireN8nRequest,
    requestDeserialize: deserialize_EnquireN8nRequest,
    responseSerialize: serialize_N8n,
    responseDeserialize: deserialize_N8n,
  },
  getProfile: {
    path: '/MessageRpc/getProfile',
    requestStream: false,
    responseStream: false,
    requestType: kbveproto_pb.EnquireProfileRequest,
    responseType: kbveproto_pb.Profile,
    requestSerialize: serialize_EnquireProfileRequest,
    requestDeserialize: deserialize_EnquireProfileRequest,
    responseSerialize: serialize_Profile,
    responseDeserialize: deserialize_Profile,
  },
  getSetting: {
    path: '/MessageRpc/getSetting',
    requestStream: false,
    responseStream: false,
    requestType: kbveproto_pb.EnquireSettingRequest,
    responseType: kbveproto_pb.Setting,
    requestSerialize: serialize_EnquireSettingRequest,
    requestDeserialize: deserialize_EnquireSettingRequest,
    responseSerialize: serialize_Setting,
    responseDeserialize: deserialize_Setting,
  },
  getUser: {
    path: '/MessageRpc/getUser',
    requestStream: false,
    responseStream: false,
    requestType: kbveproto_pb.EnquireUserRequest,
    responseType: kbveproto_pb.User,
    requestSerialize: serialize_EnquireUserRequest,
    requestDeserialize: deserialize_EnquireUserRequest,
    responseSerialize: serialize_User,
    responseDeserialize: deserialize_User,
  },
};

exports.MessageRpcClient = grpc.makeGenericClientConstructor(MessageRpcService);
