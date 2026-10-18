"""Extract text cells only from the four user-provided print-page MHTML files."""
import email
import hashlib
import json
import re
import sys
import zipfile
from html.parser import HTMLParser
from pathlib import Path


class PrintTable(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.rows, self.row, self.cell, self.parts = [], {}, None, []
        self.ignored = 0

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style', 'iframe', 'noscript'):
            self.ignored += 1
        if self.ignored:
            return
        if tag == 'tr':
            self.row = {}
        if tag == 'td':
            classes = dict(attrs).get('class', '').split()
            self.cell = next((c for c in ('zekr', 'zekrtimes', 'zekrbless') if c in classes), None)
            self.parts = []
        if self.cell and tag in ('br', 'p', 'li'):
            self.parts.append('\n')

    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'iframe', 'noscript') and self.ignored:
            self.ignored -= 1
            return
        if self.ignored:
            return
        if tag == 'td' and self.cell:
            self.row[self.cell] = re.sub(r'[ \t\r\f\v]+', ' ', ''.join(self.parts)).strip()
            self.cell = None
        if tag == 'tr' and self.row.get('zekr'):
            self.rows.append(self.row)

    def handle_data(self, data):
        if self.cell and not self.ignored:
            self.parts.append(data)


spec = [
    ('اذكار الصلاة.mhtml', 'waking', 'أذكار الاستيقاظ من النوم', '12'),
    ('اذكار النوم.mhtml', 'sleep', 'أذكار النوم', '11'),
    ('اذكار بعد الصلاة.mhtml', 'after-prayer', 'أذكار بعد الصلاة المفروضة', '9'),
    ('التسابيح.mhtml', 'tasbeeh', 'التسابيح', '3'),
]
archive = Path(sys.argv[1])
output = {'source': 'IslamBook; user-provided MHTML archive', 'categories': []}
with zipfile.ZipFile(archive) as bundle:
    if sum(info.file_size for info in bundle.infolist()) > 5_000_000:
        raise ValueError('ARCHIVE_TOO_LARGE')
    for filename, key, title, page in spec:
        raw = bundle.read('اذكار/' + filename)
        message = email.message_from_bytes(raw)
        source = 'https://www.islambook.com/AzkarPrint/' + page
        if message['Snapshot-Content-Location'] != source:
            raise ValueError('UNEXPECTED_SOURCE')
        part = next(p for p in message.walk() if p.get_content_type() == 'text/html')
        parser = PrintTable()
        parser.feed(part.get_payload(decode=True).decode(part.get_content_charset() or 'utf-8'))
        items, seen = [], set()
        for row in parser.rows:
            canonical = re.sub(r'[\u064b-\u065f\u0670\u0640\s]', '', row['zekr'])
            if canonical in seen:
                continue
            seen.add(canonical)
            items.append({'content': row['zekr'], 'count_description': row.get('zekrtimes', ''),
                          'fadl': row.get('zekrbless', ''), 'source': source})
        if not items:
            raise ValueError('INCOMPLETE_EXTRACTION')
        output['categories'].append({'key': key, 'title': title, 'sourceUrl': source,
                                     'sourceFile': filename, 'sourceSha256': hashlib.sha256(raw).hexdigest(), 'items': items})
        print(key, len(items), [item['count_description'] for item in items])
Path(sys.argv[2]).write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
