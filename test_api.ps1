$headers = @{
    "Authorization" = "Bearer sk-BxhqGuKi6ppVGVEL4W5m9e1jAwQdyXikDTzfifHzQ3MSAJ5uZRH9"
    "Content-Type" = "application/json"
}

$body = @{
    "model" = "gpt-4o"
    "messages" = @(
        @{
            "role" = "user"
            "content" = "Hello"
        }
    )
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "https://api.oaipro.com/v1/chat/completions" -Method Post -Headers $headers -Body $body
    Write-Host "Success!" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 5
} catch {
    Write-Host "Error:" -ForegroundColor Red
    $_.Exception.Message
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $reader.ReadToEnd()
    }
}
