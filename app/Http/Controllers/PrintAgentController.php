<?php

namespace App\Http\Controllers;

use App\Services\Lottery\PrintAuthorization;

class PrintAgentController extends Controller
{
    public function download()
    {
        return $this->package();
    }

    public function package()
    {
        $directory = storage_path('app/private/print-agent');
        if (! is_dir($directory)) mkdir($directory, 0700, true);
        $temporary = tempnam($directory, 'download-');
        $zip = new \ZipArchive();
        if ($zip->open($temporary, \ZipArchive::OVERWRITE) !== true) abort(503, 'No se pudo preparar el instalador.');
        foreach (['package.json', 'package-lock.json', 'README.md', 'Iniciar.bat', 'Iniciar.vbs'] as $name) $zip->addFile(base_path('printing-agent/'.$name), $name);
        $installer = file_get_contents(base_path('printing-agent/Instalar.bat'));
        $url = str_replace('%', '%%', rtrim(config('app.url'), '/'));
        $installer = str_replace('"http://lotoenlace.test"', '"'.$url.'"', $installer);
        $zip->addFromString('Instalar.bat', str_replace("\n", "\r\n", str_replace("\r\n", "\n", $installer)));
        foreach (['src', 'scripts'] as $folder) {
            foreach (new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator(base_path('printing-agent/'.$folder), \FilesystemIterator::SKIP_DOTS)) as $file) {
                if ($file->isFile()) $zip->addFile($file->getPathname(), str_replace('\\', '/', substr($file->getPathname(), strlen(base_path('printing-agent')) + 1)));
            }
        }
        $zip->close();
        return response()->download($temporary, 'LotoEnlace-PrintAgent-Windows.zip')->deleteFileAfterSend(true);
    }

    public function publicKey(PrintAuthorization $signer)
    {
        try {
            return response()->json(['version' => 1, 'issuer' => rtrim(config('app.url'), '/'), 'public_key' => $signer->publicKey()]);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 503);
        }
    }
}
