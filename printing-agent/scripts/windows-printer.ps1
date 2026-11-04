$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
try {
    $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
    if ($request.action -eq 'list') {
        $rows = @(Get-CimInstance -ClassName Win32_Printer | ForEach-Object {
            $virtual = $_.Name -match 'Microsoft Print to PDF|Microsoft XPS|OneNote|Fax' -or $_.PortName -eq 'PORTPROMPT:'
            [PSCustomObject]@{ name = $_.Name; driver = $_.DriverName; isDefault = [bool]$_.Default; offline = [bool]$_.WorkOffline; virtual = [bool]$virtual }
        })
        [Console]::Write((ConvertTo-Json -InputObject $rows -Compress))
        exit 0
    }
    if ($request.action -ne 'print') { throw 'Invalid operation' }
    Add-Type -TypeDefinition @"
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class LotoRawPrinter {
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
    public class DOCINFO { [MarshalAs(UnmanagedType.LPWStr)] public string pDocName; [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile; [MarshalAs(UnmanagedType.LPWStr)] public string pDataType; }
    [DllImport("winspool.drv", EntryPoint="OpenPrinterW", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool OpenPrinter(string name, out IntPtr handle, IntPtr defaults);
    [DllImport("winspool.drv", SetLastError=true)] static extern bool ClosePrinter(IntPtr handle);
    [DllImport("winspool.drv", EntryPoint="StartDocPrinterW", CharSet=CharSet.Unicode, SetLastError=true)] static extern int StartDocPrinter(IntPtr handle, int level, [In] DOCINFO info);
    [DllImport("winspool.drv", SetLastError=true)] static extern bool EndDocPrinter(IntPtr handle);
    [DllImport("winspool.drv", SetLastError=true)] static extern bool StartPagePrinter(IntPtr handle);
    [DllImport("winspool.drv", SetLastError=true)] static extern bool EndPagePrinter(IntPtr handle);
    [DllImport("winspool.drv", SetLastError=true)] static extern bool WritePrinter(IntPtr handle, byte[] bytes, int count, out int written);
    public static int Print(string printer, byte[] data, string title) {
        IntPtr handle;
        if (!OpenPrinter(printer, out handle, IntPtr.Zero)) throw new Win32Exception();
        bool document=false, page=false;
        try {
            int id=StartDocPrinter(handle, 1, new DOCINFO { pDocName=title, pDataType="RAW" });
            if (id==0) throw new Win32Exception();
            document=true;
            if (!StartPagePrinter(handle)) throw new Win32Exception();
            page=true;
            int written;
            if (!WritePrinter(handle, data, data.Length, out written) || written!=data.Length) throw new Win32Exception();
            if (!EndPagePrinter(handle)) throw new Win32Exception();
            page=false;
            if (!EndDocPrinter(handle)) throw new Win32Exception();
            document=false;
            return id;
        } finally {
            if (page) EndPagePrinter(handle);
            if (document) EndDocPrinter(handle);
            ClosePrinter(handle);
        }
    }
}
"@
    $bytes = [Convert]::FromBase64String($request.data)
    $jobId = [LotoRawPrinter]::Print([string]$request.printer, $bytes, [string]$request.title)
    [Console]::Write((@{ spool_job_id = $jobId } | ConvertTo-Json -Compress))
} catch {
    # Never write receipt bytes, PINs or request content to logs.
    [Console]::Error.Write('No se pudo procesar la operación en el servicio de impresión de Windows.')
    exit 1
}
