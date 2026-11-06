"""Attach signed Genius platform packages to the matching Obsidian release."""

import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
from urllib.request import urlopen
from zipfile import ZipFile

ROOT = "https://s3.gns.sh/releases"
PUBLIC_KEY = "RWQYhfTfOQSBPUcE3itONaKaHrLwGsKj1gUk2CTHkNI1AVBsYlJYM9aE"
PLATFORMS = ("macos-aarch64", "macos-x86_64", "linux-aarch64", "linux-x86_64", "windows-x86_64")


def download(url, path):
    with urlopen(url, timeout=60) as response, path.open("wb") as out:
        shutil.copyfileobj(response, out)


def gh(*args):
    return subprocess.check_output(["gh", *args], text=True)


def main():
    tag = os.environ["DESKTOP_TAG"]
    if not re.fullmatch(r"v[0-9]+\.[0-9]+\.[0-9]+", tag):
        raise ValueError("Expected a stable desktop tag such as v0.4.1")
    manifest = json.loads(Path("manifest.json").read_text())
    version = manifest["version"]
    release = json.loads(gh("release", "view", version, "--json", "assets,isDraft"))
    if release["isDraft"]:
        raise ValueError(f"Obsidian release {version} must be published first")
    present = {asset["name"] for asset in release["assets"]}
    base = f"{ROOT}/{tag}"

    with tempfile.TemporaryDirectory() as directory:
        temp = Path(directory)
        signed = temp / "latest.json"
        download(f"{base}/latest.json", signed)
        download(f"{base}/latest.json.minisig", temp / "latest.json.minisig")
        subprocess.run(["minisign", "-Vm", signed, "-P", PUBLIC_KEY], check=True)
        metadata = json.loads(signed.read_text())
        if metadata.get("tag") != tag:
            raise ValueError("Signed release tag does not match the requested release")
        assets = {asset["name"]: asset for asset in metadata.get("obsidian_assets", [])}
        staged = []
        for platform in PLATFORMS:
            source = f"genius-obsidian-{tag[1:]}-{platform}.zip"
            asset = assets.get(source)
            if not asset or asset.get("url") != f"{base}/{source}":
                raise ValueError(f"Signed S3 manifest has no matching package for {platform}")
            dest = temp / f"genius-obsidian-{version}-{platform}.zip"
            if dest.name in present:
                continue
            download(asset["url"], dest)
            with dest.open("rb") as stream:
                digest = hashlib.file_digest(stream, "sha256").hexdigest()
            if digest != asset["sha256"] or dest.stat().st_size != asset["size"]:
                raise ValueError(f"Download failed checksum or size verification: {source}")
            with ZipFile(dest) as package:
                bundled = json.loads(package.read("genius-export/manifest.json"))
                if bundled["id"] != manifest["id"] or bundled["version"] != version:
                    raise ValueError(f"{source} does not contain Obsidian plugin {version}")
                binary = "genius-cli.exe" if platform.startswith("windows") else "genius-cli"
                package.getinfo(f"genius-export/bin/{binary}")
                if package.testzip() is not None:
                    raise ValueError(f"Invalid ZIP: {source}")
            staged.append(dest)

        if staged:
            gh("release", "upload", version, *(str(path) for path in staged))
        print(f"Obsidian {version}: added {len(staged)} platform package(s)")


if __name__ == "__main__":
    main()
