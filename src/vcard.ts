///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * Pure client-side vCard 3.0 generate/parse — `@rapidmx/restapi` has no vCard import/export support of its
 * own, and Outlook's Contacts UI treats this as a purely local file-format concern (a `.vcf` file never
 * touches the server as anything but ordinary `Contact` field values), so there's nothing to add there.
 */
import type { Contact, ContactInput } from "./contactsApi.js";

function escapeVCardValue(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
}

function unescapeVCardValue(value: string): string {
    return value.replace(/\\n/g, "\n").replace(/\\;/g, ";").replace(/\\,/g, ",").replace(/\\\\/g, "\\");
}

/** Builds a single vCard 3.0 record for one contact. */
export function contactToVCard(contact: Contact): string {
    const lines: string[] = ["BEGIN:VCARD", "VERSION:3.0"];
    lines.push(`N:${escapeVCardValue(contact.surname ?? "")};${escapeVCardValue(contact.givenName ?? "")};;;`);
    lines.push(`FN:${escapeVCardValue(contact.displayName)}`);
    if (contact.company) {
        lines.push(`ORG:${escapeVCardValue(contact.company)}`);
    }
    if (contact.jobTitle) {
        lines.push(`TITLE:${escapeVCardValue(contact.jobTitle)}`);
    }
    for (const email of contact.emails) {
        lines.push(`EMAIL;TYPE=${email.type.toUpperCase()}:${escapeVCardValue(email.address)}`);
    }
    for (const phone of contact.phones) {
        lines.push(`TEL;TYPE=${phone.type.toUpperCase()}:${escapeVCardValue(phone.phoneNumber)}`);
    }
    for (const address of contact.addresses) {
        const parts = [
            "",
            "",
            address.street ?? "",
            address.city ?? "",
            address.state ?? "",
            address.postalCode ?? "",
            address.country ?? "",
        ];
        lines.push(`ADR;TYPE=${address.type.toUpperCase()}:${parts.map(escapeVCardValue).join(";")}`);
    }
    if (contact.notes) {
        lines.push(`NOTE:${escapeVCardValue(contact.notes)}`);
    }
    lines.push("END:VCARD");
    return lines.join("\r\n");
}

/** Builds a single `.vcf` file's text content from multiple contacts (one `BEGIN:VCARD`/`END:VCARD` block
 * per contact — the standard way multiple vCards share one file). */
export function contactsToVCardFile(contacts: Contact[]): string {
    return contacts.map(contactToVCard).join("\r\n");
}

/** A parsed vCard's fields, shaped as a partial `ContactInput` missing only the `mailboxUid`/`folderUid`
 * scope (the caller supplies those, since they're not part of the vCard format itself). */
export type ParsedVCardContact = Omit<ContactInput, "mailboxUid" | "folderUid">;

/**
 * Parses one or more vCard 3.0/4.0 records from a `.vcf` file's text content. Deliberately tolerant of
 * fields this app doesn't model (PHOTO, BDAY, etc. — silently ignored) and of the `TYPE=` parameter being
 * absent (defaults to "other") — real-world exported vCards vary a lot in exactly which optional parameters
 * they include.
 */
export function parseVCards(text: string): ParsedVCardContact[] {
    const cards = text.split(/BEGIN:VCARD/i).slice(1);
    return cards.map((card) => {
        const contact: ParsedVCardContact = { displayName: "", emails: [], phones: [], addresses: [] };
        const lines = card.split(/\r\n|\r|\n/);
        for (const rawLine of lines) {
            const line = rawLine.trim();
            const colonIndex = line.indexOf(":");
            if (colonIndex === -1) {
                continue;
            }
            const key = line.slice(0, colonIndex);
            const value = unescapeVCardValue(line.slice(colonIndex + 1));
            const [name, ...params] = key.split(";");
            const typeParam = params.find((p) => p.toUpperCase().startsWith("TYPE="));
            const type = (typeParam?.slice(5).toLowerCase() as "home" | "work" | "other" | undefined) ?? "other";

            switch (name.toUpperCase()) {
                case "FN":
                    contact.displayName = value;
                    break;
                case "N": {
                    const [surname, given] = value.split(";");
                    if (surname) contact.surname = surname;
                    if (given) contact.givenName = given;
                    break;
                }
                case "ORG":
                    contact.company = value;
                    break;
                case "TITLE":
                    contact.jobTitle = value;
                    break;
                case "EMAIL":
                    contact.emails!.push({ address: value, type });
                    break;
                case "TEL":
                    contact.phones!.push({ phoneNumber: value, type });
                    break;
                case "ADR": {
                    const [, , street, city, state, postalCode, country] = value.split(";");
                    contact.addresses!.push({ street, city, state, postalCode, country, type });
                    break;
                }
                case "NOTE":
                    contact.notes = value;
                    break;
                default:
                    break;
            }
        }
        if (!contact.displayName) {
            contact.displayName = [contact.givenName, contact.surname].filter(Boolean).join(" ") || "Unnamed contact";
        }
        return contact;
    });
}
