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

let currentSelectedCase = null; // Speichert den aktuell ausgewählten Case
let caseFolders = {}; // Speichert die Ordner des aktuell ausgewählten Cases
let selectedCaseFolderID = null; // Speichert den aktuell ausgewählten Ordner des aktuell ausgewählten Cases
let emailTemplatesNames = {}; // Speichert die Email-Templates

// Das Popup läuft als eigenes Fenster, der zugehörige Compose-Tab kommt per URL-Parameter
const composeTabIdFromUrl =
  Number(new URLSearchParams(window.location.search).get("composeTabId")) ||
  null;

async function queryComposeTabs() {
  if (composeTabIdFromUrl !== null) {
    return [{ id: composeTabIdFromUrl }];
  }
  return browser.tabs.query({ active: true, currentWindow: true });
}

// Fenstergröße speichern bei Änderung
function saveWindowSize() {
  const width = window.outerWidth;
  const height = window.outerHeight;
  if (width > 0 && height > 0) {
    browser.storage.local.set({
      composePopupWindowSize: { width, height },
    });
  }
}

// Debounced resize handler
let resizeTimeout;
window.addEventListener("resize", function () {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(saveWindowSize, 500);
});

// Speichere auch beim Schließen
window.addEventListener("beforeunload", saveWindowSize);

// Standard-Betreff-Template
const DEFAULT_SUBJECT_TEMPLATE =
  "Unser Zeichen: {{AKTE_KURZRUBRUM}}, {{AKTE_ZEICHEN}}";

function getSelectedTagsForCompose() {
  const tagsSelect = document.getElementById("tagsSelect");
  if (!tagsSelect) {
    return [];
  }

  return Array.from(tagsSelect.selectedOptions).map((option) => option.value);
}

async function updateSaveAfterSendStateForComposeTab() {
  if (!currentSelectedCase) {
    return;
  }

  const tabs = await queryComposeTabs();
  const composeTabId = tabs.length > 0 ? tabs[0].id : null;

  const loginData = await browser.storage.local.get([
    "username",
    "password",
    "serverAddress",
  ]);

  await browser.runtime.sendMessage({
    type: "saveToCaseAfterSend",
    source: "popup_compose",
    caseId: currentSelectedCase.id,
    content: currentSelectedCase.fileNumber,
    selectedCaseFolderID: selectedCaseFolderID,
    selectedTags: getSelectedTagsForCompose(),
    username: loginData.username,
    password: loginData.password,
    serverAddress: loginData.serverAddress,
    currentSelectedCase: currentSelectedCase,
    composeTabId: composeTabId,
  });
}

// Ersetzt Platzhalter im Betreff-Template mit Akten-Daten
function replaceSubjectPlaceholders(template, caseData, caseMetaData) {
  let result = template;

  // Verfügbare Platzhalter und ihre Werte
  const placeholders = {
    "{{AKTE_ZEICHEN}}": caseData.fileNumber || "",
    "{{AKTE_KURZRUBRUM}}": caseData.name || "",
    "{{AKTE_WEGEN}}": caseMetaData.reason || "",
    "{{AKTE_ANWALT}}": caseMetaData.lawyer || "",
    "{{AKTE_EIGENE1}}": caseMetaData.custom1 || "",
    "{{AKTE_EIGENE2}}": caseMetaData.custom2 || "",
    "{{AKTE_EIGENE3}}": caseMetaData.custom3 || "",
  };

  // Alle Platzhalter ersetzen
  for (const [placeholder, value] of Object.entries(placeholders)) {
    result = result.replace(
      new RegExp(placeholder.replace(/[{}]/g, "\\$&"), "g"),
      value,
    );
  }

  return result;
}

document.addEventListener("DOMContentLoaded", async function () {
  browser.runtime.sendMessage({
    type: "checkUpdate",
    content: "check",
  });

  const recommendCaseButtonAfterSend = document.getElementById(
    "recommendCaseButtonAfterSend",
  );
  const setSubjectButton = document.getElementById("setSubjectButton");
  const feedback = document.getElementById("feedback");
  const customizableLabel = document.getElementById("customizableLabel");
  const updateDataButton = document.getElementById("updateDataButton");
  const settingsButton = document.getElementById("settingsButton");
  const progressBar = document.getElementById("progressBar");

  await ensureStoredServerPermission(feedback);

  await fillTagsList();

  // Automatisch nach Aktenzeichen im Betreff suchen
  await findFileNumberInComposeMessage();

  // Prüfe ob bereits ein Betreff vorhanden ist und zeige Button
  try {
    const tabs = await queryComposeTabs();
    if (tabs.length > 0) {
      const composeDetails = await browser.compose.getComposeDetails(
        tabs[0].id,
      );
      if (composeDetails.subject && composeDetails.subject.trim() !== "") {
        setSubjectButton.style.display = "block";
      }
    }
  } catch (error) {
    console.error("Fehler beim Prüfen des Betreffs:", error);
  }

  // Event Listener für "Betreff setzen" Button
  if (setSubjectButton) {
    setSubjectButton.addEventListener("click", async function () {
      if (!currentSelectedCase) {
        feedback.textContent = i18nMessage("selectCaseFirstFeedback");
        feedback.style.color = "red";
        return;
      }

      try {
        const tabs = await queryComposeTabs();
        if (tabs.length > 0) {
          const tabId = tabs[0].id;

          // Hole caseMetaData für Platzhalter
          const loginData = await browser.storage.local.get([
            "username",
            "password",
            "serverAddress",
          ]);
          const caseMetaData = await getCaseMetaData(
            currentSelectedCase.id,
            loginData.username,
            loginData.password,
            loginData.serverAddress,
          );

          // Betreff-Template aus Einstellungen laden oder Standard verwenden
          const settings = await browser.storage.local.get("subjectTemplate");
          const template = settings.subjectTemplate || DEFAULT_SUBJECT_TEMPLATE;

          // Neuen Betreff mit Template und Platzhalter-Ersetzung erstellen
          const newSubject = replaceSubjectPlaceholders(
            template,
            currentSelectedCase,
            caseMetaData,
          );

          // Compose-Details mit neuem Betreff aktualisieren
          await browser.compose.setComposeDetails(tabId, {
            subject: newSubject,
          });

          feedback.textContent = i18nMessage("subjectSetFeedback");
          feedback.style.color = "green";
          console.log("Betreff manuell gesetzt:", newSubject);
        }
      } catch (error) {
        console.error("Fehler beim Setzen des Betreffs:", error);
        feedback.textContent = i18nMessage("subjectSetErrorFeedback");
        feedback.style.color = "red";
      }
    });
  }

  document.getElementById("searchInput").focus();

  // Überprüfen, ob der Code heute bereits ausgeführt wurde
  const today = new Date().toISOString().split("T")[0];
  const lastUpdate = await browser.storage.local.get("lastUpdate");
  if (lastUpdate.lastUpdate !== today) {
    updateData(feedback, progressBar);
  }

  // Code für den recommendCaseButtonAfterSend
  if (recommendCaseButtonAfterSend && customizableLabel) {
    recommendCaseButtonAfterSend.addEventListener("click", async function () {
      if (!currentSelectedCase) {
        feedback.textContent = i18nMessage("noMatchingFileNumberFeedback");
        feedback.style.color = "red";
        return;
      }

      // Prüfe, ob Umbenennen erlaubt ist
      const settings = await browser.storage.local.get([
        "username",
        "password",
        "serverAddress",
        "allowRename",
      ]);
      let customFilename = null;
      let composeTabId = null;

      const tabs = await queryComposeTabs();
      if (tabs.length > 0) {
        composeTabId = tabs[0].id;
      }

      if (settings.allowRename) {
        // Zeige Rename-Dialog
        if (composeTabId !== null) {
          const composeDetails =
            await browser.compose.getComposeDetails(composeTabId);
          const originalSubject = composeDetails.subject || "nachricht";
          const originalFilename = `${originalSubject}.eml`;

          customFilename = await showRenameDialog(originalFilename);

          if (customFilename === null) {
            // Benutzer hat abgebrochen
            feedback.textContent = i18nMessage("saveCancelledFeedback");
            feedback.style.color = "orange";
            return;
          }
        }
      }

      browser.runtime.sendMessage({
        type: "saveToCaseAfterSend",
        source: "popup_compose",
        caseId: currentSelectedCase.id,
        content: currentSelectedCase.fileNumber,
        selectedCaseFolderID: selectedCaseFolderID,
        selectedTags: getSelectedTagsForCompose(),
        username: settings.username,
        password: settings.password,
        serverAddress: settings.serverAddress,
        currentSelectedCase: currentSelectedCase,
        customFilename: customFilename,
        composeTabId: composeTabId,
      });

      feedback.textContent = i18nMessage("saveAfterSendFeedback");
      feedback.style.color = "green";
    });
  }

  // Update the pending after-send state with the selected tags.
  const tagsSelect = document.getElementById("tagsSelect");
  tagsSelect.addEventListener("change", async function () {
    const selectedTags = getSelectedTagsForCompose();
    console.log("Ausgewählte Tags:", selectedTags);
    try {
      await updateSaveAfterSendStateForComposeTab();
    } catch (error) {
      console.error("Fehler beim Aktualisieren der Etikettenauswahl:", error);
    }
  });

  // Event Listener für den "Daten aktualisieren" Button
  if (updateDataButton) {
    updateDataButton.addEventListener("click", async function () {
      updateData(feedback, progressBar);
    });
  }

  // Code, um die options.html in einem neuen Tab zu öffnen
  if (settingsButton) {
    settingsButton.addEventListener("click", function () {
      browser.tabs.create({ url: "options.html" });
    });
  }
});

// Hört auf Antworten vom Hintergrund-Skript background.js
browser.runtime.onMessage.addListener((message) => {
  const feedback = document.getElementById("feedback");
  if (message.type === "success") {
    feedback.textContent = i18nMessage("successfullySentFeedback");
    feedback.style.color = "green";
  } else if (message.type === "error") {
    feedback.textContent = i18nMessage("errorPrefix", [message.content]);
    feedback.style.color = "red";
  } else if (message.type === "updateStatus") {
    const updateIndicator = document.getElementById("updateIndicator");
    if (updateIndicator) {
      const updateText = updateIndicator.querySelector(".update-text");

      // Entferne alle Status-Klassen
      updateIndicator.classList.remove("update-success", "update-error");

      switch (message.status) {
        case "start":
          updateIndicator.style.display = "flex";
          updateText.textContent = message.message;
          break;

        case "success":
          updateIndicator.classList.add("update-success");
          updateText.textContent = message.message;
          // Nach 3 Sekunden ausblenden
          setTimeout(() => {
            updateIndicator.style.display = "none";
          }, 3000);
          break;

        case "error":
          updateIndicator.classList.add("update-error");
          updateText.textContent = message.message;
          // Nach 5 Sekunden ausblenden
          setTimeout(() => {
            updateIndicator.style.display = "none";
          }, 5000);
          break;
      }
    }
  }
});

async function fetchCasesByReferenceApi(
  username,
  password,
  serverAddress,
  reference,
  headers,
) {
  const url =
    serverAddress +
    "/j-lawyer-io/rest/v7/cases/byreference/" +
    encodeURIComponent(reference);

  const response = await fetch(url, {
    method: "GET",
    headers: headers,
  });

  if (!response.ok) {
    throw new Error("Reference search response was not ok");
  }

  return response.json();
}

function mergeCaseSearchResults(primaryResults, referenceResults) {
  const casesById = new Map();

  for (const item of primaryResults) {
    casesById.set(item.id, item);
  }

  for (const item of referenceResults) {
    if (!casesById.has(item.id)) {
      casesById.set(item.id, item);
    }
  }

  return Array.from(casesById.values());
}

// Funktion zum Suchen von Fällen via API
async function searchCasesApi(
  username,
  password,
  serverAddress,
  searchString,
  includeArchived = true,
) {
  // API erfordert mindestens 3 Zeichen
  if (!searchString || searchString.length < 3) {
    return [];
  }

  const url =
    serverAddress +
    "/j-lawyer-io/rest/v7/cases/search" +
    "?searchString=" +
    encodeURIComponent(searchString) +
    "&includeArchived=" +
    includeArchived;

  const headers = new Headers();
  const loginBase64Encoded = btoa(
    unescape(encodeURIComponent(username + ":" + password)),
  );
  headers.append("Authorization", "Basic " + loginBase64Encoded);
  headers.append("Content-Type", "application/json");

  const response = await fetch(url, {
    method: "GET",
    headers: headers,
  });

  if (!response.ok) {
    throw new Error("Network response was not ok");
  }

  const primaryResults = await response.json();
  let referenceResults = [];

  try {
    referenceResults = await fetchCasesByReferenceApi(
      username,
      password,
      serverAddress,
      searchString,
      headers,
    );
  } catch (error) {
    console.warn("Reference search failed:", searchString, error);
  }

  return mergeCaseSearchResults(primaryResults, referenceResults);
}

function getTags(username, password, serverAddress) {
  const url =
    serverAddress +
    "/j-lawyer-io/rest/v7/configuration/optiongroups/document.tags";

  const headers = new Headers();
  const loginBase64Encoded = btoa(
    unescape(encodeURIComponent(username + ":" + password)),
  );
  headers.append("Authorization", "Basic " + loginBase64Encoded);
  // headers.append('Authorization', 'Basic ' + btoa('' + username + ':' + password + ''));
  headers.append("Content-Type", "application/json");

  return fetch(url, {
    method: "GET",
    headers: headers,
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      return response.json();
    })
    .then((data) => {
      const valuesArray = data.map((item) => item.value);
      console.log("Tags heruntergeladen: " + valuesArray);
      // let tagsList = JSON.stringify(valuesArray)
      browser.storage.local.set({ documentTags: valuesArray });
      return valuesArray;
    });
}

// Debounce-Timer für die Suche
let searchDebounceTimer = null;

function createResultMessage(text, color = "#666") {
  const div = document.createElement("div");
  div.className = "resultItem";
  div.style.color = color;
  div.style.fontStyle = "italic";
  div.textContent = text;
  return div;
}

// Event-Listener für die Suche
document.getElementById("searchInput").addEventListener("input", function () {
  const query = this.value.trim();

  // Debounce: Warte 300ms nach letzter Eingabe bevor API-Call
  clearTimeout(searchDebounceTimer);

  if (query && query.length >= 3) {
    searchDebounceTimer = setTimeout(() => {
      searchCases(query);
    }, 300);
  } else if (query.length > 0 && query.length < 3) {
    // Zeige Hinweis bei weniger als 3 Zeichen
    const resultsListElement = document.getElementById("resultsList");
    resultsListElement.style.display = "block";
    resultsListElement.replaceChildren(
      createResultMessage("Mindestens 3 Zeichen eingeben..."),
    );
  } else {
    document.getElementById("resultsList").textContent = "";
    document.getElementById("resultsList").style.display = "none";
  }
});

// Funktion zum Suchen von Fällen (via API)
async function searchCases(query) {
  const feedback = document.getElementById("feedback");
  if (!(await ensureStoredServerPermission(feedback))) {
    return;
  }

  const resultsListElement = document.getElementById("resultsList");
  resultsListElement.style.display = "block";

  // Lade-Anzeige
  resultsListElement.replaceChildren(createResultMessage("Suche..."));

  let loginData = await browser.storage.local.get([
    "username",
    "password",
    "serverAddress",
  ]);

  try {
    // API-Suche durchführen
    const results = await searchCasesApi(
      loginData.username,
      loginData.password,
      loginData.serverAddress,
      query,
    );

    // Ergebnisliste leeren
    while (resultsListElement.firstChild) {
      resultsListElement.removeChild(resultsListElement.firstChild);
    }

    if (results.length === 0) {
      resultsListElement.replaceChildren(
        createResultMessage(i18nMessage("noResultsFound")),
      );
      return;
    }

    const archivedStates = await Promise.all(
      results.map((item) => isCaseArchivedInSearch(item.id, loginData)),
    );

    results.forEach((item, index) => {
      const div = document.createElement("div");
      div.className = "resultItem";
      div.setAttribute("data-id", item.id);
      div.setAttribute("data-file-number", item.fileNumber);
      div.setAttribute("data-name", item.name);
      if (item.reason) {
        div.setAttribute("data-reason", item.reason);
      }
      div.textContent = `${item.name} (${item.fileNumber})`;
      if (item.reason) {
        div.textContent += ` - ${item.reason}`;
      }
      if (archivedStates[index]) {
        div.appendChild(createArchivedBadge());
      }
      resultsListElement.appendChild(div);
    });

    // Event-Handler für Suchergebnisse
    document.querySelectorAll(".resultItem").forEach((item) => {
      item.addEventListener("click", async function () {
        // Setze die ausgewählte Akte basierend auf dem Klick
        const caseId = this.getAttribute("data-id");
        const caseName = this.getAttribute("data-name");
        const caseFileNumber = this.getAttribute("data-file-number");

        console.log("Ausgewählter Fall - ID:", caseId);
        console.log("Ausgewählter Fall - Name:", caseName);
        console.log("Ausgewählter Fall - Aktenzeichen:", caseFileNumber);

        currentSelectedCase = {
          id: caseId,
          name: caseName,
          fileNumber: caseFileNumber,
        };

        const loginData = await browser.storage.local.get([
          "username",
          "password",
          "serverAddress",
        ]);

        // Hole die Metadaten des Falls, einschließlich `reason`
        const caseMetaData = await getCaseMetaData(
          currentSelectedCase.id,
          loginData.username,
          loginData.password,
          loginData.serverAddress,
        );

        // Aktualisiere die `currentSelectedCase` mit dem `reason`
        currentSelectedCase.reason = caseMetaData.reason;

        // Lade die Ordner des ausgewählten Falls und aktualisiere die Struktur
        caseFolders = await getCaseFolders(
          currentSelectedCase.id,
          loginData.username,
          loginData.password,
          loginData.serverAddress,
        );
        displayTreeStructure(caseFolders);

        // Aktualisiere das Label mit den Falldetails, einschließlich `reason`, falls vorhanden
        const customizableLabel = document.getElementById("customizableLabel");
        customizableLabel.textContent = `${currentSelectedCase.fileNumber}: ${currentSelectedCase.name} - ${currentSelectedCase.reason || i18nMessage("noReasonGiven")}`;
        updateArchivedCaseNotice(
          currentSelectedCase.id,
          caseMetaData.archived,
          loginData,
        );

        // Beteiligte anzeigen
        displayParties(currentSelectedCase.id);

        // "Betreff setzen"-Button einblenden, da eine Akte ausgewählt wurde
        document.getElementById("setSubjectButton").style.display = "block";

        // Führe die Aktion aus, die sonst der Button ausgelöst hätte
        browser.storage.local
          .get(["username", "password", "serverAddress"])
          .then((result) => {
            browser.runtime.sendMessage({
              type: "saveToCaseAfterSend",
              source: "popup_compose",
              caseId: currentSelectedCase.id,
              content: currentSelectedCase.fileNumber,
              selectedCaseFolderID: selectedCaseFolderID,
              selectedTags: getSelectedTagsForCompose(),
              username: result.username,
              password: result.password,
              serverAddress: result.serverAddress,
              currentSelectedCase: currentSelectedCase,
              composeTabId: tabId,
            });

            // Setze Feedback-Text und -Farbe
            const feedback = document.getElementById("feedback");
            feedback.textContent = i18nMessage("saveAfterSendFeedback");
            feedback.style.color = "green";
          });

        // Blende die Ergebnissliste aus
        document.getElementById("resultsList").style.display = "none";
      });
    });
  } catch (error) {
    console.error("Fehler bei der Suche:", error);
    resultsListElement.replaceChildren(
      createResultMessage(i18nMessage("searchError"), "red"),
    );
  }
}

function getConsecutiveMatchCount(str, query) {
  let count = 0;
  let maxCount = 0;
  for (let i = 0, j = 0; i < str.length; i++) {
    if (str[i] === query[j]) {
      count++;
      j++;
      if (count > maxCount) {
        maxCount = count;
      }
    } else {
      count = 0;
      j = 0;
    }
  }
  return maxCount;
}

// Füllen der Tagsliste
async function fillTagsList() {
  try {
    const result = await browser.storage.local.get("documentTags");
    const tagsSelect = document.getElementById("tagsSelect");

    // Funktion, um zu prüfen, ob ein Tag bereits in der Liste vorhanden ist
    function isTagInList(tag) {
      for (let i = 0; i < tagsSelect.options.length; i++) {
        if (tagsSelect.options[i].value === tag) {
          return true;
        }
      }
      return false;
    }

    if (result.documentTags && result.documentTags.length > 0) {
      const sortedTags = result.documentTags.sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" }),
      ); // Tags alphabetisch sortieren (unabhängig von Groß- und Kleinschreibung)
      sortedTags.forEach((tag) => {
        // Nur hinzufügen, wenn der Tag noch nicht in der Liste ist
        if (!isTagInList(tag)) {
          const option = document.createElement("option");
          option.value = tag;
          option.text = tag;
          tagsSelect.appendChild(option);
        }
      });
    }
  } catch (error) {
    console.error("Fehler beim Befüllen der Tags-Liste:", error);
  }
}

async function getCaseMetaData(caseId, username, password, serverAddress) {
  const url = serverAddress + "/j-lawyer-io/rest/v1/cases/" + caseId;

  const headers = new Headers();
  const loginBase64Encoded = btoa(
    unescape(encodeURIComponent(username + ":" + password)),
  );
  headers.append("Authorization", "Basic " + loginBase64Encoded);
  // headers.append('Authorization', 'Basic ' + btoa('' + username + ':' + password + ''));
  headers.append("Content-Type", "application/json");

  return fetch(url, {
    method: "GET",
    headers: headers,
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      return response.json();
    })
    .then((data) => {
      let extractedData = {};

      // Standardfelder
      if ("reason" in data && data.reason !== null) {
        extractedData.reason = data.reason;
      }

      if ("lawyer" in data && data.lawyer !== null) {
        extractedData.lawyer = data.lawyer;
      }

      // Zusätzliche Felder für Betreff-Template
      if ("name" in data && data.name !== null) {
        extractedData.name = data.name;
      }

      if ("fileNumber" in data && data.fileNumber !== null) {
        extractedData.fileNumber = data.fileNumber;
      }

      // Benutzerdefinierte Felder (custom1, custom2, custom3)
      if ("custom1" in data && data.custom1 !== null) {
        extractedData.custom1 = data.custom1;
      }

      if ("custom2" in data && data.custom2 !== null) {
        extractedData.custom2 = data.custom2;
      }

      if ("custom3" in data && data.custom3 !== null) {
        extractedData.custom3 = data.custom3;
      }

      extractedData.archived = isArchivedValue(data.archived);

      return extractedData;
    });
}

async function getCaseFolders(caseId, username, password, serverAddress) {
  const url =
    serverAddress + "/j-lawyer-io/rest/v3/cases/" + caseId + "/folders";

  const headers = new Headers();
  const loginBase64Encoded = btoa(
    unescape(encodeURIComponent(username + ":" + password)),
  );
  headers.append("Authorization", "Basic " + loginBase64Encoded);
  // headers.append('Authorization', 'Basic ' + btoa('' + username + ':' + password + ''));
  headers.append("Content-Type", "application/json");
  return fetch(url, {
    method: "GET",
    headers: headers,
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      return response.json();
    })
    .then((data) => {
      console.log("Folders des Case " + caseId + " heruntergeladen: ", data);
      return data;
    });
}

// Funktion zum Abrufen der Beteiligten einer Akte
async function getPartiesInCase(caseId, username, password, serverAddress) {
  const url =
    serverAddress + "/j-lawyer-io/rest/v1/cases/" + caseId + "/parties";

  const headers = new Headers();
  const loginBase64Encoded = btoa(
    unescape(encodeURIComponent(username + ":" + password)),
  );
  headers.append("Authorization", "Basic " + loginBase64Encoded);
  headers.append("Content-Type", "application/json");

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: headers,
    });

    if (!response.ok) {
      throw new Error("Network response was not ok");
    }

    const data = await response.json();
    console.log("Beteiligte der Akte " + caseId + " heruntergeladen:", data);
    return data;
  } catch (error) {
    console.error("Fehler beim Abrufen der Beteiligten:", error);
    throw error;
  }
}

// Funktion zum Anzeigen der Beteiligten einer Akte
const RECIPIENT_FIELDS = ["to", "cc", "bcc"];

function getRecipientEmail(recipient) {
  if (typeof recipient !== "string") {
    return null;
  }
  const match = recipient.match(/<([^<>]+)>/);
  return (match ? match[1] : recipient).trim().toLowerCase();
}

async function getActiveComposeTabId() {
  const tabs = await queryComposeTabs();
  if (tabs.length === 0) {
    console.log("Kein aktiver Tab gefunden.");
    return null;
  }
  return tabs[0].id;
}

function getRecipientLists(composeDetails) {
  const lists = {};
  for (const field of RECIPIENT_FIELDS) {
    const value = composeDetails[field] || [];
    lists[field] = Array.isArray(value) ? [...value] : [value];
  }
  return lists;
}

// Feld (to/cc/bcc), in dem die Adresse aktuell steht, oder null
function findRecipientField(recipientLists, email) {
  for (const field of RECIPIENT_FIELDS) {
    if (recipientLists[field].some((r) => getRecipientEmail(r) === email)) {
      return field;
    }
  }
  return null;
}

// Erneuter Klick auf das aktuelle Feld entfernt den Beteiligten, ein anderes Feld verschiebt ihn dorthin
async function toggleRecipient(party, field) {
  const feedback = document.getElementById("feedback");
  try {
    const tabId = await getActiveComposeTabId();
    if (tabId === null) {
      return;
    }
    const composeDetails = await browser.compose.getComposeDetails(tabId);
    const recipientLists = getRecipientLists(composeDetails);
    const email = party.email.trim().toLowerCase();
    const currentField = findRecipientField(recipientLists, email);

    for (const listField of RECIPIENT_FIELDS) {
      recipientLists[listField] = recipientLists[listField].filter(
        (r) => getRecipientEmail(r) !== email,
      );
    }

    const updateDetails = { ...recipientLists };
    const fieldLabel = i18nMessage(`recipientField_${field}`);
    let message;
    if (currentField === field) {
      message = i18nMessage("recipientRemovedFeedback", [party.displayName]);
    } else {
      recipientLists[field].push(`${party.displayName} <${party.email}>`);
      message = i18nMessage("recipientAddedFeedback", [
        `${fieldLabel}: ${party.displayName}`,
      ]);

      // Zeichen des Beteiligten zum Betreff hinzufügen, falls noch nicht enthalten
      const subject = composeDetails.subject || "";
      if (party.reference && !subject.includes(party.reference)) {
        updateDetails.subject = subject.trim()
          ? `${subject.trim()} (Zeichen: ${party.reference})`
          : `Zeichen: ${party.reference}`;
      }
    }

    await browser.compose.setComposeDetails(tabId, updateDetails);
    await refreshRecipientHighlights();

    feedback.textContent = message;
    feedback.style.color = "green";
    setTimeout(() => {
      feedback.textContent = "";
    }, 3000);
  } catch (error) {
    console.error("Fehler beim Aktualisieren des Compose-Fensters:", error);
    feedback.textContent = i18nMessage("errorPrefix", [error.message]);
    feedback.style.color = "red";
  }
}

// Entfernt alle Empfänger aus An, CC und BCC
async function resetRecipients() {
  const feedback = document.getElementById("feedback");
  try {
    const tabId = await getActiveComposeTabId();
    if (tabId === null) {
      return;
    }
    await browser.compose.setComposeDetails(tabId, { to: [], cc: [], bcc: [] });
    await refreshRecipientHighlights();
    feedback.textContent = i18nMessage("recipientsResetFeedback");
    feedback.style.color = "green";
    setTimeout(() => {
      feedback.textContent = "";
    }, 3000);
  } catch (error) {
    console.error("Fehler beim Zurücksetzen der Empfänger:", error);
    feedback.textContent = i18nMessage("errorPrefix", [error.message]);
    feedback.style.color = "red";
  }
}

// Hebt bei jedem Beteiligten den Button des Feldes hervor, in dem er gerade steht
async function refreshRecipientHighlights() {
  const partyItems = document.querySelectorAll(".partyItem[data-email]");
  if (partyItems.length === 0) {
    return;
  }
  const tabId = await getActiveComposeTabId();
  if (tabId === null) {
    return;
  }
  const recipientLists = getRecipientLists(
    await browser.compose.getComposeDetails(tabId),
  );
  partyItems.forEach((item) => {
    const currentField = findRecipientField(recipientLists, item.dataset.email);
    item.classList.toggle("isRecipient", currentField !== null);
    item.querySelectorAll("button[data-field]").forEach((button) => {
      button.classList.toggle("active", button.dataset.field === currentField);
    });
  });
}

// Empfänger können auch direkt im Compose-Fenster geändert werden, daher regelmäßig abgleichen
window.addEventListener("focus", () => {
  refreshRecipientHighlights().catch((error) =>
    console.error("Fehler beim Abgleich der Empfänger:", error),
  );
});
setInterval(() => {
  refreshRecipientHighlights().catch((error) =>
    console.error("Fehler beim Abgleich der Empfänger:", error),
  );
}, 2000);

async function displayParties(caseId) {
  try {
    if (!caseId) {
      console.log("Keine Case-ID vorhanden, kann Beteiligte nicht anzeigen");
      return;
    }

    const loginData = await browser.storage.local.get([
      "username",
      "password",
      "serverAddress",
    ]);

    // Beteiligte abrufen
    const parties = await getPartiesInCase(
      caseId,
      loginData.username,
      loginData.password,
      loginData.serverAddress,
    );

    // Container für die Beteiligten leeren
    const partiesListElement = document.getElementById("partiesList");
    partiesListElement.replaceChildren();

    // Wenn keine Beteiligten vorhanden sind
    if (!parties || parties.length === 0) {
      const noPartiesElement = document.createElement("div");
      noPartiesElement.textContent = i18nMessage("noPartiesFound");
      partiesListElement.appendChild(noPartiesElement);
      return;
    }

    // Array für Beteiligte mit E-Mail-Adressen
    const partiesWithEmails = [];

    // Für jeden Beteiligten die Adressdetails abrufen
    for (const party of parties) {
      if (party.addressId) {
        try {
          const addressDetails = await getAddressDetails(
            party.addressId,
            loginData.username,
            loginData.password,
            loginData.serverAddress,
          );

          // Nur Beteiligte mit E-Mail-Adresse anzeigen
          if (addressDetails.email) {
            partiesWithEmails.push({
              name: addressDetails.name,
              firstName: addressDetails.firstName,
              email: addressDetails.email,
              involvementType: party.involvementType,
              reference: party.reference, // Referenz aus der Partei-Information hinzufügen
            });
          }
        } catch (error) {
          console.error(
            `Fehler beim Abrufen der Adressdetails für ${party.addressId}:`,
            error,
          );
        }
      }
    }

    // Beteiligte alphabetisch nach Namen sortieren
    partiesWithEmails.sort((a, b) => {
      const nameA = a.name + (a.firstName ? `, ${a.firstName}` : "");
      const nameB = b.name + (b.firstName ? `, ${b.firstName}` : "");
      return nameA.localeCompare(nameB);
    });

    // Button "Empfänger zurücksetzen"
    const resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.className = "resetRecipientsButton";
    resetButton.textContent = i18nMessage("resetRecipientsButton");
    resetButton.addEventListener("click", resetRecipients);
    partiesListElement.appendChild(resetButton);

    // Beteiligten-Liste erstellen
    partiesWithEmails.forEach((party) => {
      const div = document.createElement("div");
      div.className = "partyItem";
      div.dataset.email = party.email.trim().toLowerCase();

      // Namen formatieren
      let displayName = party.name;
      if (party.firstName) {
        displayName += `, ${party.firstName}`;
      }
      party.displayName = displayName;

      // Involvementtype als Badge hinzufügen
      let involvementBadge = "";
      if (party.involvementType) {
        involvementBadge = ` [${party.involvementType}]`;
      }

      // Referenz-Information hinzufügen, falls vorhanden
      let referenceInfo = "";
      if (party.reference) {
        referenceInfo = ` - Zeichen: ${party.reference}`;
      }

      // Klick auf den Namen wirkt wie der Button "An"
      const label = document.createElement("span");
      label.className = "partyLabel";
      label.textContent = `${displayName}${involvementBadge}${referenceInfo} (${party.email})`;
      label.addEventListener("click", () => toggleRecipient(party, "to"));
      div.appendChild(label);

      // Buttons für An / CC / BCC
      const buttons = document.createElement("span");
      buttons.className = "partyRecipientButtons";
      for (const field of RECIPIENT_FIELDS) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.field = field;
        button.textContent = i18nMessage(`recipientField_${field}`);
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          toggleRecipient(party, field);
        });
        buttons.appendChild(button);
      }
      div.appendChild(buttons);

      partiesListElement.appendChild(div);
    });
    await refreshRecipientHighlights();
  } catch (error) {
    console.error("Fehler beim Anzeigen der Beteiligten:", error);

    // Fehlermeldung anzeigen
    const partiesListElement = document.getElementById("partiesList");
    partiesListElement.replaceChildren();

    const errorElement = document.createElement("div");
    errorElement.textContent = i18nMessage("partiesLoadError");
    errorElement.style.color = "red";
    partiesListElement.appendChild(errorElement);
  }
}

function createTreeElement(obj) {
  if (!obj) return null; // Behandlung von null-Werten

  const element = document.createElement("div");
  element.className = "treeItem";
  element.textContent = obj.name;
  element.style.paddingLeft = "20px";
  element.style.cursor = "pointer";
  element.onclick = function (event) {
    // Verhindern, dass das Klick-Event sich nach oben durch den Baum fortpflanzt
    event.stopPropagation();

    // Entfernen der Auswahl von allen anderen Elementen
    const selectedElements = document.querySelectorAll(
      ".treeItem.selectedItem",
    );
    selectedElements.forEach((el) => el.classList.remove("selectedItem"));

    // Hinzufügen der Auswahl zum aktuellen Element
    this.classList.add("selectedItem");

    selectedCaseFolderID = obj.id;
    console.log("Name des ausgewählten Ordners: " + obj.name);
    console.log("Id des ausgewählten Ordners: " + selectedCaseFolderID);

    updateSaveAfterSendStateForComposeTab().catch((error) => {
      console.error("Fehler beim Aktualisieren der Ordnerauswahl:", error);
    });
  };

  if (obj.children && obj.children.length > 0) {
    // Sortiert alphabetisch nach dem Namen
    obj.children.sort((a, b) => a.name.localeCompare(b.name));
    obj.children.forEach((child) => {
      const childElement = createTreeElement(child);
      if (childElement) {
        element.appendChild(childElement);
      }
    });
  }
  return element;
}

function displayTreeStructure(folderData) {
  // Überprüfen Sie, ob folderData nicht null ist
  if (!folderData) {
    console.log("Keine Folder-Daten vorhanden.");
    return;
  }

  const treeRoot = createTreeElement(folderData);
  const treeContainer = document.getElementById("treeContainer");
  if (treeContainer) {
    treeContainer.replaceChildren(); // Bestehenden Inhalt löschen
    treeContainer.appendChild(treeRoot);
  }
}

async function getCalendars(username, password, serverAddress) {
  const url = serverAddress + "/j-lawyer-io/rest/v4/calendars/list/" + username;
  const headers = new Headers();
  const loginBase64Encoded = btoa(
    unescape(encodeURIComponent(username + ":" + password)),
  );

  headers.append("Authorization", "Basic " + loginBase64Encoded);
  headers.append("Content-Type", "application/json");

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: headers,
      timeOut: 10000,
    });

    if (!response.ok) {
      throw new Error("Network response was not ok");
    }

    const data = await response.json();

    data.forEach((calendar) => {
      console.log("Kalender ID:", calendar.id);
      console.log("Anzeigename: (displayName)", calendar.displayName);
      console.log("Hintergrund:", calendar.background);
      console.log("Cloud-Host:", calendar.cloudHost);
      console.log("Cloud-Pfad:", calendar.cloudPath);
      console.log("Cloud-Port:", calendar.cloudPort);
      console.log("Cloud-SSL:", calendar.cloudSsl);
      console.log(
        "Ereignistyp: (eventType - FOLLOWUP, RESPITE, EVENT)",
        calendar.eventType,
      );
      console.log("Href:", calendar.href);
      console.log("-----------------------------------");
    });
    return data;
  } catch (error) {
    console.error("Fehler beim Abrufen der Kalender:", error);
  }
}

async function getUsers(username, password, serverAddress) {
  const url = serverAddress + "/j-lawyer-io/rest/v6/security/users";
  const headers = new Headers();
  const loginBase64Encoded = btoa(
    unescape(encodeURIComponent(username + ":" + password)),
  );

  headers.append("Authorization", "Basic " + loginBase64Encoded);
  headers.append("Content-Type", "application/json");

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: headers,
      timeOut: 10000,
    });

    if (!response.ok) {
      throw new Error("Network response was not ok");
    }

    const data = await response.json();

    return data;
  } catch (error) {
    console.error("Fehler beim Abrufen der User:", error);
  }
}

function normalizeUserForStorage(user) {
  const principalId =
    user.principalId ||
    user.userName ||
    user.username ||
    user.login ||
    user.id ||
    user.displayName ||
    user.name;
  const displayName = user.displayName || principalId;

  return {
    displayName,
    principalId,
  };
}

function getEmailTemplates(username, password, serverAddress) {
  const url = serverAddress + "/j-lawyer-io/rest/v6/templates/email";

  const headers = new Headers();
  const loginBase64Encoded = btoa(
    unescape(encodeURIComponent(username + ":" + password)),
  );
  headers.append("Authorization", "Basic " + loginBase64Encoded);
  headers.append("Content-Type", "application/json");

  return fetch(url, {
    method: "GET",
    headers: headers,
  }).then((response) => {
    if (!response.ok) {
      throw new Error("Network response was not ok");
    }
    return response.json();
  });
}

// Funktion zum Abrufen der Kontaktdetails anhand der Adress-ID
async function getAddressDetails(addressId, username, password, serverAddress) {
  const url = serverAddress + "/j-lawyer-io/rest/v2/contacts/" + addressId;

  const headers = new Headers();
  const loginBase64Encoded = btoa(
    unescape(encodeURIComponent(username + ":" + password)),
  );
  headers.append("Authorization", "Basic " + loginBase64Encoded);
  headers.append("Content-Type", "application/json");

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: headers,
    });

    if (!response.ok) {
      throw new Error("Network response was not ok");
    }

    const data = await response.json();
    console.log(
      "Kontaktdetails für Adresse " + addressId + " heruntergeladen:",
      data,
    );
    return data;
  } catch (error) {
    console.error("Fehler beim Abrufen der Kontaktdetails:", error);
    throw error;
  }
}

// Funktion zum Aktualisieren der Daten
async function updateData(feedback, progressBar) {
  progressBar.value = 0;
  progressBar.style.display = "block";

  try {
    if (!(await ensureStoredServerPermission(feedback))) {
      progressBar.style.display = "none";
      return;
    }

    const { username, password, serverAddress } =
      await browser.storage.local.get([
        "username",
        "password",
        "serverAddress",
      ]);
    feedback.textContent = i18nMessage("updatingDataFeedback");
    feedback.style.color = "blue";

    let tasksCompleted = 0;
    const totalTasks = 4; // Reduziert von 5 auf 4 (Cases werden jetzt per API gesucht)

    function updateProgress() {
      tasksCompleted++;
      progressBar.value = (tasksCompleted / totalTasks) * 100;
      if (tasksCompleted === totalTasks) {
        feedback.textContent = i18nMessage("dataUpdatedFeedback");
        feedback.style.color = "green";
        const today = new Date().toISOString().split("T")[0];
        browser.storage.local.set({ lastUpdate: today });
      }
    }

    // Alle asynchronen Aufgaben parallel ausführen
    // Hinweis: Cases werden nicht mehr heruntergeladen, sondern per API gesucht
    await Promise.all([
      (async () => {
        await getTags(username, password, serverAddress);
        fillTagsList();
        updateProgress();
      })(),

      (async () => {
        const calendarsRaw = await getCalendars(
          username,
          password,
          serverAddress,
        );
        await browser.storage.local.set({ calendars: calendarsRaw });

        // Kalenderdaten filtern und speichern
        const followUpCalendars = calendarsRaw
          .filter((calendar) => calendar.eventType === "FOLLOWUP")
          .map((calendar) => ({
            id: calendar.id,
            displayName: calendar.displayName,
          }));
        const respiteCalendars = calendarsRaw
          .filter((calendar) => calendar.eventType === "RESPITE")
          .map((calendar) => ({
            id: calendar.id,
            displayName: calendar.displayName,
          }));
        const eventCalendars = calendarsRaw
          .filter((calendar) => calendar.eventType === "EVENT")
          .map((calendar) => ({
            id: calendar.id,
            displayName: calendar.displayName,
          }));

        await browser.storage.local.set({
          followUpCalendars,
          respiteCalendars,
          eventCalendars,
        });

        console.log("Kalender heruntergeladen: " + calendarsRaw);
        updateProgress();
      })(),

      (async () => {
        const emailTemplates = (
          await getEmailTemplates(username, password, serverAddress)
        )
          .map((item, index) => ({ id: index + 1, name: item.name }))
          .sort((a, b) => a.name.localeCompare(b.name));
        await browser.storage.local.set({
          emailTemplates,
          emailTemplatesNames: emailTemplates,
        });
        console.log("E-Mail-Vorlagen: ", emailTemplates);
        updateProgress();
      })(),

      (async () => {
        const users = (
          await getUsers(username, password, serverAddress)
        ).filter((user) => user.displayName || user.principalId);
        await browser.storage.local.set({
          users: users.map(normalizeUserForStorage),
        });
        console.log("Benutzer heruntergeladen: ", users);
        updateProgress();
      })(),
    ]);
  } catch (error) {
    console.error("Error during updateData:", error);
    feedback.textContent = i18nMessage("errorPrefix", [error.message]);
    feedback.style.color = "red";
  }
}

// Hilfsfunktion: Extrahiert Empfänger-Name und E-Mail aus To/CC-Felder
function parseRecipientsFromComposeDetails(composeDetails) {
  const recipients = [];

  try {
    // Sammle alle Empfänger (To, Cc)
    const allRecipients = [
      ...(composeDetails.to || []),
      ...(composeDetails.cc || []),
    ];

    for (const recipient of allRecipients) {
      const parsed = {
        name: "",
        email: "",
        lastName: "",
      };

      // Format 1: "Max Mustermann" <max@example.com>
      const nameEmailMatch = recipient.match(/^"?([^"<]+)"?\s*<([^>]+)>/);
      if (nameEmailMatch) {
        parsed.name = nameEmailMatch[1].trim();
        parsed.email = nameEmailMatch[2].trim();

        // Extrahiere Nachnamen (letztes Wort)
        const nameParts = parsed.name.split(/\s+/);
        parsed.lastName = nameParts[nameParts.length - 1];
      } else {
        // Format 2: max@example.com (nur E-Mail)
        const emailOnlyMatch = recipient.match(/([^\s<>]+@[^\s<>]+)/);
        if (emailOnlyMatch) {
          parsed.email = emailOnlyMatch[1].trim();

          // Versuche Namen aus E-Mail zu extrahieren
          const emailPrefix = parsed.email.split("@")[0];
          parsed.name = emailPrefix.replace(/[._-]/g, " ");
          parsed.lastName = parsed.name.split(/\s+/).pop();
        }
      }

      if (parsed.email) {
        recipients.push(parsed);
      }
    }
  } catch (error) {
    console.log("Fehler beim Parsen der Empfänger:", error);
  }

  return recipients;
}

// Hilfsfunktion: Extrahiert Namen nach Slash (Edge-Case: /Name Format)
function extractSlashNames(text) {
  const slashPattern = /\/([A-Za-zÄÖÜäöüß]{3,})/g;
  const names = new Set();

  let match;
  while ((match = slashPattern.exec(text)) !== null) {
    names.add(match[1].toLowerCase());
  }

  return Array.from(names);
}

// Hilfsfunktion: Reverse-Suche - Findet Worte aus case.name im Text
function matchCaseNameInText(caseName, emailText) {
  if (!caseName || !emailText) return 0;

  // Extrahiere bedeutungsvolle Worte aus case.name (>3 Zeichen, keine Stopwords)
  const stopwords = [
    "und",
    "oder",
    "der",
    "die",
    "das",
    "gegen",
    "für",
    "mit",
    "von",
    "bei",
  ];
  const caseWords = caseName
    .split(/[\s\-_,;.()]+/)
    .filter(
      (word) => word.length > 3 && !stopwords.includes(word.toLowerCase()),
    )
    .map((word) => word.toLowerCase());

  if (caseWords.length === 0) return 0;

  const emailTextLower = emailText.toLowerCase();
  let matchedWords = 0;

  for (const word of caseWords) {
    if (emailTextLower.includes(word)) {
      matchedWords++;
    }
  }

  const matchRatio = matchedWords / caseWords.length;

  // Scoring basierend auf Match-Ratio
  if (matchRatio >= 1.0) {
    return 45; // Alle Worte gefunden
  } else if (matchRatio >= 0.5) {
    return 35; // Mindestens 50% der Worte
  } else if (matchRatio >= 0.3) {
    return 25; // 30-50% der Worte
  }

  return 0;
}

// Hilfsfunktion: Vergleicht Empfänger mit case.name (Fuzzy-Matching)
function matchRecipientWithCaseName(recipient, caseName) {
  if (!recipient.name && !recipient.email) return 0;
  if (!caseName) return 0;

  const caseNameLower = caseName.toLowerCase();
  let score = 0;

  // Strategie 1: Nachname im case.name
  if (recipient.lastName && recipient.lastName.length > 2) {
    const lastNameLower = recipient.lastName.toLowerCase();
    if (caseNameLower.includes(lastNameLower)) {
      score = 40;
      console.log(
        `Empfänger-Match (Nachname): "${recipient.lastName}" in "${caseName}"`,
      );
      return score;
    }
  }

  // Strategie 2: Vollständiger Name
  if (recipient.name && recipient.name.length > 3) {
    const nameLower = recipient.name.toLowerCase();

    if (caseNameLower.includes(nameLower)) {
      score = 45;
      console.log(
        `Empfänger-Match (Voller Name): "${recipient.name}" in "${caseName}"`,
      );
      return score;
    }

    // Einzelne Worte prüfen
    const nameWords = recipient.name
      .split(/\s+/)
      .filter((word) => word.length > 2);
    let matchedWords = 0;

    for (const word of nameWords) {
      if (caseNameLower.includes(word.toLowerCase())) {
        matchedWords++;
      }
    }

    if (nameWords.length > 0 && matchedWords >= nameWords.length / 2) {
      score = 30;
      console.log(
        `Empfänger-Match (Teil-Name): ${matchedWords}/${nameWords.length} Worte in "${caseName}"`,
      );
      return score;
    }
  }

  // Strategie 3: E-Mail-Prefix
  if (recipient.email) {
    const emailPrefix = recipient.email.split("@")[0].toLowerCase();

    if (emailPrefix.length > 3 && caseNameLower.includes(emailPrefix)) {
      score = 25;
      console.log(
        `Empfänger-Match (E-Mail-Prefix): "${emailPrefix}" in "${caseName}"`,
      );
      return score;
    }

    const emailParts = emailPrefix
      .split(/[._-]/)
      .filter((part) => part.length > 2);
    let matchedParts = 0;

    for (const part of emailParts) {
      if (caseNameLower.includes(part)) {
        matchedParts++;
      }
    }

    if (emailParts.length > 0 && matchedParts > 0) {
      score = 20;
      console.log(
        `Empfänger-Match (E-Mail-Teile): ${matchedParts}/${emailParts.length} Teile in "${caseName}"`,
      );
      return score;
    }
  }

  return 0;
}

// Hilfsfunktion: Extrahiert potenzielle Aktenzeichen aus Text mit Regex-Mustern
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

// Hilfsfunktion: Berechnet Confidence-Prozent basierend auf Score
function calculateConfidence(score) {
  // Max Score: 100 (Betreff) + 15 (Empfänger-Bonus 30% von 45) = 115
  // Mapping Score → Confidence %
  if (score >= 100) return Math.min(100, Math.round(85 + (score - 100) * 1.5)); // 85-100%
  if (score >= 50) return Math.round(60 + (score - 50) * 0.5); // 60-85%
  if (score >= 25) return Math.round(40 + (score - 25) * 0.8); // 40-60%
  if (score >= 5) return Math.round(20 + (score - 5)); // 20-40%
  return Math.round(score * 4); // 0-20%
}

// Hilfsfunktion: Findet Top N Matches mit case-insensitive Suche und Regex-Fallback
function findBestMatchesInSubject(
  subject,
  casesArray,
  composeDetails,
  maxResults = 3,
) {
  // Performance: toLowerCase nur einmal
  const subjectLower = subject.toLowerCase();
  let extractedNumbers = null; // Lazy loading - nur bei Bedarf extrahieren

  // Parse Empfänger (To/CC) aus composeDetails
  const recipients = composeDetails
    ? parseRecipientsFromComposeDetails(composeDetails)
    : [];
  console.log("Parsed Recipients:", recipients);

  const allMatches = [];

  for (let item of casesArray) {
    const fileNumber = item.fileNumber;
    const fileNumberLower = fileNumber.toLowerCase();
    let score = 0;
    let method = "";
    let recipientScore = 0;

    // Exakte Suche (case-insensitive)
    if (subjectLower.includes(fileNumberLower)) {
      score = 100;
      method = "Exakter Match im Betreff";
    } else {
      // Fallback: Regex-Extraktion (lazy - nur einmal ausführen)
      if (extractedNumbers === null) {
        extractedNumbers = extractFileNumberPatterns(subject);
      }

      for (const extracted of extractedNumbers) {
        if (extracted.toLowerCase() === fileNumberLower) {
          score = 50;
          method = "Regex-Extraktion";
          break;
        }
      }
    }

    // Reverse-Suche: case.name im Betreff
    let caseNameScore = 0;
    if (score === 0) {
      // Nur wenn kein Aktenzeichen gefunden
      caseNameScore = matchCaseNameInText(item.name, subject);
      if (caseNameScore > 0) {
        score = caseNameScore;
        method = "case.name im Betreff";
      }
    }

    // Edge-Case: /Name Format im Betreff
    let slashNameScore = 0;
    if (score === 0) {
      // Nur wenn noch kein Match
      const slashNames = extractSlashNames(subject);
      if (slashNames.length > 0) {
        // Prüfe ob einer der slash-Namen in case.name vorkommt
        for (const name of slashNames) {
          if (item.name.toLowerCase().includes(name)) {
            slashNameScore = 35;
            score = slashNameScore;
            method = "/Name Format";
            break;
          }
        }
      }
    }

    // Empfänger-Matching: Vergleiche mit case.name
    // Prüfe alle Empfänger, nimm höchsten Score
    if (recipients.length > 0) {
      for (const recipient of recipients) {
        const currentRecipientScore = matchRecipientWithCaseName(
          recipient,
          item.name,
        );
        if (currentRecipientScore > recipientScore) {
          recipientScore = currentRecipientScore;
        }
      }
    }

    // Kombiniere Scores:
    // - Aktenzeichen (100-50): Höchste Priorität
    // - case.name Match (45-35): Mittlere Priorität
    // - Empfänger/Slash (40-35): Als Bonus oder Haupt-Score
    let finalScore = score;
    let matchType = method;

    if (score >= 50 && recipientScore > 0) {
      // Aktenzeichen + Empfänger: Bonus
      finalScore = score + Math.round(recipientScore * 0.3);
      matchType = method + " + Empfänger-Bonus";
    } else if (score > 0 && score < 50 && recipientScore > 0) {
      // case.name/Regex + Empfänger: Addiere beide
      finalScore = score + recipientScore;
      matchType = method + " + Empfänger";
    } else if (score === 0 && recipientScore > 0) {
      // Nur Empfänger: Verwende Empfänger-Score
      finalScore = recipientScore;
      matchType = "Empfänger-Match";
    }

    // Sammle alle Matches mit Score > 0
    if (finalScore > 0) {
      allMatches.push({
        item: item,
        score: finalScore,
        method: matchType,
        recipientScore: recipientScore,
        confidence: calculateConfidence(finalScore),
      });
    }
  }

  // Sortiere nach Score (höchster zuerst)
  allMatches.sort((a, b) => b.score - a.score);

  // Gib Top N zurück
  const topMatches = allMatches.slice(0, maxResults);

  console.log(
    `Gefundene Matches: ${allMatches.length}, Top ${maxResults}:`,
    topMatches,
  );

  return topMatches;
}

async function findServerMatchesInSubject(subject, loginData) {
  const extractedPatterns = extractFileNumberPatterns(subject);
  const subjectLower = subject.toLowerCase();
  const matches = [];
  const seenIds = new Set();

  for (const pattern of extractedPatterns) {
    if (pattern.length < 3) {
      continue;
    }

    try {
      const results = await searchCasesApi(
        loginData.username,
        loginData.password,
        loginData.serverAddress,
        pattern,
      );

      for (const item of results) {
        if (seenIds.has(item.id)) {
          continue;
        }

        seenIds.add(item.id);
        const fileNumberInSubject = subjectLower.includes(
          item.fileNumber.toLowerCase(),
        );
        const score = fileNumberInSubject ? 100 : 80;

        matches.push({
          item: item,
          score: score,
          method: fileNumberInSubject
            ? "Server-Aktenzeichen"
            : "Beteiligtenzeichen",
          confidence: calculateConfidence(score),
        });
      }
    } catch (error) {
      console.error("Fehler bei Server-Suche für Muster:", pattern, error);
    }
  }

  return matches;
}

function mergeCaseMatches(primaryMatches, serverMatches, maxResults = 3) {
  const matchesById = new Map();

  for (const match of primaryMatches) {
    matchesById.set(match.item.id, match);
  }

  for (const match of serverMatches) {
    const existingMatch = matchesById.get(match.item.id);
    if (!existingMatch || match.score > existingMatch.score) {
      matchesById.set(match.item.id, match);
    }
  }

  return Array.from(matchesById.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}

// Funktion: Wählt einen Vorschlag aus und lädt den Case
async function selectSuggestion(match, loginData, tabId) {
  const item = match.item;

  console.log("Vorschlag gewählt - ID: " + item.id);
  console.log("Vorschlag gewählt - Name: " + item.name);
  console.log(
    "Match Score: " + match.score + ", Confidence: " + match.confidence + "%",
  );

  currentSelectedCase = {
    id: item.id,
    name: item.name,
    fileNumber: item.fileNumber,
  };

  // Lade Case-Details (metadata bereits vorhanden wenn aus displaySuggestions)
  let caseMetaData;
  if (match.metadata) {
    caseMetaData = match.metadata;
  } else {
    caseMetaData = await getCaseMetaData(
      item.id,
      loginData.username,
      loginData.password,
      loginData.serverAddress,
    );
  }
  console.log("caseMetaData:", caseMetaData);

  // Aktualisiere den currentSelectedCase mit dem reason
  currentSelectedCase.reason = caseMetaData.reason;

  // Ordner des Cases laden
  caseFolders = await getCaseFolders(
    item.id,
    loginData.username,
    loginData.password,
    loginData.serverAddress,
  );
  displayTreeStructure(caseFolders);

  // Beteiligte anzeigen
  displayParties(item.id);

  // Label aktualisieren
  const customizableLabel = document.getElementById("customizableLabel");
  if (customizableLabel) {
    customizableLabel.textContent = `${item.fileNumber}: ${item.name} (${caseMetaData.reason || "?"} - ${caseMetaData.lawyer || "?"})`;
  }
  updateArchivedCaseNotice(item.id, caseMetaData.archived, loginData);

  // Automatisch Speichern nach Senden aktivieren
  browser.runtime.sendMessage({
    type: "saveToCaseAfterSend",
    source: "popup_compose",
    caseId: currentSelectedCase.id,
    content: currentSelectedCase.fileNumber,
    selectedCaseFolderID: selectedCaseFolderID,
    selectedTags: getSelectedTagsForCompose(),
    username: loginData.username,
    password: loginData.password,
    serverAddress: loginData.serverAddress,
    currentSelectedCase: currentSelectedCase,
    composeTabId: tabId,
  });

  // "Betreff setzen"-Button einblenden, da eine Akte ausgewählt wurde
  const setSubjectButton = document.getElementById("setSubjectButton");
  if (setSubjectButton) {
    setSubjectButton.style.display = "block";
  }

  // Feedback anzeigen
  const feedback = document.getElementById("feedback");
  feedback.textContent = i18nMessage("saveAfterSendFeedback");
  feedback.style.color = "green";

  return {
    id: item.id,
    name: item.name,
    fileNumber: item.fileNumber,
    reason: caseMetaData.reason,
  };
}

// Funktion: Zeigt Top-N Vorschläge im UI an
async function displaySuggestions(matches, loginData, tabId) {
  const suggestionsContainer = document.getElementById("suggestionsContainer");
  const suggestionsList = document.getElementById("suggestionsList");

  // Clear existing suggestions
  suggestionsList.replaceChildren();

  if (!matches || matches.length === 0) {
    suggestionsContainer.style.display = "block";
    const noMatch = document.createElement("div");
    noMatch.className = "suggestionItem noMatch";
    noMatch.textContent = i18nMessage("noSuggestionsFound");
    suggestionsList.appendChild(noMatch);
    return;
  }

  suggestionsContainer.style.display = "block";

  // Lade Metadata für alle Vorschläge parallel
  console.log("Lade Metadata für Top-3 Vorschläge...");
  const metadataPromises = matches.map((match) =>
    getCaseMetaData(
      match.item.id,
      loginData.username,
      loginData.password,
      loginData.serverAddress,
    ).catch((err) => {
      console.error(
        `Fehler beim Laden von Metadata für Case ${match.item.id}:`,
        err,
      );
      return { reason: "?", lawyer: "?" };
    }),
  );

  const metadataResults = await Promise.all(metadataPromises);

  matches.forEach((match, index) => {
    const item = match.item;
    const metadata = metadataResults[index];
    const div = document.createElement("div");
    div.className = "suggestionItem";

    // Confidence-Badge mit Farbe
    let confidenceClass = "confidence-low";
    if (match.confidence >= 85) confidenceClass = "confidence-high";
    else if (match.confidence >= 60) confidenceClass = "confidence-medium";

    const caseInfo = document.createElement("span");
    caseInfo.className = "caseInfo";

    const caseName = document.createElement("strong");
    caseName.textContent = item.name;
    caseInfo.appendChild(caseName);
    caseInfo.appendChild(document.createTextNode(` (${item.fileNumber})`));

    const caseDetails = document.createElement("span");
    caseDetails.className = "caseDetails";
    caseDetails.textContent = `${metadata.reason || "?"} - ${metadata.lawyer || "?"}`;
    caseInfo.appendChild(caseDetails);
    if (isArchivedValue(metadata.archived)) {
      caseName.appendChild(createArchivedBadge());
    }

    const confidenceBadge = document.createElement("span");
    confidenceBadge.className = `confidenceBadge ${confidenceClass}`;
    confidenceBadge.textContent = `${match.confidence}%`;

    div.appendChild(caseInfo);
    div.appendChild(confidenceBadge);

    // Speichere metadata im match-Objekt für später
    match.metadata = metadata;

    // Click-Handler
    div.addEventListener("click", async function () {
      // Entferne vorherige Selektion
      document
        .querySelectorAll(".suggestionItem")
        .forEach((el) => el.classList.remove("selected"));
      // Markiere als ausgewählt
      div.classList.add("selected");

      // Lade Case (metadata bereits vorhanden)
      await selectSuggestion(match, loginData, tabId);
    });

    suggestionsList.appendChild(div);
  });

  // Auto-select first suggestion if confidence >= 85%
  if (matches.length > 0 && matches[0].confidence >= 85) {
    console.log("Auto-selecting top suggestion (confidence >= 85%)");
    setTimeout(() => {
      suggestionsList.firstChild.click();
    }, 100);
  }
}

// Funktion zum Auslesen des Betreffs im Compose-Fenster und Suche nach einem Aktenzeichen
async function findFileNumberInComposeMessage() {
  try {
    // Aktiven Tab im Compose-Fenster ermitteln
    const tabs = await queryComposeTabs();
    if (tabs.length === 0) {
      console.log("Kein aktiver Tab gefunden.");
      return null;
    }

    const tabId = tabs[0].id;
    console.log("Aktive Tab-ID:", tabId);

    // Compose-Details aus dem aktiven Tab abrufen
    const composeDetails = await browser.compose.getComposeDetails(tabId);
    console.log("Compose-Details:", composeDetails);

    // Wenn kein Betreff vorhanden ist, frühzeitig beenden
    if (!composeDetails.subject || composeDetails.subject.trim() === "") {
      console.log("Nachricht hat keinen Betreff.");
      return null;
    }

    // In Betreff nach Aktenzeichen suchen
    const subject = composeDetails.subject;
    console.log("Betreff der Nachricht:", subject);

    // Gespeicherte Cases aus dem lokalen Storage holen
    let storedData = await browser.storage.local.get("cases");
    let loginData = await browser.storage.local.get([
      "username",
      "password",
      "serverAddress",
    ]);

    // Die gespeicherten Cases in einem Array (werden nicht mehr synchronisiert, meist leer)
    let casesArray = storedData.cases || [];

    // Lokale Treffer nur als Ergänzung, die Suche erfolgt in jedem Fall am Server
    const localMatches = findBestMatchesInSubject(
      subject,
      casesArray,
      composeDetails,
      3,
    );
    const serverMatches = await findServerMatchesInSubject(subject, loginData);
    const topMatches = mergeCaseMatches(localMatches, serverMatches, 3);

    // Zeige Vorschläge im UI
    await displaySuggestions(topMatches, loginData, tabId);

    // Gib Top-Match zurück (für Kompatibilität)
    if (topMatches.length > 0) {
      return {
        id: topMatches[0].item.id,
        name: topMatches[0].item.name,
        fileNumber: topMatches[0].item.fileNumber,
      };
    }

    console.log("Keine Übereinstimmung gefunden");
    return null;

    // LEGACY CODE entfernt - wird nicht mehr verwendet
    /*

        if (matchResult) {
            const item = matchResult.item;

            console.log("Aktenzeichen im Betreff gefunden:", item.fileNumber);
            console.log("Match Score:", matchResult.score);
            console.log("Match Methode:", matchResult.method);

            // Case-Informationen speichern
            currentSelectedCase = {
                id: item.id,
                name: item.name,
                fileNumber: item.fileNumber
            };

            console.log("Matching ID:", item.id);
            console.log("Matching Name:", item.name);

            // Weitere Metadaten und Ordner des Cases laden
            const caseMetaData = await getCaseMetaData(item.id, loginData.username, loginData.password, loginData.serverAddress);
            console.log("caseMetaData:", caseMetaData);

            // Aktualisiere den currentSelectedCase mit dem reason
            currentSelectedCase.reason = caseMetaData.reason;

            // Ordner des Cases laden
            caseFolders = await getCaseFolders(item.id, loginData.username, loginData.password, loginData.serverAddress);
            displayTreeStructure(caseFolders);

            // UI-Elemente aktualisieren
            const customizableLabel = document.getElementById("customizableLabel");
            const labelText = `${item.fileNumber}: ${item.name}${caseMetaData.reason ? ` - ${caseMetaData.reason}` : ''}`;
            customizableLabel.textContent = labelText;

            // Betreff aktualisieren, aber nur wenn die Aktenzeichen-Nummer nicht bereits im Betreff enthalten ist
            // (Wir haben bereits oben geprüft, dass die Nummer im Betreff ist, daher aktualisieren wir hier nicht)

            // Beteiligte anzeigen
            displayParties(item.id);

            // Automatisch Speichern nach Senden aktivieren
            browser.storage.local.get(["username", "password", "serverAddress"]).then(result => {
                browser.runtime.sendMessage({
                    type: "saveToCaseAfterSend",
                    source: "popup_compose",
                    caseId: currentSelectedCase.id,
                    content: currentSelectedCase.fileNumber,
                    selectedCaseFolderID: selectedCaseFolderID,
                    selectedTags: getSelectedTagsForCompose(),
                    username: result.username,
                    password: result.password,
                    serverAddress: result.serverAddress,
                    currentSelectedCase: currentSelectedCase
                });

                // Feedback anzeigen
                const feedback = document.getElementById("feedback");
                feedback.textContent = i18nMessage("saveAfterSendFeedback");
                feedback.style.color = "green";
            });

            return {
                id: item.id,
                name: item.name,
                fileNumber: item.fileNumber,
                reason: caseMetaData.reason
            };
        }

        // Wenn kein Aktenzeichen gefunden wurde
        console.log("Kein Aktenzeichen im Betreff gefunden");
        return null;
        */
  } catch (error) {
    console.error("Fehler bei der Suche nach Aktenzeichen:", error);
    return null;
  }
}

async function logActivity(action, details) {
  const timestamp = new Date().toISOString();
  const logEntry = { timestamp, action, details };

  let activityLog = await browser.storage.local.get("activityLog");
  activityLog = activityLog.activityLog || [];
  activityLog.push(logEntry);

  await browser.storage.local.set({ activityLog });
}

// Funktion zum Anzeigen des Rename-Dialogs
async function showRenameDialog(originalFilename) {
  return new Promise((resolve) => {
    const dialog = document.getElementById("renameDialog");
    const filenameInput = document.getElementById("filenameInput");
    const filenameSuggestion = document.getElementById("filenameSuggestion");
    const useSuggestionBtn = document.getElementById("useSuggestionBtn");
    const cancelRenameBtn = document.getElementById("cancelRenameBtn");
    const confirmRenameBtn = document.getElementById("confirmRenameBtn");

    // Zeitstempel-basierter Vorschlag
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}-${String(now.getMinutes()).padStart(2, "0")}`;

    // Dateiendung beibehalten
    const lastDotIndex = originalFilename.lastIndexOf(".");
    const extension =
      lastDotIndex > 0 ? originalFilename.substring(lastDotIndex) : "";
    const nameWithoutExt =
      lastDotIndex > 0
        ? originalFilename.substring(0, lastDotIndex)
        : originalFilename;

    const suggestedFilename = `${timestamp}_${nameWithoutExt}${extension}`;

    // UI vorbereiten
    filenameInput.value = originalFilename;
    filenameSuggestion.textContent = suggestedFilename;
    dialog.style.display = "flex";
    filenameInput.focus();
    filenameInput.select();

    // Event Listener (einmalig)
    const cleanup = () => {
      dialog.style.display = "none";
      useSuggestionBtn.replaceWith(useSuggestionBtn.cloneNode(true));
      cancelRenameBtn.replaceWith(cancelRenameBtn.cloneNode(true));
      confirmRenameBtn.replaceWith(confirmRenameBtn.cloneNode(true));
    };

    // Vorschlag verwenden
    document.getElementById("useSuggestionBtn").addEventListener(
      "click",
      function () {
        cleanup();
        resolve(suggestedFilename);
      },
      { once: true },
    );

    // Abbrechen
    document.getElementById("cancelRenameBtn").addEventListener(
      "click",
      function () {
        cleanup();
        resolve(null); // null = abgebrochen
      },
      { once: true },
    );

    // Umbenennen bestätigen
    document.getElementById("confirmRenameBtn").addEventListener(
      "click",
      function () {
        const newFilename = filenameInput.value.trim();
        cleanup();
        resolve(newFilename || originalFilename);
      },
      { once: true },
    );

    // Enter-Taste
    filenameInput.addEventListener(
      "keypress",
      function (e) {
        if (e.key === "Enter") {
          const newFilename = filenameInput.value.trim();
          cleanup();
          resolve(newFilename || originalFilename);
        }
      },
      { once: true },
    );
  });
}
