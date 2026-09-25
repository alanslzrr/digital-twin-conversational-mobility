"""Prepare an immutable multi-feed routing release; never modifies the active graph/DB."""
import argparse
import hashlib
import importlib.util
import json
import re
import shutil
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo
sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parent.parent

def digest(path):
    with path.open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()

def module(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / file)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value

def prepare(refresh=False, renfe_dir=None, renfe_export=None):
    releases = ROOT / 'data/routing-releases'
    releases.mkdir(parents=True, exist_ok=True)
    today = datetime.now(ZoneInfo('Europe/Madrid')).date().isoformat()
    crtm = module('crtm_prepare', 'prepare-crtm.py')
    otp = module('renfe_prepare', 'prepare-otp.py')
    with tempfile.TemporaryDirectory(dir=releases, prefix='.prepare-') as temporary:
        stage = Path(temporary)
        if refresh:
            renfe_dir, sources = stage / 'renfe', stage / 'sources'
            otp.prepare(True, renfe_dir, sources)
            renfe_export = sources / 'renfe-madrid.json'
        else:
            renfe_dir = renfe_dir or ROOT / 'data/otp'
            renfe_export = renfe_export or (renfe_dir / 'renfe-madrid.json' if (renfe_dir / 'renfe-madrid.json').exists() else ROOT / 'data/sources/renfe-madrid.json')
        data = json.loads(renfe_export.read_text())
        renfe = data['manifest']
        if digest(renfe_dir / 'renfe-madrid.gtfs.zip') != renfe['staticVersion']:
            raise ValueError('Renfe export/archive mismatch')
        catalogs = {}
        archives = {}
        for network in crtm.SOURCES:
            if refresh:
                catalog = crtm.prepare(network, True)
                archive = ROOT / 'data/sources/crtm' / (network + '.zip')
            else:
                candidates = [ROOT / f'data/sources/crtm/{network}.zip', ROOT / f'data/tmp/crtm/{network}.zip', ROOT / f'data/tmp/crtm-emt/{network}.zip']
                candidates = [p for p in candidates if p.exists()]
                if not candidates or len({digest(p) for p in candidates}) != 1:
                    raise ValueError(f'Provide unambiguous prepared raw archives for {network}, or --refresh')
                archive = candidates[0]
                catalog = ROOT / f'data/sources/crtm/{network}' / digest(archive)
            manifest = json.loads((catalog / 'manifest.json').read_text())
            if digest(archive) != manifest['version']:
                raise ValueError('CRTM export/archive mismatch')
            if any(digest(catalog / (t + '.csv')) != h for t, h in manifest['tableHashes'].items()):
                raise ValueError('CRTM table mismatch')
            catalogs[network] = (catalog, manifest)
            archives[network] = archive
        feeds = {}
        renfe_start, renfe_end = (datetime.strptime(renfe[k], '%Y%m%d').date().isoformat() for k in ['serviceStart', 'serviceEnd'])
        if renfe_start <= today <= renfe_end:
            feeds['renfe'] = {'version': renfe['staticVersion'], 'serviceStart': renfe_start, 'serviceEnd': renfe_end, 'source': 'renfe-madrid.gtfs.zip'}
        excluded = {}
        for network, (_, m) in catalogs.items():
            if m['serviceStart'] <= today <= m['serviceEnd']:
                feeds[network] = {'version': m['version'], 'serviceStart': m['serviceStart'], 'serviceEnd': m['serviceEnd'], 'source': network + '.gtfs.zip'}
            else:
                excluded[network] = {'reason': 'outside_current_service_envelope', 'serviceEnd': m['serviceEnd'], 'version': m['version']}
        if not feeds:
            raise ValueError('No current schedules for routing')
        osm = renfe_dir / 'madrid.osm.pbf'
        image = re.search(r'image: (opentripplanner/[^\s]+)', (ROOT / 'infra/local/compose.yaml').read_text()).group(1)
        identity = {'format': 'routing-release-v1', 'feeds': feeds, 'catalogs': {n:m['version'] for n,(_,m) in catalogs.items()}, 'renfeCatalog': renfe['staticVersion'], 'osmSha256': digest(osm), 'otpImage': image, 'configVersion': 1}
        release_id = hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()
        target = releases / release_id
        if target.exists():
            print(json.dumps({'release': release_id, 'directory': str(target), 'reused': True}))
            return target
        output = stage / 'release'
        output.mkdir()
        shutil.copy2(osm, output / 'madrid.osm.pbf')
        shutil.copy2(renfe_dir / 'renfe-madrid.gtfs.zip', output / 'renfe-madrid.gtfs.zip')
        shutil.copy2(renfe_export, output / 'renfe-madrid.json')
        for network, (catalog, _) in catalogs.items():
            shutil.copytree(catalog, output / 'catalogs' / network)
            if network in feeds:
                shutil.copy2(archives[network], output / feeds[network]['source'])
        build_config = {'transitModelTimeZone': 'Europe/Madrid', 'dataImportReport': True, 'maxDataImportIssuesPerFile': 1000, 'osm': [{'source': 'madrid.osm.pbf'}], 'transitFeeds': [{'type': 'gtfs', 'feedId': n, 'source': f['source']} for n,f in feeds.items()]}
        (output / 'build-config.json').write_text(json.dumps(build_config, indent=2))
        for name in ['router-config.json', 'otp-config.json']:
            shutil.copy2(ROOT / 'infra/otp' / name, output / name)
        files = {str(p.relative_to(output)): digest(p) for p in output.rglob('*') if p.is_file()}
        manifest = {**identity, 'releaseId': release_id, 'staticVersion': renfe['staticVersion'], 'preparedAt': datetime.now().astimezone().isoformat(), 'excluded': excluded, 'files': files,
                    'coverage': 'Renfe, EMT, Metro Ligero and interurban schedules where included; walking through the Madrid OSM extract. No expired Metro timetable. Frequency-based legs are planning estimates, not exact departures.'}
        (output / 'manifest.json').write_text(json.dumps(manifest, indent=2))
        output.rename(target)
        print(json.dumps({'release': release_id, 'directory': str(target), 'feeds': list(feeds), 'excluded': excluded}))
        return target

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--refresh', action='store_true', help='Explicitly fetch official sources into staging; never activates')
    parser.add_argument('--renfe-dir', type=Path)
    parser.add_argument('--renfe-export', type=Path)
    args = parser.parse_args()
    prepare(args.refresh, args.renfe_dir, args.renfe_export)
