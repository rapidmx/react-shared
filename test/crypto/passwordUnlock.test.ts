///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { describe, expect, it } from "vitest";
import { toBase64 } from "../../src/crypto/encoding.js";
import {
    DEFAULT_ARGON2ID_PARAMS,
    argon2idKdfLabel,
    deriveFromPassword,
    generateSalt,
} from "../../src/crypto/passwordUnlock.js";

// Argon2id is intentionally slow (memory-hard) - use lighter parameters than the real default so this
// suite stays fast, while still exercising the real hash-wasm computation end to end.
const FAST_PARAMS = { memorySize: 8, iterations: 1, parallelism: 1 };

describe("argon2idKdfLabel", () => {
    it("formats the kdf string", () => {
        expect(argon2idKdfLabel(DEFAULT_ARGON2ID_PARAMS)).toBe("argon2id:m=65536,t=3,p=4");
        expect(argon2idKdfLabel(FAST_PARAMS)).toBe("argon2id:m=8,t=1,p=1");
    });
});

describe("generateSalt", () => {
    it("defaults to 16 bytes and differs between calls", () => {
        const a = generateSalt();
        const b = generateSalt();
        expect(a.length).toBe(16);
        expect(toBase64(a)).not.toBe(toBase64(b));
    });

    it("respects a custom length", () => {
        expect(generateSalt(32).length).toBe(32);
    });
});

describe("deriveFromPassword", () => {
    it("is deterministic for the same password/salt/params", async () => {
        const salt = generateSalt();
        const a = await deriveFromPassword("correct horse battery staple", salt, FAST_PARAMS);
        const b = await deriveFromPassword("correct horse battery staple", salt, FAST_PARAMS);
        expect(a.authProof).toBe(b.authProof);
        expect(toBase64(a.wrappingKey)).toBe(toBase64(b.wrappingKey));
    });

    it("produces independent authProof and wrappingKey values", async () => {
        const salt = generateSalt();
        const { authProof, wrappingKey } = await deriveFromPassword("a password", salt, FAST_PARAMS);
        expect(authProof).not.toBe(toBase64(wrappingKey));
    });

    it("produces a different wrappingKey for a different password, same salt", async () => {
        const salt = generateSalt();
        const a = await deriveFromPassword("password one", salt, FAST_PARAMS);
        const b = await deriveFromPassword("password two", salt, FAST_PARAMS);
        expect(toBase64(a.wrappingKey)).not.toBe(toBase64(b.wrappingKey));
    });

    it("produces a different wrappingKey for the same password, different salt", async () => {
        const a = await deriveFromPassword("same password", generateSalt(), FAST_PARAMS);
        const b = await deriveFromPassword("same password", generateSalt(), FAST_PARAMS);
        expect(toBase64(a.wrappingKey)).not.toBe(toBase64(b.wrappingKey));
    });

    it("wrappingKey is usable to seal/open with masterKey.ts", async () => {
        const { sealWithKey, openWithKey, buildAad } = await import("../../src/crypto/masterKey.js");
        const salt = generateSalt();
        const { wrappingKey } = await deriveFromPassword("hunter2", salt, FAST_PARAMS);
        const aad = buildAad("mb1", "mk-wrap:password");
        const sealed = await sealWithKey(wrappingKey, new TextEncoder().encode("the master key bytes"), aad);
        const opened = await openWithKey(wrappingKey, sealed, aad);
        expect(new TextDecoder().decode(opened)).toBe("the master key bytes");
    });
});
