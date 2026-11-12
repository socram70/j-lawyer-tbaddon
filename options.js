function normalizeServerAddress(serverAddress) {
  return serverAddress.trim().replace(/\/+$/, "");
}

async function requestServerPermission(serverAddress) {
  if (!serverAddress) {
    return true;
  }

  const origins = getPermissionOriginsForServer(serverAddress);
  if (origins.length === 0) {
    return true;
  }

  const granted = await browser.permissions.request({ origins });
  if (!granted) {
    alert(i18nMessage("serverPermissionDenied"));
  }
  return granted;
}

document.getElementById("saveButton").addEventListener("click", async function () {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;
  const serverAddress = normalizeServerAddress(
    document.getElementById("serverAddress").value,
  );
  const moveToTrash = document.getElementById("moveToTrash").checked;
  const allowRename = document.getElementById("allowRename").checked;
  const performOcr = document.getElementById("performOcr").checked;
  const subjectTemplate = document.getElementById("subjectTemplate").value;
  const filenameTemplate = document.getElementById("filenameTemplate").value;
  const recipientRoleMapping = {};
  document
    .querySelectorAll("#recipientRoleMapping select")
    .forEach((select) => {
      recipientRoleMapping[select.dataset.partyType] = select.value;
    });

  try {
    const hasServerPermission = await requestServerPermission(serverAddress);
    if (!hasServerPermission) {
      return;
    }
  } catch (error) {
    alert(i18nMessage("invalidServerAddress", [error.message]));
    return;
  }

  await browser.storage.local
    .set({
      username: username,
      password: password,
      serverAddress: serverAddress,
      moveToTrash: moveToTrash,
      allowRename: allowRename,
      performOcr: performOcr,
      subjectTemplate: subjectTemplate,
      filenameTemplate: filenameTemplate,
      recipientRoleMapping: recipientRoleMapping,
    })
    .then(() => {
      document.getElementById("saveButton").value =
        i18nMessage("savedButtonValue");
    });
});

document
  .getElementById("viewLogButton")
  .addEventListener("click", async function () {
    let activityLog = await browser.storage.local.get("activityLog");
    activityLog = activityLog.activityLog || [];
    if (activityLog.length === 0) {
      alert(i18nMessage("noActivityLogged"));
    } else {
      const logWindow = window.open("", "Activity Log", "width=600,height=400");
      const logDocument = logWindow.document;
      logDocument.title = i18nMessage("activityLogTitle");

      logDocument.body.style.fontFamily = "Arial, sans-serif";
      logDocument.body.style.backgroundColor = "#ffffff";
      logDocument.body.style.color = "#000000";
      logDocument.body.style.margin = "8px";

      const heading = logDocument.createElement("h2");
      heading.textContent = i18nMessage("activityLogTitle");
      logDocument.body.appendChild(heading);

      const table = logDocument.createElement("table");
      table.setAttribute("border", "1");
      table.style.width = "100%";
      table.style.borderCollapse = "collapse";
      table.style.backgroundColor = "#ffffff";
      table.style.color = "#000000";

      const headerRow = logDocument.createElement("tr");
      [
        i18nMessage("activityLogTimestamp"),
        i18nMessage("activityLogAction"),
        i18nMessage("activityLogDetails"),
      ].forEach((headerText) => {
        const headerCell = logDocument.createElement("th");
        headerCell.textContent = headerText;
        headerCell.style.padding = "4px";
        headerCell.style.backgroundColor = "#f2f2f2";
        headerRow.appendChild(headerCell);
      });
      table.appendChild(headerRow);

      activityLog.forEach((entry) => {
        const row = logDocument.createElement("tr");
        const timestampCell = logDocument.createElement("td");
        const actionCell = logDocument.createElement("td");
        const detailsCell = logDocument.createElement("td");

        timestampCell.textContent = new Date(entry.timestamp).toLocaleString();
        actionCell.textContent = entry.action;
        detailsCell.textContent = JSON.stringify(entry.details, null, 2);

        timestampCell.style.padding = "4px";
        actionCell.style.padding = "4px";
        detailsCell.style.padding = "4px";
        detailsCell.style.whiteSpace = "pre-wrap";

        row.appendChild(timestampCell);
        row.appendChild(actionCell);
        row.appendChild(detailsCell);
        table.appendChild(row);
      });

      logDocument.body.appendChild(table);
    }
  });

document
  .getElementById("clearLogButton")
  .addEventListener("click", async function () {
    await browser.storage.local.remove("activityLog");
    alert(i18nMessage("activityLogCleared"));
  });

document
  .getElementById("viewUpdatesButton")
  .addEventListener("click", async function () {
    await browser.tabs.create({
      url: browser.runtime.getURL("updates.html"),
    });
  });

// Beim Laden der Optionen-Seite, werden die gespeicherten Werte in die Eingabefelder gesetzt
document.addEventListener("DOMContentLoaded", function () {
  browser.storage.local
    .get([
      "username",
      "password",
      "serverAddress",
      "moveToTrash",
      "allowRename",
      "performOcr",
      "subjectTemplate",
      "filenameTemplate",
      "recipientRoleMapping",
    ])
    .then((result) => {
      document.getElementById("username").value = result.username || "";
      document.getElementById("password").value = result.password || "";
      document.getElementById("serverAddress").value =
        result.serverAddress || "";
      document.getElementById("moveToTrash").checked =
        result.moveToTrash || false;
      document.getElementById("allowRename").checked =
        result.allowRename || false;
      document.getElementById("performOcr").checked =
        result.performOcr || false;
      document.getElementById("subjectTemplate").value =
        result.subjectTemplate || "";
      document.getElementById("filenameTemplate").value =
        result.filenameTemplate || "";
      renderRecipientRoleMapping(result);
    });
});

// Beteiligtentypen vom Server laden und je Typ eine Auswahl An/CC/BCC/nicht zuordnen anzeigen
async function renderRecipientRoleMapping(settings) {
  const container = document.getElementById("recipientRoleMapping");
  const mapping = settings.recipientRoleMapping || DEFAULT_RECIPIENT_ROLE_MAPPING;
  let partyTypes = Object.keys(mapping);

  try {
    if (!settings.serverAddress || !(await hasServerPermission(settings.serverAddress))) {
      throw new Error("Keine Serveradresse oder Berechtigung");
    }
    const headers = new Headers();
    headers.append(
      "Authorization",
      "Basic " +
        btoa(unescape(encodeURIComponent(settings.username + ":" + settings.password))),
    );
    const response = await fetch(
      settings.serverAddress + "/j-lawyer-io/rest/v7/configuration/party-types",
      { method: "GET", headers },
    );
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    partyTypes = (await response.json())
      .sort((a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0))
      .map((partyType) => partyType.name);
  } catch (error) {
    console.error("Beteiligtentypen konnten nicht geladen werden:", error);
    const hint = document.createElement("small");
    hint.style.cssText = "color: #b45309; display: block; margin-bottom: 6px";
    hint.textContent = i18nMessage("recipientRoleMappingLoadError");
    container.appendChild(hint);
  }

  for (const partyType of partyTypes) {
    const row = document.createElement("div");
    row.style.cssText = "display: flex; justify-content: space-between; gap: 10px; margin: 3px 0; max-width: 360px";
    const label = document.createElement("span");
    label.textContent = partyType;
    const select = document.createElement("select");
    select.dataset.partyType = partyType;
    for (const field of [...RECIPIENT_FIELDS, "none"]) {
      const option = document.createElement("option");
      option.value = field;
      option.textContent = i18nMessage(`recipientField_${field}`);
      select.appendChild(option);
    }
    select.value = getRecipientFieldForPartyType(partyType, mapping);
    row.append(label, select);
    container.appendChild(row);
  }
}
