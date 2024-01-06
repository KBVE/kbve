// package: 
// file: kbveproto.proto

/* tslint:disable */
/* eslint-disable */

import * as jspb from "google-protobuf";

export class Apikey extends jspb.Message { 
    getPermissions(): string;
    setPermissions(value: string): Apikey;
    getKeyhash(): string;
    setKeyhash(value: string): Apikey;
    getLabel(): string;
    setLabel(value: string): Apikey;
    getUlid(): Uint8Array | string;
    getUlid_asU8(): Uint8Array;
    getUlid_asB64(): string;
    setUlid(value: Uint8Array | string): Apikey;
    getUserid(): Uint8Array | string;
    getUserid_asU8(): Uint8Array;
    getUserid_asB64(): string;
    setUserid(value: Uint8Array | string): Apikey;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): Apikey.AsObject;
    static toObject(includeInstance: boolean, msg: Apikey): Apikey.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: Apikey, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): Apikey;
    static deserializeBinaryFromReader(message: Apikey, reader: jspb.BinaryReader): Apikey;
}

export namespace Apikey {
    export type AsObject = {
        permissions: string,
        keyhash: string,
        label: string,
        ulid: Uint8Array | string,
        userid: Uint8Array | string,
    }
}

export class Appwrite extends jspb.Message { 
    getAppwriteEndpoint(): string;
    setAppwriteEndpoint(value: string): Appwrite;
    getAppwriteProjectid(): string;
    setAppwriteProjectid(value: string): Appwrite;
    getAppwriteApiKey(): string;
    setAppwriteApiKey(value: string): Appwrite;
    getVersion(): string;
    setVersion(value: string): Appwrite;
    getCreatedAt(): string;
    setCreatedAt(value: string): Appwrite;
    getUlid(): Uint8Array | string;
    getUlid_asU8(): Uint8Array;
    getUlid_asB64(): string;
    setUlid(value: Uint8Array | string): Appwrite;
    getUserid(): Uint8Array | string;
    getUserid_asU8(): Uint8Array;
    getUserid_asB64(): string;
    setUserid(value: Uint8Array | string): Appwrite;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): Appwrite.AsObject;
    static toObject(includeInstance: boolean, msg: Appwrite): Appwrite.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: Appwrite, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): Appwrite;
    static deserializeBinaryFromReader(message: Appwrite, reader: jspb.BinaryReader): Appwrite;
}

export namespace Appwrite {
    export type AsObject = {
        appwriteEndpoint: string,
        appwriteProjectid: string,
        appwriteApiKey: string,
        version: string,
        createdAt: string,
        ulid: Uint8Array | string,
        userid: Uint8Array | string,
    }
}

export class Auth extends jspb.Message { 
    getEmail(): string;
    setEmail(value: string): Auth;
    getHash(): string;
    setHash(value: string): Auth;
    getSalt(): string;
    setSalt(value: string): Auth;
    getPasswordResetToken(): string;
    setPasswordResetToken(value: string): Auth;
    getPasswordResetExpiry(): string;
    setPasswordResetExpiry(value: string): Auth;
    getVerificationToken(): string;
    setVerificationToken(value: string): Auth;
    getVerificationExpiry(): string;
    setVerificationExpiry(value: string): Auth;
    getStatus(): number;
    setStatus(value: number): Auth;
    getLastLoginAt(): string;
    setLastLoginAt(value: string): Auth;
    getFailedLoginAttempts(): number;
    setFailedLoginAttempts(value: number): Auth;
    getLockoutUntil(): string;
    setLockoutUntil(value: string): Auth;
    getTwoFactorSecret(): string;
    setTwoFactorSecret(value: string): Auth;
    getRecoveryCodes(): string;
    setRecoveryCodes(value: string): Auth;
    getUlid(): Uint8Array | string;
    getUlid_asU8(): Uint8Array;
    getUlid_asB64(): string;
    setUlid(value: Uint8Array | string): Auth;
    getUserid(): Uint8Array | string;
    getUserid_asU8(): Uint8Array;
    getUserid_asB64(): string;
    setUserid(value: Uint8Array | string): Auth;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): Auth.AsObject;
    static toObject(includeInstance: boolean, msg: Auth): Auth.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: Auth, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): Auth;
    static deserializeBinaryFromReader(message: Auth, reader: jspb.BinaryReader): Auth;
}

export namespace Auth {
    export type AsObject = {
        email: string,
        hash: string,
        salt: string,
        passwordResetToken: string,
        passwordResetExpiry: string,
        verificationToken: string,
        verificationExpiry: string,
        status: number,
        lastLoginAt: string,
        failedLoginAttempts: number,
        lockoutUntil: string,
        twoFactorSecret: string,
        recoveryCodes: string,
        ulid: Uint8Array | string,
        userid: Uint8Array | string,
    }
}

export class Global extends jspb.Message { 
    getId(): number;
    setId(value: number): Global;
    getKey(): string;
    setKey(value: string): Global;
    getValue(): string;
    setValue(value: string): Global;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): Global.AsObject;
    static toObject(includeInstance: boolean, msg: Global): Global.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: Global, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): Global;
    static deserializeBinaryFromReader(message: Global, reader: jspb.BinaryReader): Global;
}

export namespace Global {
    export type AsObject = {
        id: number,
        key: string,
        value: string,
    }
}

export class N8n extends jspb.Message { 
    getWebhook(): string;
    setWebhook(value: string): N8n;
    getPermissions(): string;
    setPermissions(value: string): N8n;
    getKeyhash(): string;
    setKeyhash(value: string): N8n;
    getLabel(): string;
    setLabel(value: string): N8n;
    getUlid(): Uint8Array | string;
    getUlid_asU8(): Uint8Array;
    getUlid_asB64(): string;
    setUlid(value: Uint8Array | string): N8n;
    getUserid(): Uint8Array | string;
    getUserid_asU8(): Uint8Array;
    getUserid_asB64(): string;
    setUserid(value: Uint8Array | string): N8n;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): N8n.AsObject;
    static toObject(includeInstance: boolean, msg: N8n): N8n.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: N8n, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): N8n;
    static deserializeBinaryFromReader(message: N8n, reader: jspb.BinaryReader): N8n;
}

export namespace N8n {
    export type AsObject = {
        webhook: string,
        permissions: string,
        keyhash: string,
        label: string,
        ulid: Uint8Array | string,
        userid: Uint8Array | string,
    }
}

export class Profile extends jspb.Message { 
    getName(): string;
    setName(value: string): Profile;
    getBio(): string;
    setBio(value: string): Profile;
    getUnsplash(): string;
    setUnsplash(value: string): Profile;
    getGithub(): string;
    setGithub(value: string): Profile;
    getInstagram(): string;
    setInstagram(value: string): Profile;
    getDiscord(): string;
    setDiscord(value: string): Profile;
    getUlid(): Uint8Array | string;
    getUlid_asU8(): Uint8Array;
    getUlid_asB64(): string;
    setUlid(value: Uint8Array | string): Profile;
    getUserid(): Uint8Array | string;
    getUserid_asU8(): Uint8Array;
    getUserid_asB64(): string;
    setUserid(value: Uint8Array | string): Profile;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): Profile.AsObject;
    static toObject(includeInstance: boolean, msg: Profile): Profile.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: Profile, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): Profile;
    static deserializeBinaryFromReader(message: Profile, reader: jspb.BinaryReader): Profile;
}

export namespace Profile {
    export type AsObject = {
        name: string,
        bio: string,
        unsplash: string,
        github: string,
        instagram: string,
        discord: string,
        ulid: Uint8Array | string,
        userid: Uint8Array | string,
    }
}

export class Setting extends jspb.Message { 
    getKey(): string;
    setKey(value: string): Setting;
    getValue(): string;
    setValue(value: string): Setting;
    getUlid(): Uint8Array | string;
    getUlid_asU8(): Uint8Array;
    getUlid_asB64(): string;
    setUlid(value: Uint8Array | string): Setting;
    getUserid(): Uint8Array | string;
    getUserid_asU8(): Uint8Array;
    getUserid_asB64(): string;
    setUserid(value: Uint8Array | string): Setting;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): Setting.AsObject;
    static toObject(includeInstance: boolean, msg: Setting): Setting.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: Setting, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): Setting;
    static deserializeBinaryFromReader(message: Setting, reader: jspb.BinaryReader): Setting;
}

export namespace Setting {
    export type AsObject = {
        key: string,
        value: string,
        ulid: Uint8Array | string,
        userid: Uint8Array | string,
    }
}

export class User extends jspb.Message { 
    getUsername(): string;
    setUsername(value: string): User;
    getRole(): number;
    setRole(value: number): User;
    getReputation(): number;
    setReputation(value: number): User;
    getExp(): number;
    setExp(value: number): User;
    getCreatedAt(): string;
    setCreatedAt(value: string): User;
    getUlid(): Uint8Array | string;
    getUlid_asU8(): Uint8Array;
    getUlid_asB64(): string;
    setUlid(value: Uint8Array | string): User;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): User.AsObject;
    static toObject(includeInstance: boolean, msg: User): User.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: User, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): User;
    static deserializeBinaryFromReader(message: User, reader: jspb.BinaryReader): User;
}

export namespace User {
    export type AsObject = {
        username: string,
        role: number,
        reputation: number,
        exp: number,
        createdAt: string,
        ulid: Uint8Array | string,
    }
}

export class EnquireApikeyRequest extends jspb.Message { 
    getId(): number;
    setId(value: number): EnquireApikeyRequest;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): EnquireApikeyRequest.AsObject;
    static toObject(includeInstance: boolean, msg: EnquireApikeyRequest): EnquireApikeyRequest.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: EnquireApikeyRequest, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): EnquireApikeyRequest;
    static deserializeBinaryFromReader(message: EnquireApikeyRequest, reader: jspb.BinaryReader): EnquireApikeyRequest;
}

export namespace EnquireApikeyRequest {
    export type AsObject = {
        id: number,
    }
}

export class EnquireAppwriteRequest extends jspb.Message { 
    getId(): number;
    setId(value: number): EnquireAppwriteRequest;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): EnquireAppwriteRequest.AsObject;
    static toObject(includeInstance: boolean, msg: EnquireAppwriteRequest): EnquireAppwriteRequest.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: EnquireAppwriteRequest, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): EnquireAppwriteRequest;
    static deserializeBinaryFromReader(message: EnquireAppwriteRequest, reader: jspb.BinaryReader): EnquireAppwriteRequest;
}

export namespace EnquireAppwriteRequest {
    export type AsObject = {
        id: number,
    }
}

export class EnquireAuthRequest extends jspb.Message { 
    getId(): number;
    setId(value: number): EnquireAuthRequest;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): EnquireAuthRequest.AsObject;
    static toObject(includeInstance: boolean, msg: EnquireAuthRequest): EnquireAuthRequest.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: EnquireAuthRequest, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): EnquireAuthRequest;
    static deserializeBinaryFromReader(message: EnquireAuthRequest, reader: jspb.BinaryReader): EnquireAuthRequest;
}

export namespace EnquireAuthRequest {
    export type AsObject = {
        id: number,
    }
}

export class EnquireGlobalRequest extends jspb.Message { 
    getId(): number;
    setId(value: number): EnquireGlobalRequest;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): EnquireGlobalRequest.AsObject;
    static toObject(includeInstance: boolean, msg: EnquireGlobalRequest): EnquireGlobalRequest.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: EnquireGlobalRequest, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): EnquireGlobalRequest;
    static deserializeBinaryFromReader(message: EnquireGlobalRequest, reader: jspb.BinaryReader): EnquireGlobalRequest;
}

export namespace EnquireGlobalRequest {
    export type AsObject = {
        id: number,
    }
}

export class EnquireN8nRequest extends jspb.Message { 
    getId(): number;
    setId(value: number): EnquireN8nRequest;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): EnquireN8nRequest.AsObject;
    static toObject(includeInstance: boolean, msg: EnquireN8nRequest): EnquireN8nRequest.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: EnquireN8nRequest, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): EnquireN8nRequest;
    static deserializeBinaryFromReader(message: EnquireN8nRequest, reader: jspb.BinaryReader): EnquireN8nRequest;
}

export namespace EnquireN8nRequest {
    export type AsObject = {
        id: number,
    }
}

export class EnquireProfileRequest extends jspb.Message { 
    getId(): number;
    setId(value: number): EnquireProfileRequest;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): EnquireProfileRequest.AsObject;
    static toObject(includeInstance: boolean, msg: EnquireProfileRequest): EnquireProfileRequest.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: EnquireProfileRequest, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): EnquireProfileRequest;
    static deserializeBinaryFromReader(message: EnquireProfileRequest, reader: jspb.BinaryReader): EnquireProfileRequest;
}

export namespace EnquireProfileRequest {
    export type AsObject = {
        id: number,
    }
}

export class EnquireSettingRequest extends jspb.Message { 
    getId(): number;
    setId(value: number): EnquireSettingRequest;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): EnquireSettingRequest.AsObject;
    static toObject(includeInstance: boolean, msg: EnquireSettingRequest): EnquireSettingRequest.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: EnquireSettingRequest, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): EnquireSettingRequest;
    static deserializeBinaryFromReader(message: EnquireSettingRequest, reader: jspb.BinaryReader): EnquireSettingRequest;
}

export namespace EnquireSettingRequest {
    export type AsObject = {
        id: number,
    }
}

export class EnquireUserRequest extends jspb.Message { 
    getId(): number;
    setId(value: number): EnquireUserRequest;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): EnquireUserRequest.AsObject;
    static toObject(includeInstance: boolean, msg: EnquireUserRequest): EnquireUserRequest.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: EnquireUserRequest, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): EnquireUserRequest;
    static deserializeBinaryFromReader(message: EnquireUserRequest, reader: jspb.BinaryReader): EnquireUserRequest;
}

export namespace EnquireUserRequest {
    export type AsObject = {
        id: number,
    }
}
