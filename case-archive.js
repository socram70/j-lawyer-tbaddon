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

// Erkennung archivierter (abgelegter) Akten und Reaktivierung (#95)

let activeCaseIdsPromise = null;

function buildCaseArchiveHeaders(loginData) {
  const headers = new Headers();
  const loginBase64Encoded = btoa(
    unescape(encodeURIComponent(loginData.username + ":" + loginData.password)),
  );
  headers.append("Authorization", "Basic " + loginBase64Encoded);
  headers.append("Content-Type", "application/json");
  return headers;
}

function isArchivedValue(archived) {
  return archived === true || archived === 1 || archived === "1";
}

// IDs aller aktiven Akten, einmal pro Popup geladen, um Suchtreffer als abgelegt zu markieren
function loadActiveCaseIds(loginData) {
  if (!activeCaseIdsPromise) {
    activeCaseIdsPromise = fetch(
      loginData.serverAddress + "/j-lawyer-io/rest/v1/cases/list/active",
      { method: "GET", headers: buildCaseArchiveHeaders(loginData) },
    )
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
      })
      .then((cases) => new Set(cases.map((item) => item.id)))
      .catch((error) => {
        console.error("Aktive Akten konnten nicht geladen werden:", error);
        activeCaseIdsPromise = null;
        return null;
      });
  }
  return activeCaseIdsPromise;
}

// Liefert für Suchtreffer true/false, oder null wenn der Status unbekannt ist
async function isCaseArchivedInSearch(caseId, loginData) {
  const activeCaseIds = await loadActiveCaseIds(loginData);
  if (!activeCaseIds) {
    return null;
  }
  return !activeCaseIds.has(caseId);
}

async function reactivateCase(caseId, loginData) {
  const headers = buildCaseArchiveHeaders(loginData);
  const caseUrl = loginData.serverAddress + "/j-lawyer-io/rest/v2/cases/" + caseId;

  const getResponse = await fetch(caseUrl, { method: "GET", headers });
  if (!getResponse.ok) {
    throw new Error(`Akte konnte nicht geladen werden (HTTP ${getResponse.status})`);
  }
  const caseData = await getResponse.json();
  caseData.archived = 0;

  const updateResponse = await fetch(
    loginData.serverAddress + "/j-lawyer-io/rest/v2/cases/update",
    { method: "PUT", headers, body: JSON.stringify(caseData) },
  );
  if (!updateResponse.ok) {
    throw new Error(
      `Akte konnte nicht reaktiviert werden (HTTP ${updateResponse.status})`,
    );
  }
  const updatedCase = await updateResponse.json();
  if (isArchivedValue(updatedCase.archived)) {
    throw new Error("Server meldet die Akte weiterhin als abgelegt");
  }

  if (activeCaseIdsPromise) {
    const activeCaseIds = await activeCaseIdsPromise;
    if (activeCaseIds) {
      activeCaseIds.add(caseId);
    }
  }
  await logActivity("reactivateCase", {
    caseId,
    fileNumber: updatedCase.fileNumber,
  });
  return updatedCase;
}

// Zeigt unter dem Akten-Label einen Hinweis mit "Akte reaktivieren", wenn die Akte abgelegt ist
function updateArchivedCaseNotice(caseId, archived, loginData) {
  let notice = document.getElementById("archivedCaseNotice");
  if (!isArchivedValue(archived)) {
    if (notice) {
      notice.remove();
    }
    return;
  }

  if (!notice) {
    notice = document.createElement("div");
    notice.id = "archivedCaseNotice";
    notice.style.cssText =
      "margin: 0 0 10px 0; padding: 8px 12px; border-radius: 6px; background: #fff3cd; color: #664d03; border: 1px solid #ffe69c; display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;";
    const label = document.getElementById("customizableLabel");
    label.insertAdjacentElement("afterend", notice);
  }

  const text = document.createElement("span");
  text.textContent = i18nMessage("archivedCaseWarning");

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = i18nMessage("reactivateCaseButton");
  button.style.cssText =
    "margin: 0; padding: 4px 10px; background: #664d03; color: white;";
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await reactivateCase(caseId, loginData);
      notice.style.background = "#d1e7dd";
      notice.style.color = "#0f5132";
      notice.style.borderColor = "#a3cfbb";
      notice.replaceChildren(i18nMessage("caseReactivatedFeedback"));
      setTimeout(() => notice.remove(), 3000);
    } catch (error) {
      console.error("Fehler beim Reaktivieren der Akte:", error);
      text.textContent = i18nMessage("errorPrefix", [error.message]);
      button.disabled = false;
    }
  });

  notice.dataset.caseId = caseId;
  notice.replaceChildren(text, button);
}

function createArchivedBadge() {
  const badge = document.createElement("span");
  badge.className = "archivedBadge";
  badge.textContent = " " + i18nMessage("archivedCaseBadge");
  badge.style.cssText = "color: #b45309; font-weight: 600;";
  return badge;
}
