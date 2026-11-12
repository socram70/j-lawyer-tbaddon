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

// Ausschluss von Anhängen beim Einzelspeichern (z. B. Signatur-Logos, .p7s).
// Betrifft nur das separate Speichern von Anhängen, die .eml bleibt vollständig.

const DEFAULT_EXCLUDE_SMALL_IMAGES_MAX_KB = 20;

function parseExcludedExtensions(value) {
  return (value || "")
    .split(/[\s,;]+/)
    .map((extension) => extension.trim().toLowerCase().replace(/^\./, ""))
    .filter((extension) => extension);
}

async function loadAttachmentExclusionSettings() {
  const settings = await browser.storage.local.get([
    "excludeSmallImages",
    "excludeSmallImagesMaxKb",
    "excludedExtensions",
  ]);
  const maxKb =
    Number(settings.excludeSmallImagesMaxKb) ||
    DEFAULT_EXCLUDE_SMALL_IMAGES_MAX_KB;

  return {
    maxImageBytes: settings.excludeSmallImages ? maxKb * 1024 : 0,
    extensions: parseExcludedExtensions(settings.excludedExtensions),
  };
}

// Liefert den Grund für den Ausschluss oder null, wenn der Anhang gespeichert wird
function getAttachmentExclusionReason(attachment, exclusionSettings) {
  const name = (attachment.name || "").toLowerCase();
  const contentType = (attachment.contentType || "").toLowerCase();
  const extension = name.includes(".") ? name.split(".").pop() : "";

  if (extension && exclusionSettings.extensions.includes(extension)) {
    return `Dateiendung .${extension} ausgeschlossen`;
  }

  const isImage =
    contentType.startsWith("image/") ||
    /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/.test(name);
  const size = Number(attachment.size);
  if (
    isImage &&
    exclusionSettings.maxImageBytes > 0 &&
    size > 0 &&
    size < exclusionSettings.maxImageBytes
  ) {
    return `Bild kleiner als ${Math.round(exclusionSettings.maxImageBytes / 1024)} KB`;
  }

  return null;
}

// Teilt Anhänge in zu speichernde und ausgeschlossene auf
function splitExcludedAttachments(attachments, exclusionSettings) {
  const included = [];
  const excluded = [];

  for (const attachment of attachments) {
    const reason = getAttachmentExclusionReason(attachment, exclusionSettings);
    if (reason) {
      console.log(`Anhang übersprungen: ${attachment.name} (${reason})`);
      excluded.push({ name: attachment.name, reason });
    } else {
      included.push(attachment);
    }
  }

  return { included, excluded };
}
