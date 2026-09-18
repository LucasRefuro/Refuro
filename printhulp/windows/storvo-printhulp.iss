; Storvo labelprinter - Windows-installer (Inno Setup)
;
; Maakt een dubbelklik-installer die:
;   1. het hulpprogramma (storvo-printhulp.exe) plaatst
;   2. een lokaal certificaat vertrouwt zodat https://127.0.0.1:9909 in elke
;      Chromium-browser (Edge, Chrome) werkt, via de Windows-vertrouwenslijst
;   3. het certificaat voor 127.0.0.1 maakt in %USERPROFILE%\.storvo-print
;   4. het hulpprogramma automatisch laat starten bij inloggen (geplande taak)
;   5. het meteen start
;
; De .exe en mkcert.exe worden door de GitHub Actions-build naast dit bestand gezet.

#define AppName "Storvo Labelprinter"
#define AppVersion "1.0.0"
#define AppExe "storvo-printhulp.exe"

[Setup]
AppId={{7A3C2E10-9B4D-4E22-9C3A-STORVOPRINT01}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=Storvo
DefaultDirName={autopf}\Storvo Printhulp
DisableProgramGroupPage=yes
DisableDirPage=yes
PrivilegesRequired=admin
OutputBaseFilename=storvo-printhulp-setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName={#AppName}

[Languages]
Name: "nl"; MessagesFile: "compiler:Languages\Dutch.isl"

[Files]
Source: "storvo-printhulp.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "mkcert.exe";           DestDir: "{app}"; Flags: ignoreversion

[Dirs]
; De datamap van de ingelogde gebruiker (waar het hulpprogramma cert en log verwacht).
Name: "{%USERPROFILE}\.storvo-print"

[Run]
; 1. Het lokale certificaat-CA vertrouwen (Windows-vertrouwenslijst -> Edge en Chrome).
Filename: "{app}\mkcert.exe"; Parameters: "-install"; Flags: runhidden waituntilterminated; StatusMsg: "Certificaat vertrouwen..."
; 2. Het certificaat voor 127.0.0.1 maken in de datamap van de gebruiker.
Filename: "{cmd}"; Parameters: "/C ""cd /d ""{%USERPROFILE}\.storvo-print"" && ""{app}\mkcert.exe"" -cert-file cert.pem -key-file key.pem 127.0.0.1 localhost"""; Flags: runhidden waituntilterminated; StatusMsg: "Certificaat maken..."
; 3. Automatisch starten bij inloggen (geplande taak, draait als de ingelogde gebruiker).
Filename: "{cmd}"; Parameters: "/C schtasks /Create /TN ""StorvoPrinthulp"" /TR ""'{app}\{#AppExe}'"" /SC ONLOGON /RL LIMITED /F"; Flags: runhidden waituntilterminated; StatusMsg: "Automatisch starten instellen..."
; 4. Nu meteen starten.
Filename: "{app}\{#AppExe}"; Flags: nowait runhidden; StatusMsg: "Hulpprogramma starten..."

[UninstallRun]
Filename: "{cmd}"; Parameters: "/C schtasks /Delete /TN ""StorvoPrinthulp"" /F"; Flags: runhidden waituntilterminated; RunOnceId: "DelTask"
Filename: "{cmd}"; Parameters: "/C taskkill /IM {#AppExe} /F"; Flags: runhidden waituntilterminated; RunOnceId: "KillHelper"

[Messages]
nl.SetupWindowTitle=Storvo Labelprinter installeren

[Code]
procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssDone then
    MsgBox('Klaar. Het hulpprogramma draait nu.'#13#10#13#10
      + 'Nog even bij de printer:'#13#10
      + '1. Installeer de Brother QL-800 driver (van de Brother-site) als dat nog niet gebeurd is.'#13#10
      + '2. Zet Editor Lite UIT: houd de Editor-Lite-knop op de printer ongeveer 2 seconden ingedrukt tot het groene lampje uitgaat.'#13#10
      + '3. Zorg dat de zwart/rode DK-22251-rol erin zit en sluit de printer met de USB-kabel aan.'#13#10#13#10
      + 'Open daarna storvo.app en test via Meer, Labelprinter, Verbinding testen.',
      mbInformation, MB_OK);
end;
