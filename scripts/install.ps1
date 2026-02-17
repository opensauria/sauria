#Requires -Version 5.1
$ErrorActionPreference = "Stop"

# OpenWind - zero-friction installer for Windows
# Usage: irm https://openwind.ai/install.ps1 | iex

$RequiredNodeMajor = 22
$TaskName = "OpenWind"

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName Microsoft.VisualBasic

# --- 1. Check Node.js ---

$nodePath = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodePath) {
    [System.Windows.Forms.MessageBox]::Show(
        "Node.js >= $RequiredNodeMajor is required.`n`nDownload it from nodejs.org",
        "OpenWind Setup",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Warning
    )
    Start-Process "https://nodejs.org"
    exit 1
}

$nodeVersion = & node --version
$major = [int]($nodeVersion -replace "v", "" -split "\.")[0]
if ($major -lt $RequiredNodeMajor) {
    [System.Windows.Forms.MessageBox]::Show(
        "Node.js >= $RequiredNodeMajor required.`nFound: $nodeVersion`n`nPlease upgrade.",
        "OpenWind Setup",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Warning
    )
    exit 1
}

# --- 2. Install package ---

& npm install -g openwind@latest --silent 2>$null
if ($LASTEXITCODE -ne 0) {
    & npm install -g openwind --silent
}

# --- 3. Choose provider (native dialog) ---

$form = New-Object System.Windows.Forms.Form
$form.Text = "OpenWind Setup"
$form.Size = New-Object System.Drawing.Size(400, 280)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false

$label = New-Object System.Windows.Forms.Label
$label.Text = "Choose your AI provider:"
$label.Location = New-Object System.Drawing.Point(20, 20)
$label.Size = New-Object System.Drawing.Size(340, 25)
$form.Controls.Add($label)

$listBox = New-Object System.Windows.Forms.ListBox
$listBox.Location = New-Object System.Drawing.Point(20, 50)
$listBox.Size = New-Object System.Drawing.Size(340, 120)
$listBox.Items.AddRange(@("Anthropic (recommended)", "OpenAI", "Google", "Ollama (local)"))
$listBox.SelectedIndex = 0
$form.Controls.Add($listBox)

$okButton = New-Object System.Windows.Forms.Button
$okButton.Text = "Continue"
$okButton.Location = New-Object System.Drawing.Point(260, 190)
$okButton.Size = New-Object System.Drawing.Size(100, 35)
$okButton.DialogResult = [System.Windows.Forms.DialogResult]::OK
$form.AcceptButton = $okButton
$form.Controls.Add($okButton)

$dialogResult = $form.ShowDialog()
if ($dialogResult -ne [System.Windows.Forms.DialogResult]::OK) { exit 0 }

$selected = $listBox.SelectedItem.ToString()
switch -Wildcard ($selected) {
    "*Anthropic*" { $Provider = "anthropic"; $KeyUrl = "https://console.anthropic.com/settings/keys" }
    "*OpenAI*"    { $Provider = "openai";    $KeyUrl = "https://platform.openai.com/api-keys" }
    "*Google*"    { $Provider = "google";    $KeyUrl = "https://aistudio.google.com/apikey" }
    "*Ollama*"    { $Provider = "ollama";    $KeyUrl = "" }
}

# --- 4. Get API key (native dialog) ---

$ApiKey = ""
if ($Provider -ne "ollama") {
    Start-Process $KeyUrl

    $ApiKey = [Microsoft.VisualBasic.Interaction]::InputBox(
        "Paste your $Provider API key:",
        "OpenWind Setup",
        ""
    )

    if ([string]::IsNullOrEmpty($ApiKey)) {
        [System.Windows.Forms.MessageBox]::Show("No API key provided. Setup cancelled.", "OpenWind")
        exit 0
    }
}

# --- 5. Run silent setup ---

$setupArgs = "setup --provider $Provider"
if ($ApiKey) { $setupArgs += " --api-key $ApiKey" }

$setupResult = & openwind $setupArgs.Split(" ") 2>&1
if ($LASTEXITCODE -ne 0) {
    [System.Windows.Forms.MessageBox]::Show(
        "Setup failed. Run 'openwind onboard' manually.",
        "OpenWind",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    )
    exit 1
}

# --- 6. Start daemon ---

$taskXml = Join-Path $env:USERPROFILE ".openwind" "service" "openwind-task.xml"
if (Test-Path $taskXml) {
    try { schtasks /delete /tn $TaskName /f 2>$null } catch { }
    schtasks /create /tn $TaskName /xml $taskXml 2>$null
}

# --- 7. Done ---

[System.Windows.Forms.MessageBox]::Show(
    "OpenWind is ready!`n`nYour AI clients have been configured automatically.`nRestart Claude Desktop or Cursor to get started.`n`nhttps://openwind.ai",
    "OpenWind",
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Information
)
