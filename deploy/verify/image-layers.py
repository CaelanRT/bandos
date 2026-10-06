"""Inspect every saved application image layer, including later-deleted files."""
import json
import pathlib
import sys
import tarfile

with tarfile.open(sys.argv[1]) as archive:
    manifest = json.load(archive.extractfile('manifest.json'))[0]
    checked = 0
    for layer in manifest['Layers']:
        with tarfile.open(fileobj=archive.extractfile(layer), mode='r|*') as contents:
            for entry in contents:
                checked += 1
                name = entry.name.removeprefix('./')
                if name.startswith('app/'):
                    parts = pathlib.PurePosixPath(name).parts
                    assert not any(part.startswith('.env') or part in {
                        '.aws', '.ssh', '.git', '.npmrc', '.agents', '.codex'
                    } for part in parts), name
    print(f'PASS image layers: {len(manifest["Layers"])} layers, {checked} entries, no baked app env/credential/checkout files')
