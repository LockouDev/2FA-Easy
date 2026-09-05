param(
    [Parameter(Mandatory = $true)]
    [string]$NsisZip,

    [Parameter(Mandatory = $true)]
    [string]$TauriPlugin
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $NsisZip -PathType Leaf)) {
    throw "Arquivo NSIS não encontrado: $NsisZip"
}

if (-not (Test-Path -LiteralPath $TauriPlugin -PathType Leaf)) {
    throw "Plugin do Tauri não encontrado: $TauriPlugin"
}

$ToolsPath = Join-Path $PSScriptRoot "target\.tauri"
$ExtractedPath = Join-Path $ToolsPath "nsis-3.11"
$NsisPath = Join-Path $ToolsPath "NSIS"
$PluginPath = Join-Path $NsisPath "Plugins\x86-unicode\additional\nsis_tauri_utils.dll"

New-Item -ItemType Directory -Force -Path $ToolsPath | Out-Null

if (-not (Test-Path -LiteralPath $NsisPath)) {
    Expand-Archive -LiteralPath $NsisZip -DestinationPath $ToolsPath -Force
    if (-not (Test-Path -LiteralPath $ExtractedPath)) {
        throw "O ZIP não contém a pasta esperada nsis-3.11"
    }
    Move-Item -LiteralPath $ExtractedPath -Destination $NsisPath
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $PluginPath) | Out-Null
Copy-Item -LiteralPath $TauriPlugin -Destination $PluginPath -Force

Write-Output "NSIS preparado em: $NsisPath"
