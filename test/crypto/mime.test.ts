///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { describe, expect, it } from "vitest";
import {
    decodeBase64Text,
    decodeBodyBytes,
    decodeBodyText,
    decodeQuotedPrintable,
    extractAddresses,
    extractDisplayBody,
    parseMimeEntity,
    parseParameterizedHeader,
    plainTextToHtml,
    splitMultipart,
} from "../../src/crypto/mime.js";

describe("parseMimeEntity", () => {
    it("splits headers and body, unfolding folded header lines", () => {
        const entity = parseMimeEntity("Subject: a very\r\n long subject\r\nContent-Type: text/plain;\r\n\tcharset=utf-8\r\n\r\nbody\r\nline 2");
        expect(entity.headers["subject"]).toBe("a very long subject");
        expect(entity.headers["content-type"]).toBe("text/plain;\tcharset=utf-8");
        expect(entity.body).toBe("body\r\nline 2");
        expect(entity.rawHeaderBlock).toBe("Subject: a very\r\n long subject\r\nContent-Type: text/plain;\r\n\tcharset=utf-8");
    });

    it("tolerates bare-LF line endings", () => {
        const entity = parseMimeEntity("From: a@b\nTo: c@d\n\nhello\n");
        expect(entity.headers).toEqual({ from: "a@b", to: "c@d" });
        expect(entity.body).toBe("hello\n");
    });

    it("treats a leading blank line as an entity with no headers", () => {
        expect(parseMimeEntity("\r\nbody only")).toEqual({ fields: [], headers: {}, rawHeaderBlock: "", body: "body only" });
        expect(parseMimeEntity("\nbody only").body).toBe("body only");
    });

    it("treats an entity with no blank line as all headers", () => {
        expect(parseMimeEntity("X-A: 1").body).toBe("");
    });

    it("keeps every repeated field in order but maps each name to its first occurrence", () => {
        const entity = parseMimeEntity("HP-Outer: From: a\r\nhp-outer: To: b\r\nFrom: first@x\r\nFROM: second@x\r\n\r\n");
        expect(entity.fields.map((f) => f.value)).toEqual(["From: a", "To: b", "first@x", "second@x"]);
        expect(entity.headers["from"]).toBe("first@x");
    });

    it("skips lines with no colon or an empty field name", () => {
        expect(parseMimeEntity("garbage\r\n: novalue\r\nX: y\r\n\r\n").fields).toEqual([{ name: "X", value: "y" }]);
    });
});

describe("parseParameterizedHeader", () => {
    it("parses quoted and unquoted parameters case-insensitively", () => {
        expect(parseParameterizedHeader('Multipart/Signed; Protocol="application/pkcs7-signature"; MICALG=sha-256; boundary=abc')).toEqual({
            value: "multipart/signed",
            params: { protocol: "application/pkcs7-signature", micalg: "sha-256", boundary: "abc" },
        });
    });

    it("keeps semicolons and escaped quotes inside quoted values", () => {
        expect(parseParameterizedHeader('attachment; filename="a;b \\"c\\".txt"').params["filename"]).toBe('a;b "c".txt');
    });

    it("ignores malformed parameters and keeps the first of a duplicated one", () => {
        expect(parseParameterizedHeader("text/plain; junk; =x; charset=a; CHARSET=b").params).toEqual({ charset: "a" });
    });

    it("returns an empty value for an absent header", () => {
        expect(parseParameterizedHeader(undefined)).toEqual({ value: "", params: {} });
    });
});

describe("splitMultipart", () => {
    it("discards preamble and epilogue and tolerates transport padding", () => {
        const body = "preamble --b not a delimiter\r\n--b  \r\npart one\r\n--b\r\npart two\r\n--b-- \r\nepilogue\r\n--b\r\nignored";
        expect(splitMultipart(body, "b")).toEqual(["part one", "part two"]);
    });

    it("only recognizes delimiters at the start of a line and not longer boundary-prefixed lines", () => {
        const body = "--b\r\nx --b y\r\n--bb\r\n--b--";
        expect(splitMultipart(body, "b")).toEqual(["x --b y\r\n--bb"]);
    });

    it("handles bare-LF line endings, empty parts, and regex metacharacters in the boundary", () => {
        expect(splitMultipart("--a.b+c\n\n--a.b+c\none\n--a.b+c--", "a.b+c")).toEqual(["", "one"]);
        expect(splitMultipart("--a\r\n--a\r\nz\r\n--a--", "a")).toEqual(["", "z"]);
    });

    it("keeps a trailing part when the close delimiter is missing, and returns nothing without any delimiter", () => {
        expect(splitMultipart("--b\r\ntruncated", "b")).toEqual(["truncated"]);
        expect(splitMultipart("--b", "b")).toEqual([""]);
        expect(splitMultipart("no delimiters here", "b")).toEqual([]);
    });
});

describe("transfer-encoding decoding", () => {
    it("decodes base64 ignoring whitespace, and returns undefined for invalid base64", () => {
        expect(new TextDecoder().decode(decodeBase64Text("aGVs\r\nbG8="))).toBe("hello");
        expect(decodeBase64Text("!!!")).toBeUndefined();
    });

    it("decodes quoted-printable soft breaks and hex escapes, leaving invalid escapes literal", () => {
        const bytes = decodeQuotedPrintable("caf=C3=A9 =\r\nline=ZZ=3dé");
        expect(new TextDecoder().decode(bytes)).toBe("café line=ZZ=é");
    });

    it("decodeBodyBytes dispatches on Content-Transfer-Encoding", () => {
        const decode = (cte: string, body: string) => new TextDecoder().decode(decodeBodyBytes(parseMimeEntity(`Content-Transfer-Encoding: ${cte}\r\n\r\n${body}`)));
        expect(decode("BASE64", "aGk=")).toBe("hi");
        expect(decode("quoted-printable", "h=69")).toBe("hi");
        expect(decode("7bit", "hi")).toBe("hi");
    });

    it("decodeBodyText applies the charset, falls back to UTF-8 for unknown charsets, and passes 8bit text through", () => {
        expect(decodeBodyText(parseMimeEntity("Content-Type: text/plain; charset=iso-8859-1\r\nContent-Transfer-Encoding: base64\r\n\r\n6Q=="))).toBe("é");
        expect(decodeBodyText(parseMimeEntity("Content-Type: text/plain; charset=x-bogus\r\nContent-Transfer-Encoding: base64\r\n\r\nw6k="))).toBe("é");
        expect(decodeBodyText(parseMimeEntity("Content-Transfer-Encoding: base64\r\n\r\n!!!"))).toBe("");
        expect(decodeBodyText(parseMimeEntity("Content-Transfer-Encoding: 8bit\r\n\r\nalready text"))).toBe("already text");
    });
});

describe("extractDisplayBody", () => {
    it("returns html only for text/html and text only for text/plain (the default with no Content-Type)", () => {
        expect(extractDisplayBody(parseMimeEntity("Content-Type: TEXT/HTML\r\n\r\n<p>x</p>"))).toEqual({ html: "<p>x</p>" });
        expect(extractDisplayBody(parseMimeEntity("Content-Type: text/plain\r\n\r\n<p>x</p>"))).toEqual({ text: "<p>x</p>" });
        expect(extractDisplayBody(parseMimeEntity("\r\nno headers"))).toEqual({ text: "no headers" });
        expect(extractDisplayBody(parseMimeEntity("Content-Type: image/png\r\n\r\nxx"))).toEqual({});
    });

    it("prefers a text/html alternative, skips attachments, and falls back to the first text/plain part", () => {
        const alternative = [
            "Content-Type: multipart/mixed; boundary=outer",
            "",
            "--outer",
            "Content-Type: text/html",
            "Content-Disposition: attachment; filename=a.html",
            "",
            "<p>attachment</p>",
            "--outer",
            "Content-Type: multipart/alternative; boundary=inner",
            "",
            "--inner",
            "Content-Type: text/plain",
            "",
            "plain",
            "--inner",
            "Content-Type: text/html",
            "Content-Transfer-Encoding: quoted-printable",
            "",
            "<p>rich=3D</p>",
            "--inner--",
            "--outer--",
        ].join("\r\n");
        expect(extractDisplayBody(parseMimeEntity(alternative))).toEqual({ html: "<p>rich=</p>" });

        const plainOnly = ["Content-Type: multipart/mixed; boundary=m", "", "--m", "Content-Type: image/png", "", "xx", "--m", "", "first", "--m", "", "second", "--m--"].join("\r\n");
        expect(extractDisplayBody(parseMimeEntity(plainOnly))).toEqual({ text: "first" });
    });

    it("returns nothing for a multipart with no boundary, no displayable part, or nesting beyond the depth limit", () => {
        expect(extractDisplayBody(parseMimeEntity("Content-Type: multipart/mixed\r\n\r\nx"))).toEqual({});
        expect(extractDisplayBody(parseMimeEntity("Content-Type: multipart/mixed; boundary=m\r\n\r\n--m\r\nContent-Type: image/png\r\n\r\nx\r\n--m--"))).toEqual({});
        let nested = "Content-Type: text/html\r\n\r\n<p>deep</p>";
        for (let i = 0; i < 9; i++) {
            nested = `Content-Type: multipart/mixed; boundary=b${i}\r\n\r\n--b${i}\r\n${nested}\r\n--b${i}--`;
        }
        expect(extractDisplayBody(parseMimeEntity(nested))).toEqual({});
    });
});

describe("plainTextToHtml", () => {
    it("escapes markup inside a whitespace-preserving pre", () => {
        expect(plainTextToHtml(`<script>&"'`)).toBe(
            '<pre style="white-space: pre-wrap; word-wrap: break-word; font-family: inherit">&lt;script&gt;&amp;&quot;&#39;</pre>',
        );
    });
});

describe("extractAddresses", () => {
    it("extracts lowercased addr-specs from display names, quoted commas, comments, and groups", () => {
        expect(extractAddresses('"Doe, Jane <x@evil>" <Jane@Example.com>, bob@example.com (Bob, maybe), Team: c@d.e, f@g.h;, undisclosed-recipients:;')).toEqual([
            "jane@example.com",
            "bob@example.com",
            "c@d.e",
            "f@g.h",
        ]);
        expect(extractAddresses(undefined)).toEqual([]);
        expect(extractAddresses("")).toEqual([]);
    });
});
