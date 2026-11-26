#!/usr/bin/env python3
"""NextOffer public internship feed generator. Standard library only.

Reads openly published job-board JSON/Markdown, keeps source links and dates, and
publishes public job metadata ONLY. Never include applicant records or auth keys.
"""
from __future__ import annotations
import datetime as dt
import hashlib
import html
import json
import os
from pathlib import Path
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'jobs' / 'feed.json'
BASE = 'https://raw.githubusercontent.com/'
USER_AGENT = 'NextOffer-InternshipFinder/2.0 (public GitHub boards; 20-minute schedule)'
SOURCES = [
    ('Dreamwork Business', 'json', 'dreamworkhq/Tech-Internships-2027/main/data/business-listings.json'),
    ('Dreamwork International', 'json', 'dreamworkhq/Tech-Internships-2027/main/data/international-listings.json'),
    ('Simplify Summer 2027', 'markdown', 'SimplifyJobs/Summer2027-Internships/dev/README.md'),
    ('Simplify Off-Season', 'markdown', 'SimplifyJobs/Summer2027-Internships/dev/README-Off-Season.md'),
    ('2027 Tech Jobs Off-Cycle', 'markdown', 'aprameyak/2027-tech-jobs/main/OFFCYCLE.md'),
    ('2027 Tech Jobs Summer', 'markdown', 'aprameyak/2027-tech-jobs/main/SUMMER.md'),
    ('2027 Product Data Business', 'markdown', 'yt6363/summer-2027-internships/main/README.md'),
    ('ApplyGuy Verified Internships', 'json', 'ApplyGuy/2027-Internships/main/data/internships.json'),
    ('European Opportunities', 'json', 'https://techopportunities.eu/open-opportunities.json'),
]
ROLE = re.compile(r'\b(data\s+(?:analytic\w*|analys\w*|science|scientist|insight\w*|engineer\w*|operations)|analytics?|business\s+(?:intelligence|analys\w*|insights?|operations?|strategy)|BI\b|intelligence|insights?|reporting|product\s+(?:analytic\w*|analys\w*|manag\w*|operations?|strateg\w*)|technical\s+program|program\s+manag\w*|project\s+manag\w*|project\s+coordinat\w*|operations?\s+(?:analys\w*|research|strateg\w*|intern)|decision\s+science|marketing\s+analytic\w*|growth\s+analys\w*|customer\s+(?:analys\w*|insights?)|supply\s+chain\s+analys\w*|financial\s+analys\w*|research\s+analys\w*|ai\s+product|business\s+systems)\b', re.I)
WRONG = re.compile(r'\b(phd|ph\.d\.?|doctoral|postdoctoral|senior|staff\s+engineer|principal\s+engineer|senior\s+manager)\b', re.I)
INTERNSHIP = re.compile(r'\b(intern\w*|co[\s-]?op|placement|apprentice|working\s+student|werkstudent|stage|stagiaire|practicante)\b', re.I)
SPRING = re.compile(r'\b(spring|winter|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|april|off[\s-]?cycle|co[\s-]?op)\b', re.I)
SUMMER = re.compile(r'\b(summer|jun(?:e)?|jul(?:y)?|aug(?:ust)?)\b', re.I)
MD_LINK = re.compile(r'\[([^\]]+)\]\((https?://[^\s)]+)(?:\s+[^)]*)?\)')
HTML_LINK = re.compile(r'<a\b[^>]*href=["\'](https?://[^"\']+)["\'][^>]*>', re.I)


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')


def fetch(url: str):
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT, 'Accept': 'application/json,text/plain,*/*'})
    with urllib.request.urlopen(req, timeout=35) as r:
        return r.read(12 * 1024 * 1024).decode('utf-8-sig', errors='replace')


def clean(s):
    s = str(s or '')
    s = re.sub(r'<br\s*/?>', ', ', s, flags=re.I)
    s = re.sub(r'!\[[^\]]*\]\([^)]*\)', '', s)
    s = MD_LINK.sub(lambda m: m.group(1), s)
    s = re.sub(r'<[^>]*>', ' ', s)
    s = s.replace('**', '').replace('__', '').replace('~~', '').replace('`', '').replace('↳', '').replace('🛂', '')
    return re.sub(r'\s+', ' ', html.unescape(s)).strip(' |,')[:240]


def best_link(s):
    # Prefer an employer ATS/apply link, not the GitHub board itself.
    a = [m.group(2) for m in MD_LINK.finditer(s)] + HTML_LINK.findall(s)
    for raw in a:
        url = html.unescape(raw).replace('&amp;', '&')
        if 'shields.io' in url or 'img.shields.io' in url:
            continue
        if urllib.parse.urlparse(url).scheme in ('https', 'http'):
            return url
    return ''


def normalized_url(u):
    if not u: return ''
    p = urllib.parse.urlparse(u)
    if p.scheme not in ('http','https') or not p.hostname: return ''
    qs = [(k,v) for k,v in urllib.parse.parse_qsl(p.query, keep_blank_values=True) if not k.lower().startswith('utm_') and k not in ('ref', 'source')]
    return urllib.parse.urlunparse((p.scheme, p.netloc.lower(),p.path, '', urllib.parse.urlencode(qs),'')).rstrip('/')


def term_for(title, text='', source=''):
    x = ' '.join((title, text))
    # 'spring' and 'summer' are less ambiguous than the source filename.
    if re.search(r'\b(spring|winter|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|april|off[\s-]?cycle)\b', x, re.I): return 'Spring / off-cycle'
    if SUMMER.search(x): return 'Summer'
    if SPRING.search(x): return 'Spring / off-cycle'
    if 'off-cycle' in source.lower() or 'off-season' in source.lower(): return 'Spring / off-cycle'
    if 'summer' in source.lower(): return 'Summer'
    return 'Unspecified'


def included(title, context=''):
    if not ROLE.search(title): return False
    if WRONG.search(title): return False
    # GitHub lists include some full-time roles; require internship / placement evidence.
    if not INTERNSHIP.search(title) and not INTERNSHIP.search(context): return False
    return True


def key_for(company, title, location):
    def norm(x): return re.sub(r'[^a-z0-9]+','', (x or '').lower())
    return hashlib.sha1(f'{norm(company)}|{norm(title)}|{norm(location)}'.encode()).hexdigest()[:18]


def parse_board_date(raw, origin='board-reported'):
    """Best-effort UTC timestamp + date precision. Never pass a date-added field as an exact posting time.

    Precision is instant, hour, day or unknown. Relative dates are board estimates.
    For board-added dates the timestamp means board entry date, not employer publication.
    """
    original = clean(raw)[:60]
    if not original: return '', 'unknown', 'unknown'
    t = dt.datetime.now(dt.timezone.utc)
    # Full timezone-aware timestamp. Raw ISO strings without timezones are treated as UTC.
    try:
        if re.match(r'^\d{4}-\d\d-\d\d[Tt ]\d\d:', original):
            obj = dt.datetime.fromisoformat(original.replace('Z', '+00:00'))
            if obj.tzinfo is None: obj = obj.replace(tzinfo=dt.timezone.utc)
            return obj.astimezone(dt.timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z'), 'instant', origin
    except (ValueError, OverflowError): pass
    # Relative ages on GitHub boards: e.g. 20m, 2h, 3d, 2w. Only hour/minute has hourly precision.
    match = re.fullmatch(r'(\d{1,3})\s*(m|min|h|hr|d|day|w|wk)s?', original, re.I)
    if match:
        amount=int(match.group(1));unit=match.group(2).lower()[0]
        if unit=='m': delta=dt.timedelta(minutes=amount)
        elif unit=='h': delta=dt.timedelta(hours=amount)
        elif unit=='d': delta=dt.timedelta(days=amount)
        else: delta=dt.timedelta(weeks=amount)
        stamp=(t-delta).isoformat(timespec='seconds').replace('+00:00','Z')
        return stamp, ('hour' if unit in ('m','h') else 'day'), origin+'-relative'
    if re.fullmatch(r'\d{4}-\d\d-\d\d', original):
        try:
            d=dt.date.fromisoformat(original)
            # Midnight is a placeholder; NEVER treat day-only precision as under one hour.
            return d.isoformat()+'T00:00:00Z','day',origin
        except ValueError: pass
    # e.g. Nov 23, Nov 23 2026. GitHub uses "Date Added" not employer posted.
    match=re.fullmatch(r'(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?',original,re.I)
    if match:
        mo={k:i for i,k in enumerate(('jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'),1)}[match.group(1)[:3].lower()]
        year=int(match.group(3) or t.year)
        try:
            d=dt.date(year,mo,int(match.group(2)))
            if not match.group(3) and d>t.date()+dt.timedelta(days=2):d=d.replace(year=year-1)
            return d.isoformat()+'T00:00:00Z','day',origin
        except ValueError:pass
    return '', 'unknown', 'unknown'


def make_job(title, company, location, url, source, source_url, posted_at='', context='', education='', description='', code='', date_basis='board-reported'):
    title, company, location = clean(title), clean(company), clean(location)
    url = normalized_url(url)
    if not title or not company or not url or not included(title,context): return None
    if not location: location = 'Location not listed'
    stamp,precision,basis=parse_board_date(posted_at,date_basis)
    return {
        'id': key_for(company,title,location),
        'title': title, 'company': company, 'location': location,
        'term': term_for(title, context, source),
        'url': url, 'source': source, 'source_url': source_url,
        'posted_at': stamp,
        'posted_at_raw': clean(posted_at)[:60],
        'date_precision': precision, 'date_basis': basis,
        'education': clean(education),
        'description': clean(description)[:240],
        'country_code': code or '',
        'full_jd_available': bool(description and len(description)>200),
    }


def json_jobs(text, source, source_url):
    parsed = json.loads(text)
    listings = (parsed.get('listings') if parsed.get('listings') is not None else parsed.get('jobs',[])) if isinstance(parsed, dict) else parsed
    if not isinstance(listings, list): raise ValueError('JSON has no listings array')
    jobs = []
    for row in listings:
        if not isinstance(row, dict): continue
        if str(row.get('employment_type','')).lower()=='new-grad': continue
        job = make_job(
            row.get('title') or row.get('role') or row.get('position'),
            row.get('company') or row.get('companyName'),
            row.get('location') or row.get('locations'),
            row.get('listingUrl') or row.get('url') or row.get('link') or row.get('apply_url') or row.get('application_url'),
            source,source_url,
            row.get('postedAt') or row.get('posted_at') or row.get('posted') or row.get('firstIndexedAt') or '',
            row.get('term') or row.get('season') or row.get('start_date') or row.get('employment_type') or 'internship',
            row.get('education') or '',
            row.get('description') or '',
            row.get('locationCountryCode') or '',
            ('source-reported' if row.get('postedAt') or row.get('posted_at') or row.get('posted') else 'board-indexed'),
        )
        if job: jobs.append(job)
    return jobs


def markdown_jobs(text, source, source_url):
    out, headings, prev_company = [], '', ''
    for raw in text.splitlines():
        line = raw.strip()
        if line.startswith('#'):
            headings = clean(line.lstrip('#'))[:100]
            continue
        if not line.startswith('|') or line.count('|') < 4: continue
        cells = [c.strip() for c in line.strip('|').split('|')]
        if len(cells) < 3 or all(re.fullmatch(r':?-+:?', c.replace(' ','')) for c in cells[:3]): continue
        first = clean(cells[0]); role = clean(cells[1]); loc = clean(cells[2])
        if first.lower() in ('company','name','organization','employer') or role.lower() in ('role','position','title'): continue
        if first not in ('','↳','same','—','-'):
            prev_company = first
        company = prev_company
        if not company: continue
        joined = ' | '.join(cells)
        # Some lists link only the company homepage in column 1 and put the
        # ACTUAL employer application in column 5 or 6. Prefer Apply links.
        apply_fields = [c for c in cells[3:] if re.search(r'\bapply\b|applications?/link',c,re.I)]
        url = next((best_link(c) for c in apply_fields if best_link(c)), '') or best_link(cells[1]) or best_link(joined)
        # Any rich markdown list typically has a link to the exact job.
        education = next((clean(c) for c in cells[3:] if re.search(r'undergrad|bachelor|master|phd|degree',c,re.I)), '')
        date = next((clean(c) for c in reversed(cells[3:]) if re.search(r'\b(?:\d+[dwhm]|\d{4}-\d\d-\d\d|nov|dec|oct|sep)\b', c, re.I)), '')
        job = make_job(role, company, loc, url,source,source_url,date,headings,education,date_basis=('board-added' if '2027 Tech Jobs' in source else 'board-reported'))
        if job: out.append(job)
    return out


def prefer(a,b):
    # Prefer ATS links, source metadata and richer descriptions.
    def rank(j):
        u=j.get('url','')
        direct = not any(x in u for x in ('dreamworkhq.com/job/', 'simplify.jobs/job/', 'github.com/'))
        return (int(direct)*5 + int(bool(j.get('posted_at'))) + int(bool(j.get('education'))) + len(j.get('description',''))/100)
    return a if rank(a)>=rank(b) else b


def main():
    old={}
    if OUT.exists():
        try: old = json.loads(OUT.read_text())
        except (ValueError, OSError): old={}
    old_by_id = {j.get('id'):j for j in old.get('jobs',[]) if j.get('id')}
    found, source_status, failures = {}, {}, []
    current = now()
    for label, kind, path in SOURCES:
        url = path if path.startswith('https://') else BASE + path
        try:
            raw = fetch(url)
            rows = json_jobs(raw,label,url) if kind == 'json' else markdown_jobs(raw,label,url)
            if not rows: raise ValueError('No relevant rows; source may have changed formatting')
            source_status[label] = {'status':'ok','matched':len(rows)}
            for job in rows:
                prev=found.get(job['id'])
                if prev: job=prefer(prev,job)
                older=old_by_id.get(job['id'],{})
                job['first_seen']=older.get('first_seen',current)
                job['last_seen']=current
                job['stale']=False
                found[job['id']]=job
        except Exception as exc:
            failures.append(label)
            source_status[label]={'status':'error','reason':str(exc)[:180]}
            print(f'ERROR {label}: {exc}',file=sys.stderr)
    if not found:
        raise RuntimeError('No sources succeeded: refusing to publish an empty feed')
    # Keep items from failed sources for at most 72 hours and mark stale.
    for job_id, job in old_by_id.items():
        if job_id in found or job.get('source') not in failures: continue
        try:
            last = dt.datetime.fromisoformat(job['last_seen'].replace('Z','+00:00'))
            age = (dt.datetime.now(dt.timezone.utc)-last).total_seconds()
        except (ValueError,KeyError,TypeError): age=10**10
        if age<=72*3600:
            found[job_id] = dict(job, stale=True)
    jobs=list(found.values())
    # Prioritize newly indexed and recent source-reported postings, keeping Spring prominent.
    jobs.sort(key=lambda j:(j.get('first_seen',''),j.get('posted_at',''),j.get('term')=='Spring / off-cycle'),reverse=True)
    jobs=jobs[:3000]
    new_ids=[j['id'] for j in jobs if j['id'] not in old_by_id]
    feed={'version':2,'generated_at':current,'scan_every_minutes':20,'total':len(jobs),
          'new_count':len(new_ids), 'new_ids':new_ids,
          'source_status':source_status,'jobs':jobs}
    OUT.parent.mkdir(parents=True,exist_ok=True)
    OUT.write_text(json.dumps(feed,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
    print(f'Wrote {OUT}: {len(jobs)} roles, {feed["new_count"]} new, {len(failures)} source warnings')
    if failures: print('Failed: '+', '.join(failures),file=sys.stderr)
    return 0

if __name__=='__main__':
    sys.exit(main())
