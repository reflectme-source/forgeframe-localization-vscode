"""Offline VSIX release-candidate integrity gate."""
from pathlib import Path,PurePosixPath
import hashlib,json,zipfile

ROOT=Path(__file__).resolve().parent.parent
VSIX=ROOT/"ForgeFrame-Localization-QA-0.1.0.vsix"
EXPECTED={
 "[Content_Types].xml",
 "extension.vsixmanifest",
 "extension/LICENSE.txt",
 "extension/changelog.md",
 "extension/extension.cjs",
 "extension/package.json",
 "extension/readme.md",
 "extension/assets/forgeframe-icon.png",
 "extension/lib/localization-core.mjs",
 "extension/lib/report-export.mjs",
 "extension/lib/report-model.mjs",
}
with zipfile.ZipFile(VSIX) as z:
    names=set(z.namelist())
    assert names==EXPECTED,(names-EXPECTED,EXPECTED-names)
    assert z.testzip() is None
    for name in names:
        assert not name.startswith("/") and ".." not in PurePosixPath(name).parts
        assert not any(x in name.lower() for x in ("node_modules","secret",".env","test_",".git"))
    manifest=json.loads(z.read("extension/package.json"))
    assert manifest["name"]=="forgeframe-localization-qa"
    assert manifest["version"]=="0.1.0"
    assert len(manifest["contributes"]["commands"])==3
    for src,actual in [
        (ROOT/"extension.cjs","extension/extension.cjs"),
        (ROOT/"lib"/"localization-core.mjs","extension/lib/localization-core.mjs"),
        (ROOT/"lib"/"report-export.mjs","extension/lib/report-export.mjs"),
        (ROOT/"lib"/"report-model.mjs","extension/lib/report-model.mjs"),
    ]:
        assert hashlib.sha256(src.read_bytes()).digest()==hashlib.sha256(z.read(actual)).digest(),actual
    assert b"private/internal notes" not in z.read("extension/readme.md")
    assert not any(x in z.read("extension/extension.cjs") for x in [b"fetch(",b"https.request(",b"telemetry"])
print("VSIX_STATIC_QA_PASS",len(EXPECTED),"archive files")
print("VSIX_SHA256",hashlib.sha256(VSIX.read_bytes()).hexdigest())
print("VSIX_BYTES",VSIX.stat().st_size)
print("STATUS","PREVIEW_PACKAGE_NOT_MARKETPLACE_PUBLISHED")
