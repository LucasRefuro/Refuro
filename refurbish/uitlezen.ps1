# Storvo | laptop uitlezen (accu en specs)
#
# Dit script plak je niet zelf: de testpagina in de refurbish-app geeft een regel
# die hem ophaalt en draait, met de code van het toestel ervoor:
#   $code='A0001';[Net.ServicePointManager]::SecurityProtocol=3072;irm https://storvo.app/refurbish/uitlezen.ps1|iex
#
# Waarom zo en niet als gedownload .bat-bestand: Edge en SmartScreen blokkeren een
# .bat van internet, en dat kostte bij elke laptop drie klikken op "Toch behouden".
# Een geplakte regel is geen bestand, dus er is niets om te blokkeren. Er is ook
# geen administrator nodig, en het uitvoeringsbeleid (ExecutionPolicy) speelt geen
# rol: iex draait tekst, geen scriptbestand.
#
# Regels voor dit bestand:
# 1. Alleen ASCII. Windows PowerShell 5.1 leest tekst zonder BOM als Latin-1, dus een
#    e met accent wordt hier rommel. tests/refurbish-uitlezen.js bewaakt dat.
# 2. Nooit exit. Het draait in het venster dat de winkelier zelf opende; exit sluit
#    dat venster en dan zie je de uitslag niet. Het .bat-vangnet leest daarom
#    $global:StorvoKlaar in plaats van een exitcode.
# 3. Alles binnen & { }: dan blijven de hulpvariabelen en de stille foutmeldingen
#    in dit blok en niet in de sessie van de winkelier hangen. $code komt van buiten.
#
# De sleutel hieronder is de publieke anon-sleutel (dezelfde als in elke pagina).
# refurbish-test draait zonder JWT-controle en kijkt alleen of de code bestaat.
& {
$ErrorActionPreference='SilentlyContinue'
$global:StorvoKlaar=$false
$adres='https://ugilfxqolemxwssbpdwu.supabase.co/functions/v1/refurbish-test'
$sleutel='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnaWxmeHFvbGVteHdzc2JwZHd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3ODk1NTUsImV4cCI6MjEwMTM2NTU1NX0.7q6R7J0_U0iU6AGlxFoBHpH22cRBluapP3nOsuIssqA'
$code="$code".Trim().ToUpper()
if(-not $code){
  Write-Host '  Geen code gevonden. Kopieer de regel opnieuw op de testpagina in Storvo.' -ForegroundColor Yellow
  return
}
Write-Host ''
Write-Host "  Storvo leest de laptop uit voor $code ..."
try{ [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 }catch{}
$accu=$null; $accuStatus=''; $accuReden=''; $cyc=$null
try{
  $rep="$env:TEMP\storvo-accu.xml"
  powercfg /batteryreport /output $rep /xml | Out-Null
  $raw = Get-Content $rep -Raw
  $md = [regex]::Match($raw,'<DesignCapacity>(\d+)</DesignCapacity>')
  $mf = [regex]::Match($raw,'<FullChargeCapacity>(\d+)</FullChargeCapacity>')
  $mc = [regex]::Match($raw,'<CycleCount>(\d+)</CycleCount>')
  if($mc.Success){ $cyc=[int]$mc.Groups[1].Value }
  if($md.Success -and $mf.Success -and [double]$md.Groups[1].Value -gt 0 -and [double]$mf.Groups[1].Value -gt 0){
    $d=[double]$md.Groups[1].Value; $f=[double]$mf.Groups[1].Value
    # Volle lading kleiner dan ontwerp = een echte, meetbare slijtage. Alleen dan een
    # percentage doorsturen. Meldt de laptop de volle lading GELIJK aan (of groter dan)
    # de ontwerpcapaciteit, dan heeft de firmware de slijtage niet bijgehouden: dat is
    # geen echte 100%, dus sturen we geen getal maar zeggen we dat het niet te meten was.
    if($f -lt $d){ $accu=[int][math]::Round(($f/$d)*100) }
    else { $accuStatus='onmeetbaar'; $accuReden='De laptop meldt de accu als vol: de volle lading is gelijk aan de ontwerpcapaciteit, dus de echte slijtage is niet te meten. Vul de conditie met de hand in, of vink een nieuwe accu aan.' }
  } else { $accuStatus='onmeetbaar'; $accuReden='Geen bruikbare accugegevens in het rapport. Vul de conditie met de hand in.' }
}catch{ $accuStatus='onmeetbaar'; $accuReden='Het accurapport kon niet gemaakt worden. Vul de conditie met de hand in.' }
$g=$null
try{
  $cs = Get-CimInstance Win32_ComputerSystem
  $csp = Get-CimInstance Win32_ComputerSystemProduct
  $bb = Get-CimInstance Win32_BaseBoard
  # MERK: de ruwe fabrikantnaam (bv. "ASUSTeK COMPUTER INC.") terugbrengen naar een
  # korte merknaam. Merk is echt iets anders dan model, dus die scheiden we netjes.
  $mr = "$($cs.Manufacturer)"; $ml = $mr.ToLower()
  if($ml -match 'asus'){ $merk='Asus' }
  elseif($ml -match 'hewlett|hp inc|^hp'){ $merk='HP' }
  elseif($ml -match 'dell'){ $merk='Dell' }
  elseif($ml -match 'lenovo'){ $merk='Lenovo' }
  elseif($ml -match 'acer'){ $merk='Acer' }
  elseif($ml -match 'micro-star|msi'){ $merk='MSI' }
  elseif($ml -match 'microsoft'){ $merk='Microsoft' }
  elseif($ml -match 'toshiba|dynabook'){ $merk='Toshiba' }
  elseif($ml -match 'samsung'){ $merk='Samsung' }
  elseif($ml -match 'fujitsu'){ $merk='Fujitsu' }
  elseif($ml -match 'wortmann|terra'){ $merk='Terra' }
  elseif($ml -match 'sony'){ $merk='Sony' }
  elseif($ml -match 'medion'){ $merk='Medion' }
  elseif($ml -match 'huawei'){ $merk='Huawei' }
  elseif($ml -match 'razer'){ $merk='Razer' }
  elseif($ml -match 'gigabyte'){ $merk='Gigabyte' }
  else { $merk = ($mr -replace '(?i)\b(computer|corporation|corp|inc|incorporated|co|ltd|technologies|technology|international|electronics|group|gmbh|systems|s\.a\.|b\.v\.)\b\.?','' -replace '[,\.]',' ' -replace '\s+',' ').Trim() }
  # MODEL staat per merk in een ander veld. HP en Lenovo: de productversie (nette
  # naam). Asus en MSI: het moederbord (modelcode). De rest: het systeemmodel. We
  # nemen de eerste die NIET generiek is ("1.0", "System Product Name", leeg, ...).
  $gen = '^(?i)(to be filled by o\.?e\.?m\.?|to be filled|system product name|default string|o\.?e\.?m\.?|invalid|not applicable|not specified|none|standard|type1productconfigid|\d+(\.\d+)*)$'
  if($merk -eq 'HP' -or $merk -eq 'Lenovo'){ $kand = @($csp.Version, $cs.Model, $bb.Product) }
  elseif($merk -eq 'Asus' -or $merk -eq 'MSI'){ $kand = @($bb.Product, $cs.Model, $csp.Version) }
  else { $kand = @($cs.Model, $bb.Product, $csp.Version, $csp.Name) }
  $model=''
  foreach($k in $kand){ $k="$k".Trim(); if($k -and ($k -notmatch $gen)){ $model=$k; break } }
  $model = ($model -replace '_',' ' -replace '\s+',' ').Trim()
  if($merk -and $model.ToLower().StartsWith(($merk.ToLower()+' '))){ $model = $model.Substring($merk.Length).Trim() }
  $model = [regex]::Replace($model, '\b(\S+)\s+\1\b', '$1')
  $serie = "$((Get-CimInstance Win32_BIOS).SerialNumber)".Trim()
  # ARTIKELCODE(s) voor de fotocatalogus: MEERDERE kandidaten als backup, want geen
  # enkele bron klopt voor elk merk. HP: SystemSKUNumber (# eraf). Lenovo: het
  # machinetype in Win32_ComputerSystem.Model. Asus/Acer: de moederbord-modelcode.
  # We sturen ze met puntkomma's; de fotozoeker probeert ze om de beurt, zodat als
  # de ene niet in de catalogus staat, de andere alsnog een treffer geeft.
  $sku = "$($cs.SystemSKUNumber)"; if($sku){ $sku = ($sku -split '#')[0].Trim() }
  $codes = @()
  foreach($c in @($sku, "$($cs.Model)".Trim(), "$($bb.Product)".Trim())){
    $c = "$c".Trim()
    if($c -and ($c -notmatch $gen) -and ($c -notmatch 'System SKU') -and ($codes -notcontains $c)){ $codes += $c }
  }
  $mpn = ($codes -join ';')
  $cpu = "$((Get-CimInstance Win32_Processor | Select-Object -First 1).Name)"
  if($cpu){ $cpu = ($cpu -replace '\(R\)','' -replace '\(TM\)','' -replace '\(tm\)','' -replace ' CPU','' -replace '@.*$','' -replace '\s+',' ').Trim() }
  # GEHEUGEN: de echt geplaatste modules optellen (Win32_PhysicalMemory), niet het
  # door Windows 'bruikbare' geheugen: dat is minder omdat de videokaart een stuk
  # afsnoept, waardoor 8 GB als 7 kan tonen. Daarna afronden naar een gangbare maat.
  $ramB = 0
  try{ foreach($m in (Get-CimInstance Win32_PhysicalMemory)){ $ramB += [double]$m.Capacity } }catch{}
  if($ramB -le 0){ $ramB = [double]$cs.TotalPhysicalMemory }
  $ram = [int][math]::Round($ramB/1GB)
  $rmaten=@(2,3,4,6,8,12,16,24,32,48,64); $rbest=$ram; $rd=999
  foreach($rm in $rmaten){ $d=[math]::Abs($rm-$ram); if($d -lt $rd){ $rd=$d; $rbest=$rm } }
  if($rd -le 1){ $ram=$rbest }
  # OPSLAG: totale grootte in verkoop-GB (bytes/1e9, niet GiB), plus de soort van de
  # hoofdschijf: HDD, SATA SSD of NVMe SSD. NVMe is altijd een SSD.
  $bytes=0; $soort=''
  try{
    $disks = @(Get-PhysicalDisk)
    foreach($d in $disks){ $bytes += [double]$d.Size }
    $hoofd = $disks | Sort-Object Size -Descending | Select-Object -First 1
    if($hoofd){ $mt="$($hoofd.MediaType)"; $bt="$($hoofd.BusType)"
      if($bt -eq 'NVMe'){ $soort='NVMe SSD' }
      elseif($mt -eq 'HDD'){ $soort='HDD' }
      elseif($mt -eq 'SSD'){ if($bt -eq 'SATA' -or $bt -eq 'RAID' -or $bt -eq 'ATA'){ $soort='SATA SSD' } else { $soort='SSD' } } }
  }catch{}
  if($bytes -eq 0){ try{ foreach($d in (Get-CimInstance Win32_DiskDrive)){ $bytes += [double]$d.Size } }catch{} }
  $opslag=''
  if($bytes -gt 0){ $gb=[int][math]::Round($bytes/1e9)
    $maten=@(120,128,240,250,256,480,500,512,1000,2000,4000); $bm=$gb; $bd=1e9
    foreach($m in $maten){ $v=[math]::Abs($m-$gb); if($v -lt $bd){ $bd=$v; $bm=$m } }
    if($bd -le $gb*0.1){ $gb=$bm }
    if($gb -ge 960){ $maat = "$([int][math]::Round($gb/1000)) TB" } else { $maat = "$gb GB" }
    if($soort){ $opslag = "$maat $soort" } else { $opslag = $maat } }
  $gpu = "$(Get-CimInstance Win32_VideoController | Where-Object { $_.Name -and $_.Name -notmatch 'Microsoft Basic|Remote|Parsec|Meta' } | Select-Object -Last 1 -ExpandProperty Name)"
  if($gpu){ $gpu = ($gpu -replace '\(R\)','' -replace '\(TM\)','' -replace 'Corporation','' -replace '\s+',' ').Trim() }
  $inch=''
  try{ $mon = Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorBasicDisplayParams | Select-Object -First 1
       if($mon.MaxHorizontalImageSize -gt 0){ $inch=[math]::Round([math]::Sqrt([math]::Pow($mon.MaxHorizontalImageSize,2)+[math]::Pow($mon.MaxVerticalImageSize,2))/2.54,1) } }catch{}
  if($inch){ $maten2=@(10.1,11.6,12.5,13.3,14.0,15.6,16.0,17.3); $bm2=$inch; $bd2=99.0; foreach($s in $maten2){ $v=[math]::Abs($s-$inch); if($v -lt $bd2){ $bd2=$v; $bm2=$s } }; if($bd2 -le 0.6){ $inch=$bm2 } }
  $scherm=''
  $res = Get-CimInstance Win32_VideoController | Where-Object { $_.CurrentHorizontalResolution } | Select-Object -First 1
  if($res){ $h=[int]$res.CurrentVerticalResolution
    if($h -ge 2000){$lab='4K'} elseif($h -ge 1400){$lab='QHD'} elseif($h -ge 1080){$lab='Full HD'} elseif($h -ge 700){$lab='HD'} else {$lab="$($res.CurrentHorizontalResolution)x$h"}
    if($inch){ $scherm="$inch inch $lab" } else { $scherm=$lab }
  } elseif($inch){ $scherm="$inch inch" }
  # WINDOWS-editie, bv. "Windows 11 Pro" of "Windows 10 Home".
  $win=''
  try{ $win = "$((Get-CimInstance Win32_OperatingSystem).Caption)"; $win = ($win -replace '(?i)microsoft ','' -replace '\s+',' ').Trim() }catch{}
  $g = @{ merk=$merk; model=$model; serienummer=$serie; mpn=$mpn; specs=@{ Processor=$cpu; Geheugen="$ram GB"; Opslag=$opslag; Videokaart=$gpu; Scherm=$scherm; Windows=$win } }
}catch{}
$body=@{ code=$code }
$res=@{}
if($accu -ne $null){ $res.accu=$accu }
elseif($accuStatus){ $res.accu_status=$accuStatus; $res.accu_reden=$accuReden }
if($cyc -ne $null){ $res.accu_cycli=$cyc }
if($res.Count -gt 0){ $body.resultaat=$res }
if($g){ $body.gegevens=$g }
try{
  Invoke-RestMethod -Method Post -Uri $adres -Headers @{ apikey=$sleutel } -ContentType 'application/json' -Body ($body | ConvertTo-Json -Depth 6) | Out-Null
  $global:StorvoKlaar=$true
  Write-Host ''
  Write-Host '  Klaar. De gegevens staan in Storvo. Je kunt dit venster sluiten.' -ForegroundColor Green
}catch{
  Write-Host ''
  Write-Host '  Versturen lukte niet. Check het internet en plak de regel opnieuw. Of vul het met de hand in Storvo in.' -ForegroundColor Yellow
}
}
