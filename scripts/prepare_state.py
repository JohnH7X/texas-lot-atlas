#!/usr/bin/env python3
"""Static layers for a state lot atlas: county outlines and labels, county links, metadata.

Parcels, owners and values are queried live from the state's parcel service; nothing else is stored.

  python3 scripts/prepare_state.py --state 12 --name Florida --office "property appraiser" --count 10950670 \
    --output public/data --checked-date YYYY-MM-DD
"""
import argparse, json, subprocess, urllib.parse
from pathlib import Path
from shapely.geometry import shape

COUNTIES = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1/query'


def get(url, **params):
    out = subprocess.run(['curl', '-s', '--max-time', '180', f'{url}?{urllib.parse.urlencode(params)}'], capture_output=True, check=True).stdout
    return json.loads(out)


def search(q):
    return 'https://www.google.com/search?q=' + urllib.parse.quote_plus(q)


def main():
    a = argparse.ArgumentParser()
    for k in ['state', 'name', 'office', 'count', 'output', 'checked-date']:
        a.add_argument('--' + k, required=True)
    a.add_argument('--sources', default='[]', help='JSON list of {"label", "url"} shown in the data notes')
    a = a.parse_args()
    out = Path(a.output)
    out.mkdir(parents=True, exist_ok=True)

    feats = get(COUNTIES, where=f"STATE='{a.state}'", outFields='NAME,GEOID', outSR='4326', maxAllowableOffset='0.002', f='geojson')['features']
    terr, labels, links = [], [], {}
    for f in feats:
        name, code = f['properties']['NAME'], f['properties']['GEOID']
        terr.append({'type': 'Feature', 'properties': {'code': code, 'name': name, 'type': 'city', 'offIsland': True}, 'geometry': f['geometry']})
        g = shape(f['geometry'])
        p = (max(g.geoms, key=lambda x: x.area) if g.geom_type == 'MultiPolygon' else g).representative_point()
        labels.append({'type': 'Feature', 'properties': {'name': name}, 'geometry': {'type': 'Point', 'coordinates': [round(p.x, 5), round(p.y, 5)]}})
        links[code] = {'zoning': search(f'{name} {a.name} zoning map'), 'zoningLabel': 'Find the city or county zoning map',
                       'site': search(f'{name} {a.name} {a.office}'), 'roll': search(f'{name} {a.name} {a.office} property search')}
    (out / 'territories.geojson').write_text(json.dumps({'type': 'FeatureCollection', 'features': terr}, separators=(',', ':')))
    (out / 'territory-labels.geojson').write_text(json.dumps({'type': 'FeatureCollection', 'features': labels}, separators=(',', ':')))
    (out / 'territory-links.json').write_text(json.dumps(links, indent=0))
    (out / 'zones.geojson').write_text('{"type":"FeatureCollection","features":[]}')
    (out / 'zones-index.json').write_text('[]')
    meta = {'checkedDate': a.checked_date, 'zoningDate': a.checked_date, 'addressDate': a.checked_date, 'unitsDate': a.checked_date,
            'zoneCount': 0, 'addressCount': 0, 'milieuCount': 0, 'addressShards': [], 'unitCount': int(a.count), 'countyCount': len(terr),
            'sources': json.loads(a.sources), 'geometryIssues': [], 'zoningSource': '', 'addressSource': '', 'transformations': 'Live parcel queries.'}
    (out / 'metadata.json').write_text(json.dumps(meta, indent=1))
    print(len(terr), 'counties')


if __name__ == '__main__':
    main()
