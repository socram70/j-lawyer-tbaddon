{
  /* j-Lawyer Thunderbird Extension - saves Messages to j-Lawyer Server Cases.
Copyright (C) 2023, Maximilian Steinert

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published
by the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>. */
}

// Aktenvorschläge über die E-Mail-Adresse eines Beteiligten (#103)

const SENDER_LOOKUP_MAX_CONTACTS = 5;

// Extrahiert die reine Adresse aus "Max Mustermann <max@example.com>"
function extractEmailAddress(value) {
  if (!value) {
    return null;
  }
  const angleMatch = value.match(/<([^<>@\s]+@[^<>\s]+)>/);
  if (angleMatch) {
    return angleMatch[1].trim().toLowerCase();
  }
  const plainMatch = value.match(/[^\s<>"',;]+@[^\s<>"',;]+/);
  return plainMatch ? plainMatch[0].trim().toLowerCase() : null;
}

function buildSenderLookupHeaders(loginData) {
  const headers = new Headers();
  const loginBase64Encoded = btoa(
    unescape(encodeURIComponent(loginData.username + ":" + loginData.password)),
  );
  headers.append("Authorization", "Basic " + loginBase64Encoded);
  headers.append("Content-Type", "application/json");
  return headers;
}

async function fetchSenderLookupJson(url, headers) {
  const response = await fetch(url, { method: "GET", headers });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} für ${url}`);
  }
  return response.json();
}

// Kontakte, deren E-Mail-Adresse exakt der gesuchten Adresse entspricht
async function findContactsByEmail(email, loginData) {
  const headers = buildSenderLookupHeaders(loginData);
  const base = loginData.serverAddress + "/j-lawyer-io/rest";
  const page = await fetchSenderLookupJson(
    `${base}/v8/contacts/page?limit=${SENDER_LOOKUP_MAX_CONTACTS}&q=${encodeURIComponent(email)}`,
    headers,
  );

  const contacts = [];
  for (const contact of page.items || []) {
    if ((contact.email || "").toLowerCase() === email) {
      contacts.push(contact);
      continue;
    }
    // Die Übersicht enthält nur das Hauptfeld, weitere Adressen stehen in den Details
    const details = await fetchSenderLookupJson(
      `${base}/v2/contacts/${contact.id}`,
      headers,
    );
    const otherEmails = [details.emailHome, details.emailMisc].map((value) =>
      (value || "").toLowerCase(),
    );
    if (otherEmails.includes(email)) {
      contacts.push(contact);
    }
  }
  return contacts;
}

// Liefert die Akten aller Kontakte mit dieser E-Mail-Adresse
async function findCasesByContactEmail(email, loginData) {
  if (!email) {
    return [];
  }

  const contacts = await findContactsByEmail(email, loginData);
  const headers = buildSenderLookupHeaders(loginData);
  const casesById = new Map();

  for (const contact of contacts) {
    const cases = await fetchSenderLookupJson(
      `${loginData.serverAddress}/j-lawyer-io/rest/v5/contacts/${contact.id}/cases`,
      headers,
    );
    for (const item of cases) {
      if (!casesById.has(item.id)) {
        casesById.set(item.id, item);
      }
    }
  }

  console.log(
    `Absender-Suche für ${email}: ${contacts.length} Kontakt(e), ${casesById.size} Akte(n)`,
  );
  return Array.from(casesById.values());
}
