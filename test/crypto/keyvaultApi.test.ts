// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "../testUtils.js";
import {
    addMasterKeyWrap,
    checkSignEnrollmentStatus,
    enrollKey,
    getEncryptionPolicy,
    getEscrowInfo,
    getKeyVault,
    lookupKeys,
    rekey,
    removeMasterKeyWrap,
    startSignEnrollment,
    updateEncryptionPolicy,
} from "../../src/crypto/keyvaultApi.js";

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("getKeyVault", () => {
    it("fetches the key vault for a mailbox", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { wrappedKeys: [], masterKeyWraps: [] }));
        const result = await getKeyVault("mb1");
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/mailboxes/mb1/keyvault", expect.anything());
        expect(result).toEqual({ wrappedKeys: [], masterKeyWraps: [] });
    });

    it("encodes a mailbox uid needing escaping", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { wrappedKeys: [], masterKeyWraps: [] }));
        await getKeyVault("mb/1");
        const [url] = fetchMock.mock.calls[0];
        expect(url).toBe("/api/mail/mailboxes/mb%2F1/keyvault");
    });
});

describe("enrollKey", () => {
    it("posts the enrollment body", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { wrappedKeys: [], masterKeyWraps: [] }));
        const input = {
            useType: "encrypt" as const,
            csr: "csr-pem",
            wrappedKey: { ciphertext: "c", nonce: "n", algorithm: "AES-256-GCM" },
        };
        await enrollKey("mb1", input);
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/mailboxes/mb1/keyvault/keys",
            expect.objectContaining({ method: "POST", body: JSON.stringify(input) }),
        );
    });
});

describe("startSignEnrollment", () => {
    it("posts the csr and wrapped key", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { enrollmentId: "enr-1" }));
        const input = {
            csr: "csr-pem",
            wrappedKey: { ciphertext: "c", nonce: "n", algorithm: "AES-256-GCM" },
        };
        const result = await startSignEnrollment("mb1", input);
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/mailboxes/mb1/keyvault/keys/sign-enrollment",
            expect.objectContaining({ method: "POST", body: JSON.stringify(input) }),
        );
        expect(result).toEqual({ enrollmentId: "enr-1" });
    });
});

describe("checkSignEnrollmentStatus", () => {
    it("fetches the enrollment status", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { status: "pending" }));
        const result = await checkSignEnrollmentStatus("mb1", "enr-1");
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/mailboxes/mb1/keyvault/keys/sign-enrollment/enr-1",
            expect.anything(),
        );
        expect(result).toEqual({ status: "pending" });
    });

    it("encodes an enrollment id needing escaping", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { status: "issued", certificate: "cert-pem" }));
        await checkSignEnrollmentStatus("mb1", "enr/1");
        const [url] = fetchMock.mock.calls[0];
        expect(url).toBe("/api/mail/mailboxes/mb1/keyvault/keys/sign-enrollment/enr%2F1");
    });
});

describe("getEscrowInfo", () => {
    it("fetches this mailbox's assigned escrow scope's public key", async () => {
        const escrowInfo = {
            escrowScopeId: "scope-1",
            publicKey: { publicKey: "base64cert", type: "x509", fingerprint: "fp1", notBefore: 0, notAfter: 1 },
        };
        const fetchMock = mockFetch(() => jsonResponse(200, escrowInfo));
        const result = await getEscrowInfo("mb1");
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/mailboxes/mb1/escrow-info", expect.anything());
        expect(result).toEqual(escrowInfo);
    });

    it("encodes a mailbox uid needing escaping", async () => {
        const fetchMock = mockFetch(() =>
            jsonResponse(200, { escrowScopeId: "scope-1", publicKey: { publicKey: "c", type: "x509", fingerprint: "f", notBefore: 0, notAfter: 1 } }),
        );
        await getEscrowInfo("mb/1");
        const [url] = fetchMock.mock.calls[0];
        expect(url).toBe("/api/mail/mailboxes/mb%2F1/escrow-info");
    });
});

describe("addMasterKeyWrap", () => {
    it("posts the wrap", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { wrappedKeys: [], masterKeyWraps: [] }));
        const wrap = {
            method: "password" as const,
            ciphertext: "c",
            nonce: "n",
            salt: "s",
            kdf: "argon2id:m=65536,t=3,p=4",
            schemeVersion: 1,
            createdAt: 0,
        };
        await addMasterKeyWrap("mb1", wrap);
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/mailboxes/mb1/keyvault/wraps",
            expect.objectContaining({ method: "POST", body: JSON.stringify(wrap) }),
        );
    });
});

describe("removeMasterKeyWrap", () => {
    it("omits the methodId query param when not given", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { wrappedKeys: [], masterKeyWraps: [] }));
        await removeMasterKeyWrap("mb1", "password");
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/mailboxes/mb1/keyvault/wraps/password",
            expect.objectContaining({ method: "DELETE" }),
        );
    });

    it("includes methodId when given", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { wrappedKeys: [], masterKeyWraps: [] }));
        await removeMasterKeyWrap("mb1", "passkey", "cred-1");
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/mailboxes/mb1/keyvault/wraps/passkey?methodId=cred-1",
            expect.objectContaining({ method: "DELETE" }),
        );
    });
});

describe("rekey", () => {
    it("puts the full replacement body", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { wrappedKeys: [], masterKeyWraps: [] }));
        const input = { wrappedKeys: [], masterKeyWraps: [], keys: [] };
        await rekey("mb1", input);
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/mailboxes/mb1/keyvault/rekey",
            expect.objectContaining({ method: "PUT", body: JSON.stringify(input) }),
        );
    });
});

describe("lookupKeys", () => {
    it("fetches with the addr query param", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { keys: [] }));
        const result = await lookupKeys("mb1", "alice@example.com");
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/mailboxes/mb1/keys/lookup?addr=alice%40example.com",
            expect.anything(),
        );
        expect(result).toEqual({ keys: [] });
    });
});

describe("getEncryptionPolicy", () => {
    it("fetches the system-wide policy", async () => {
        const fetchMock = mockFetch(() =>
            jsonResponse(200, { encryptSameOrg: "optional", encryptFederated: "optional", encryptExternal: "optional" }),
        );
        const result = await getEncryptionPolicy();
        expect(fetchMock).toHaveBeenCalledWith("/api/system/encryption-policy", expect.anything());
        expect(result.encryptSameOrg).toBe("optional");
    });
});

describe("updateEncryptionPolicy", () => {
    it("puts the patch", async () => {
        const fetchMock = mockFetch(() =>
            jsonResponse(200, { encryptSameOrg: "prohibited", encryptFederated: "optional", encryptExternal: "optional" }),
        );
        await updateEncryptionPolicy({ encryptSameOrg: "prohibited" });
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/system/encryption-policy",
            expect.objectContaining({ method: "PUT", body: JSON.stringify({ encryptSameOrg: "prohibited" }) }),
        );
    });
});
