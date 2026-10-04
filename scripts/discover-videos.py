"""Refresh the licensed footage candidate catalog from the Commons metadata API.
Run from the repository root; imported footage and credits are frozen separately. Metadata candidates require
content review before being added to scripts/open-videos.json.
"""
import concurrent.futures
import hashlib
import html
import json
import re
import time
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

MANIFEST = Path('scripts/open-videos.json')
CANDIDATES = Path('data/import-candidates.json')
TOPICS = {
    'Animals': 'birds cat dog fish horse butterfly elephant deer penguin insect wildlife duck squirrel turtle jellyfish eagle flamingo bee dolphin lion giraffe seal fox hummingbird monkey rabbit owl crab ant whale kangaroo',
    'Travel': 'waterfall ocean beach river mountain forest city train boat snow sunset volcano lake waves clouds glacier stream rain landscape canyon garden park island railway sailing',
    'Sports': 'basketball football skateboard cycling surfing swimming running skiing gymnastics tennis climbing skating volleyball rowing kayaking athletics',
    'Food': 'cooking baking coffee fruit food bread pizza dough vegetable chocolate kitchen grill',
    'Technology': 'robot rocket machine factory turbine satellite spacecraft printer engine airplane helicopter drone',
    'Education': 'microscope experiment plant flower earth moon sun science geology chemistry physics astronomy',
}

def plain(value):
    return html.unescape(re.sub(r'<[^>]*>', '', str(value))).strip()

def search(task):
    category, topic, offset = task
    params = {'action': 'query', 'generator': 'search', 'gsrsearch': f'filetype:video {topic}', 'gsrnamespace': '6', 'gsrlimit': '50', 'gsroffset': str(offset), 'prop': 'imageinfo', 'iiprop': 'url|extmetadata|size|mediatype', 'format': 'json'}
    for attempt in range(4):
        try:
            request = urllib.request.Request('https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode(params), headers={'User-Agent': 'Velo/1.2 (https://github.com/Emredke/tiktok-clone)'})
            with urllib.request.urlopen(request, timeout=60) as response:
                data = json.load(response)
            if 'error' in data:
                raise ValueError(data['error'])
            result = []
            for page in data.get('query', {}).get('pages', {}).values():
                info = (page.get('imageinfo') or [{}])[0]
                meta = info.get('extmetadata', {})
                value = lambda key: plain(meta.get(key, {}).get('value', ''))
                license_name, license_url = value('LicenseShortName'), value('LicenseUrl')
                allowed = license_name == 'CC0' and re.match(r'https?://creativecommons.org/publicdomain/zero/1\.0(?:/|$)', license_url)
                if re.fullmatch(r'CC BY (?:4\.0|3\.0|2\.5|2\.0|1\.0)', license_name):
                    allowed = re.match(r'https?://creativecommons.org/licenses/by/' + re.escape(license_name.split()[-1]) + r'(?:/|$)', license_url)
                if not allowed or not value('Artist') or value('Restrictions'):
                    continue
                if info.get('mediatype') != 'VIDEO' or not 10000 <= info.get('size', 0) <= 25 * 1024 * 1024 or not 2 <= info.get('duration', 0) <= 180:
                    continue
                if max(info.get('width', 0), info.get('height', 0)) > 4096:
                    continue
                if re.search(r'animation|simulation|diagram|cartoon|logo|rendering|timelapse of illustration|sex|porn|surgery|cystic|parasite|attack|weapon|kill shot|bowhunt|explosion', page['title'], re.I):
                    continue
                url = urllib.parse.urlsplit(info['url'])
                if url.scheme != 'https' or url.hostname != 'upload.wikimedia.org':
                    continue
                result.append({'id': 'open-' + hashlib.sha256(page['title'].encode()).hexdigest()[:12], 'title': page['title'], 'url': urllib.parse.urlunsplit(url._replace(query='')), 'page': info['descriptionurl'], 'author': value('Artist'), 'license': license_name, 'license_url': license_url, 'category': category, 'caption': plain(page['title'][5:].rsplit('.', 1)[0])[:300], 'changes': 'Trimmed to a short excerpt, resized, and transcoded. Audio removed.', 'retrieved': date.today().isoformat()})
            return topic, result
        except Exception as error:
            if attempt == 3:
                print(f'{topic}: metadata unavailable: {error}', flush=True)
                return topic, []
            time.sleep(2 ** attempt)

if __name__ == '__main__':
    catalog = {source['id']: source for source in json.loads(MANIFEST.read_text())}
    if CANDIDATES.exists():
        for source in json.loads(CANDIDATES.read_text()):
            catalog.setdefault(source['id'], source)
    counts = {category: sum(source['category'] == category for source in catalog.values()) for category in TOPICS}
    tasks = [(category, topic, offset) for offset in (0, 50, 100) for category, words in TOPICS.items() if counts[category] < 40 for topic in words.split()]
    CANDIDATES.parent.mkdir(parents=True, exist_ok=True)
    # Batches keep API concurrency and outstanding requests bounded.
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        for start in range(0, len(tasks), 2):
            for topic, results in pool.map(search, tasks[start:start + 2]):
                for source in results:
                    catalog.setdefault(source['id'], source)
                CANDIDATES.write_text(json.dumps(list(catalog.values()), ensure_ascii=False, indent=2) + '\n')
                print(f'{topic}: {len(results)} eligible; {len(catalog)} unique candidates', flush=True)
            if len(catalog) >= 500 and all(sum(source['category'] == category for source in catalog.values()) >= 30 for category in TOPICS):
                break
    print(f'Saved {len(catalog)} candidates to {CANDIDATES}', flush=True)
