$script:triggeredAt = [DateTime]::UtcNow.ToString("o")

function Write-Log {
    param([string]$Message, [ConsoleColor]$ForegroundColor)
    Write-Host "[triggeredAt=$script:triggeredAt] $($Message.Trim())" -ForegroundColor $ForegroundColor
}
