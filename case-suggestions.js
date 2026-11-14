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

// Gemeinsame Aktenerkennung für Posteingangs- und Verfassen-Popup (#112):
// Aktenzeichen-Muster in Betreff und Text, notfalls Suche mit dem ganzen Betreff,
// dazu Akten der Beteiligten mit passender E-Mail-Adresse (Absender bzw. Empfänger).
// Alle Server-Anfragen laufen parallel. Benötigt searchCasesApi() der jeweiligen Seite
// und findCasesByContactEmail() aus sender-case-lookup.js.

function extractFileNumberPatterns(text) {
  const patterns = [
    // AZ: / Az.: / Aktenzeichen Präfixe mit verschiedenen Formaten
    /(?:AZ|Az|Aktenzeichen)[:\.\s]+([0-9]{1,4}[\/\-_][0-9]{1,6}(?:[\/\-_][A-Za-z0-9]+)?)/gi,
    // Bracket-Format: [2024/123] oder [2024-123-ABC]
    /\[([0-9]{1,4}[\/\-_][0-9]{1,6}(?:[\/\-_][A-Za-z0-9]+)?)\]/g,
    // Jahr/Nummer Format (häufigster Fall): 2024/123 oder 2024-123 etc.
    /\b([0-9]{2,4}[\/\-_][0-9]{1,6}(?:[\/\-_][A-Za-z0-9]+)?)\b/g,
  ];

  const extractedNumbers = new Set();

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      // Match kann in Gruppe 1 sein (bei Präfix-Patterns) oder Gruppe 0 (bei direkten Patterns)
      const fileNumber = match[1] || match[0];
      if (fileNumber && fileNumber.trim()) {
        extractedNumbers.add(fileNumber.trim());
      }
    }
  }

  return Array.from(extractedNumbers);
}

// subject: Betreff, texts: weitere Texte (Header, Textanfang inkl. Zitat),
// contactEmails: Adressen, deren Beteiligten-Akten vorgeschlagen werden,
// contactLocation: Bezeichnung dieser Quelle ("Absender" bzw. "Empfänger")
async function collectCaseSuggestions(
  { subject = "", texts = [], contactEmails = [], contactLocation },
  loginData,
  maxResults = 3,
) {
  const subjectLower = subject.toLowerCase();

  // Aktenzeichen-Muster extrahieren, Priorität Betreff > weitere Texte
  const extractedPatterns = new Set();
  for (const text of [subject, ...texts].filter((t) => t)) {
    extractFileNumberPatterns(text).forEach((p) => extractedPatterns.add(p));
  }

  // Wenn keine Muster gefunden, versuche den Betreff direkt zu suchen
  if (extractedPatterns.size === 0 && subject.length >= 3) {
    extractedPatterns.add(subject);
  }
  console.log("Extrahierte Aktenzeichen-Muster:", Array.from(extractedPatterns));

  // API erfordert mindestens 3 Zeichen
  const patternSearches = Array.from(extractedPatterns)
    .filter((pattern) => pattern.length >= 3)
    .map((pattern) =>
      searchCasesApi(
        loginData.username,
        loginData.password,
        loginData.serverAddress,
        pattern,
      ).catch((error) => {
        console.error("Fehler bei API-Suche für Muster:", pattern, error);
        return [];
      }),
    );
  const uniqueEmails = [...new Set(contactEmails.filter((e) => e))];
  const contactSearches = uniqueEmails.map((email) =>
    findCasesByContactEmail(email, loginData).catch((error) => {
      console.error("Fehler bei der Suche nach Beteiligten-Adresse:", error);
      return [];
    }),
  );

  const [patternResults, contactResults] = await Promise.all([
    Promise.all(patternSearches),
    Promise.all(contactSearches),
  ]);

  const allResults = [];
  const resultsById = new Map();

  for (const results of patternResults) {
    for (const result of results) {
      if (resultsById.has(result.id)) {
        continue;
      }
      // Prüfe ob das Aktenzeichen exakt im Betreff vorkommt (höchste Priorität)
      const inSubject = subjectLower.includes(result.fileNumber.toLowerCase());
      const entry = {
        item: result,
        score: inSubject ? 100 : 50,
        confidence: inSubject ? 95 : 70,
        location: inSubject ? "Betreff" : "E-Mail",
      };
      resultsById.set(result.id, entry);
      allResults.push(entry);
    }
  }

  for (const contactCases of contactResults) {
    // Zuletzt geänderte Akten zuerst, ein einzelner Treffer ist aussagekräftiger
    contactCases.sort((a, b) =>
      (b.dateChanged || "").localeCompare(a.dateChanged || ""),
    );
    const isUniqueContactCase = contactCases.length === 1;

    for (const contactCase of contactCases) {
      const existingResult = resultsById.get(contactCase.id);
      if (existingResult) {
        // Aktenzeichen-Treffer und Beteiligten-Adresse bestätigen sich gegenseitig
        if (!existingResult.location.includes(contactLocation)) {
          existingResult.score = Math.min(existingResult.score + 30, 100);
          existingResult.confidence = Math.min(existingResult.confidence + 15, 99);
          existingResult.location += " + " + contactLocation;
        }
        continue;
      }
      const entry = {
        item: contactCase,
        score: isUniqueContactCase ? 60 : 40,
        confidence: isUniqueContactCase ? 80 : 60,
        location: contactLocation,
      };
      resultsById.set(contactCase.id, entry);
      allResults.push(entry);
    }
  }

  // Sortiere nach Score (stabil, Adress-Treffer bleiben nach Änderungsdatum sortiert)
  allResults.sort((a, b) => b.score - a.score);
  const topMatches = allResults.slice(0, maxResults);
  console.log("Gefundene Matches:", topMatches);
  return topMatches;
}
