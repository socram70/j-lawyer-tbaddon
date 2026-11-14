# j-lawyer.org Thunderbird Extension

Thunderbird-Erweiterung zum Speichern von Nachrichten und Anhängen in j-lawyer.org sowie zum Erstellen von Terminen/Fristen/Wiedervorlagen zu einer Akte. Zusätzlich unterstützt die Erweiterung das Arbeiten im Verfassen-Fenster (Vorlagen, Dokumente aus der Akte anhängen) und das Bearbeiten von Bildanhängen mit PDF-Zusammenfassung.

Wichtig: Zugangsdaten werden lokal und unverschlüsselt in Thunderbird gespeichert.

## Features

- E-Mails speichern: komplette Nachricht inkl. Anhänge, nur Nachricht oder nur Anhänge in eine Akte hochladen
- Bildanhänge bearbeiten: Bilder zuschneiden, Reihenfolge festlegen, umbenennen, als ein PDF zusammenfassen und speichern
- Etiketten setzen: beliebige Dokument-Tags beim Hochladen vergeben; gespeicherte Nachrichten werden zusätzlich mit dem Tag „veraktet“ versehen
- Ordnerwahl: Zielordner innerhalb der Akte auswählen (Ordnerbaum wird angezeigt)
- Kontextmenü für Mehrfachzuordnung: mehrere markierte Nachrichten per Rechtsklick an eine Akte senden, wahlweise komplett, nur Nachricht, nur Anhänge oder Nachricht und Anhänge getrennt
- Automatische Aktenvorschläge: Aktenzeichen in Betreff und Text sowie Abgleich der Absender- bzw. Empfänger-Adressen mit den Beteiligten der Akten; ein Aktenzeichen im Betreff hat Vorrang
- Archivierte Akten: werden bei der Suche gefunden, als „(archiviert)“ gekennzeichnet und können direkt reaktiviert werden
- Anhänge filtern: kleine Bilder (z. B. Signatur-Logos) und bestimmte Dateiendungen beim separaten Speichern überspringen
- Kalender: Termin, Frist oder Wiedervorlage für eine Akte und einen Nutzer anlegen (j-lawyer.org ≥ 2.6)
- Verfassen-Fenster: eigenes Fenster neben der E-Mail; Akte wählen, Beteiligte per Klick in An/CC/BCC übernehmen, Vorlagen mit Platzhaltern einfügen, Dokumente aus der Akte als Anhang hinzufügen, nach dem Senden speichern
- Datenabgleich: Nutzer, Kalender, Akten, Ordner und Tags laden/aktualisieren (↺)
- Optional: E-Mail nach Zuordnung in Papierkorb verschieben/sofort löschen (abhängig von Kontoeinstellung)
- Protokoll: Log einsehen und löschen

## Voraussetzungen

- Thunderbird ab Version 125
- j-lawyer.org-Server erreichbar; für Kalenderfunktionen mindestens Version 2.6
- Server-URL inkl. Protokoll und Port, Benutzername und Passwort

## Installation

1) Aus dem Mozilla Hub für Thunderbird Erweiterungen herunterladen. Updates werden je nach Einstellung in TB automatisch installiert.

2) ODER: Letztes Release als `.xpi` herunterladen (j-Lawyer-Thunderbird.xpi). In Thunderbird: Add-ons öffnen und „Aus Datei installieren…“ wählen

3) Einstellungen der Erweiterung öffnen und konfigurieren:
   - Serveradresse inkl. Protokoll und Port, z. B. `http://192.168.1.10:8080`
   - Benutzername und Passwort
   - Optional: „E-Mail nach Zuordnung in Papierkorb verschieben“ aktivieren
   - Optional: kleine Bilder und Dateiendungen vom separaten Speichern von Anhängen ausschließen
   - Optional: Fenster beim Verfassen nach Klick auf „Nach Senden speichern“ schließen

4) Erster Datenabgleich wird bei bestehender Verbindung automatisch und dann jeden Tag vorgenommen. 
   Kann manuell ausgelöst werden. Sollte manuell ausgelöst werden bei neu angelegten Akten.

5) SSH-Tunnel/Port: Falls der j-lawyer-Server via SSH-Port erreichbar ist, in Thunderbird den Port freigeben:
   - Menü „Bearbeiten“ → „Einstellungen“ → Tab „Allgemein“ → „Konfiguration bearbeiten…“
   - `network.security.ports.banned.override` als String anlegen/ändern (ohne Leerzeichen)
   - Den verwendeten Port eintragen (entspricht dem Port aus dem j-lawyer.org-Clientprofil)
   - Kein Thunderbird-Neustart erforderlich

## Benutzung – Beispiele

1) Nachricht inkl. Anhänge speichern
- Nachricht in Thunderbird öffnen
- Button der Erweiterung im Nachrichtenfenster anklicken → Popup
- Akte über Suche finden (Name, Aktenzeichen; Trefferliste klicken)
- Zielordner im Ordnerbaum auswählen (optional)
- Etiketten auswählen (optional)
- „Speichern“ klicken
- Ergebnis: Upload in die Akte, Nachricht wird mit „veraktet“ getaggt; optional Verschieben in Papierkorb

2) Nur Anhänge speichern (mit Bildbearbeitung)
- Im Popup „🖼️ Bildanhänge vor Speichern bearbeiten“ aktivieren (optional)
- „Nur Anhang“ klicken
- Für Bildanhänge erscheint ein Overlay: Bilder zuschneiden, Reihenfolge ändern, Dateien/PDF umbenennen, „Als PDF zusammenfassen“ möglich
- Nicht-Bildanhänge werden automatisch ohne Bearbeitung gespeichert

3) Nur Nachricht speichern (ohne Anhänge)
- „Nur Nachricht“ klicken → Nachricht als `.eml` in die Akte hochladen

4) Mehrere Nachrichten per Kontextmenü zuordnen
- In der Nachrichtenliste mehrere E-Mails markieren
- Rechtsklick → „Nachrichten an j-Lawyer senden…“
- Akte/Ordner wählen, optional Tags setzen
- „Speichern“, „Nur Nachricht“, „Nur Anhang“ oder „Nachricht und Anhang“ klicken; die Nachrichten werden nacheinander gespeichert

5) Kalendereintrag erstellen (Termin/Frist/Wiedervorlage)
- Toolbar-Symbol „Kalendereintrag erstellen“ öffnen
- Akte suchen und auswählen
- Kategorie wählen (Termin/Frist/Wiedervorlage), Verantwortlichen und Kalender wählen
- Datum/Zeit setzen; Ort/Beschreibung ergänzen → Speichern

   ![Kalender 1](https://github.com/jlawyerorg/j-lawyer-tbaddon/assets/71747937/686c4693-4e56-49d4-9bc0-21b0cb4beca6)
   
   ![Kalender 2](https://github.com/jlawyerorg/j-lawyer-tbaddon/assets/71747937/4531ba6d-f8ee-4ce5-8843-c748c2d5df87)

6) Arbeit im Verfassen-Fenster
- Beim Schreiben einer E-Mail den Button der Erweiterung anklicken → eigenes Fenster rechts am Verfassen-Fenster (Größe wird gemerkt)
- Die Akte wird wie im Posteingang vorgeschlagen: Aktenzeichen in Betreff und zitiertem Text, Beteiligte unter den Empfängern; ändern sich Empfänger oder Betreff, wird erneut gesucht (eine von Hand gewählte Akte bleibt erhalten)
- Beteiligte der Akte per „An“, „CC“ oder „BCC“ übernehmen; erneuter Klick entfernt sie wieder, das aktuelle Feld ist hervorgehoben; „Empfänger zurücksetzen“ leert alle Empfängerfelder
- „Nach Senden speichern“: die E-Mail wird nach dem Versand in der Akte abgelegt
- Rechtsklick auf den Button: E-Mail-Vorlagen mit Platzhaltern einfügen, Dokumente aus der Akte als Anhang hinzufügen

## Hinweise und Sicherheit

- Anmeldedaten werden lokal unverschlüsselt gespeichert
- Bei neuen/„jungen“ Akten vor Kalender-/Speicherfunktionen einmal ↺ ausführen, damit die Akte gefunden wird
- Vorschläge über E-Mail-Adressen funktionieren nur, wenn die Adresse beim Kontakt in j-lawyer hinterlegt ist (E-Mail, privat oder sonstige); weitere Adressen eines Kontakts am besten unter „E-Mail sonstige“ eintragen
- Bei Fehler „Datei existiert eventuell schon“ ggf. Dateiname ändern oder Zielordner prüfen

## Mitwirken

- Tests, Bugmeldungen und Funktionswünsche sind willkommen – bitte Issues im Repository nutzen

## Lizenz

AGPL-3.0 – siehe `LICENSE`
