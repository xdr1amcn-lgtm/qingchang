$ErrorActionPreference = 'Stop'

try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
  $null = [Windows.Media.Ocr.OcrResult, Windows.Foundation, ContentType = WindowsRuntime]

  $script:asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } |
    Select-Object -First 1
  if (-not $script:asTask) { throw 'Windows OCR API is unavailable' }

  function Wait-WinRT($operation, [Type]$resultType) {
    $task = $script:asTask.MakeGenericMethod($resultType).Invoke($null, @($operation))
    $task.GetAwaiter().GetResult()
  }

  $base64 = [Console]::In.ReadToEnd().Trim()
  if (-not $base64 -or $base64.Length -gt 3000000) { throw 'Invalid OCR image data' }
  $bytes = [Convert]::FromBase64String($base64)

  $streamType = [Windows.Storage.Streams.InMemoryRandomAccessStream, Windows.Storage, ContentType = WindowsRuntime]
  $stream = [Activator]::CreateInstance($streamType)
  $writerType = [Windows.Storage.Streams.DataWriter, Windows.Storage, ContentType = WindowsRuntime]
  $writer = [Activator]::CreateInstance($writerType, @($stream))
  $writer.WriteBytes($bytes)
  Wait-WinRT ($writer.StoreAsync()) ([UInt32]) | Out-Null
  $writer.DetachStream() | Out-Null
  $stream.Seek(0)

  $decoderType = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
  $decoder = Wait-WinRT ($decoderType::CreateAsync($stream)) $decoderType
  $bitmapType = [Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
  $bitmap = Wait-WinRT ($decoder.GetSoftwareBitmapAsync()) $bitmapType
  $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
  if (-not $engine) { throw 'No Windows OCR language pack is available' }
  $result = Wait-WinRT ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
  [Console]::Out.Write($result.Text)
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
